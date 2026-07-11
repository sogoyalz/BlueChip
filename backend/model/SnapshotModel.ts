import { model } from "mongoose";
import { SnapshotSchema, ISnapshot } from "../schemas/SnapshotSchema";

export const SnapshotModel = model<ISnapshot>("Snapshot", SnapshotSchema);
