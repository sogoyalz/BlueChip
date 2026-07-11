/**
 * Order book tests: snapshot/incremental updates, level removal,
 * top-N ordering, and the l2 WebSocket wiring.
 */
jest.mock("../services/gemini", () => ({
  fetchTickerV2: jest.fn(),
}));

import {
  applyChanges,
  resetBook,
  getDepth,
  clearBooks,
} from "../services/orderBook";
import { handleWsMessage } from "../services/geminiWs";
import { getPrice, clearCache } from "../services/priceFeed";

beforeEach(() => {
  clearBooks();
  clearCache();
});

describe("applyChanges / getDepth", () => {
  test("builds both sides sorted best-first", () => {
    applyChanges("BTCUSD", [
      ["buy", "64000", "0.5"],
      ["buy", "64010", "1.2"],
      ["buy", "63990", "2.0"],
      ["sell", "64020", "0.7"],
      ["sell", "64050", "0.3"],
      ["sell", "64015", "1.1"],
    ]);
    const depth = getDepth("BTCUSD");
    expect(depth.bids.map(([p]) => p)).toEqual([64010, 64000, 63990]); // highest first
    expect(depth.asks.map(([p]) => p)).toEqual([64015, 64020, 64050]); // lowest first
    expect(depth.bids[0][1]).toBe(1.2);
  });

  test("qty 0 removes a level; new qty replaces (not adds)", () => {
    applyChanges("BTCUSD", [["buy", "64000", "1.0"]]);
    applyChanges("BTCUSD", [["buy", "64000", "0.4"]]); // replace
    expect(getDepth("BTCUSD").bids).toEqual([[64000, 0.4]]);
    applyChanges("BTCUSD", [["buy", "64000", "0"]]); // remove
    expect(getDepth("BTCUSD").bids).toEqual([]);
  });

  test("caps output at the requested number of levels", () => {
    const changes: Array<[string, string, string]> = [];
    for (let i = 0; i < 30; i++) changes.push(["buy", String(64000 - i), "1"]);
    applyChanges("BTCUSD", changes);
    expect(getDepth("BTCUSD", 10).bids).toHaveLength(10);
    expect(getDepth("BTCUSD", 10).bids[0][0]).toBe(64000);
  });

  test("resetBook wipes stale levels (reconnect snapshot)", () => {
    applyChanges("BTCUSD", [["buy", "64000", "1.0"]]);
    resetBook("BTCUSD");
    expect(getDepth("BTCUSD").bids).toEqual([]);
  });

  test("ignores junk levels and unknown sides safely", () => {
    applyChanges("BTCUSD", [
      ["buy", "not-a-price", "1"],
      ["hold", "64000", "1"],
      ["sell", "-5", "1"],
    ]);
    const depth = getDepth("BTCUSD");
    expect(depth.bids).toEqual([]);
    expect(depth.asks).toEqual([]);
  });

  test("unknown symbol yields an empty book", () => {
    expect(getDepth("ETHUSD")).toEqual({ bids: [], asks: [], updatedAt: 0 });
  });
});

describe("l2 WebSocket wiring", () => {
  test("a snapshot resets the book, seeds the price, and applies changes", () => {
    applyChanges("BTCUSD", [["buy", "1", "99"]]); // stale pre-reconnect level
    handleWsMessage(
      JSON.stringify({
        type: "l2_updates",
        symbol: "BTCUSD",
        trades: [{ price: "64100" }],
        changes: [
          ["buy", "64090", "0.5"],
          ["sell", "64110", "0.8"],
        ],
      })
    );
    const depth = getDepth("BTCUSD");
    expect(depth.bids).toEqual([[64090, 0.5]]); // stale level gone
    expect(depth.asks).toEqual([[64110, 0.8]]);
    expect(getPrice("BTCUSD")?.price).toBe(64100);
  });

  test("incremental l2_updates (no trades array) only mutates levels", () => {
    handleWsMessage(
      JSON.stringify({
        type: "l2_updates",
        symbol: "BTCUSD",
        trades: [{ price: "64100" }],
        changes: [["buy", "64090", "0.5"]],
      })
    );
    handleWsMessage(
      JSON.stringify({
        type: "l2_updates",
        symbol: "BTCUSD",
        changes: [["buy", "64095", "0.2"]],
      })
    );
    const depth = getDepth("BTCUSD");
    expect(depth.bids.map(([p]) => p)).toEqual([64095, 64090]); // both present
  });
});
