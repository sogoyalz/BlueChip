// Public market-data endpoints — no auth, these serve the same shared
// Gemini-sourced data to every visitor.

import { Router } from "express";
import { SYMBOLS, isSupported } from "../config/symbols";
import { getAllPrices } from "../services/priceFeed";
import { getDepth } from "../services/orderBook";
import { addClient, removeClient } from "../services/sse";
import { marketLimiter } from "../middlewares/rateLimit";
import {
  CANDLE_TIMEFRAMES,
  Candle,
  CandleTimeframe,
  fetchCandles,
} from "../services/gemini";

const router = Router();

router.get("/api/symbols", (_req, res) => {
  res.json(SYMBOLS);
});

router.get("/api/prices", (_req, res) => {
  res.json({ prices: getAllPrices(), updatedAt: Date.now() });
});

// Live price stream (Server-Sent Events). The dashboard prefers this and
// falls back to polling /api/prices if the stream can't connect.
router.get("/api/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // don't let reverse proxies buffer the stream
  });
  res.flushHeaders();
  res.write("retry: 5000\n\n"); // EventSource reconnect hint
  // Cap concurrent streams per IP so one client can't exhaust server sockets.
  if (!addClient(res, req.ip)) {
    res.write("event: error\ndata: too many streams\n\n");
    res.end();
    return;
  }
  req.on("close", () => removeClient(res));
});

// Top of the live order book, maintained from Gemini's l2 WebSocket feed.
// Empty sides simply mean the WS hasn't (re)connected yet — the dashboard
// hides the panel rather than erroring.
router.get("/api/book/:symbol", marketLimiter, (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  if (!isSupported(symbol)) {
    res.status(400).json({ message: "Unknown or unsupported symbol" });
    return;
  }
  res.json({ symbol, ...getDepth(symbol, 10) });
});

// Candle cache: short timeframes change often, long ones barely move —
// TTLs keep us polite to Gemini no matter how many visitors load charts.
const SHORT_TTL_MS = 60_000; // <= 30m candles
const LONG_TTL_MS = 300_000; // 1hr+ candles
const candleCache = new Map<string, { candles: Candle[]; fetchedAt: number }>();

router.get("/api/candles/:symbol", marketLimiter, async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const timeframe = String(req.query.timeframe || "1hr") as CandleTimeframe;

  if (!isSupported(symbol)) {
    res.status(400).json({ message: "Unknown or unsupported symbol" });
    return;
  }
  if (!CANDLE_TIMEFRAMES.includes(timeframe)) {
    res.status(400).json({ message: `timeframe must be one of ${CANDLE_TIMEFRAMES.join(", ")}` });
    return;
  }

  const key = `${symbol}:${timeframe}`;
  const ttl = ["1m", "5m", "15m", "30m"].includes(timeframe)
    ? SHORT_TTL_MS
    : LONG_TTL_MS;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttl) {
    res.json({ symbol, timeframe, candles: cached.candles });
    return;
  }

  try {
    // Gemini returns newest-first; charts want ascending time.
    const candles = (await fetchCandles(symbol, timeframe)).slice().reverse();
    candleCache.set(key, { candles, fetchedAt: Date.now() });
    res.json({ symbol, timeframe, candles });
  } catch (err) {
    console.error(`candles ${key} failed:`, err);
    if (cached) {
      // Serve stale data over an error page.
      res.json({ symbol, timeframe, candles: cached.candles });
      return;
    }
    res.status(502).json({ message: "Could not fetch candle data — try again shortly" });
  }
});

export default router;
