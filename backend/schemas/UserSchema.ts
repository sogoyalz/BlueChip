import { Schema } from "mongoose";
import bcrypt from "bcrypt";

export interface IUser {
  email: string;
  username: string;
  password: string;
  createdAt: Date;
  // Bumped to invalidate every token already issued to this user (logout-
  // everywhere / password reset). A token whose tv claim is behind the stored
  // value is rejected even before it expires. Defaults to 0 for existing docs.
  tokenVersion: number;
}

export const UserSchema = new Schema<IUser>({
  // Normalize so "A@x.com" and "a@x.com" can't become two distinct accounts;
  // the unique index then enforces one account per address.
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  tokenVersion: { type: Number, default: 0 },
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
