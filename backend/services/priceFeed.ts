// The single shared price cache. One backend process polls Gemini for the
// curated symbol list and every user request reads from here — no per-user
// calls to Gemini ever. The WebSocket feed (services/geminiWs.ts) writes
// into the same cache with fresher prices when connected.

import { SYMBOLS } from "../config/symbols";
import { fetchTickerV2 } from "./gemini";

export type PriceSource = "rest" | "ws";

export interface PriceEntry {
  price: number;
  changePct24h: number;
  updatedAt: number; // epoch ms
  source: PriceSource;
}

// Per-process, so a second instance would serve its own prices from its own
// feed. Single-instance only — see render.yaml.
const cache = new Map<string, PriceEntry>();

/**
 * A price we are willing to trade on. Gemini sends amounts as strings, and
 * Number("") is 0 while Number("x") is NaN — neither is a price. The
 * WebSocket path always checked this; the REST poller did not, and a NaN that
 * reached the cache was passed straight through order validation, because
 * `NaN > MAX_NOTIONAL` is false. The order then went to the exchange with the
 * literal string "NaN" as its price.
 */
const isUsablePrice = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

let timer: ReturnType<typeof setInterval> | null = null;
let polling = false;

export const DEFAULT_POLL_MS = 10_000;
export const DEFAULT_MAX_AGE_MS = 30_000;

export function getPrice(symbol: string): PriceEntry | undefined {
  return cache.get(symbol.toUpperCase());
}

export function getAllPrices(): Record<string, PriceEntry> {
  const out: Record<string, PriceEntry> = {};
  for (const [symbol, entry] of cache) out[symbol] = entry;
  return out;
}

/** Used by the WebSocket feed and by tests to inject prices directly. */
export function setPrice(
  symbol: string,
  entry: Partial<PriceEntry> & { price: number }
): void {
  // Refuse rather than cache: a bad price is worse than a stale one, because
  // staleness is detected downstream and a NaN is not.
  if (!isUsablePrice(entry.price)) return;
  const prev = cache.get(symbol.toUpperCase());
  cache.set(symbol.toUpperCase(), {
    changePct24h: entry.changePct24h ?? prev?.changePct24h ?? 0,
    updatedAt: entry.updatedAt ?? Date.now(),
    source: entry.source ?? "rest",
    price: entry.price,
  });
}

/** A price older than maxAgeMs must not be used to fill orders. */
export function isFresh(
  symbol: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): boolean {
  const entry = cache.get(symbol.toUpperCase());
  // Freshness gates order placement, so it has to mean "we have a price we can
  // actually use" — not just "we wrote something recently".
  return (
    !!entry &&
    isUsablePrice(entry.price) &&
    Date.now() - entry.updatedAt <= maxAgeMs
  );
}

/**
 * One polling pass over every curated symbol, sequentially to spread the
 * request load. A failed symbol keeps its last cached value; errors never
 * escape the loop.
 */
export async function pollOnce(): Promise<void> {
  for (const { symbol } of SYMBOLS) {
    try {
      const ticker = await fetchTickerV2(symbol);
      // Don't clobber a fresher WebSocket price with REST data — but always
      // refresh the 24h change, which only the REST ticker carries.
      const prev = cache.get(symbol);
      const wsIsFresher =
        prev?.source === "ws" && Date.now() - prev.updatedAt < 5_000;
      const next = wsIsFresher ? prev.price : ticker.close;
      if (!isUsablePrice(next)) {
        // A malformed ticker leaves the last known good price in place. The
        // staleness guard will refuse orders soon enough if it never recovers.
        console.warn(`[priceFeed] ${symbol} returned an unusable price:`, ticker.close);
        continue;
      }
      cache.set(symbol, {
        price: next,
        changePct24h: Number.isFinite(ticker.changePct24h) ? ticker.changePct24h : 0,
        updatedAt: Date.now(),
        source: wsIsFresher ? "ws" : "rest",
      });
    } catch (err) {
      console.warn(`[priceFeed] ${symbol} poll failed:`, (err as Error).message);
    }
  }
}

export function startPolling(intervalMs: number = DEFAULT_POLL_MS): void {
  if (timer) return; // already running
  void pollOnce(); // warm the cache immediately
  timer = setInterval(() => {
    if (polling) return; // never overlap slow passes
    polling = true;
    void pollOnce().finally(() => {
      polling = false;
    });
  }, intervalMs);
}

export function stopPolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Test helper. */
export function clearCache(): void {
  cache.clear();
}
