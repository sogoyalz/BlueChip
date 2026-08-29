// Portfolio-level endpoints: history of the one shared Gemini sandbox
// account's value over time.

import { Router } from "express";
import { SnapshotModel } from "../model/SnapshotModel";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { fromCents } from "../util/money";
import { log } from "../util/logger";

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
    const match: Record<string, unknown> = {};
    if (RANGE_MS[range]) {
      match.ts = { $gte: new Date(Date.now() - RANGE_MS[range]) };
    } else if (range !== "ALL") {
      res.status(400).json({ message: "range must be 1D, 1W, 1M or ALL" });
      return;
    }

    // Downsample in the DATABASE, not in this process.
    //
    // Snapshots accumulate forever — every 15 minutes plus one per fill, so
    // ~2,900 after a month and ~35,000 after a year. Reading them all to emit
    // 200 points meant the work grew without bound, continuously and silently.
    //
    // $bucketAuto splits the matched range into at most MAX_POINTS buckets of
    // roughly equal span and returns one row per bucket, so the documents
    // crossing the wire stay constant no matter how much history exists, and
    // "ALL" still means all of it rather than a recent slice. Buckets come back
    // ordered by their lower bound, which is already the chronological order
    // the chart wants, and taking the LAST value in each bucket means the final
    // bucket carries the newest snapshot.
    //
    // The pipeline is built from our own RANGE_MS table, never from user input.
    const buckets = await SnapshotModel.aggregate<{
      ts: Date;
      valueCents: number;
    }>([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      { $sort: { ts: 1 } },
      {
        $bucketAuto: {
          groupBy: "$ts",
          buckets: MAX_POINTS,
          output: {
            ts: { $last: "$ts" },
            valueCents: { $last: "$valueCents" },
          },
        },
      },
    ]);

    const points = buckets
      // Skip anything that is not a finite number: pre-cents snapshots have no
      // valueCents at all, and a historical row can hold Infinity, which
      // `typeof === "number"` happily accepts and which turns into NaN path
      // coordinates in the chart.
      .filter((b) => Number.isFinite(b.valueCents))
      .map((b) => ({ ts: b.ts.getTime(), value: fromCents(b.valueCents) }));

    res.json({ range, points });
  } catch (err) {
    log.error("portfolio.history_failed", { range: String(req.query.range), err: err as Error });
    res.status(500).json({ message: "Failed to fetch portfolio history" });
  }
});

export default router;
