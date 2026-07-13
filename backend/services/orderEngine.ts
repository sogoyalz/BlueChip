// Orders execute for real against Gemini's SANDBOX exchange — a real
// matching engine, real order lifecycle, fake (test) funds. This process
// never mutates a balance directly; Gemini is the source of truth for
// fills, and orderSync.ts reconciles local order status against it.

import { Types, HydratedDocument } from "mongoose";
import { OrdersModel } from "../model/OrdersModel";
import { isSupported } from "../config/symbols";
import { getPrice, isFresh } from "./priceFeed";
import { placeGeminiOrder, cancelGeminiOrder, clearBalancesCache } from "./geminiPrivate";
import { snapshotNow } from "./snapshots";
import { MAX_NOTIONAL, MAX_QTY, roundQty, roundUsd } from "../util/money";
import { IOrder, OrderSide, OrderType } from "../schemas/OrdersSchema";

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
  const qty = roundQty(Number(input.qty));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new OrderError(400, "qty must be a number > 0");
  }
  if (qty > MAX_QTY) {
    throw new OrderError(400, "qty exceeds the maximum order size");
  }

  let limitPrice: number | undefined;
  if (type === "LIMIT") {
    limitPrice = roundUsd(Number(input.limitPrice));
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      throw new OrderError(400, "limitPrice must be a number > 0 for LIMIT orders");
    }
  }

  let clientOrderId: string | undefined;
  if (input.clientOrderId !== undefined) {
    if (typeof input.clientOrderId !== "string" || input.clientOrderId.length > 100) {
      throw new OrderError(400, "clientOrderId must be a string of at most 100 chars");
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
  const { symbol, side, type, qty, limitPrice, clientOrderId } = validate(input);

  // Idempotency: if the caller supplied a key and we've already recorded an
  // order for it, return that one instead of placing a second order on the
  // exchange (a retry after a slow-but-successful first attempt).
  if (clientOrderId) {
    const existing = await OrdersModel.findOne({ userId, clientOrderId });
    if (existing) return existing;
  }

  if (!isFresh(symbol)) {
    throw new OrderError(503, "Market data unavailable — try again shortly");
  }
  const price = getPrice(symbol)!.price;

  const orderPrice = type === "MARKET" ? price : limitPrice!;
  if (type === "LIMIT" && orderPrice > price * 100) {
    throw new OrderError(400, "limitPrice is implausibly far from the market");
  }
  if (roundUsd(qty * orderPrice) > MAX_NOTIONAL) {
    throw new OrderError(400, "Order notional exceeds the maximum");
  }

  const geminiPrice =
    type === "MARKET"
      ? side === "BUY"
        ? roundUsd(price * (1 + MARKET_IOC_SLIPPAGE))
        : roundUsd(price * (1 - MARKET_IOC_SLIPPAGE))
      : limitPrice!;

  let geminiResult;
  try {
    geminiResult = await placeGeminiOrder({
      symbol,
      amount: String(qty),
      price: String(geminiPrice),
      side: side === "BUY" ? "buy" : "sell",
      options: type === "MARKET" ? ["immediate-or-cancel"] : undefined,
      clientOrderId, // Gemini dedupes on this too, so even a retry that races
      // past our findOne can't double-fill on the exchange.
    });
  } catch (err) {
    console.error("Gemini order placement failed:", err);
    throw new OrderError(502, "Order could not be placed on the exchange");
  }

  const executed = Number(geminiResult.executed_amount);
  const remaining = Number(geminiResult.remaining_amount);
  const status =
    executed === 0
      ? type === "MARKET"
        ? "REJECTED"
        : "OPEN"
      : remaining === 0
      ? "FILLED"
      : type === "MARKET"
      ? "PARTIALLY_FILLED"
      : "OPEN";

  let order: HydratedDocument<IOrder>;
  try {
    order = await OrdersModel.create({
      userId,
      symbol,
      side,
      type,
      status,
      qty,
      limitPrice: type === "LIMIT" ? limitPrice : undefined,
      geminiOrderId: geminiResult.order_id,
      clientOrderId,
      fillPrice: executed > 0 ? Number(geminiResult.avg_execution_price) : undefined,
      filledAt: executed > 0 ? new Date() : undefined,
      reason:
        status === "REJECTED" ? "Order did not fill (immediate-or-cancel)" : undefined,
    });
  } catch (err) {
    // Two identical requests raced past the findOne above and both placed on
    // Gemini (which deduped on client_order_id, so no double-fill). The unique
    // (userId, clientOrderId) index rejects the second insert — return the
    // order the first one persisted.
    if (clientOrderId && (err as { code?: number }).code === 11000) {
      const existing = await OrdersModel.findOne({ userId, clientOrderId });
      if (existing) return existing;
    }
    throw err;
  }

  if (executed > 0) {
    // The fill just changed balances — drop the short-lived cache so the
    // snapshot below and the user's next account/holdings read are fresh.
    clearBalancesCache();
    void snapshotNow();
  }

  return order;
}

/** Cancel a resting order: Gemini is the source of truth, cancelled first. */
export async function cancelOrder(
  geminiOrderId: string
): Promise<{ status: "CANCELLED" | "FILLED"; fillPrice?: number }> {
  const result = await cancelGeminiOrder(geminiOrderId);
  const executed = Number(result.executed_amount);
  if (result.is_cancelled) {
    return {
      status: "CANCELLED",
      fillPrice: executed > 0 ? Number(result.avg_execution_price) : undefined,
    };
  }
  // Filled before the cancel reached Gemini.
  return { status: "FILLED", fillPrice: Number(result.avg_execution_price) };
}
