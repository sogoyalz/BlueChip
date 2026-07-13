// CSRF defense for cookie-authenticated, state-changing requests.
//
// The session rides an httpOnly cookie the browser attaches automatically, so a
// cross-site form/GET could carry it. We require a custom request header that a
// browser only lets same-origin (or CORS-permitted) JavaScript set — a plain
// HTML form or top-level navigation cannot. Sending a custom header also forces
// a CORS preflight, which our origin allowlist then rejects for other sites.
//
// This is layered on top of sameSite:"lax" on the auth cookie; either alone
// blocks the classic vectors, together they cover each other's edges. Both
// frontends set this header as an axios default (see their config).

import { Request, Response, NextFunction } from "express";

export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "XMLHttpRequest";

export function requireCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  if (req.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
    res.status(403).json({ message: "Missing or invalid CSRF header" });
    return;
  }
  next();
}
