// Background matcher for resting LIMIT orders. Every tick it scans OPEN
// limit orders and fills the ones the live Gemini price has crossed
// (price-or-better: a BUY fills when market <= limit, a SELL when
// market >= limit), executing at the current market price.

import { OrdersModel } from "../model/OrdersModel";
import { applyFillEffects } from "./orderEngine";
import { getPrice, isFresh } from "./priceFeed";
import { snapshotUser } from "./snapshots";

export const DEFAULT_TICK_MS = 2_000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function crossed(
  side: "BUY" | "SELL",
  marketPrice: number,
  limitPrice: number
): boolean {
  return side === "BUY" ? marketPrice <= limitPrice : marketPrice >= limitPrice;
}

/** One matcher pass. Exported for tests. */
export async function tick(): Promise<void> {
  const open = await OrdersModel.find({ status: "OPEN", type: "LIMIT" }).limit(500);

  for (const order of open) {
    try {
      if (!isFresh(order.symbol)) continue; // never fill on stale data
      const price = getPrice(order.symbol)!.price;
      if (!crossed(order.side, price, order.limitPrice!)) continue;

      // Claim the order atomically: only one of {matcher, cancel endpoint}
      // can win the OPEN -> terminal transition. Losing means the user
      // cancelled between our find() and now — skip, no portfolio effects.
      const claimed = await OrdersModel.findOneAndUpdate(
        { _id: order._id, status: "OPEN" },
        { $set: { status: "FILLED", fillPrice: price, filledAt: new Date() } }
      );
      if (!claimed) continue;

      // Note: if the process crashes between the claim above and the
      // portfolio mutation below, the order shows FILLED without effects.
      // Acceptable for paper trading; a real exchange would journal fills
      // and replay on startup.
      const fill = await applyFillEffects(
        order.userId,
        order.symbol,
        order.side,
        order.qty,
        price
      );
      if (fill.reason) {
        await OrdersModel.updateOne(
          { _id: order._id },
          {
            $set: { status: "REJECTED", reason: fill.reason },
            $unset: { fillPrice: "", filledAt: "" },
          }
        );
      } else {
        if (fill.realizedPnl !== undefined) {
          await OrdersModel.updateOne(
            { _id: order._id },
            { $set: { realizedPnl: fill.realizedPnl } }
          );
        }
        void snapshotUser(order.userId);
      }
    } catch (err) {
      console.error(`[matcher] order ${order._id} failed:`, err);
    }
  }
}

export function startMatcher(intervalMs: number = DEFAULT_TICK_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    if (ticking) return; // never overlap slow passes
    ticking = true;
    void tick()
      .catch((err) => console.error("[matcher] tick failed:", err))
      .finally(() => {
        ticking = false;
      });
  }, intervalMs);
}

export function stopMatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
