/**
 * SSE price-stream tests: frame format, client lifecycle, broadcast.
 */
jest.mock("../services/gemini", () => ({
  fetchTickerV2: jest.fn(),
}));

import { Response } from "express";
import {
  formatEvent,
  addClient,
  removeClient,
  clientCount,
  broadcastPrices,
  stopSseBroadcast,
} from "../services/sse";
import { setPrice, clearCache } from "../services/priceFeed";

const fakeRes = () => ({ write: jest.fn() }) as unknown as Response;

afterEach(() => {
  stopSseBroadcast(); // also clears the client set
  clearCache();
});

describe("formatEvent", () => {
  test("emits a spec-compliant SSE frame", () => {
    expect(formatEvent("prices", { a: 1 })).toBe(
      'event: prices\ndata: {"a":1}\n\n'
    );
  });
});

describe("client lifecycle", () => {
  test("a new client immediately receives a snapshot frame", () => {
    setPrice("BTCUSD", { price: 64000, changePct24h: 1.2 });
    const res = fakeRes();
    addClient(res);
    expect(clientCount()).toBe(1);
    const frame = (res.write as jest.Mock).mock.calls[0][0] as string;
    expect(frame).toContain("event: prices");
    expect(frame).toContain('"BTCUSD"');
    expect(frame).toContain("64000");
  });

  test("removeClient stops future frames", () => {
    const res = fakeRes();
    addClient(res);
    removeClient(res);
    broadcastPrices();
    expect((res.write as jest.Mock).mock.calls).toHaveLength(1); // snapshot only
  });
});

describe("broadcastPrices", () => {
  test("pushes the current cache to every client", () => {
    const a = fakeRes();
    const b = fakeRes();
    addClient(a);
    addClient(b);
    setPrice("ETHUSD", { price: 1800, changePct24h: -0.5 });
    broadcastPrices();
    for (const res of [a, b]) {
      const frames = (res.write as jest.Mock).mock.calls.map((c) => c[0]);
      expect(frames).toHaveLength(2); // snapshot + broadcast
      expect(frames[1]).toContain('"ETHUSD"');
    }
  });

  test("a dead socket is dropped instead of breaking the broadcast", () => {
    const dead = { write: jest.fn(() => { throw new Error("EPIPE"); }) } as unknown as Response;
    const alive = fakeRes();
    addClient(dead); // snapshot write throws -> dropped immediately
    addClient(alive);
    broadcastPrices();
    expect(clientCount()).toBe(1);
    expect((alive.write as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
