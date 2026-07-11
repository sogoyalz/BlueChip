// Thin typed wrappers around Gemini's PUBLIC market-data REST API.
// No API key: these endpoints are open. Docs: https://docs.gemini.com/rest-api
//
// Rate-limit budget: public endpoints allow ~120 req/min. The price poller
// (services/priceFeed.ts) and the candle cache (routes/MarketRoute.ts) are
// sized to stay well under that.

const GEMINI_BASE = process.env.GEMINI_API_URL || "https://api.gemini.com";

export const CANDLE_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1hr",
  "6hr",
  "1day",
] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

export interface TickerV2 {
  symbol: string;
  open: number;
  close: number;
  bid: number;
  ask: number;
  changePct24h: number;
}

// Gemini candle: [timestamp_ms, open, high, low, close, volume]
export type Candle = [number, number, number, number, number, number];

async function geminiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GEMINI_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Gemini ${path} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

/** All pair ids Gemini currently trades, lowercase from the API. */
export async function fetchSymbols(): Promise<string[]> {
  return geminiGet<string[]>("/v1/symbols");
}

/** Current price + 24h change for one pair. */
export async function fetchTickerV2(symbol: string): Promise<TickerV2> {
  const raw = await geminiGet<{
    symbol: string;
    open: string;
    close: string;
    bid: string;
    ask: string;
  }>(`/v2/ticker/${symbol.toLowerCase()}`);
  const open = Number(raw.open);
  const close = Number(raw.close);
  return {
    symbol: symbol.toUpperCase(),
    open,
    close,
    bid: Number(raw.bid),
    ask: Number(raw.ask),
    changePct24h: open > 0 ? ((close - open) / open) * 100 : 0,
  };
}

/** OHLCV history, most recent candle FIRST (Gemini's order). */
export async function fetchCandles(
  symbol: string,
  timeframe: CandleTimeframe
): Promise<Candle[]> {
  return geminiGet<Candle[]>(
    `/v2/candles/${symbol.toLowerCase()}/${timeframe}`
  );
}
