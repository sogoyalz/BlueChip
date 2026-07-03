import jwt from "jsonwebtoken";
import { Types } from "mongoose";

export const createSecretToken = (id: Types.ObjectId | string): string => {
  return jwt.sign({ id }, process.env.TOKEN_KEY as string, {
    expiresIn: 3 * 24 * 60 * 60, // 3 days, in seconds
  });
};
