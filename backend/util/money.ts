// Money and quantity helpers for the paper-trading engine.
//
// All USD amounts are rounded to 2dp and all asset quantities to 8dp at
// every mutation boundary so floating-point drift never accumulates in
// the database. Balances are only ever changed via conditional $inc
// updates (never user.save()), so these helpers are the single place
// rounding happens.

export const STARTING_CASH = 100_000;

// A sell of "everything" can leave ~1e-12 behind after float math; any
// holding at or below this is considered dust and gets cleaned up.
export const QTY_EPSILON = 1e-9;

// Sanity caps on a single order.
export const MAX_QTY = 1_000_000;
export const MAX_NOTIONAL = 10_000_000;

export function roundUsd(n: number): number {
  return Math.round(n * 100) / 100 + 0; // + 0 normalizes -0
}

export function roundQty(n: number): number {
  return Math.round(n * 1e8) / 1e8 + 0;
}

/**
 * New weighted-average cost after buying `buyQty` at `price` on top of an
 * existing position of `prevQty` at `prevAvg`.
 */
export function weightedAvgCost(
  prevQty: number,
  prevAvg: number,
  buyQty: number,
  price: number
): number {
  if (prevQty <= 0) return price;
  return (prevQty * prevAvg + buyQty * price) / (prevQty + buyQty);
}
