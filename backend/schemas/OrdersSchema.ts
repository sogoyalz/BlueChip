import { Schema } from "mongoose";

export interface IOrder {
  name: string;
  qty: number;
  price: number;
  mode: string;
}

export const OrdersSchema = new Schema<IOrder>({
  name: String,
  qty: Number,
  price: Number,
  mode: String,
});
