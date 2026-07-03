import { model } from "mongoose";
import { HoldingsSchema, IHolding } from "../schemas/HoldingsSchema";

export const HoldingsModel = model<IHolding>("holding", HoldingsSchema);
