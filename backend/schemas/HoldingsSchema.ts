import { Schema, Types } from "mongoose";

export interface IHolding {
  userId: Types.ObjectId;
  symbol: string; // Gemini pair, e.g. "BTCUSD"
  qty: number; // asset quantity, 8dp
  avgCost: number; // weighted average cost in USD
}

export const HoldingsSchema = new Schema<IHolding>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  symbol: { type: String, required: true },
  qty: { type: Number, required: true, default: 0 },
  avgCost: { type: Number, required: true, default: 0 },
});

// One holding row per user per symbol.
HoldingsSchema.index({ userId: 1, symbol: 1 }, { unique: true });
