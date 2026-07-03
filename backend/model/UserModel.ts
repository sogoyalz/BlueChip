import { model } from "mongoose";
import { UserSchema, IUser } from "../schemas/UserSchema";

export const UserModel = model<IUser>("user", UserSchema);
