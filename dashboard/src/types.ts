// Shared domain types for the dashboard. Shapes mirror the backend schemas
// (backend/schemas/*.ts) and API responses.

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";

// Legacy alias — BuySellModal and GeneralContext predate the side/type split.
export type TradeMode = OrderSide;

export interface Holding {
  _id?: string;
  symbol: string;
  qty: number;
  avgCost: number;
  // Live enrichment added by the backend from its Gemini price cache.
  price?: number;
  dayChangePct?: number;
}

export interface Order {
  _id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  qty: number;
  limitPrice?: number;
  fillPrice?: number;
  reason?: string;
  createdAt: string;
  filledAt?: string;
}

export interface Account {
  username: string;
  email: string;
  balance: number;
  portfolioValue?: number;
  createdAt?: string;
}

// One entry in the backend's shared Gemini price cache (GET /api/prices).
export interface TickerPrice {
  price: number;
  changePct24h: number;
  updatedAt: number;
  source?: "ws" | "rest";
}

export interface SymbolInfo {
  symbol: string; // Gemini pair id, e.g. "BTCUSD"
  base: string; // asset ticker, e.g. "BTC"
  name: string; // display name, e.g. "Bitcoin"
}

// Gemini OHLCV candle: [timestamp_ms, open, high, low, close, volume]
export type Candle = [number, number, number, number, number, number];

export type CandleTimeframe = "1m" | "5m" | "15m" | "30m" | "1hr" | "6hr" | "1day";
