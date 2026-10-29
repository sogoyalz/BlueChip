import { GeminiHttpError, GeminiUnavailableError } from "./geminiPrivate";

export const RECONCILIATION_MESSAGES: Record<string, string> = {
  exchange_unavailable: "The server has no working exchange connection.",
  rate_limited: "The exchange asked the server to slow down; the lookup will retry.",
  not_found: "The exchange has not confirmed this order. It will not be resubmitted automatically.",
  invalid_response: "The exchange response could not safely identify an order state.",
  lookup_failed: "The exchange lookup failed; another lookup is scheduled.",
  missing_identifier: "No exchange identifier was recorded. Manual investigation is required.",
};
export function reconciliationCode(error: unknown): string {
  if (typeof GeminiUnavailableError === "function" && error instanceof GeminiUnavailableError) return "exchange_unavailable";
  if (typeof GeminiHttpError === "function" && error instanceof GeminiHttpError) {
    if (error.status === 429) return "rate_limited";
    if (error.status === 404 || error.reason === "OrderNotFound") return "not_found";
  }
  return "lookup_failed";
}

interface Pass { checked: number; changed: number; failed: number; manualReview: number; failureCode: string | null }
const runtime: { active: number; lastStartedAt: string | null; lastCompletedAt: string | null; lastPass: Pass | null; lastFailureCode: string | null } = {
  active: 0, lastStartedAt: null, lastCompletedAt: null, lastPass: null, lastFailureCode: null,
};
export function beginReconciliation(): Pass {
  runtime.active += 1; runtime.lastStartedAt = new Date().toISOString();
  return { checked: 0, changed: 0, failed: 0, manualReview: 0, failureCode: null };
}
export function finishReconciliation(pass: Pass): void {
  runtime.active -= 1; runtime.lastCompletedAt = new Date().toISOString();
  runtime.lastPass = { ...pass }; runtime.lastFailureCode = pass.failureCode;
}
export function getReconciliationStatus() { return { ...runtime, active: runtime.active > 0, lastPass: runtime.lastPass ? { ...runtime.lastPass } : null }; }
