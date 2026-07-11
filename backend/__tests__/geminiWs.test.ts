/**
 * Gemini WebSocket feed: message handling and backoff math as pure
 * functions. No live socket in CI.
 */
jest.mock("../services/gemini", () => ({
  fetchTickerV2: jest.fn(),
}));

import { handleWsMessage, backoffDelay } from "../services/geminiWs";
import { getPrice, clearCache, setPrice } from "../services/priceFeed";

beforeEach(() => {
  clearCache();
});

describe("handleWsMessage", () => {
  test("a trade event updates the cache tagged source:ws", () => {
    handleWsMessage(
      JSON.stringify({ type: "trade", symbol: "BTCUSD", price: "50123.45" })
    );
    const entry = getPrice("BTCUSD");
    expect(entry?.price).toBe(50123.45);
    expect(entry?.source).toBe("ws");
  });

  test("an l2_updates snapshot with trades seeds the price", () => {
    handleWsMessage(
      JSON.stringify({
        type: "l2_updates",
        symbol: "ETHUSD",
        trades: [{ price: "3111.5" }, { price: "3110.0" }],
        changes: [],
      })
    );
    expect(getPrice("ETHUSD")?.price).toBe(3111.5);
  });

  test("keeps the REST 24h change when a ws trade lands", () => {
    setPrice("BTCUSD", { price: 50000, changePct24h: 3.2, source: "rest" });
    handleWsMessage(
      JSON.stringify({ type: "trade", symbol: "BTCUSD", price: 50500 })
    );
    const entry = getPrice("BTCUSD");
    expect(entry?.price).toBe(50500);
    expect(entry?.changePct24h).toBe(3.2);
  });

  test.each([
    ["not json at all"],
    [JSON.stringify({ type: "heartbeat" })],
    [JSON.stringify({ type: "trade", symbol: "BTCUSD", price: "not-a-number" })],
    [JSON.stringify({ type: "trade", symbol: "BTCUSD", price: -5 })],
    [JSON.stringify({ type: "trade", price: 50000 })], // no symbol
  ])("ignores junk safely: %s", (raw) => {
    expect(() => handleWsMessage(raw)).not.toThrow();
    expect(getPrice("BTCUSD")).toBeUndefined();
  });
});

describe("backoffDelay", () => {
  test("doubles per attempt and caps at 30s", () => {
    const noJitter = () => 0.5; // exact base value
    expect(backoffDelay(0, noJitter)).toBe(1000);
    expect(backoffDelay(1, noJitter)).toBe(2000);
    expect(backoffDelay(3, noJitter)).toBe(8000);
    expect(backoffDelay(10, noJitter)).toBe(30000);
  });

  test("jitter stays within ±20%", () => {
    expect(backoffDelay(2, () => 0)).toBe(3200); // 4000 * 0.8
    expect(backoffDelay(2, () => 1)).toBe(4800); // 4000 * 1.2
  });
});
