import { Router } from "express";
import { Types } from "mongoose";
import { OrdersModel } from "../model/OrdersModel";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { orderLimiter } from "../middlewares/rateLimit";
import { OrderError, placeOrder, cancelOrder } from "../services/orderEngine";

const router = Router();

// Place an order. 201 = accepted (check order.status: a MARKET order can
// still come back REJECTED, e.g. insufficient funds — that's an order
// outcome, not a request error).
router.post("/api/orders", verifyToken, orderLimiter, async (req, res) => {
  try {
    const order = await placeOrder(req.user!._id, req.body);
    res.status(201).json({ order });
  } catch (err) {
    if (err instanceof OrderError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ message: "Failed to place order" });
  }
});

// The user's own orders, newest first. ?status=open narrows to resting
// limit orders.
router.get("/api/orders", verifyToken, async (req, res) => {
  try {
    const filter: Record<string, unknown> = { userId: req.user!._id };
    if (req.query.status === "open") filter.status = "OPEN";
    const orders = await OrdersModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(orders);
  } catch (err) {
    console.error(err);
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
    const order = await OrdersModel.findOne({
      _id: orderId,
      userId: req.user!._id,
      status: "OPEN",
    });
    if (!order || !order.geminiOrderId) {
      res.status(409).json({ message: "Order not open (already filled or cancelled)" });
      return;
    }

    const result = await cancelOrder(order.geminiOrderId);
    order.status = result.status;
    if (result.fillPrice !== undefined) {
      order.fillPrice = result.fillPrice;
      order.filledAt = new Date();
    }
    await order.save();
    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to cancel order" });
  }
});

export default router;
