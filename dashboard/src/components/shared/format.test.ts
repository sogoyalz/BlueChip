import { num, usd, usdAbs, signedUsd, pct, price } from "./format";

describe("format", () => {
  test("num groups and fixes decimals, em-dashes anything not finite", () => {
    expect(num(1234.5)).toBe("1,234.50");
    expect(num(undefined)).toBe("—");
    expect(num(NaN)).toBe("—");
    expect(num(Infinity)).toBe("—");
  });

  test("usd keeps the sign; usdAbs drops it; signedUsd leads with it", () => {
    // These three were one function copied six times with drifting behaviour:
    // Summary's copy took the absolute value because its caller added the sign,
    // and every other copy did not. Naming them separately is the point.
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd(-1234.5)).toBe("$-1,234.50");
    expect(usdAbs(-1234.5)).toBe("$1,234.50");
    expect(signedUsd(-1234.5)).toBe("-$1,234.50");
    expect(signedUsd(1234.5)).toBe("+$1,234.50");
  });

  test("usd renders an em dash rather than $NaN", () => {
    expect(usd(undefined)).toBe("—");
    expect(usd(NaN)).toBe("—");
  });

  test("dp is respected", () => {
    expect(usdAbs(1234.56, 0)).toBe("$1,235");
  });

  test("pct always carries a sign", () => {
    expect(pct(1.234)).toBe("+1.23%");
    expect(pct(-0.5)).toBe("-0.50%");
    expect(pct(0)).toBe("+0.00%");
  });

  test("price widens precision for small values", () => {
    expect(price(80412.554)).toBe("80,412.55");
    expect(price(0.0899)).toBe("0.0899");
  });
});
