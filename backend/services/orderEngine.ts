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
import { MAX_NOTIONAL, MAX_QTY, exchangeAmount, exchangePrice, roundQty, roundUsd } from "../util/money";
import { IOrder, OrderSide, OrderType } from "../schemas/OrdersSchema";
import { log, alert } from "../util/logger";

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
    // A timeout is NOT a rejection. The request may have reached Gemini and
    // been accepted; we simply never heard back. Reporting that as "could not
    // be placed" tells the user something we do not know, and if they retry
    // without an idempotency key they can place it a second time for real.
    if ((err as Error).name === "TimeoutError") {
      alert("orders.place_timeout", {
        userId: String(userId),
        symbol,
        side,
        qty,
        clientOrderId,
        // Whether a retry is safe hinges entirely on this: with a key, Gemini
        // dedupes and our unique index refuses a second row. Without one,
        // retrying risks a duplicate order on the exchange.
        retrySafe: Boolean(clientOrderId),
        err: err as Error,
      });
      throw new OrderError(
        504,
        clientOrderId
          ? "Timed out waiting for the exchange. Your order may still have been placed — retrying with the same request is safe."
          : "Timed out waiting for the exchange. Your order may still have been placed — check your orders before trying again."
      );
    }
    log.error("orders.place_rejected", {
      userId: String(userId),
      symbol,
      side,
      qty,
      err: err as Error,
    });
    throw new OrderError(502, "Order could not be placed on the exchange");
  }

  const executed = exchangeAmount(geminiResult.executed_amount);
  // remaining stays a raw Number() on purpose: NaN === 0 is false, so an
  // unparseable remaining can never satisfy the FILLED test below — which is
  // the safe direction, since FILLED is terminal and never re-reconciled.
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
      filledQty: executed > 0 ? executed : undefined,
      limitPrice: type === "LIMIT" ? limitPrice : undefined,
      geminiOrderId: geminiResult.order_id,
      clientOrderId,
      // exchangePrice, not Number(): a malformed avg_execution_price is NaN,
      // which mongoose refuses with a CastError — and a failed create here
      // means the order is LIVE on the exchange with no local record, the
      // orphaned-fill path. Losing the whole order over an unreadable price on
      // a fill we otherwise know everything about is the wrong trade.
      fillPrice: executed > 0 ? exchangePrice(geminiResult.avg_execution_price) : undefined,
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
    // Anything else means the order is LIVE ON THE EXCHANGE but we failed to
    // record it — balances have moved and nothing local knows about it. Log the
    // exchange's own id loudly so it can be reconciled by hand; the caller
    // still gets an error rather than a false success.
    // The one condition nothing else can reconcile: money moved on the
    // exchange and we have no record of it. This is what monitoring is for.
    alert("orders.orphaned_fill", {
      geminiOrderId: geminiResult.order_id,
      userId: String(userId),
      symbol,
      side,
      qty,
      executed,
      err: err as Error,
    });
    if (executed > 0) {
      // The trade happened regardless of our write failing. Leaving the cached
      // balance in place would serve a figure we already know is wrong to every
      // /api/account and /api/holdings read until the TTL expires, and the
      // snapshot series would skip the move entirely.
      clearBalancesCache();
      void snapshotNow();
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
): Promise<{ status: "CANCELLED" | "FILLED"; fillPrice?: number; filledQty?: number }> {
  const result = await cancelGeminiOrder(geminiOrderId);
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
