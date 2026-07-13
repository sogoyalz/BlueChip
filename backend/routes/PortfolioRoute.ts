// Portfolio-level endpoints: history of the one shared Gemini sandbox
// account's value over time.

import { Router } from "express";
import { trusted } from "mongoose";
import { SnapshotModel } from "../model/SnapshotModel";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { fromCents } from "../util/money";

const router = Router();

const RANGE_MS: Record<string, number> = {
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
};

const MAX_POINTS = 200;

router.get("/api/portfolio/history", verifyToken, async (req, res) => {
  try {
    const range = String(req.query.range || "1M");
    const filter: Record<string, unknown> = {};
    if (RANGE_MS[range]) {
      // trusted(): this $gte is built from our own RANGE_MS table, not user
      // input — sanitizeFilter is on globally.
      filter.ts = trusted({ $gte: new Date(Date.now() - RANGE_MS[range]) });
    } else if (range !== "ALL") {
      res.status(400).json({ message: "range must be 1D, 1W, 1M or ALL" });
      return;
    }

    const snapshots = await SnapshotModel.find(filter, "valueCents ts").sort({ ts: 1 });
    // Downsample evenly to MAX_POINTS, always keeping the newest point.
    const step = Math.ceil(snapshots.length / MAX_POINTS);
    const points = snapshots
      .filter((_, i) => i % step === 0 || i === snapshots.length - 1)
      // Convert stored integer cents back to dollars at the API edge. Pre-cents
      // snapshots lack valueCents; skip them rather than emit NaN — they age out
      // as new cents-based snapshots accumulate.
      .filter((s) => typeof s.valueCents === "number")
      .map((s) => ({ ts: s.ts.getTime(), value: fromCents(s.valueCents) }));

    res.json({ range, points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch portfolio history" });
  }
});

export default router;
