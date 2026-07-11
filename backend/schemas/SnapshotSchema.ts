import { Schema, Types } from "mongoose";

// A point-in-time record of a user's total portfolio value, taken
// periodically and after every fill. Powers the Summary chart.
export interface ISnapshot {
  userId: Types.ObjectId;
  value: number; // cash + holdings at live prices
  cash: number;
  ts: Date;
}

export const SnapshotSchema = new Schema<ISnapshot>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  value: { type: Number, required: true },
  cash: { type: Number, required: true },
  ts: { type: Date, default: Date.now },
});

SnapshotSchema.index({ userId: 1, ts: 1 });
