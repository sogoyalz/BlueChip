import { Schema } from "mongoose";

export interface IPosition {
  product: string;
  name: string;
  qty: number;
  avg: number;
  price: number;
  net: string;
  day: string;
  isLoss: boolean;
}

export const PositionsSchema = new Schema<IPosition>({
  product: String,
  name: String,
  qty: Number,
  avg: Number,
  price: Number,
  net: String,
  day: String,
  isLoss: Boolean,
});
