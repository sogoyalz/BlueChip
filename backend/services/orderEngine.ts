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

/**
 * Apply the portfolio effects of filling `qty` of `symbol` at `price`.
 * Returns null on success or a human-readable rejection reason. Never
 * leaves money half-moved: a BUY whose holding update fails refunds the
 * debit before reporting failure.
 */
export async function applyFillEffects(
  userId: Types.ObjectId | string,
  symbol: string,
  side: OrderSide,
  qty: number,
  price: number
): Promise<string | null> {
  if (side === "BUY") {
    const cost = roundUsd(qty * price);
    const debit = await UserModel.updateOne(
      { _id: userId, balance: { $gte: cost } },
      { $inc: { balance: -cost } }
    );
    if (debit.modifiedCount === 0) return "Insufficient funds";

    try {
      await upsertHolding(userId, symbol, qty, cost, price);
    } catch (err) {
      // E11000 = two first-buys of the same symbol raced the unique index;
      // the row exists now, so the retry takes the increment path.
      if ((err as { code?: number }).code === 11000) {
        try {
          await upsertHolding(userId, symbol, qty, cost, price);
          return null;
        } catch (retryErr) {
          console.error("holding upsert retry failed:", retryErr);
        }
      } else {
        console.error("holding upsert failed:", err);
      }
      // Give the money back rather than swallowing it.
      await UserModel.updateOne({ _id: userId }, { $inc: { balance: cost } });
      return "Order failed — funds were not deducted";
    }
    return null;
  }

  // SELL: take the quantity first (guarded), then credit the proceeds.
  const decrement = await HoldingsModel.updateOne(
    { userId, symbol, qty: { $gte: qty - QTY_EPSILON } },
    { $inc: { qty: -qty } }
  );
  if (decrement.modifiedCount === 0) return "Insufficient quantity";

  // A sell-everything can leave ~1e-12 behind; drop dust rows.
  await HoldingsModel.deleteMany({ userId, symbol, qty: { $lte: QTY_EPSILON } });

  const proceeds = roundUsd(qty * price);
  await UserModel.updateOne({ _id: userId }, { $inc: { balance: proceeds } });
  return null;
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
    const reason = await applyFillEffects(userId, symbol, side, qty, price);
    if (reason) {
      order.status = "REJECTED";
      order.reason = reason;
    } else {
      order.status = "FILLED";
      order.fillPrice = price;
      order.filledAt = new Date();
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
