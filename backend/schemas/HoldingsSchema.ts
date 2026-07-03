import { Schema } from "mongoose";

export interface IHolding {
  name: string;
  qty: number;
  avg: number;
  price: number;
  net: string;
  day: string;
}

export const HoldingsSchema = new Schema<IHolding>({
  name: String,
  qty: Number,
  avg: Number,
  price: Number,
  net: String,
  day: String,
});
