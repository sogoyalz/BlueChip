/**
 * Valuing the shared account when we cannot price part of it.
 *
 * `?? 0` used to stand in for a missing price, valuing the holding at nothing
 * and folding that into the total — a figure known to be short, presented as
 * definite. Reachable whenever a balance is in an asset outside the eight
 * curated symbols (the shared sandbox account can hold anything), or before
 * the price cache has warmed.
 */
jest.mock("../services/geminiPrivate", () => ({ getGeminiBalances: jest.fn() }));
jest.mock("../services/priceFeed", () => ({ getPrice: jest.fn() }));

import { getGeminiBalances } from "../services/geminiPrivate";
import { getPrice } from "../services/priceFeed";
import { portfolioCents, getAccountTotals } from "../services/account";

const mockedBalances = getGeminiBalances as jest.Mock;
const mockedGetPrice = getPrice as jest.Mock;

const bal = (currency: string, amount: string) => ({
  currency, amount, available: amount, availableForWithdrawal: amount,
});

beforeEach(() => jest.clearAllMocks());

describe("portfolioCents", () => {
  test("prices every holding when the cache has them all", async () => {
    mockedBalances.mockResolvedValue([bal("USD", "1000"), bal("BTC", "2")]);
    mockedGetPrice.mockReturnValue({ price: 500 });

    const r = await portfolioCents();
    expect(r.complete).toBe(true);
    expect(r.cashCents).toBe(100_000);
    expect(r.holdingsCents).toBe(100_000);
    expect(r.valueCents).toBe(200_000);
  });

  test("an unpriced holding is skipped AND flagged, not counted as zero", async () => {
    mockedBalances.mockResolvedValue([bal("USD", "1000"), bal("XYZ", "500")]);
    mockedGetPrice.mockReturnValue(undefined);

    const r = await portfolioCents();
    expect(r.complete).toBe(false);
    expect(r.holdingsCents).toBe(0);
    // The cash is still real, so the number is right about what it includes —
    // `complete` is what says it is not the whole picture.
    expect(r.valueCents).toBe(100_000);
  });

  test("one unpriced holding among priced ones still flags the total", async () => {
    mockedBalances.mockResolvedValue([
      bal("USD", "100"), bal("BTC", "1"), bal("XYZ", "9"),
    ]);
    mockedGetPrice.mockImplementation((s: string) =>
      s === "BTCUSD" ? { price: 200 } : undefined
    );

    const r = await portfolioCents();
    expect(r.complete).toBe(false);
    expect(r.valueCents).toBe(30_000); // 100 cash + 200 BTC, XYZ omitted
  });

  test("sums every USD row, not just the first", async () => {
    mockedBalances.mockResolvedValue([bal("USD", "10"), bal("USD", "5")]);
    const r = await portfolioCents();
    expect(r.cashCents).toBe(1_500);
  });

  test("a malformed amount still fails loudly rather than silently", async () => {
    mockedBalances.mockResolvedValue([bal("USD", "not-a-number")]);
    await expect(portfolioCents()).rejects.toThrow();
  });
});

describe("getAccountTotals", () => {
  test("carries the completeness flag to the caller", async () => {
    mockedBalances.mockResolvedValue([bal("USD", "50"), bal("XYZ", "1")]);
    mockedGetPrice.mockReturnValue(undefined);
    await expect(getAccountTotals()).resolves.toEqual({
      balance: 50,
      portfolioValue: 50,
      complete: false,
    });
  });
});
