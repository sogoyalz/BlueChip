// The simulated exchange core. Orders execute against live Gemini prices
// but settle entirely in our own MongoDB — no real funds ever move.
//
// Concurrency model: no locks, no transactions. Every balance/holding
// mutation is a MongoDB conditional atomic update ("compare-and-swap"):
// the debit only happens if the balance still covers it, the sell
// decrement only happens if the quantity is still held. A losing race
// turns into a clean REJECTED order instead of a negative balance.

import { Types, HydratedDocument } from "mongoose";
import { HoldingsModel } from "../model/HoldingsModel";
import { OrdersModel } from "../model/OrdersModel";
import { UserModel } from "../model/UserModel";
import { isSupported } from "../config/symbols";
import { getPrice, isFresh } from "./priceFeed";
import { snapshotUser } from "./snapshots";
import {
  MAX_NOTIONAL,
  MAX_QTY,
  QTY_EPSILON,
  roundQty,
  roundUsd,
} from "../util/money";
import { IOrder, OrderSide, OrderType } from "../schemas/OrdersSchema";

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
}

interface ValidatedOrder {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number;
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

  return { symbol, side, type, qty, limitPrice };
}

export interface FillResult {
  /** null = success; otherwise a human-readable rejection reason */
  reason: string | null;
  /** SELL fills only: profit locked in vs weighted-average cost */
  realizedPnl?: number;
}

/**
 * Apply the portfolio effects of filling `qty` of `symbol` at `price`.
 * Never leaves money half-moved: a BUY whose holding update fails refunds
 * the debit before reporting failure.
 */
export async function applyFillEffects(
  userId: Types.ObjectId | string,
  symbol: string,
  side: OrderSide,
  qty: number,
  price: number
): Promise<FillResult> {
  if (side === "BUY") {
    const cost = roundUsd(qty * price);
    const debit = await UserModel.updateOne(
      { _id: userId, balance: { $gte: cost } },
      { $inc: { balance: -cost } }
    );
    if (debit.modifiedCount === 0) return { reason: "Insufficient funds" };

    try {
      await upsertHolding(userId, symbol, qty, cost, price);
    } catch (err) {
      // E11000 = two first-buys of the same symbol raced the unique index;
      // the row exists now, so the retry takes the increment path.
      if ((err as { code?: number }).code === 11000) {
        try {
          await upsertHolding(userId, symbol, qty, cost, price);
          return { reason: null };
        } catch (retryErr) {
          console.error("holding upsert retry failed:", retryErr);
        }
      } else {
        console.error("holding upsert failed:", err);
      }
      // Give the money back rather than swallowing it.
      await UserModel.updateOne({ _id: userId }, { $inc: { balance: cost } });
      return { reason: "Order failed — funds were not deducted" };
    }
    return { reason: null };
  }

  // SELL: read the cost basis (avgCost only changes on buys, so this is
  // race-safe against other sells), take the quantity (guarded), then
  // credit proceeds and book the realized P&L in one atomic $inc.
  const holding = await HoldingsModel.findOne({ userId, symbol });
  const avgCost = holding?.avgCost ?? 0;

  const decrement = await HoldingsModel.updateOne(
    { userId, symbol, qty: { $gte: qty - QTY_EPSILON } },
    { $inc: { qty: -qty } }
  );
  if (decrement.modifiedCount === 0) return { reason: "Insufficient quantity" };

  // A sell-everything can leave ~1e-12 behind; drop dust rows.
  await HoldingsModel.deleteMany({ userId, symbol, qty: { $lte: QTY_EPSILON } });

  const proceeds = roundUsd(qty * price);
  const realizedPnl = roundUsd((price - avgCost) * qty);
  await UserModel.updateOne(
    { _id: userId },
    { $inc: { balance: proceeds, realizedPnl } }
  );
  return { reason: null, realizedPnl };
}

/**
 * Race-free weighted-average upsert: the whole read-compute-write of
 * qty/avgCost happens inside one aggregation-pipeline update on the server.
 */
function upsertHolding(
  userId: Types.ObjectId | string,
  symbol: string,
  qty: number,
  cost: number,
  price: number
) {
  const prevQty = { $ifNull: ["$qty", 0] };
  return HoldingsModel.findOneAndUpdate(
    { userId, symbol },
    [
      {
        $set: {
          avgCost: {
            $round: [
              {
                $cond: [
                  { $gt: [prevQty, 0] },
                  {
                    $divide: [
                      {
                        $add: [
                          { $multiply: [prevQty, { $ifNull: ["$avgCost", 0] }] },
                          cost,
                        ],
                      },
                      { $add: [prevQty, qty] },
                    ],
                  },
                  price,
                ],
              },
              2,
            ],
          },
          qty: { $round: [{ $add: [prevQty, qty] }, 8] },
        },
      },
    ],
    // updatePipeline: mongoose 9 requires explicit opt-in for
    // aggregation-pipeline updates.
    { upsert: true, new: true, updatePipeline: true }
  );
}

/**
 * Place an order for a user. MARKET orders fill (or reject) immediately at
 * the cached live price; LIMIT orders rest OPEN for the matcher.
 * Throws OrderError for invalid input / unavailable market data; returns
 * the persisted order document otherwise (check .status for the outcome).
 */
export async function placeOrder(
  userId: Types.ObjectId | string,
  input: PlaceOrderInput
): Promise<HydratedDocument<IOrder>> {
  const { symbol, side, type, qty, limitPrice } = validate(input);

  // Both order types need a live price — market to fill at, limit for the
  // sanity/affordability checks.
  if (!isFresh(symbol)) {
    throw new OrderError(503, "Market data unavailable — try again shortly");
  }
  const price = getPrice(symbol)!.price;

  if (type === "MARKET") {
    if (roundUsd(qty * price) > MAX_NOTIONAL) {
      throw new OrderError(400, "Order notional exceeds the maximum");
    }
    const order = await OrdersModel.create({
      userId,
      symbol,
      side,
      type,
      status: "OPEN",
      qty,
    });
    const fill = await applyFillEffects(userId, symbol, side, qty, price);
    if (fill.reason) {
      order.status = "REJECTED";
      order.reason = fill.reason;
    } else {
      order.status = "FILLED";
      order.fillPrice = price;
      order.filledAt = new Date();
      if (fill.realizedPnl !== undefined) order.realizedPnl = fill.realizedPnl;
      // Fire-and-forget: the Summary chart gets a point at every fill.
      void snapshotUser(userId);
    }
    await order.save();
    return order;
  }

  // LIMIT
  const lp = limitPrice!;
  if (lp > price * 100) {
    throw new OrderError(400, "limitPrice is implausibly far from the market");
  }
  if (roundUsd(qty * lp) > MAX_NOTIONAL) {
    throw new OrderError(400, "Order notional exceeds the maximum");
  }

  // Soft affordability check — advisory only. Funds/quantity are checked
  // for real (atomically) when the matcher fills the order.
  if (side === "BUY") {
    const user = await UserModel.findById(userId);
    if (user && roundUsd(qty * lp) > (user.balance ?? 0)) {
      throw new OrderError(422, "Order cost exceeds your available balance");
    }
  } else {
    const holding = await HoldingsModel.findOne({ userId, symbol });
    if (!holding || holding.qty + QTY_EPSILON < qty) {
      throw new OrderError(422, "You don't hold enough to sell that quantity");
    }
  }

  return OrdersModel.create({
    userId,
    symbol,
    side,
    type,
    status: "OPEN",
    qty,
    limitPrice: lp,
  });
}
