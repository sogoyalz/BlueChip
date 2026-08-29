/**
 * Reconciling an exchange observation onto a local order.
 *
 * Two writers touch the same order document: the cancel route (one-shot, user
 * initiated) and orderSync (every 5s). Both did read -> mutate -> save(), and
 * mongoose's default versioning only guards array paths, so concurrent scalar
 * writes were last-write-wins.
 *
 * The damaging interleaving:
 *
 *   1. order is OPEN; user clicks Cancel just as a sync tick begins
 *   2. both load the document
 *   3. Gemini fills the order completely in that instant
 *   4. sync's status call returns FILLED, executed 1.0   -> saves FILLED/1.0
 *   5. cancel's call returns is_cancelled, executed 0.4  -> saves CANCELLED/0.4
 *
 * Final state: CANCELLED/0.4 while the exchange says FILLED/1.0. And because
 * CANCELLED is terminal, orderSync's resting filter never looks at the order
 * again — the divergence is PERMANENT, and 0.6 of filled quantity is invisible
 * to the app forever.
 *
 * The fix keys off the one thing that is monotonic: an order's executed amount
 * on the exchange only ever increases. So the observation reporting MORE
 * executed is the more recent truth, whichever write happens to land first.
 */
import { shouldApplyObservation, TERMINAL_STATUSES } from "../services/orderState";

describe("shouldApplyObservation", () => {
  test("applies an observation that saw more executed", () => {
    expect(
      shouldApplyObservation(
        { status: "PARTIALLY_FILLED", filledQty: 0.4 },
        { status: "FILLED", filledQty: 1 }
      )
    ).toBe(true);
  });

  test("rejects an observation that saw LESS executed — the race", () => {
    // The cancel observed 0.4 before the order finished filling. Its write
    // arrives second, but its knowledge is older.
    expect(
      shouldApplyObservation(
        { status: "FILLED", filledQty: 1 },
        { status: "CANCELLED", filledQty: 0.4 }
      )
    ).toBe(false);
  });

  test("applies a status refinement at the same fill level", () => {
    // A cancel of an untouched resting order: nothing executed either side,
    // but OPEN -> CANCELLED is real information.
    expect(
      shouldApplyObservation(
        { status: "OPEN", filledQty: 0 },
        { status: "CANCELLED", filledQty: 0 }
      )
    ).toBe(true);
  });

  test("will not overwrite a terminal status at the same fill level", () => {
    // Both terminal, same executed amount: nothing new to say, and flip-flopping
    // between them is how the two writers used to fight.
    expect(
      shouldApplyObservation(
        { status: "CANCELLED", filledQty: 0.4 },
        { status: "FILLED", filledQty: 0.4 }
      )
    ).toBe(false);
  });

  test("treats a missing filledQty as zero (orders predating the field)", () => {
    expect(
      shouldApplyObservation({ status: "OPEN" }, { status: "PARTIALLY_FILLED", filledQty: 0.1 })
    ).toBe(true);
    expect(
      shouldApplyObservation({ status: "FILLED" }, { status: "CANCELLED", filledQty: 0 })
    ).toBe(false);
  });

  test("converges regardless of which writer lands first", () => {
    // Same two observations, both orderings, same end state.
    const fill = { status: "FILLED" as const, filledQty: 1 };
    const cancel = { status: "CANCELLED" as const, filledQty: 0.4 };

    // sync first, then cancel
    let stored: { status: string; filledQty?: number } = { status: "OPEN", filledQty: 0 };
    if (shouldApplyObservation(stored, fill)) stored = fill;
    if (shouldApplyObservation(stored, cancel)) stored = cancel;
    expect(stored).toEqual(fill);

    // cancel first, then sync
    stored = { status: "OPEN", filledQty: 0 };
    if (shouldApplyObservation(stored, cancel)) stored = cancel;
    if (shouldApplyObservation(stored, fill)) stored = fill;
    expect(stored).toEqual(fill);
  });

  test("terminal set is exactly the statuses orderSync stops reconciling", () => {
    // If these ever diverge, an order could be written to a terminal state that
    // the reconciler still scans, or vice versa.
    expect([...TERMINAL_STATUSES].sort()).toEqual(["CANCELLED", "FILLED", "REJECTED"]);
  });
});
