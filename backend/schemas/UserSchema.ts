import { Schema } from "mongoose";
import bcrypt from "bcrypt";

export interface IUser {
  email: string;
  username: string;
  password: string;
  createdAt: Date;
}

export const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Runs automatically RIGHT BEFORE a user is saved
UserSchema.pre("save", async function () {
  this.password = await bcrypt.hash(this.password, 12);
});
