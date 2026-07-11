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

const cache = new Map<string, PriceEntry>();

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
  return !!entry && Date.now() - entry.updatedAt <= maxAgeMs;
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
      cache.set(symbol, {
        price: wsIsFresher ? prev.price : ticker.close,
        changePct24h: ticker.changePct24h,
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
