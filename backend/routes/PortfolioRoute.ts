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

// Hard cap on documents read per request. Snapshots accumulate forever — every
// 15 minutes plus one per fill — so an unbounded read grows without limit:
// ~2,900 documents after a month, ~35,000 after a year, all loaded and sorted
// to emit 200 points. Reading the NEWEST slice keeps the chart correct for
// every range except a very old "ALL", which degrades to "recent history"
// rather than degrading the server.
const MAX_DOCS = 5_000;

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

    // Newest-first with a cap, then flipped back to ascending for the chart.
    const newest = await SnapshotModel.find(filter, "valueCents ts")
      .sort({ ts: -1 })
      .limit(MAX_DOCS);
    const snapshots = newest.reverse();
    // Downsample evenly to MAX_POINTS, always keeping the newest point.
    const step = Math.ceil(snapshots.length / MAX_POINTS);
    const points = snapshots
      .filter((_, i) => i % step === 0 || i === snapshots.length - 1)
      // Convert stored integer cents back to dollars at the API edge. Skip
      // anything that is not a finite number: pre-cents snapshots have no
      // valueCents at all, and a historical row can hold Infinity, which
      // `typeof === "number"` happily accepts and which turns into NaN path
      // coordinates in the chart.
      .filter((s) => Number.isFinite(s.valueCents))
      .map((s) => ({ ts: s.ts.getTime(), value: fromCents(s.valueCents) }));

    res.json({ range, points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch portfolio history" });
  }
});

export default router;
