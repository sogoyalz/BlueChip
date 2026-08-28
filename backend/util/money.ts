// Money and quantity helpers shared by order validation and the Gemini
// sandbox order client.
//
// All USD amounts are rounded to 2dp and all asset quantities to 8dp at
// every mutation boundary so floating-point drift never accumulates.

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

// Integer-cents helpers for STORED/AGGREGATED money (portfolio value, cash
// balance). Summing many float dollar amounts drifts sub-cent; summing integer
// cents does not. Snapshots persist cents; the API converts back to dollars at
// the edge. (Order *prices* — limitPrice/fillPrice — stay decimal: they mirror
// Gemini's own decimal price model and are the exchange's to be the ledger of.)
export function toCents(usd: number): number {
  // Amounts and prices arrive from the exchange as strings and reach here via
  // Number(). "abc" becomes NaN, "1e999" becomes Infinity, and either one
  // poisons whatever total it lands in. Checked against a real database:
  // mongoose rejects a NaN valueCents (so the snapshot is dropped silently and
  // portfolio history simply stops growing) while Infinity is ACCEPTED and
  // persisted — and `typeof Infinity === "number"`, so a guard written to skip
  // bad points lets it through to the chart, permanently. Refuse it here, at
  // the one place every stored total passes through.
  if (!Number.isFinite(usd)) {
    throw new RangeError(`toCents received a non-finite value: ${usd}`);
  }
  return Math.round(usd * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}
