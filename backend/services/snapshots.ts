// Portfolio value snapshots. Two triggers: a periodic sweep over all users
// (so charts move even for idle accounts as prices drift) and a per-user
// snapshot right after every fill (so trades show up immediately).

import { Types } from "mongoose";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";
import { SnapshotModel } from "../model/SnapshotModel";
import { getPrice } from "./priceFeed";
import { STARTING_CASH, roundUsd } from "../util/money";

export const DEFAULT_SNAPSHOT_MS = 15 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

interface HoldingLike {
  symbol: string;
  qty: number;
  avgCost: number;
}

function portfolioValue(cash: number, holdings: HoldingLike[]): number {
  return roundUsd(
    cash +
      holdings.reduce(
        (sum, h) => sum + h.qty * (getPrice(h.symbol)?.price ?? h.avgCost),
        0
      )
  );
}

/** Snapshot one user now (fire-and-forget safe: never throws). */
export async function snapshotUser(
  userId: Types.ObjectId | string
): Promise<void> {
  try {
    const user = await UserModel.findById(userId);
    if (!user) return;
    const holdings = (await HoldingsModel.find({ userId })) ?? [];
    const cash = roundUsd(user.balance ?? STARTING_CASH);
    await SnapshotModel.create({
      userId,
      cash,
      value: portfolioValue(cash, holdings),
      ts: new Date(),
    });
  } catch (err) {
    console.warn("[snapshots] snapshotUser failed:", (err as Error).message);
  }
}

/** One sweep over every user. Exported for tests. */
export async function snapshotAll(): Promise<void> {
  const [users, holdings] = await Promise.all([
    UserModel.find({}, "balance"),
    HoldingsModel.find({}, "userId symbol qty avgCost"),
  ]);

  const byUser = new Map<string, HoldingLike[]>();
  for (const h of holdings) {
    const key = String(h.userId);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key)!.push(h);
  }

  const ts = new Date();
  const docs = users.map((u) => {
    const cash = roundUsd(u.balance ?? STARTING_CASH);
    return {
      userId: u._id,
      cash,
      value: portfolioValue(cash, byUser.get(String(u._id)) ?? []),
      ts,
    };
  });
  if (docs.length > 0) await SnapshotModel.insertMany(docs);
}

export function startSnapshots(intervalMs: number = DEFAULT_SNAPSHOT_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void snapshotAll()
      .catch((err) => console.error("[snapshots] sweep failed:", err))
      .finally(() => {
        sweeping = false;
      });
  }, intervalMs);
}

export function stopSnapshots(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
