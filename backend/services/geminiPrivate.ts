// Signed wrappers around Gemini's PRIVATE (authenticated) REST API.
// Docs: https://docs.gemini.com/rest-api/#private-api-invocation
//
// This client talks to Gemini's SANDBOX exchange only — a separate test
// account with fake funds, not production. It places real orders that
// really fill against a real matching engine, just not with real money.

import { createHmac } from "crypto";

const PRIVATE_BASE =
  process.env.GEMINI_PRIVATE_API_URL || "https://api.sandbox.gemini.com";

// Refuse to boot if this ever points anywhere but the sandbox — a shared
// API key that started placing real orders on production would be a
// real-money incident, not a bug.
if (!PRIVATE_BASE.includes("sandbox")) {
  throw new Error(
    `GEMINI_PRIVATE_API_URL must point at the Gemini sandbox, got: ${PRIVATE_BASE}`
  );
}

// Same bound as the public client. An order placement that never returns is
// worse than one that fails: the caller cannot tell whether it reached the
// exchange, and nothing else will reconcile it.
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 8_000;

const API_KEY = process.env.GEMINI_API_KEY;
const API_SECRET = process.env.GEMINI_API_SECRET;

export type GeminiOrderSide = "buy" | "sell";
export type GeminiOrderOption =
  | "maker-or-cancel"
  | "immediate-or-cancel"
  | "fill-or-kill";

export interface GeminiOrderResponse {
  order_id: string;
  symbol: string;
  side: GeminiOrderSide;
  type: string;
  price: string;
  avg_execution_price: string;
  executed_amount: string;
  remaining_amount: string;
  is_live: boolean;
  is_cancelled: boolean;
  timestampms: number;
}

export interface GeminiBalance {
  currency: string;
  amount: string;
  available: string;
  availableForWithdrawal: string;
}

// Nonce must strictly increase per API key. Date.now() is monotonic within
// this process; this assumes a single backend instance holds the key.
let lastNonce = 0;
function nextNonce(): number {
  const nonce = Math.max(Date.now(), lastNonce + 1);
  lastNonce = nonce;
  return nonce;
}

/**
 * Carries the HTTP status so the retry policy can tell a transient failure
 * from a refusal. The message is unchanged from before this class existed.
 */
/**
 * The exchange cannot be reached ON OUR ACCOUNT: credentials are absent, or
 * Gemini rejected them. Distinct from a genuine failure because it is a known,
 * expected state — a fresh clone has no sandbox key — and the caller should
 * say "not configured", not "something went wrong".
 */
/** Gemini's own reason codes that mean the key, signature or nonce is wrong. */
const CREDENTIAL_REASONS =
  /^(Invalid(Apikey|Signature|Nonce)|Missing(Apikey|Payload|Signature)Header|AuthenticationError)$/i;

