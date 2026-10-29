import { exactIncrement, marketLimit } from "../util/decimal";
test("preserves valid decimal prices and quantities without floating remainder errors", () => {
  expect(exactIncrement(0.0899, "0.00001")).toBe("0.0899");
  expect(exactIncrement(0.3, "0.1")).toBe("0.3");
  expect(exactIncrement(1e-8, "1e-8")).toBe("0.00000001");
  expect(() => exactIncrement(0.08991, "0.0001")).toThrow(/multiple/);
});
test("market limits preserve the direction of the one-percent price bound", () => {
  expect(marketLimit(50000, "BUY", "0.01")).toBe("50500");
  expect(marketLimit(0.0899, "BUY", "0.00001")).toBe("0.09079");
  expect(marketLimit(0.0899, "SELL", "0.00001")).toBe("0.08901");
});
