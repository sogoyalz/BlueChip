import jwt from "jsonwebtoken";
import { Types } from "mongoose";

// tv (token version) is checked against the user's stored tokenVersion on every
// request, so bumping that field revokes all outstanding tokens for the user.
export const createSecretToken = (
  id: Types.ObjectId | string,
  tokenVersion = 0
): string => {
  return jwt.sign({ id, tv: tokenVersion }, process.env.TOKEN_KEY as string, {
    algorithm: "HS256", // pinned; verify side pins the same
    expiresIn: 12 * 60 * 60, // 12 hours — keep in sync with the cookie maxAge
  });
};
