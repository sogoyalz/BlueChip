import {
  roundUsd,
  roundQty,
  weightedAvgCost,
  QTY_EPSILON,
  STARTING_CASH,
} from "../util/money";

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

describe("weightedAvgCost", () => {
  test("first buy sets avg to the fill price", () => {
    expect(weightedAvgCost(0, 0, 1, 50000)).toBe(50000);
  });

  test("averages a second buy by quantity", () => {
    // 1 @ 100 then 1 @ 200 → avg 150
    expect(weightedAvgCost(1, 100, 1, 200)).toBe(150);
    // 3 @ 10 then 1 @ 50 → (30 + 50) / 4 = 20
    expect(weightedAvgCost(3, 10, 1, 50)).toBe(20);
  });

  test("fractional quantities average correctly", () => {
    expect(weightedAvgCost(0.5, 40000, 0.5, 60000)).toBe(50000);
  });
});

describe("constants", () => {
  test("starting cash and epsilon are sane", () => {
    expect(STARTING_CASH).toBe(100000);
    expect(QTY_EPSILON).toBeGreaterThan(0);
    expect(QTY_EPSILON).toBeLessThan(1e-6);
  });
});
