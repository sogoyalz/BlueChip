/**
 * Did this request fail because the server has no working exchange connection?
 *
 * A fresh clone has no Gemini sandbox key, and a deployment can have one that
 * the exchange rejects. Both are setup states rather than faults, and the
 * backend says so with 503 + code:"exchange_unavailable". Telling the user
 * "Could not load account" for either is alarming and points them at the wrong
 * problem entirely.
 */
export function isExchangeUnavailable(err: unknown): boolean {
  // Every caller is inside a catch block, so this must never throw. Reading
  // the shape directly rather than through axios.isAxiosError also means it
  // works when axios is partially stubbed — which is how a test caught the
  // first version swallowing the toast entirely.
  const response = (err as { response?: { status?: number; data?: { code?: string } } })
    ?.response;
  return response?.status === 503 && response?.data?.code === "exchange_unavailable";
}

/**
 * One id for the exchange-unavailable notice, so the several requests that all
 * depend on the exchange raise it once between them rather than stacking the
 * same sentence. Per-request ids stay in use for genuine failures, which are
 * worth distinguishing.
 */
export const EXCHANGE_TOAST_ID = "exchange-unavailable";

/** react-toastify options for a failure, deduping the shared case. */
export function accountErrorToast(err: unknown, fallbackId: string) {
  return { toastId: isExchangeUnavailable(err) ? EXCHANGE_TOAST_ID : fallbackId };
}

/** What to tell the user, given any failure from an account-shaped request. */
export function accountErrorMessage(err: unknown, fallback: string): string {
  if (!isExchangeUnavailable(err)) return fallback;
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
  return data?.message ?? "The exchange connection is not set up on this server.";
}
