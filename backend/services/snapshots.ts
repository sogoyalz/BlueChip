// Shared-portfolio value snapshots. Two triggers: a periodic sweep (so the
// chart moves even between trades as prices drift) and a snapshot right
// after every fill (so trades show up immediately).

import { SnapshotModel } from "../model/SnapshotModel";
import { portfolioCents } from "./account";
import { log } from "../util/logger";

export const DEFAULT_SNAPSHOT_MS = 15 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;



/**
 * Snapshot the shared account now (fire-and-forget safe: never throws).
 *
 * If any balance or price is not a finite number, portfolioValue() throws and
 * nothing is written. That is deliberate: a portfolio value we know to be
 * wrong is worse than a gap in the series, and a non-finite one would corrupt
 * the chart for good.
 */
export async function snapshotNow(): Promise<void> {
  try {
    const { cashCents, valueCents, complete } = await portfolioCents();
    if (!complete) {
      // A snapshot is permanent. Writing a total that omits a holding we could
      // not price would put a point on the chart that is known to be too low,
      // indistinguishable forever from a real dip. A gap in the series is
      // recoverable; a wrong point is not.
      log.warn("snapshots.skipped_incomplete", {
        reason: "at least one holding had no cached price",
      });
      return;
    }
    await SnapshotModel.create({ cashCents, valueCents, ts: new Date() });
  } catch (err) {
    log.warn("snapshots.failed", { err: err as Error });
  }
}

export function startSnapshots(intervalMs: number = DEFAULT_SNAPSHOT_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void snapshotNow().finally(() => {
      sweeping = false;
    });
  }, intervalMs);
}

export function stopSnapshots(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
