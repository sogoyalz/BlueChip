import { Schema, Types } from "mongoose";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";

export interface IOrder {
  userId: Types.ObjectId;
  symbol: string; // Gemini pair, e.g. "BTCUSD"
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  qty: number;
  limitPrice?: number; // LIMIT orders only
  fillPrice?: number; // set when status becomes FILLED
  realizedPnl?: number; // SELL fills only: profit vs weighted-avg cost
  reason?: string; // set when status becomes REJECTED
  createdAt: Date;
  filledAt?: Date;
}

export const OrdersSchema = new Schema<IOrder>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  symbol: { type: String, required: true },
  side: { type: String, enum: ["BUY", "SELL"], required: true },
  type: { type: String, enum: ["MARKET", "LIMIT"], required: true },
  status: {
    type: String,
    enum: ["OPEN", "FILLED", "CANCELLED", "REJECTED"],
    required: true,
  },
  qty: { type: Number, required: true },
  limitPrice: Number,
  fillPrice: Number,
  realizedPnl: Number,
  reason: String,
  createdAt: { type: Date, default: Date.now },
  filledAt: Date,
});

// The matcher scans open limit orders; users list their own newest-first.
OrdersSchema.index({ status: 1, type: 1 });
OrdersSchema.index({ userId: 1, createdAt: -1 });
