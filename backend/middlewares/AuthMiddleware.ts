import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, VerifyErrors } from "jsonwebtoken";

type JwtVerifyResult = string | JwtPayload | undefined;
import { HydratedDocument } from "mongoose";
import { UserModel } from "../model/UserModel";
import { IUser } from "../schemas/UserSchema";
import "dotenv/config";

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<IUser>;
    }
  }
}

// Used by the frontend's "am I still logged in?" check (POST /).
// Responds with a status flag rather than calling next().
// Accepts the token from the cookie, the request body, or a Bearer
// header — in production the dashboard runs on a different site, so
// the backend-domain cookie never arrives cross-origin.
export const userVerification = (req: Request, res: Response): void => {
  const bearer = req.headers.authorization;
  const token =
    req.cookies.token ||
    (typeof req.body?.token === "string" ? req.body.token : null) ||
    (bearer && bearer.startsWith("Bearer ") ? bearer.slice(7) : null);

  if (!token) {
    res.json({ status: false }); // no token = not logged in
    return;
  }

  jwt.verify(token, process.env.TOKEN_KEY as string, { algorithms: ["HS256"] }, async (err: VerifyErrors | null, data: JwtVerifyResult) => {
    if (err) {
      return res.json({ status: false }); // token is fake/expired
    }
    try {
      const payload = data as JwtPayload;
      const user = await UserModel.findById(payload.id); // payload.id came from the token
      // Reject tokens issued before the user's version was bumped (revocation).
      // Missing on either side means 0 — legacy users/tokens predate the field.
      if (user && (payload.tv ?? 0) === (user.tokenVersion ?? 0)) {
        return res.json({ status: true, user: user.username });
      }
      return res.json({ status: false });
    } catch (dbErr) {
      console.error(dbErr);
      return res.status(500).json({ status: false });
    }
  });
};

// Route GUARD for protected data endpoints. On success calls next();
// otherwise responds 401. Accepts the token from the cookie or an
// Authorization: Bearer header — the dashboard lives on a different origin,
// so the backend-domain cookie never arrives cross-origin and the header is
// what carries the token in production. We deliberately do NOT read the token
// from the URL/query string: query params leak into access logs, proxy logs,
// browser history, and Referer headers.
export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
  const bearer = req.headers.authorization;
  const token =
    req.cookies.token ||
    (bearer && bearer.startsWith("Bearer ") ? bearer.slice(7) : null);

  if (!token) {
    res.status(401).json({ status: false, message: "No token provided" });
    return;
  }

  jwt.verify(token, process.env.TOKEN_KEY as string, { algorithms: ["HS256"] }, async (err: VerifyErrors | null, data: JwtVerifyResult) => {
    if (err) {
      return res.status(401).json({ status: false, message: "Invalid or expired token" });
    }
    try {
      const payload = data as JwtPayload;
      const user = await UserModel.findById(payload.id);
      if (!user) {
        return res.status(401).json({ status: false, message: "User not found" });
      }
      // Reject tokens issued before the user's version was bumped (revocation).
      // Missing on either side means 0 — legacy users/tokens predate the field.
      if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
        return res.status(401).json({ status: false, message: "Invalid or expired token" });
      }
      req.user = user; // make the authenticated user available downstream
      next();
    } catch (dbErr) {
      console.error(dbErr);
      return res.status(500).json({ status: false, message: "Auth check failed" });
    }
  });
};
