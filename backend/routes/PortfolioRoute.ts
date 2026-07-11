// Portfolio-level endpoints: the public leaderboard (auth-gated but
// cross-user) and, later, per-user history.

import { Router } from "express";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";
import { SnapshotModel } from "../model/SnapshotModel";
import { verifyToken } from "../middlewares/AuthMiddleware";
import { getPrice } from "../services/priceFeed";
import { STARTING_CASH, roundUsd } from "../util/money";

const router = Router();

export interface LeaderboardRow {
  userId: string;
  username: string;
  value: number;
  returnPct: number;
  rank: number;
}

// One in-JS pass over users+holdings is fine at portfolio-project scale;
// swap for a $lookup aggregation if user counts ever make this hot.
async function computeLeaderboard(): Promise<LeaderboardRow[]> {
  const [users, holdings] = await Promise.all([
    UserModel.find({}, "username balance"),
    HoldingsModel.find({}, "userId symbol qty avgCost"),
  ]);

  const valueByUser = new Map<string, number>();
  for (const h of holdings) {
    const live = getPrice(h.symbol);
    const value = h.qty * (live?.price ?? h.avgCost);
    const key = String(h.userId);
    valueByUser.set(key, (valueByUser.get(key) ?? 0) + value);
  }

  const rows = users.map((u) => {
    const value = roundUsd(
      (u.balance ?? STARTING_CASH) + (valueByUser.get(String(u._id)) ?? 0)
    );
    return {
      userId: String(u._id),
      username: u.username,
      value,
      returnPct: roundUsd(((value - STARTING_CASH) / STARTING_CASH) * 100),
      rank: 0,
    };
  });

  rows.sort((a, b) => b.value - a.value);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

// Memoized so a page full of users doesn't recompute every request.
const MEMO_TTL_MS = 30_000;
let memo: { rows: LeaderboardRow[]; at: number } | null = null;

/** Test helper. */
export function clearLeaderboardMemo(): void {
  memo = null;
}

router.get("/api/leaderboard", verifyToken, async (req, res) => {
  try {
    if (!memo || Date.now() - memo.at > MEMO_TTL_MS) {
      memo = { rows: await computeLeaderboard(), at: Date.now() };
    }
    const meId = String(req.user!._id);
    const me = memo.rows.find((r) => r.userId === meId) ?? null;
    res.json({
      rows: memo.rows
        .slice(0, 25)
        .map(({ rank, username, value, returnPct }) => ({
          rank,
          username,
          value,
          returnPct,
        })),
      me: me && {
        rank: me.rank,
        username: me.username,
        value: me.value,
        returnPct: me.returnPct,
      },
      totalUsers: memo.rows.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to compute leaderboard" });
  }
});

const RANGE_MS: Record<string, number> = {
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
};

const MAX_POINTS = 200;

router.get("/api/portfolio/history", verifyToken, async (req, res) => {
  try {
    const range = String(req.query.range || "1M");
    const filter: Record<string, unknown> = { userId: req.user!._id };
    if (RANGE_MS[range]) {
      filter.ts = { $gte: new Date(Date.now() - RANGE_MS[range]) };
    } else if (range !== "ALL") {
      res.status(400).json({ message: "range must be 1D, 1W, 1M or ALL" });
      return;
    }

    const snapshots = await SnapshotModel.find(filter, "value ts").sort({ ts: 1 });
    // Downsample evenly to MAX_POINTS, always keeping the newest point.
    const step = Math.ceil(snapshots.length / MAX_POINTS);
    const points = snapshots
      .filter((_, i) => i % step === 0 || i === snapshots.length - 1)
      .map((s) => ({ ts: s.ts.getTime(), value: s.value }));

    res.json({ range, points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch portfolio history" });
  }
});

export default router;
