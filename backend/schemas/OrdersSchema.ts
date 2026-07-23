import { Schema, Types } from "mongoose";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus =
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export interface IOrder {
  userId: Types.ObjectId;
  symbol: string; // Gemini pair, e.g. "BTCUSD"
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  qty: number;
  limitPrice?: number; // LIMIT orders only
  fillPrice?: number; // avg_execution_price once any of the order has filled
  geminiOrderId?: string; // Gemini sandbox order_id — source of truth for status
  clientOrderId?: string; // client-supplied idempotency key (unique per user)
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
    enum: ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"],
    required: true,
  },
  qty: { type: Number, required: true },
  limitPrice: Number,
  fillPrice: Number,
  geminiOrderId: String,
  clientOrderId: String,
  reason: String,
  createdAt: { type: Date, default: Date.now },
  filledAt: Date,
});

// orderSync scans resting orders; users list their own newest-first.
OrdersSchema.index({ status: 1, type: 1 });
OrdersSchema.index({ userId: 1, createdAt: -1 });
// Idempotency: a (user, clientOrderId) pair may exist at most once. Sparse so
// orders placed without a key (the field is optional) don't collide on null.
OrdersSchema.index(
  { userId: 1, clientOrderId: 1 },
  { unique: true, sparse: true }
);
