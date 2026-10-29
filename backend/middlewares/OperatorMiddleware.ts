import type { Request, Response, NextFunction } from "express";

/** Privileges are provisioned outside signup. No account is an operator by default. */
export function operatorIds(): string[] {
  const ids = (process.env.OPERATOR_USER_IDS ?? "").split(",").map(id => id.trim().toLowerCase()).filter(Boolean);
  if (ids.some(id => !/^[a-f0-9]{24}$/.test(id))) throw new Error("OPERATOR_USER_IDS must contain MongoDB user IDs");
  return ids;
}
export function isOperator(id: unknown): boolean { return operatorIds().includes(String(id).toLowerCase()); }
export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !isOperator(req.user._id)) { res.status(403).json({ message: "Operator access required" }); return; }
  next();
}
