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
