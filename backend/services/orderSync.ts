// Reconciles local order status against Gemini, which now does all real
// matching. Resting orders are placed once (orderEngine.placeOrder) and
// then only Gemini's own book decides when/if they fill; this poller is
// how that state makes it back into MongoDB for the dashboard to read.

import { trusted } from "mongoose";
import { OrdersModel } from "../model/OrdersModel";
import {
  GeminiOrderResponse,
  getGeminiActiveOrders,
  getGeminiOrderStatus,
  clearBalancesCache,
} from "./geminiPrivate";
import { snapshotNow } from "./snapshots";
import { applyObservation } from "./orderState";

export const DEFAULT_SYNC_MS = 5_000;
// Orders that have left Gemini's book need a status lookup of their own. Cap
// how many we resolve per pass so a burst of fills can't spike the private API;
// whatever is left over is picked up on the next tick a few seconds later.
export const MAX_STATUS_LOOKUPS_PER_TICK = 25;

let timer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

/** One sync pass over locally-resting orders. Exported for tests. */
export async function tick(): Promise<void> {
  const resting = await OrdersModel.find({
    // trusted(): this $in is ours, not user input — sanitizeFilter is on globally.
    status: trusted({ $in: ["OPEN", "PARTIALLY_FILLED"] }),
  }).limit(500);
  if (resting.length === 0) return;

  // One request covers every order that is still resting — the steady state,
  // and by far the common case. Only orders that have LEFT the book cost a
  // lookup of their own. (This used to be one status call per resting order per
  // tick, which walks straight into Gemini's private rate limit as orders pile
  // up: 100 resting orders meant 100 calls every 5 seconds.)
  //
  // The account is shared, so this list also carries orders placed by other
  // users (and anything placed on the sandbox account outside this app). We
  // only ever look up ids we already stored against a local order, so nothing
  // from another user's order can leak into a response.
  let active: Map<string, GeminiOrderResponse>;
  try {
    const live = await getGeminiActiveOrders();
    active = new Map(live.map((o) => [String(o.order_id), o]));
  } catch (err) {
    // Without the active list we can't tell "still resting" from "gone", and
    // guessing would mean N lookups again. Leave it for the next tick.
    console.error("[orderSync] could not list active orders:", err);
    return;
  }

  let lookups = 0;
  for (const order of resting) {
    if (!order.geminiOrderId) continue;
    try {
      let result = active.get(order.geminiOrderId);
      if (!result) {
        // Off the book: filled or cancelled. Only these need resolving.
        if (lookups >= MAX_STATUS_LOOKUPS_PER_TICK) continue;
        lookups += 1;
        result = await getGeminiOrderStatus(order.geminiOrderId);
      }
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
      // PARTIALLY_FILLED, just a larger executed amount). Sync when the status
      // changed OR more of it executed than we have recorded.
      const nextFillPrice =
        executed > 0 ? Number(result.avg_execution_price) : order.fillPrice;
      const statusChanged = status !== order.status;
      const fillAdvanced = executed > 0 && executed !== (order.filledQty ?? 0);
      if (!statusChanged && !fillAdvanced) continue; // nothing changed

      // Conditional + atomic: a cancel racing this tick may already have
      // written a NEWER observation, and last-write-wins would clobber it.
      const updated = await applyObservation(order._id, {
        status,
        filledQty: executed,
        fillPrice: executed > 0 ? nextFillPrice : undefined,
      });
      if (!updated) continue; // a fresher observation won; nothing to do
      // Only a NEW execution moves the shared account's balances — including
      // one on a CANCELLED order that partially filled before the cancel
      // landed. A cancel that executed nothing new leaves balances alone.
      if (fillAdvanced) {
        clearBalancesCache();
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
