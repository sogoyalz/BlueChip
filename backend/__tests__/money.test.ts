import { roundUsd, roundQty, toCents, fromCents, QTY_EPSILON } from "../util/money";

describe("roundUsd", () => {
  test("rounds to 2 decimal places", () => {
    expect(roundUsd(10.005)).toBe(10.01);
    expect(roundUsd(10.004)).toBe(10);
    expect(roundUsd(0.1 + 0.2)).toBe(0.3);
  });

  test("handles large notionals without drift", () => {
    expect(roundUsd(99999.999)).toBe(100000);
  });
});

describe("roundQty", () => {
  test("rounds to 8 decimal places", () => {
    expect(roundQty(0.123456789)).toBe(0.12345679);
    expect(roundQty(1e-9)).toBe(0);
  });

  test("float subtraction dust rounds away", () => {
    // 0.3 - 0.1 - 0.2 leaves ~-2.8e-17 in raw float math
    expect(roundQty(0.3 - 0.1 - 0.2)).toBe(0);
  });
});

describe("integer cents", () => {
  test("toCents rounds to an integer number of cents", () => {
    expect(toCents(10.005)).toBe(1001);
    expect(toCents(10.004)).toBe(1000);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  test("fromCents is the inverse for whole cents", () => {
    expect(fromCents(1001)).toBe(10.01);
    expect(fromCents(9000000)).toBe(90000);
  });

  test("summing in cents never drifts sub-cent", () => {
    // Summing 0.1 as a float 10 times drifts (0.9999...); in cents it's exact.
    let cents = 0;
    for (let i = 0; i < 10; i++) cents += toCents(0.1);
    expect(cents).toBe(100);
    expect(fromCents(cents)).toBe(1);
  });
});

describe("constants", () => {
  test("epsilon is sane", () => {
    expect(QTY_EPSILON).toBeGreaterThan(0);
    expect(QTY_EPSILON).toBeLessThan(1e-6);
  });
});

describe("non-finite money never reaches a total", () => {
  // Balance amounts arrive from Gemini as strings and go through Number().
  // "abc" becomes NaN and "1e999" becomes Infinity, and either one poisons the
  // sum it lands in. Verified against a real database: mongoose REJECTS a NaN
  // valueCents (so the snapshot is silently dropped and portfolio history just
  // stops growing), while Infinity is ACCEPTED and stored — and the history
  // route's `typeof valueCents === "number"` guard does not catch it, because
  // typeof Infinity is "number". One bad response permanently poisons the chart.
  test("toCents refuses NaN", () => {
    expect(() => toCents(NaN)).toThrow(/non-finite/i);
  });

  test("toCents refuses Infinity in both directions", () => {
    expect(() => toCents(Infinity)).toThrow(/non-finite/i);
    expect(() => toCents(-Infinity)).toThrow(/non-finite/i);
  });

  test("finite values are unaffected", () => {
    expect(toCents(10.005)).toBe(1001);
    expect(toCents(0)).toBe(0);
    expect(toCents(-3.5)).toBe(-350);
  });

  test("a bad string amount is caught where it is parsed", () => {
    expect(() => toCents(Number("abc") * 78000)).toThrow(/non-finite/i);
    expect(() => toCents(Number("1e999") * 78000)).toThrow(/non-finite/i);
  });
});