export class GeminiUnavailableError extends Error {
  constructor(readonly reason: "not_configured" | "rejected", message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

class GeminiHttpError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Gemini ${path} responded ${status}`);
    this.name = "GeminiHttpError";
  }
}

/** One signed attempt. Every call mints a new nonce — Gemini rejects reuse. */
async function signedPost<T>(
  path: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (!API_KEY || !API_SECRET) {
    throw new GeminiUnavailableError(
      "not_configured",
      "GEMINI_API_KEY / GEMINI_API_SECRET are not configured"
    );
  }

  const payload = { request: path, nonce: nextNonce(), ...params };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
    "base64"
  );
  const signature = createHmac("sha384", API_SECRET)
    .update(payloadBase64)
    .digest("hex");

  const res = await fetch(`${PRIVATE_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "0",
      "X-GEMINI-APIKEY": API_KEY,
      "X-GEMINI-PAYLOAD": payloadBase64,
      "X-GEMINI-SIGNATURE": signature,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // 401/403 is unambiguously our key. A 400 is NOT: Gemini answers a
    // malformed or unfillable ORDER with 400 too, so the reason field has to
    // decide. Treating every 400 as a credential problem would report an
    // insufficient-funds rejection as a misconfigured server.
    let reason = "";
    try {
      reason = String(((await res.json()) as { reason?: unknown }).reason ?? "");
    } catch {
      /* no JSON body — fall through to the generic error */
    }
    if (res.status === 401 || res.status === 403 || CREDENTIAL_REASONS.test(reason)) {
      throw new GeminiUnavailableError(
        "rejected",
        `Gemini rejected our credentials on ${path} (${res.status}${reason ? ` ${reason}` : ""})`
      );
    }
    throw new GeminiHttpError(res.status, path);
  }
  return (await res.json()) as T;
}

const RETRY_DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A signed request, optionally retried.
 *
 * `retries` is opt-in and deliberately stays at 0 for /v1/order/new and
 * /v1/order/cancel: repeating a write risks a second fill, and the idempotency
 * key plus a clear 504 is the right answer there instead. The read paths carry
 * no such risk — a balance or order-status fetch that fails on a transient
 * blip currently surfaces to the user as a 500 for no good reason.
 *
 * Each attempt re-signs from scratch, because the nonce cannot be reused.
 *
 * A timeout is NOT retried, even on a read. /v1/balances backs /api/account
 * and /api/holdings and coalesces concurrent callers onto one request, so a
 * second 8-second attempt would hold every waiting caller for sixteen seconds
 * to chase a call that has already proven slow. Retrying is for failures that
 * come back fast — a 5xx, a refused connection — where the second attempt
 * costs almost nothing.
 */
async function geminiPrivatePost<T>(
  path: string,
  params: Record<string, unknown> = {},
  { retries = 0 }: { retries?: number } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      return await signedPost<T>(path, params);
    } catch (err) {
      lastErr = err;
      // Absent or rejected credentials will not be different in 250ms, and a
      // 4xx is a decision rather than a blip. Repeating either changes nothing
      // and burns a nonce.
      if (err instanceof GeminiUnavailableError) throw err;
      const status = err instanceof GeminiHttpError ? err.status : undefined;
      if (status !== undefined && status < 500) throw err;
      // See above: a retry must be cheap, and a second timeout is not.
      if ((err as Error)?.name === "TimeoutError") throw err;
      if (attempt >= retries) break;
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

export interface PlaceGeminiOrderInput {
  symbol: string;
  amount: string;
  price: string;
  side: GeminiOrderSide;
  options?: GeminiOrderOption[];
  clientOrderId?: string; // idempotency key echoed to Gemini as client_order_id
}

export async function placeGeminiOrder(
  input: PlaceGeminiOrderInput
): Promise<GeminiOrderResponse> {
  return geminiPrivatePost<GeminiOrderResponse>("/v1/order/new", {
    symbol: input.symbol.toLowerCase(),
    amount: input.amount,
    price: input.price,
    side: input.side,
    type: "exchange limit",
    options: input.options ?? [],
    ...(input.clientOrderId ? { client_order_id: input.clientOrderId } : {}),
  });
}

export async function cancelGeminiOrder(
  orderId: string
): Promise<GeminiOrderResponse> {
  return geminiPrivatePost<GeminiOrderResponse>("/v1/order/cancel", {
    order_id: orderId,
  });
}

/**
 * Every order still live on the shared account's book, in ONE request.
 * Orders that have filled or been cancelled simply aren't in the response —
 * that absence is what tells orderSync which orders need an individual lookup.
 */
export async function getGeminiActiveOrders(): Promise<GeminiOrderResponse[]> {
  return geminiPrivatePost<GeminiOrderResponse[]>("/v1/orders", {}, { retries: 1 });
}

export async function getGeminiOrderStatus(
  orderId: string
): Promise<GeminiOrderResponse> {
  return geminiPrivatePost<GeminiOrderResponse>(
    "/v1/order/status",
    { order_id: orderId },
    { retries: 1 },
  );
}

// Balances change only when an order fills, but /api/account and /api/holdings
// read them on every request. Cache for a few seconds and coalesce concurrent
// callers onto one in-flight request, so a burst of dashboard loads can't blow
// through Gemini's private-API rate budget. Env-overridable; 0 disables.
const BALANCES_TTL_MS = Number(process.env.GEMINI_BALANCES_TTL_MS) || 3_000;
let balancesCache: { data: GeminiBalance[]; fetchedAt: number } | null = null;
let balancesInFlight: Promise<GeminiBalance[]> | null = null;
// Bumped by every invalidation. A fetch that was already in flight when the
// cache was cleared carries pre-fill balances, so it must not publish them as
// current — it compares the generation it started in before caching.
let balancesGeneration = 0;

export async function getGeminiBalances(): Promise<GeminiBalance[]> {
  if (balancesCache && Date.now() - balancesCache.fetchedAt < BALANCES_TTL_MS) {
    return balancesCache.data;
  }
  if (balancesInFlight) return balancesInFlight; // fold into the in-flight fetch
  const gen = balancesGeneration;
  let inFlight: Promise<GeminiBalance[]>;
  inFlight = geminiPrivatePost<GeminiBalance[]>("/v1/balances", {}, { retries: 1 })
    .then((data) => {
      // Stale by the time it landed (a fill cleared the cache meanwhile) —
      // hand the data to this caller but don't cache it.
      if (gen === balancesGeneration) {
        balancesCache = { data, fetchedAt: Date.now() };
      }
      return data;
    })
    .finally(() => {
      // Only clear the slot if it's still ours; a newer fetch may have claimed it.
      if (balancesInFlight === inFlight) balancesInFlight = null;
    });
  balancesInFlight = inFlight;
  return inFlight;
}

/** Invalidate the cached balances (a fill changed them) — also used by tests. */
export function clearBalancesCache(): void {
  balancesGeneration += 1;
  balancesCache = null;
  balancesInFlight = null;
}
