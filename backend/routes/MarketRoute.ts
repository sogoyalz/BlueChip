// Public market-data endpoints — no auth, these serve the same shared
// Gemini-sourced data to every visitor.

import { Router } from "express";
import { SYMBOLS, isSupported } from "../config/symbols";
import { getAllPrices } from "../services/priceFeed";
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

// Candle cache: short timeframes change often, long ones barely move —
// TTLs keep us polite to Gemini no matter how many visitors load charts.
const SHORT_TTL_MS = 60_000; // <= 30m candles
const LONG_TTL_MS = 300_000; // 1hr+ candles
const candleCache = new Map<string, { candles: Candle[]; fetchedAt: number }>();

router.get("/api/candles/:symbol", async (req, res) => {
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
    res.status(502).json({ message: "Could not fetch candles from Gemini" });
  }
});

export default router;
