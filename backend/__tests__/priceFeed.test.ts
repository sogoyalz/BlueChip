jest.mock("../services/gemini", () => ({
  fetchTickerV2: jest.fn(),
}));

import {
  pollOnce,
  getPrice,
  getAllPrices,
  setPrice,
  isFresh,
  clearCache,
} from "../services/priceFeed";
import { fetchTickerV2 } from "../services/gemini";
import { SYMBOLS } from "../config/symbols";

const mockedFetchTicker = fetchTickerV2 as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clearCache();
});

describe("pollOnce", () => {
  test("populates the cache for every curated symbol", async () => {
    mockedFetchTicker.mockImplementation(async (symbol: string) => ({
      symbol,
      open: 100,
      close: 110,
      bid: 109,
      ask: 111,
      changePct24h: 10,
    }));
    await pollOnce();
    expect(mockedFetchTicker).toHaveBeenCalledTimes(SYMBOLS.length);
    const btc = getPrice("BTCUSD");
    expect(btc?.price).toBe(110);
    expect(btc?.changePct24h).toBe(10);
    expect(btc?.source).toBe("rest");
    expect(Object.keys(getAllPrices()).length).toBe(SYMBOLS.length);
  });

  test("a failed symbol keeps its previous value and doesn't break the pass", async () => {
    setPrice("BTCUSD", { price: 50000, changePct24h: 1 });
    mockedFetchTicker.mockImplementation(async (symbol: string) => {
      if (symbol === "BTCUSD") throw new Error("gemini 503");
      return { symbol, open: 10, close: 11, bid: 10.9, ask: 11.1, changePct24h: 10 };
    });
    await expect(pollOnce()).resolves.toBeUndefined();
    expect(getPrice("BTCUSD")?.price).toBe(50000); // previous value survives
    expect(getPrice("ETHUSD")?.price).toBe(11); // rest of the pass ran
  });

  test("does not clobber a fresher WebSocket price but refreshes 24h change", async () => {
    setPrice("BTCUSD", { price: 50123, source: "ws", changePct24h: 0 });
    mockedFetchTicker.mockResolvedValue({
      symbol: "BTCUSD",
      open: 100,
      close: 49000,
      bid: 0,
      ask: 0,
      changePct24h: 4.2,
    });
    await pollOnce();
    const btc = getPrice("BTCUSD");
    expect(btc?.price).toBe(50123); // ws price kept
    expect(btc?.changePct24h).toBe(4.2); // 24h change refreshed from REST
    expect(btc?.source).toBe("ws");
  });
});

describe("isFresh", () => {
  test("unknown symbols are never fresh", () => {
    expect(isFresh("BTCUSD")).toBe(false);
  });

  test("a just-set price is fresh; an old one is not", () => {
    setPrice("BTCUSD", { price: 50000 });
    expect(isFresh("BTCUSD")).toBe(true);
    setPrice("ETHUSD", { price: 3000, updatedAt: Date.now() - 60_000 });
    expect(isFresh("ETHUSD", 30_000)).toBe(false);
  });
});

describe("setPrice", () => {
  test("is case-insensitive on symbol and defaults sensibly", () => {
    setPrice("btcusd", { price: 42 });
    expect(getPrice("BTCUSD")?.price).toBe(42);
    expect(getPrice("BTCUSD")?.source).toBe("rest");
  });
});
