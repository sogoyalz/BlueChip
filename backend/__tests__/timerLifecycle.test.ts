/**
 * The start/stop contract of every background timer.
 *
 * This is what graceful shutdown rests on. lifecycle.ts stops each of these
 * before draining the HTTP server, because a timer that keeps firing means new
 * work starts while the process is trying to exit — and an order placed on the
 * exchange with its local write still in flight is the one state nothing can
 * reconcile. If a stop() failed to clear its interval, nothing else would
 * notice until a deploy hung and the platform force-killed it mid-write.
 *
 * Every one of these functions was uncovered.
 */
jest.mock("../services/gemini", () => ({ fetchTickerV2: jest.fn() }));
jest.mock("../services/geminiPrivate", () => ({
  getGeminiActiveOrders: jest.fn().mockResolvedValue([]),
  getGeminiOrderStatus: jest.fn(),
  getGeminiBalances: jest.fn().mockResolvedValue([]),
  clearBalancesCache: jest.fn(),
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn() },
}));
jest.mock("../model/SnapshotModel", () => ({
  SnapshotModel: { create: jest.fn().mockResolvedValue({}) },
}));

import { startPolling, stopPolling } from "../services/priceFeed";
import { startSnapshots, stopSnapshots } from "../services/snapshots";
import { startOrderSync, stopOrderSync } from "../services/orderSync";
import { startSseBroadcast, stopSseBroadcast, clientCount } from "../services/sse";
import { fetchTickerV2 } from "../services/gemini";
import { OrdersModel } from "../model/OrdersModel";

const services = [
  ["priceFeed", startPolling, stopPolling],
  ["snapshots", startSnapshots, stopSnapshots],
  ["orderSync", startOrderSync, stopOrderSync],
  ["sse", startSseBroadcast, stopSseBroadcast],
] as const;

beforeEach(() => {
  jest.useFakeTimers();
  (fetchTickerV2 as jest.Mock).mockResolvedValue({
    symbol: "BTCUSD", open: 1, close: 1, changePct24h: 0,
  });
  (OrdersModel.find as jest.Mock).mockReturnValue({
    sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
  });
});

afterEach(() => {
  for (const [, , stop] of services) stop();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe.each(services)("%s timer lifecycle", (_name, start, stop) => {
  test("start schedules exactly one interval", () => {
    start(1000);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  test("starting twice does not schedule a second one", () => {
    start(1000);
    const afterFirst = jest.getTimerCount();
    start(1000);
    expect(jest.getTimerCount()).toBe(afterFirst);
  });

  test("stop clears every timer it owns", () => {
    start(1000);
    stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("stop is safe to call when never started", () => {
    expect(() => stop()).not.toThrow();
  });

  test("stop is safe to call twice — a second SIGTERM must not break it", () => {
    start(1000);
    stop();
    expect(() => stop()).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("start works again after stop, so a restart is possible", () => {
    start(1000);
    stop();
    start(1000);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

test("stopSseBroadcast also releases its client registry", () => {
  startSseBroadcast(1000);
  stopSseBroadcast();
  // Streams are held open indefinitely by design; leaving them registered is
  // what would stop the HTTP server ever finishing its close.
  expect(clientCount()).toBe(0);
});
