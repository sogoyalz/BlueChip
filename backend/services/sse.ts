// Server-Sent Events price streaming: browsers open one long-lived
// GET /api/stream and receive the shared price cache every couple of
// seconds. Completes the streaming path end to end:
//   Gemini WebSocket -> backend cache -> SSE -> browser.
//
// SSE over WebSocket-to-browser on purpose: it's plain HTTP (survives
// proxies and free-tier hosts), auto-reconnects natively via EventSource,
// and the dashboard only consumes — it never needs to send.

import { Response } from "express";
import { getAllPrices } from "./priceFeed";
import { envInteger } from "../config/runtime";

// Per-process: a second instance holds its own client set, and the per-IP cap
// below is then enforced per instance rather than overall. See render.yaml.
const clients = new Set<Response>();
// Track how many streams each IP holds so one client can't exhaust sockets.
const perIp = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

export const DEFAULT_BROADCAST_MS = 2_000;
// A comment frame every 25s keeps proxies from timing the connection out and
// surfaces half-open sockets: the write throws and the client is reaped.
export const KEEPALIVE_MS = 25_000;
// Max concurrent streams per IP. Env-overridable so tests/ops can tune it.
export const MAX_STREAMS_PER_IP = envInteger("MAX_SSE_PER_IP", 5, 1, 1000);
const MAX_STREAMS = envInteger("MAX_SSE_CLIENTS", 1000, 1, 10_000);

function writeFrame(res: Response, frame: string): boolean {
  try {
    if (res.write(frame) !== false) return true;
  } catch { /* closed or slow client */ }
  removeClient(res);
  try { res.end(); } catch { /* already closed */ }
  return false;
}

/** One SSE frame: `event: <name>\ndata: <json>\n\n`. */
export function formatEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function pricesFrame(): string {
  return formatEvent("prices", {
    prices: getAllPrices(),
    updatedAt: Date.now(),
  });
}

/**
 * Register a new stream and send it an immediate snapshot. `ip` is used to cap
 * concurrent streams per client. Returns false (and does not register) when the
 * IP is already at MAX_STREAMS_PER_IP, so the caller can 429 the request.
 */
export function addClient(res: Response, ip = "unknown"): boolean {
  const current = perIp.get(ip) ?? 0;
  if (current >= MAX_STREAMS_PER_IP || clients.size >= MAX_STREAMS) return false;

  clients.add(res);
  perIp.set(ip, current + 1);
  // Remember the IP on the response so removeClient can decrement the right one.
  (res as Response & { _sseIp?: string })._sseIp = ip;
  return writeFrame(res, pricesFrame());
}

export function removeClient(res: Response): void {
  if (!clients.delete(res)) return; // already removed — don't double-decrement
  const ip = (res as Response & { _sseIp?: string })._sseIp ?? "unknown";
  const next = (perIp.get(ip) ?? 1) - 1;
  if (next <= 0) perIp.delete(ip);
  else perIp.set(ip, next);
}

export function clientCount(): number {
  return clients.size;
}

/** Push the current cache to every connected browser. */
export function broadcastPrices(): void {
  if (clients.size === 0) return;
  const frame = pricesFrame();
  for (const res of clients) {
    writeFrame(res, frame);
  }
}

/** Send a keep-alive comment to every client; reap any whose write fails. */
export function sendKeepAlive(): void {
  if (clients.size === 0) return;
  for (const res of clients) {
    writeFrame(res, ": keep-alive\n\n");
  }
}

export function startSseBroadcast(intervalMs: number = DEFAULT_BROADCAST_MS): void {
  if (timer) return;
  timer = setInterval(broadcastPrices, intervalMs);
  keepAliveTimer = setInterval(sendKeepAlive, KEEPALIVE_MS);
}

export function stopSseBroadcast(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
  // End the responses, don't just forget them. These connections are held open
  // indefinitely by design, and an HTTP server will not finish closing while
  // any are still alive — so on a SIGTERM the process would hang until the
  // platform force-killed it, mid-flight.
  for (const res of clients) {
    try {
      res.end();
    } catch {
      // socket already gone — nothing to close
    }
  }
  clients.clear();
  perIp.clear();
}
