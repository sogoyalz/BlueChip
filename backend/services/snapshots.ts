// Shared-portfolio value snapshots. Two triggers: a periodic sweep (so the
// chart moves even between trades as prices drift) and a snapshot right
// after every fill (so trades show up immediately).

import { SnapshotModel } from "../model/SnapshotModel";
import { getGeminiBalances } from "./geminiPrivate";
import { getPrice } from "./priceFeed";
import { toCents } from "../util/money";

export const DEFAULT_SNAPSHOT_MS = 15 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

/**
 * Cash + every non-USD balance valued at the live cached price, in INTEGER
 * CENTS. Each dollar amount is rounded to cents individually before summing,
 * so the total is an exact integer-cent sum with no float drift.
 */
async function portfolioValue(): Promise<{ valueCents: number; cashCents: number }> {
  const balances = await getGeminiBalances();
  let cashCents = 0;
  let holdingsCents = 0;
  for (const b of balances) {
    const amount = Number(b.amount);
    if (b.currency === "USD") {
      cashCents += toCents(amount);
    } else {
      const symbol = `${b.currency}USD`;
      holdingsCents += toCents(amount * (getPrice(symbol)?.price ?? 0));
    }
  }
  return { cashCents, valueCents: cashCents + holdingsCents };
}

/** Snapshot the shared account now (fire-and-forget safe: never throws). */
export async function snapshotNow(): Promise<void> {
  try {
    const { cashCents, valueCents } = await portfolioValue();
    await SnapshotModel.create({ cashCents, valueCents, ts: new Date() });
  } catch (err) {
    console.warn("[snapshots] snapshotNow failed:", (err as Error).message);
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
