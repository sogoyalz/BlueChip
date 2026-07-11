// Streaming prices from Gemini's public v2 market-data WebSocket. Trade
// events land in the shared price cache (services/priceFeed.ts) tagged
// source:"ws"; the REST poller keeps running underneath as a permanent
// fallback and as the only source of the 24h-change figure.
//
// Reliability model:
//  - Heartbeat watchdog: Gemini sends a message at least every ~5s. If we
//    hear nothing for WATCHDOG_TIMEOUT_MS the socket is presumed dead
//    (half-open TCP), terminated, and reconnected.
//  - Exponential backoff with jitter on reconnect (1s -> 30s cap).
//  - Generation counter: every connect() bumps it and stale sockets'
//    handlers no-op, so an old zombie can never write over a new socket.

import WebSocket from "ws";
import { SYMBOLS } from "../config/symbols";
import { setPrice } from "./priceFeed";
import { applyChanges, resetBook } from "./orderBook";

const WS_URL = process.env.GEMINI_WS_URL || "wss://api.gemini.com/v2/marketdata";

export const WATCHDOG_TIMEOUT_MS = 30_000;
const WATCHDOG_CHECK_MS = 10_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

let ws: WebSocket | null = null;
let generation = 0;
let attempts = 0;
let connected = false;
let lastMessageAt = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

export function isWsConnected(): boolean {
  return connected;
}

/** Backoff delay for the given attempt number: 1s, 2s, 4s … capped at 30s, ±20% jitter. */
export function backoffDelay(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
  return Math.round(base * (0.8 + rand() * 0.4));
}

/**
 * Process one raw message from the feed. Exported for tests.
 * Gemini v2 sends: heartbeats, l2_updates (book changes + trades on
 * subscribe), and individual trade events {type:"trade", symbol, price}.
 */
export function handleWsMessage(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // not JSON — ignore
  }

  if (msg.type === "trade") {
    const symbol = String(msg.symbol || "").toUpperCase();
    const price = Number(msg.price);
    if (symbol && Number.isFinite(price) && price > 0) {
      setPrice(symbol, { price, source: "ws" });
    }
    return;
  }

  if (msg.type === "l2_updates") {
    const symbol = String(msg.symbol || "").toUpperCase();
    if (!symbol) return;

    // The initial l2_updates after (re)subscribing is a full snapshot and
    // carries a trades array — reset the book so stale levels from before
    // a reconnect can't linger, and seed the price from the latest trade.
    const isSnapshot = Array.isArray(msg.trades);
    if (isSnapshot) {
      resetBook(symbol);
      const latest = (msg.trades as Array<{ price?: unknown }>)[0];
      const price = Number(latest?.price);
      if (Number.isFinite(price) && price > 0) {
        setPrice(symbol, { price, source: "ws" });
      }
    }

    if (Array.isArray(msg.changes)) {
      applyChanges(symbol, msg.changes as Array<[string, string, string]>);
    }
  }
}

/** True when the socket has been silent past the watchdog timeout. Exported for tests. */
export function isStalled(now: number = Date.now()): boolean {
  return lastMessageAt > 0 && now - lastMessageAt > WATCHDOG_TIMEOUT_MS;
}

function connect(): void {
  if (stopped) return;
  const gen = ++generation;

  console.log(`[geminiWs] connecting (attempt ${attempts + 1})`);
  const socket = new WebSocket(WS_URL);
  ws = socket;

  const isStale = () => gen !== generation || stopped;

  socket.on("open", () => {
    if (isStale()) return socket.terminate();
    connected = true;
    attempts = 0;
    lastMessageAt = Date.now();
    console.log("[geminiWs] connected — subscribing l2");
    socket.send(
      JSON.stringify({
        type: "subscribe",
        subscriptions: [{ name: "l2", symbols: SYMBOLS.map((s) => s.symbol) }],
      })
    );
  });

  socket.on("message", (data) => {
    if (isStale()) return;
    lastMessageAt = Date.now();
    handleWsMessage(data.toString());
  });

  socket.on("error", (err) => {
    if (isStale()) return;
    console.warn("[geminiWs] socket error:", err.message);
  });

  socket.on("close", () => {
    if (isStale()) return;
    connected = false;
    scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  const delay = backoffDelay(attempts);
  attempts += 1;
  console.log(`[geminiWs] disconnected — reconnecting in ${delay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

export function startGeminiWs(): void {
  if (!stopped) return; // already running
  stopped = false;
  attempts = 0;
  connect();

  watchdogTimer = setInterval(() => {
    if (connected && isStalled()) {
      console.warn("[geminiWs] no messages for 30s — terminating stalled socket");
      connected = false;
      ws?.terminate(); // close event schedules the reconnect
    }
  }, WATCHDOG_CHECK_MS);
}

export function stopGeminiWs(): void {
  stopped = true;
  connected = false;
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  ws?.terminate();
  ws = null;
}
