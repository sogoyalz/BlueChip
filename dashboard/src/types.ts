// Shared domain types for the dashboard. Shapes mirror the backend schemas
// (backend/schemas/*.ts) and the static seed data in data/data.ts.

export type TradeMode = "BUY" | "SELL";

export interface Holding {
  name: string;
  qty: number;
  avg: number;
  price: number;
  net: string;
  day: string;
  isLoss?: boolean;
}

export interface Position extends Holding {
  product: string;
}

export interface Order {
  name: string;
  qty: number;
  price: number;
  mode: TradeMode;
}

export interface WatchlistStock {
  name: string;
  price: number;
  percent: string;
  isDown: boolean;
}
