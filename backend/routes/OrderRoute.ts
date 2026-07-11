import { Router } from "express";
import { OrdersModel } from "../model/OrdersModel";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { orderLimiter } from "../middlewares/rateLimit";
import { OrderError, placeOrder } from "../services/orderEngine";

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

// Cancel a resting order. The OPEN-status filter makes this atomic against
// the matcher: whoever transitions the order first wins.
router.post("/api/orders/:id/cancel", verifyToken, orderLimiter, async (req, res) => {
  try {
    const cancelled = await OrdersModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!._id, status: "OPEN" },
      { $set: { status: "CANCELLED" } },
      { new: true }
    );
    if (!cancelled) {
      res.status(409).json({ message: "Order not open (already filled or cancelled)" });
      return;
    }
    res.json({ order: cancelled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to cancel order" });
  }
});

export default router;
