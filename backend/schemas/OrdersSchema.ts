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
  qty: number; // requested amount
  filledQty?: number; // executed_amount — less than qty on a partial fill
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
  filledQty: Number,
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
// Idempotency: a (user, clientOrderId) pair may exist at most once.
//
// This MUST be a partial index, not a sparse one. `sparse` reads like "skip
// documents without the field", but on a COMPOUND index Mongo indexes a
// document when ANY indexed field is present — and userId always is. So every
// order placed without an idempotency key (the field is optional, and the
// README's own example omits it) was indexed with clientOrderId: null, and a
// user's SECOND keyless order collided with their first. Worse, the insert
// happens after the order is already live on Gemini, so the fill existed on the
// exchange with no local record of it.
//
// partialFilterExpression indexes only orders that actually carry a key, which
// is what the constraint was always meant to express.
OrdersSchema.index(
  { userId: 1, clientOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientOrderId: { $type: "string" } },
  }
);
