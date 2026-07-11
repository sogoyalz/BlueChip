// Rate limits for the public deployment. Maxima are env-overridable so
// tests can raise (or shrink) them without touching code.
//
// NOTE: index.ts must set app.set("trust proxy", 1) — Render sits behind a
// proxy, and without it every visitor shares the proxy's IP bucket.

import rateLimit from "express-rate-limit";
import { Request } from "express";

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Login/signup: brute-force protection.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: num(process.env.AUTH_RATE_MAX, 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts — try again in a few minutes" },
});

// Order placement/cancel: keyed by authenticated user (these routes sit
// behind verifyToken, so req.user is always present).
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: num(process.env.ORDER_RATE_MAX, 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => String(req.user!._id),
  message: { message: "Too many orders — slow down a little" },
});

// App-wide backstop.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: num(process.env.GENERAL_RATE_MAX, 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests" },
});
