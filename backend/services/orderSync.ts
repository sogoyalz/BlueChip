// Reconciles local order status against Gemini, which now does all real
// matching. Resting orders are placed once (orderEngine.placeOrder) and
// then only Gemini's own book decides when/if they fill; this poller is
// how that state makes it back into MongoDB for the dashboard to read.

import { trusted } from "mongoose";
import { OrdersModel } from "../model/OrdersModel";
import { getGeminiOrderStatus, clearBalancesCache } from "./geminiPrivate";
import { snapshotNow } from "./snapshots";

export const DEFAULT_SYNC_MS = 5_000;

let timer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

/** One sync pass over locally-resting orders. Exported for tests. */
export async function tick(): Promise<void> {
  const resting = await OrdersModel.find({
    // trusted(): this $in is ours, not user input — sanitizeFilter is on globally.
    status: trusted({ $in: ["OPEN", "PARTIALLY_FILLED"] }),
  }).limit(500);

  for (const order of resting) {
    if (!order.geminiOrderId) continue;
    try {
      const result = await getGeminiOrderStatus(order.geminiOrderId);
      const executed = Number(result.executed_amount);
      const remaining = Number(result.remaining_amount);

      const status = result.is_cancelled
        ? "CANCELLED"
        : remaining === 0
        ? "FILLED"
        : executed > 0
        ? "PARTIALLY_FILLED"
        : "OPEN";

      // A resting order can also fill *more* without changing status (still
      // PARTIALLY_FILLED, but a higher executed amount and new avg price). Sync
      // when the status changed OR the fill price advanced.
      const nextFillPrice =
        executed > 0 ? Number(result.avg_execution_price) : order.fillPrice;
      const statusChanged = status !== order.status;
      const fillAdvanced = executed > 0 && nextFillPrice !== order.fillPrice;
      if (!statusChanged && !fillAdvanced) continue; // nothing changed

      order.status = status;
      if (executed > 0) {
        order.fillPrice = nextFillPrice;
        order.filledAt = new Date();
      }
      await order.save();
      if (status === "FILLED" || status === "PARTIALLY_FILLED") {
        clearBalancesCache(); // a resting order filled — balances changed
        void snapshotNow();
      }
    } catch (err) {
      console.error(`[orderSync] order ${order._id} failed:`, err);
    }
  }
}

export function startOrderSync(intervalMs: number = DEFAULT_SYNC_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    if (syncing) return; // never overlap slow passes
    syncing = true;
    void tick()
      .catch((err) => console.error("[orderSync] tick failed:", err))
      .finally(() => {
        syncing = false;
      });
  }, intervalMs);
}

export function stopOrderSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
