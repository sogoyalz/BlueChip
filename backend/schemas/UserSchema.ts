import { Schema } from "mongoose";
import bcrypt from "bcrypt";

import { STARTING_CASH } from "../util/money";

export interface IUser {
  email: string;
  username: string;
  password: string;
  balance: number;
  realizedPnl: number; // profit locked in by sells, vs weighted-avg cost
  createdAt: Date;
}

export const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: STARTING_CASH },
  realizedPnl: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Runs automatically RIGHT BEFORE a user is saved.
// Only hashes when the password itself changed — otherwise any later
// save() (e.g. after mutating balance) would hash the hash and
// permanently lock the user out.
export async function hashPasswordHook(this: {
  isModified(path: string): boolean;
  password: string;
}): Promise<void> {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
}

UserSchema.pre("save", hashPasswordHook);
