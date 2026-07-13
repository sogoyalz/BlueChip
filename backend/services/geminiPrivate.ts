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

async function geminiPrivatePost<T>(
  path: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (!API_KEY || !API_SECRET) {
    throw new Error("GEMINI_API_KEY / GEMINI_API_SECRET are not configured");
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
  });
  if (!res.ok) {
    throw new Error(`Gemini ${path} responded ${res.status}`);
  }
  return (await res.json()) as T;
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

export async function getGeminiOrderStatus(
  orderId: string
): Promise<GeminiOrderResponse> {
  return geminiPrivatePost<GeminiOrderResponse>("/v1/order/status", {
    order_id: orderId,
  });
}

// Balances change only when an order fills, but /api/account and /api/holdings
// read them on every request. Cache for a few seconds and coalesce concurrent
// callers onto one in-flight request, so a burst of dashboard loads can't blow
// through Gemini's private-API rate budget. Env-overridable; 0 disables.
const BALANCES_TTL_MS = Number(process.env.GEMINI_BALANCES_TTL_MS) || 3_000;
let balancesCache: { data: GeminiBalance[]; fetchedAt: number } | null = null;
let balancesInFlight: Promise<GeminiBalance[]> | null = null;

export async function getGeminiBalances(): Promise<GeminiBalance[]> {
  if (balancesCache && Date.now() - balancesCache.fetchedAt < BALANCES_TTL_MS) {
    return balancesCache.data;
  }
  if (balancesInFlight) return balancesInFlight; // fold into the in-flight fetch
  balancesInFlight = geminiPrivatePost<GeminiBalance[]>("/v1/balances")
    .then((data) => {
      balancesCache = { data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      balancesInFlight = null;
    });
  return balancesInFlight;
}

/** Test helper: drop the cached balances so a test starts from a clean slate. */
export function clearBalancesCache(): void {
  balancesCache = null;
  balancesInFlight = null;
}
