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
  sendKeepAlive,
  stopSseBroadcast,
  MAX_STREAMS_PER_IP,
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

describe("per-IP connection cap", () => {
  test("accepts up to MAX_STREAMS_PER_IP then rejects further streams from that IP", () => {
    for (let i = 0; i < MAX_STREAMS_PER_IP; i++) {
      expect(addClient(fakeRes(), "1.2.3.4")).toBe(true);
    }
    // One past the cap is rejected and not registered.
    expect(addClient(fakeRes(), "1.2.3.4")).toBe(false);
    expect(clientCount()).toBe(MAX_STREAMS_PER_IP);
    // A different IP is unaffected.
    expect(addClient(fakeRes(), "5.6.7.8")).toBe(true);
  });

  test("removeClient frees the IP's slot so a new stream is accepted", () => {
    const streams = Array.from({ length: MAX_STREAMS_PER_IP }, () => fakeRes());
    streams.forEach((r) => addClient(r, "9.9.9.9"));
    expect(addClient(fakeRes(), "9.9.9.9")).toBe(false); // at cap
    removeClient(streams[0]);
    expect(addClient(fakeRes(), "9.9.9.9")).toBe(true); // slot freed
  });
});

describe("sendKeepAlive", () => {
  test("writes a comment frame to every client and reaps dead ones", () => {
    const alive = fakeRes();
    const dead = { write: jest.fn() } as unknown as Response;
    addClient(alive, "a");
    addClient(dead, "b");
    // Make the dead socket start failing only on the keep-alive write.
    (dead.write as jest.Mock).mockImplementation(() => { throw new Error("EPIPE"); });
    sendKeepAlive();
    expect((alive.write as jest.Mock).mock.calls.some((c) => c[0] === ": keep-alive\n\n")).toBe(true);
    expect(clientCount()).toBe(1); // dead one reaped
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

  test("reaping a dead socket frees its IP slot (regression: perIp leak)", () => {
    const streams = Array.from({ length: MAX_STREAMS_PER_IP }, () => fakeRes());
    streams.forEach((r) => addClient(r, "7.7.7.7"));
    // One socket dies after registration; the broadcast write fails.
    (streams[0].write as jest.Mock).mockImplementation(() => {
      throw new Error("EPIPE");
    });
    broadcastPrices();
    expect(clientCount()).toBe(MAX_STREAMS_PER_IP - 1);
    // The freed slot must be reusable — before the fix it leaked forever.
    expect(addClient(fakeRes(), "7.7.7.7")).toBe(true);
  });
});
