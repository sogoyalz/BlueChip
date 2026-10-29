// Orders execute for real against Gemini's SANDBOX exchange — a real
// matching engine, real order lifecycle, fake (test) funds. This process
// never mutates a balance directly; Gemini is the source of truth for
// fills, and orderSync.ts reconciles local order status against it.

import { Types, HydratedDocument, trusted } from "mongoose";
import { createHash, randomUUID } from "crypto";
import { canonicalDecimal, exactIncrement, marketLimit } from "../util/decimal";
import { getTradingRules } from "./tradingRules";
import { usableExchangeObservation } from "./exchangeObservation";
import { OrdersModel } from "../model/OrdersModel";
import { isSupported } from "../config/symbols";
import { getPrice, isFresh, DEFAULT_MAX_AGE_MS } from "./priceFeed";
import { placeGeminiOrder, cancelGeminiOrder, clearBalancesCache, GeminiUnavailableError, GeminiHttpError } from "./geminiPrivate";
import { snapshotNow } from "./snapshots";
import { MAX_NOTIONAL, MAX_QTY, exchangeAmount, exchangePrice, roundUsd } from "../util/money";
import { IOrder, OrderSide, OrderType } from "../schemas/OrdersSchema";
import { alert } from "../util/logger";
import { orderEvent, appendOrderEvent } from "../schemas/OrderEvent";

// A MARKET order is emulated as an immediate-or-cancel limit order priced
// to cross the book: a BUY bids above the ask, a SELL offers below the bid.
export const MARKET_IOC_SLIPPAGE = 0.01;

export class OrderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface PlaceOrderInput {
  symbol?: unknown;
  side?: unknown;
  type?: unknown;
  qty?: unknown;
  limitPrice?: unknown;
  clientOrderId?: unknown; // optional idempotency key
}

interface ValidatedOrder {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number;
  clientOrderId?: string;
}

