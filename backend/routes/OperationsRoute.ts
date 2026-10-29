import { Router } from "express";
import { Types, trusted } from "mongoose";
import rateLimit from "express-rate-limit";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { isOperator, requireOperator } from "../middlewares/OperatorMiddleware";
import { OrdersModel } from "../model/OrdersModel";
import { IOrder } from "../schemas/OrdersSchema";
import { appendOrderEvent } from "../schemas/OrderEvent";
import { getReconciliationStatus, RECONCILIATION_MESSAGES } from "../services/reconciliationDiagnostics";
import { log } from "../util/logger";

const router = Router();
const uncertain = ["PENDING", "UNKNOWN"];
const recheckLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => String(req.user!._id), message: { message: "Too many rechecks. Try again shortly." } });

// Explicit serialization keeps hashes, upstream payloads, and other user data private.
function diagnostics(order: IOrder & { _id: Types.ObjectId }, operator: boolean) {
  return {
    _id: order._id, ...(operator ? { ownerId: order.userId } : {}),
    symbol: order.symbol, side: order.side, type: order.type, status: order.status,
    qty: order.qty, filledQty: order.filledQty, limitPrice: order.limitPrice, fillPrice: order.fillPrice,
    createdAt: order.createdAt, filledAt: order.filledAt, clientOrderId: order.clientOrderId,
    geminiOrderId: order.geminiOrderId, exchangeClientOrderId: order.exchangeClientOrderId,
    submittedAmount: order.submittedAmount, submittedPrice: order.submittedPrice,
    lastCheckedAt: order.lastCheckedAt, nextCheckAt: order.nextCheckAt,
    reconciliationAttempts: order.reconciliationAttempts ?? 0,
    lastReconciliationCode: order.lastReconciliationCode,
    lastReconciliationErrorAt: order.lastReconciliationErrorAt,
    reconciliationMessage: RECONCILIATION_MESSAGES[order.lastReconciliationCode ?? ""],
    recoveryMode: !uncertain.includes(order.status) ? "observed"
      : order.geminiOrderId || order.exchangeClientOrderId ? "automatic_lookup" : "manual_investigation",
    recentEvents: (order.recentEvents ?? []).slice(-50).map(event => ({
      kind: event.kind, at: event.at, status: event.status, filledQty: event.filledQty,
      ...(operator ? { actorId: event.actorId } : {}),
      // Notes are internal codes or locally generated messages, never upstream bodies.
      note: event.note,
    })),
  };
}

router.get("/api/session", verifyToken, (req, res) => {
  res.json({ id: req.user!._id, username: req.user!.username, isOperator: isOperator(req.user!._id) });
});

router.get("/api/orders/:id/diagnostics", verifyToken, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) { res.status(404).json({ message: "Order not found" }); return; }
    const operator = isOperator(req.user!._id);
    const order = await OrdersModel.findOne({ _id: id, ...(!operator ? { userId: req.user!._id } : {}) });
    if (!order) { res.status(404).json({ message: "Order not found" }); return; }
    res.json({ order: diagnostics(order, operator), isOperator: operator });
  } catch (err) {
    log.error("operations.diagnostics_failed", { err: err as Error });
    res.status(500).json({ message: "Could not load order diagnostics" });
  }
});

router.get("/api/operations/orders", verifyToken, requireOperator, async (req, res) => {
  try {
    const filter: Record<string, unknown> = { status: trusted({ $in: uncertain }) };
    const page = { ...filter };
    if (req.query.cursor !== undefined) {
      try {
        if (typeof req.query.cursor !== "string" || req.query.cursor.length > 512) throw Error();
        const cursor = JSON.parse(Buffer.from(req.query.cursor, "base64url").toString());
        const date = new Date(cursor.ts);
        if (!Number.isFinite(date.getTime()) || !Types.ObjectId.isValid(cursor.id)) throw Error();
        page.$or = [{ createdAt: trusted({ $gt: date }) }, { createdAt: date, _id: trusted({ $gt: new Types.ObjectId(cursor.id) }) }];
      } catch { res.status(400).json({ message: "Invalid queue cursor" }); return; }
    }
    const [orders, total] = await Promise.all([
      OrdersModel.find(page).sort({ createdAt: 1, _id: 1 }).limit(51), OrdersModel.countDocuments(filter),
    ]);
    const rows = orders.slice(0, 50), last = rows[rows.length - 1];
    res.json({ orders: rows.map(order => diagnostics(order, true)), total,
      nextCursor: orders.length > 50 && last ? Buffer.from(JSON.stringify({ ts: last.createdAt.toISOString(), id: String(last._id) })).toString("base64url") : "",
      sync: getReconciliationStatus(), exchangeConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_SECRET),
    });
  } catch (err) {
    log.error("operations.queue_failed", { err: err as Error });
    res.status(500).json({ message: "Could not load operations queue" });
  }
});

// Scheduling a status lookup never submits, cancels, or guesses an exchange order.
router.post("/api/operations/orders/:id/reconcile", verifyToken, requireOperator, recheckLimiter, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) { res.status(404).json({ message: "Order not found" }); return; }
    const now = new Date();
    const filter: Record<string, unknown> = {
      _id: id, status: trusted({ $in: uncertain }),
      $and: [
        { $or: [{ status: "UNKNOWN" }, { createdAt: trusted({ $lte: new Date(now.getTime() - 30_000) }) }] },
        { $or: [{ geminiOrderId: trusted({ $type: "string", $ne: "" }) }, { exchangeClientOrderId: trusted({ $type: "string", $ne: "" }) }] },
        { $or: [{ lastOperatorRecheckAt: trusted({ $exists: false }) }, { lastOperatorRecheckAt: trusted({ $lte: new Date(now.getTime() - 30_000) }) }] },
      ],
    };
    const order = await OrdersModel.findOneAndUpdate(filter, { $set: { nextCheckAt: now, lastOperatorRecheckAt: now },
      $push: { recentEvents: appendOrderEvent("RECHECK_REQUESTED", { actorId: req.user!._id }) },
    }, { returnDocument: "after" });
    if (!order) {
      const exists = await OrdersModel.exists({ _id: id });
      res.status(exists ? 409 : 404).json({ message: exists
        ? "Recheck requires an unresolved order with an exchange identifier, outside its 30-second submission/recheck window."
        : "Order not found" }); return;
    }
    res.status(202).json({ message: "Status lookup scheduled. The order will not be resubmitted.", order: diagnostics(order, true) });
  } catch (err) {
    log.error("operations.recheck_failed", { err: err as Error });
    res.status(500).json({ message: "Could not schedule status lookup" });
  }
});

export default router;
