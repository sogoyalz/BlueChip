/**
 * Public market-data route tests: symbols, prices, and the candle proxy
 * with its TTL cache.
 */
jest.mock("../model/UserModel", () => ({ UserModel: {} }));
jest.mock("../model/OrdersModel", () => ({ OrdersModel: {} }));
jest.mock("../services/geminiPrivate", () => ({ getGeminiBalances: jest.fn() }));
jest.mock("../services/gemini", () => ({
  ...jest.requireActual("../services/gemini"),
  fetchCandles: jest.fn(),
  fetchTickerV2: jest.fn(),
}));

import request from "supertest";
import { app } from "../index";
import { fetchCandles } from "../services/gemini";
import { setPrice, clearCache } from "../services/priceFeed";

const mockedFetchCandles = fetchCandles as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clearCache();
});

describe("GET /api/symbols", () => {
  test("lists the curated symbols publicly", async () => {
    const res = await request(app).get("/api/symbols");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("symbol");
    expect(res.body[0]).toHaveProperty("base");
    expect(res.body[0]).toHaveProperty("name");
  });
});

describe("GET /api/prices", () => {
  test("returns the shared price cache publicly", async () => {
    setPrice("BTCUSD", { price: 50000, changePct24h: 2.5 });
    const res = await request(app).get("/api/prices");
    expect(res.status).toBe(200);
    expect(res.body.prices.BTCUSD.price).toBe(50000);
    expect(res.body).toHaveProperty("updatedAt");
  });
});

describe("GET /api/book/:symbol", () => {
  test("rejects an unsupported symbol with 400", async () => {
    const res = await request(app).get("/api/book/AAPL");
    expect(res.status).toBe(400);
  });

  test("serves the top of the live book", async () => {
    const { applyChanges, clearBooks } = jest.requireActual("../services/orderBook");
    clearBooks();
    applyChanges("BTCUSD", [
      ["buy", "64000", "0.5"],
      ["sell", "64010", "0.7"],
    ]);
    const res = await request(app).get("/api/book/BTCUSD");
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe("BTCUSD");
    expect(res.body.bids).toEqual([[64000, 0.5]]);
    expect(res.body.asks).toEqual([[64010, 0.7]]);
  });
});

describe("GET /api/candles/:symbol", () => {
  const geminiCandles = [
    [3000, 11, 12, 10, 11.5, 100], // newest first, as Gemini sends
    [2000, 10, 11, 9, 11, 90],
    [1000, 9, 10, 8, 10, 80],
  ];

  test("rejects an unsupported symbol with 400", async () => {
    const res = await request(app).get("/api/candles/AAPL?timeframe=1hr");
    expect(res.status).toBe(400);
    expect(mockedFetchCandles).not.toHaveBeenCalled();
  });

  test("rejects a bad timeframe with 400", async () => {
    const res = await request(app).get("/api/candles/BTCUSD?timeframe=2weeks");
    expect(res.status).toBe(400);
    expect(mockedFetchCandles).not.toHaveBeenCalled();
  });

  test("proxies Gemini candles reversed to ascending time", async () => {
    mockedFetchCandles.mockResolvedValue(geminiCandles);
    const res = await request(app).get("/api/candles/BTCUSD?timeframe=1hr");
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe("BTCUSD");
    expect(res.body.candles.map((c: number[]) => c[0])).toEqual([1000, 2000, 3000]);
  });

  test("serves the second request from cache (no extra Gemini call)", async () => {
    mockedFetchCandles.mockResolvedValue(geminiCandles);
    await request(app).get("/api/candles/ETHUSD?timeframe=1hr");
    await request(app).get("/api/candles/ETHUSD?timeframe=1hr");
    expect(mockedFetchCandles).toHaveBeenCalledTimes(1);
  });

  test("serves stale cache when Gemini errors, 502 when nothing cached", async () => {
    mockedFetchCandles.mockResolvedValueOnce(geminiCandles);
    await request(app).get("/api/candles/SOLUSD?timeframe=1m");
    // Bust the short TTL by faking time forward
    const realNow = Date.now;
    Date.now = () => realNow() + 120_000;
    try {
      mockedFetchCandles.mockRejectedValue(new Error("gemini down"));
      const stale = await request(app).get("/api/candles/SOLUSD?timeframe=1m");
      expect(stale.status).toBe(200);
      expect(stale.body.candles.length).toBe(3);

      const cold = await request(app).get("/api/candles/DOGEUSD?timeframe=1m");
      expect(cold.status).toBe(502);
    } finally {
      Date.now = realNow;
    }
  });
});
