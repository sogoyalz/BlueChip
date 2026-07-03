import { model } from "mongoose";
import { PositionsSchema, IPosition } from "../schemas/PositionsSchema";

export const PositionsModel = model<IPosition>("Position", PositionsSchema);