function validate(input: PlaceOrderInput): ValidatedOrder {
  const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : "";
  if (!isSupported(symbol)) {
    throw new OrderError(400, "Unknown or unsupported symbol");
  }
  const side = input.side;
  if (side !== "BUY" && side !== "SELL") {
    throw new OrderError(400, "side must be BUY or SELL");
  }
  const type = input.type;
  if (type !== "MARKET" && type !== "LIMIT") {
    throw new OrderError(400, "type must be MARKET or LIMIT");
  }
  const qty = Number(input.qty);
  if ((typeof input.qty !== "number" && typeof input.qty !== "string") || !Number.isFinite(qty) || qty <= 0) {
    throw new OrderError(400, "qty must be a number > 0");
  }
  if (qty > MAX_QTY) {
    throw new OrderError(400, "qty exceeds the maximum order size");
  }

  let limitPrice: number | undefined;
  if (type === "LIMIT") {
    limitPrice = Number(input.limitPrice);
    if ((typeof input.limitPrice !== "number" && typeof input.limitPrice !== "string") || !Number.isFinite(limitPrice) || limitPrice <= 0) {
      throw new OrderError(400, "limitPrice must be a number > 0 for LIMIT orders");
    }
  }

  let clientOrderId: string | undefined;
  if (input.clientOrderId !== undefined) {
    if (typeof input.clientOrderId !== "string" || !/^[a-zA-Z0-9:_\-.#]{1,36}$/.test(input.clientOrderId)) {
      throw new OrderError(400, "clientOrderId must contain 1–36 letters, digits, or : _ - . #");
    }
    clientOrderId = input.clientOrderId;
  }

  return { symbol, side, type, qty, limitPrice, clientOrderId };
}

/**
 * Place an order for a user against the Gemini sandbox exchange.
 * Throws OrderError for invalid input / unavailable market data / a
 * rejection from Gemini itself; returns the persisted order document
 * otherwise (check .status for the outcome — orderSync.ts keeps resting
 * orders in sync with Gemini after this call returns).
 */
export async function placeOrder(
  userId: Types.ObjectId | string,
  input: PlaceOrderInput
): Promise<HydratedDocument<IOrder>> {
  const validated = validate(input);
  const { symbol, side, type, qty, limitPrice } = validated;
  const clientOrderId = validated.clientOrderId ?? randomUUID();
  let amountText: string, limitText: string | undefined;
  try {
    amountText = canonicalDecimal(input.qty as string | number);
    limitText = type === "LIMIT" ? canonicalDecimal(input.limitPrice as string | number) : undefined;
  } catch (err) { throw new OrderError(400, (err as Error).message); }
  const requestHash = createHash("sha256").update(JSON.stringify({ symbol, side, type, qty: amountText, limitPrice: limitText })).digest("hex");

  function replay(existing: HydratedDocument<IOrder>): HydratedDocument<IOrder> {
    // Older orders do not have a hash. Compare their actual instructions.
    const matches = existing.requestHash
      ? existing.requestHash === requestHash
      : existing.symbol === symbol && existing.side === side && existing.type === type &&
        existing.qty === qty && (existing.limitPrice ?? undefined) === limitPrice;
    if (!matches) throw new OrderError(409, "This request ID already belongs to a different order");
    return existing;
  }
  const previous = await OrdersModel.findOne({ userId, clientOrderId });
  if (previous) return replay(previous);
  if (!isFresh(symbol)) throw new OrderError(503, "Market data unavailable — try again shortly");
  let rules;
  try { rules = await getTradingRules(symbol); }
  catch { throw new OrderError(503, "Exchange trading rules unavailable — try again shortly"); }
  // A cold metadata request can outlive the freshness window. Use the latest
  // quote after that await, rather than submitting against an earlier read.
  if (!isFresh(symbol)) throw new OrderError(503, "Market data unavailable — try again shortly");
  const quote = getPrice(symbol)!;
  const price = quote.price;
  if (type === "LIMIT" && limitPrice! > price * 100) throw new OrderError(400, "limitPrice is implausibly far from the market");
  let amount: string, geminiPrice: string;
  try {
    amount = exactIncrement(amountText, rules.tickSize);
    if (qty < rules.minOrderSize) throw new Error(`Minimum order size is ${rules.minOrderSize}`);
    geminiPrice = type === "LIMIT" ? exactIncrement(limitText!, rules.quoteIncrement)
      : marketLimit(price, side, rules.quoteIncrement);
  } catch (err) { throw new OrderError(400, (err as Error).message); }
  if (roundUsd(qty * Number(geminiPrice)) > MAX_NOTIONAL) throw new OrderError(400, "Order notional exceeds the maximum");

  // Reserve the request BEFORE the external side effect. The unique index
  // elects one submitter, including concurrent requests on different sockets.
  let order: HydratedDocument<IOrder>;
  try {
    order = await OrdersModel.create({
      userId, symbol, side, type, qty, limitPrice, clientOrderId, requestHash,
      exchangeClientOrderId: randomUUID(), status: "PENDING", lastCheckedAt: new Date(),
      submittedAmount: amount, submittedPrice: geminiPrice,
      recentEvents: [orderEvent("INTENT_RECORDED", { status: "PENDING" })],
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const existing = await OrdersModel.findOne({ userId, clientOrderId });
      if (existing) return replay(existing);
    }
    throw err; // no request was sent if persistence failed
  }

  let result;
  // Persistence can also be slow. A request known not to have been sent can
  // be rejected safely if its chosen quote expires while reserving the row.
  if (!isFresh(symbol) || Date.now() - quote.updatedAt > DEFAULT_MAX_AGE_MS) {
    const reason = "Market data expired before submission. Place a new order when prices recover.";
    await OrdersModel.updateOne({ _id: order._id, status: "PENDING" }, {
      $set: { status: "REJECTED", reason }, $push: { recentEvents: appendOrderEvent("REJECTED", { status: "REJECTED", note: reason }) },
    });
    throw new OrderError(503, reason);
  }
  try {
    result = await placeGeminiOrder({ symbol, amount, price: geminiPrice,
      side: side === "BUY" ? "buy" : "sell",
      options: type === "MARKET" ? ["immediate-or-cancel"] : undefined,
      clientOrderId: order.exchangeClientOrderId,
    });
  } catch (err) {
    const unavailable = typeof GeminiUnavailableError === "function" && err instanceof GeminiUnavailableError;
    const refused = typeof GeminiHttpError === "function" && err instanceof GeminiHttpError && err.status < 500;
    const status = unavailable || refused ? "REJECTED" : "UNKNOWN";
    const reason = status === "UNKNOWN"
      ? "Exchange confirmation pending. This order will be reconciled; do not place a replacement."
      : unavailable ? "Exchange connection unavailable" : "Exchange rejected this order";
    await OrdersModel.updateOne({ _id: order._id, status: "PENDING" }, {
      $set: { status, reason },
      $push: { recentEvents: appendOrderEvent(status === "UNKNOWN" ? "CONFIRMATION_PENDING" : "REJECTED", { status, note: reason }) },
    });
    order.status = status; order.reason = reason;
    if (unavailable) throw err;
    if (status === "UNKNOWN") {
      clearBalancesCache();
      alert("orders.confirmation_pending", { orderId: String(order._id), userId: String(userId), err: err as Error });
      return order;
    }
    throw new OrderError(502, reason);
  }

  // An incomplete response is uncertain, never a fabricated rejection/fill.
  if (!usableExchangeObservation(result)) {
    clearBalancesCache();
    await OrdersModel.updateOne({ _id: order._id, status: "PENDING" }, {
      $set: { status: "UNKNOWN", reason: "Exchange confirmation pending" },
      $push: { recentEvents: appendOrderEvent("CONFIRMATION_PENDING", { status: "UNKNOWN", note: "Exchange returned an incomplete response" }) },
    });
    order.status = "UNKNOWN"; order.reason = "Exchange confirmation pending";
    return order;
  }
  const executed = Number(result.executed_amount), remaining = Number(result.remaining_amount);
  const status = type === "MARKET" && executed === 0 ? "REJECTED"
    : remaining === 0 ? "FILLED" : result.is_cancelled ? "CANCELLED"
    : executed > 0 ? "PARTIALLY_FILLED" : "OPEN";
  const fields = {
    status, geminiOrderId: String(result.order_id), filledQty: executed,
    fillPrice: executed > 0 ? exchangePrice(result.avg_execution_price) : undefined,
    filledAt: executed > 0 ? new Date() : undefined,
    reason: status === "REJECTED" ? "Order did not fill (immediate-or-cancel)" : undefined,
  };
  // Availability changes on a hold too, even without a fill.
  clearBalancesCache();
  if (executed > 0) void snapshotNow();
  try {
    const updated = await OrdersModel.findOneAndUpdate(
      { _id: order._id, status: trusted({ $in: ["PENDING", "UNKNOWN"] }) },
      { $set: fields, $push: { recentEvents: appendOrderEvent("EXCHANGE_OBSERVED", { status, filledQty: executed }) } }, { returnDocument: "after" }
    );
    return updated ?? (await OrdersModel.findById(order._id)) ?? order;
  } catch (err) {
    // The PENDING record survives, including its exchange client ID. Recovery
    // can look it up after restart even when this acknowledgement write fails.
    alert("orders.acknowledgement_failed", { orderId: String(order._id), geminiOrderId: result.order_id, err: err as Error });
    throw err;
  }
}

/** Cancel a resting order: Gemini is the source of truth, cancelled first. */
export async function cancelOrder(
  geminiOrderId: string
): Promise<{ status: "CANCELLED" | "FILLED"; fillPrice?: number; filledQty?: number }> {
  const result = await cancelGeminiOrder(geminiOrderId);
  clearBalancesCache();
  if (!usableExchangeObservation(result) || (!result.is_cancelled && (result.is_live || Number(result.remaining_amount) !== 0))) {
    throw new OrderError(502, "Cancellation is not confirmed. The order remains tracked for reconciliation.");
  }
  const executed = exchangeAmount(result.executed_amount);
  if (result.is_cancelled) {
    return {
      status: "CANCELLED",
      fillPrice: executed > 0 ? exchangePrice(result.avg_execution_price) : undefined,
      filledQty: executed > 0 ? executed : undefined,
    };
  }
  // Filled before the cancel reached Gemini.
  return {
    status: "FILLED",
    fillPrice: exchangePrice(result.avg_execution_price),
    filledQty: executed > 0 ? executed : undefined,
  };
}
