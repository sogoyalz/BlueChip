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

const clients = new Set<Response>();
let timer: ReturnType<typeof setInterval> | null = null;

export const DEFAULT_BROADCAST_MS = 2_000;

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

/** Register a new stream and send it an immediate snapshot. */
export function addClient(res: Response): void {
  clients.add(res);
  try {
    res.write(pricesFrame());
  } catch {
    clients.delete(res);
  }
}

export function removeClient(res: Response): void {
  clients.delete(res);
}

export function clientCount(): number {
  return clients.size;
}

/** Push the current cache to every connected browser. */
export function broadcastPrices(): void {
  if (clients.size === 0) return;
  const frame = pricesFrame();
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res); // dead socket — drop it
    }
  }
}

export function startSseBroadcast(intervalMs: number = DEFAULT_BROADCAST_MS): void {
  if (timer) return;
  timer = setInterval(broadcastPrices, intervalMs);
}

export function stopSseBroadcast(): void {
  if (timer) clearInterval(timer);
  timer = null;
  clients.clear();
}
