import { Schema, Types } from "mongoose";
import { OrderEvent, ORDER_EVENT_KINDS } from "./OrderEvent";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus =
  | "PENDING"
  | "UNKNOWN"
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
  exchangeClientOrderId?: string;
  requestHash?: string;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  lastOperatorRecheckAt?: Date;
  submittedAmount?: string;
  submittedPrice?: string;
  reconciliationAttempts?: number;
  lastReconciliationCode?: string;
  lastReconciliationErrorAt?: Date;
  recentEvents?: OrderEvent[];
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
    enum: ["PENDING", "UNKNOWN", "OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"],
    required: true,
  },
  qty: { type: Number, required: true },
  filledQty: Number,
  limitPrice: Number,
  fillPrice: Number,
  geminiOrderId: String,
  clientOrderId: String,
  exchangeClientOrderId: String,
  requestHash: String,
  lastCheckedAt: Date,
  nextCheckAt: Date,
  lastOperatorRecheckAt: Date,
  submittedAmount: String,
  submittedPrice: String,
  reconciliationAttempts: { type: Number, default: 0, min: 0 },
  lastReconciliationCode: String,
  lastReconciliationErrorAt: Date,
  recentEvents: {
    type: [{ _id: false, kind: { type: String, enum: ORDER_EVENT_KINDS, required: true }, at: { type: Date, required: true },
      status: String, filledQty: Number, actorId: Schema.Types.ObjectId, note: { type: String, maxlength: 200 } }],
    default: [],
  },
  reason: String,
  createdAt: { type: Date, default: Date.now },
  filledAt: Date,
});

// orderSync scans resting orders; users list their own newest-first.
OrdersSchema.index({ status: 1, type: 1 });
OrdersSchema.index({ status: 1, createdAt: 1, _id: 1 });
OrdersSchema.index({ userId: 1, createdAt: -1 });
OrdersSchema.index({ userId: 1, createdAt: -1, _id: -1 });
OrdersSchema.index({ userId: 1, status: 1, createdAt: -1, _id: -1 });
OrdersSchema.index({ status: 1, lastCheckedAt: 1, _id: 1 });
OrdersSchema.index({ exchangeClientOrderId: 1 }, { unique: true, partialFilterExpression: { exchangeClientOrderId: { $type: "string" } } });
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
