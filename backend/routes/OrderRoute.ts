import { Router } from "express";
import { Types, trusted } from "mongoose";
import { OrdersModel } from "../model/OrdersModel";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { orderLimiter } from "../middlewares/rateLimit";
import { OrderError, placeOrder, cancelOrder } from "../services/orderEngine";
import { clearBalancesCache, GeminiUnavailableError } from "../services/geminiPrivate";
import { snapshotNow } from "../services/snapshots";
import { applyObservation, RESTING_STATUSES } from "../services/orderState";
import { log } from "../util/logger";
import { IOrder } from "../schemas/OrdersSchema";

const router = Router();

// One page of orders. Bounded so a long history cannot make the response
// unbounded; the true total travels in X-Total-Count.
const ORDER_PAGE_SIZE = 100;

function orderSummary(order: IOrder & { _id?: unknown }) {
  return {
      _id: order._id, symbol: order.symbol, side: order.side, type: order.type, status: order.status,
      qty: order.qty, filledQty: order.filledQty, limitPrice: order.limitPrice, fillPrice: order.fillPrice,
      geminiOrderId: order.geminiOrderId, clientOrderId: order.clientOrderId,
      reason: order.reason, createdAt: order.createdAt, filledAt: order.filledAt,
  };
}


// Place an order. 201 = accepted (check order.status: a MARKET order can
// still come back REJECTED, e.g. insufficient funds — that's an order
// outcome, not a request error).
router.post("/api/orders", verifyToken, orderLimiter, async (req, res) => {
  try {
    const order = await placeOrder(req.user!._id, req.body);
    res.status(order.status === "PENDING" || order.status === "UNKNOWN" ? 202 : 201).json({ order: orderSummary(order) });
  } catch (err) {
    if (err instanceof OrderError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    // Same distinction as the account routes: an unconfigured or rejected key
    // is a setup problem, and telling the user "failed to place order" hides
    // that the order was never attempted.
    if (err instanceof GeminiUnavailableError) {
      log.warn("orders.exchange_unavailable", { reason: err.reason });
      res.status(503).json({
        code: "exchange_unavailable",
        message: "Trading is unavailable: this server's exchange connection is not set up.",
      });
      return;
    }
    log.error("orders.place_failed", {
      userId: String(req.user?._id),
      symbol: req.body?.symbol,
      err: err as Error,
    });
    res.status(500).json({ message: "Failed to place order" });
  }
});

// The user's own orders, newest first. ?status=open narrows to orders still
// resting on the exchange — which includes a partially-filled limit whose
// remainder is on the book, not just untouched OPEN ones.
router.get("/api/orders", verifyToken, async (req, res) => {
  try {
    const filter: Record<string, unknown> = { userId: req.user!._id };
    if (req.query.status === "open") {
      filter.status = trusted({ $in: RESTING_STATUSES });
    } else if (req.query.status === "pending") {
      filter.status = trusted({ $in: ["PENDING", "UNKNOWN"] });
    } else if (req.query.status !== undefined && req.query.status !== "all") {
      res.status(400).json({ message: "status must be all, open or pending" }); return;
    }
    if (req.query.symbol !== undefined) {
      if (typeof req.query.symbol !== "string" || !/^[A-Za-z0-9]{3,20}$/.test(req.query.symbol)) {
        res.status(400).json({ message: "Invalid symbol filter" }); return;
      }
      filter.symbol = req.query.symbol.toUpperCase();
    }
    const pageFilter = { ...filter };
    if (req.query.cursor !== undefined) {
      try {
        if (typeof req.query.cursor !== "string" || req.query.cursor.length > 512) throw new Error();
        const cursor = JSON.parse(Buffer.from(req.query.cursor, "base64url").toString()) as { ts: string; id: string };
        const date = new Date(cursor.ts);
        if (!Number.isFinite(date.getTime()) || !Types.ObjectId.isValid(cursor.id)) throw new Error();
        pageFilter.$or = [
          { createdAt: trusted({ $lt: date }) },
          { createdAt: date, _id: trusted({ $lt: new Types.ObjectId(cursor.id) }) },
        ];
      } catch { res.status(400).json({ message: "Invalid order cursor" }); return; }
    }
    const found = await OrdersModel.find(pageFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(ORDER_PAGE_SIZE + 1);
    const orders = found.slice(0, ORDER_PAGE_SIZE);
    const last = orders[orders.length - 1];
    res.set("X-Next-Cursor", found.length > ORDER_PAGE_SIZE && last
      ? Buffer.from(JSON.stringify({ ts: last.createdAt.toISOString(), id: String(last._id) })).toString("base64url") : "");

    // The list is capped, so its length is not the user's order count. The
    // heading used to render that length as the total, telling someone with
    // 150 orders they had 100. Sent as a header so the response body stays the
    // plain array every caller already expects.
    res.set("X-Total-Count", String(await OrdersModel.countDocuments(filter)));
    res.json(orders.map(orderSummary));
  } catch (err) {
    log.error("orders.list_failed", { userId: String(req.user?._id), err: err as Error });
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// Cancel a resting order. Gemini is the source of truth: we cancel there
// first, then reconcile local status to match whatever it reports (an
// order can fill on the exchange in the moment before our cancel lands).
router.post("/api/orders/:id/cancel", verifyToken, orderLimiter, async (req, res) => {
  try {
    // A malformed id would make the query below throw a CastError (-> 500);
    // it can only ever mean "no such order". @types/express@5 types a route
    // param as string | string[], so coerce before validating/querying.
    const orderId = String(req.params.id);
    if (!Types.ObjectId.isValid(orderId)) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    // Resting means OPEN or PARTIALLY_FILLED: a limit order that partly
    // crossed keeps its remainder on the book, and refusing to cancel it
    // left exactly those orders stuck on the shared account until they
    // happened to fill.
    const order = await OrdersModel.findOne({
      _id: orderId,
      userId: req.user!._id,
      status: trusted({ $in: RESTING_STATUSES }),
    });
    if (!order || !order.geminiOrderId) {
      res.status(409).json({ message: "Order is not resting (already filled or cancelled)" });
      return;
    }

    const result = await cancelOrder(order.geminiOrderId);
    // Conditional + atomic. An orderSync tick may have observed this order
    // more recently than the cancel did (it can fill completely while the
    // cancel is in flight); the newer observation must win regardless of
    // which write lands second.
    const updated = await applyObservation(order._id, {
      status: result.status,
      filledQty: result.filledQty ?? 0,
      fillPrice: result.fillPrice,
      actorId: req.user!._id,
    });
    // Part of it executed before the cancel landed — balances moved.
    clearBalancesCache(); // cancellation releases holds even without a fill
    if (result.filledQty) {
      void snapshotNow();
    }
    // If a fresher observation won, report THAT state, not the one we lost with.
    const current = updated ?? (await OrdersModel.findById(order._id));
    res.json({ order: current ? orderSummary(current) : null });
  } catch (err) {
    log.error("orders.cancel_failed", {
      userId: String(req.user?._id),
      orderId: String(req.params.id),
      err: err as Error,
    });
    res.status(500).json({ message: "Failed to cancel order" });
  }
});

export default router;
