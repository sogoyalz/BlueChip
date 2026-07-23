import { Schema } from "mongoose";

// A point-in-time record of the shared Gemini sandbox account's total
// value, taken periodically and after every fill. Powers the Summary chart.
//
// Money is stored as INTEGER CENTS so summing many holdings never drifts
// sub-cent. The API converts back to dollars (fromCents) at the edge.
export interface ISnapshot {
  valueCents: number; // (cash + holdings at live prices), in integer cents
  cashCents: number; // cash, in integer cents
  ts: Date;
}

export const SnapshotSchema = new Schema<ISnapshot>({
  valueCents: { type: Number, required: true },
  cashCents: { type: Number, required: true },
  ts: { type: Date, default: Date.now },
});

SnapshotSchema.index({ ts: 1 });
