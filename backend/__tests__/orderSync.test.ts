/**
 * orderSync tests: reconciles local order status against Gemini's real
 * order state (Gemini itself does all the matching now).
 */
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("../services/geminiPrivate", () => ({
  getGeminiActiveOrders: jest.fn(),
  getGeminiOrderStatus: jest.fn(),
  clearBalancesCache: jest.fn(),
}));
jest.mock("../services/snapshots", () => ({
  snapshotNow: jest.fn().mockResolvedValue(undefined),
}));

import { tick, MAX_STATUS_LOOKUPS_PER_TICK } from "../services/orderSync";
import { OrdersModel } from "../model/OrdersModel";
import {
  getGeminiActiveOrders,
  getGeminiOrderStatus,
  clearBalancesCache,
} from "../services/geminiPrivate";
import { snapshotNow } from "../services/snapshots";
import { shouldApplyObservation } from "../services/orderState";

const mockedOrders = OrdersModel as unknown as Record<string, jest.Mock>;
const mockedActiveOrders = getGeminiActiveOrders as jest.Mock;
const mockedGetStatus = getGeminiOrderStatus as jest.Mock;
const mockedSnapshotNow = snapshotNow as jest.Mock;

const restingOrder = (fields: object) => {
  const doc: Record<string, unknown> = {
    _id: "o1",
    status: "OPEN",
    geminiOrderId: "gemini-1",
    save: jest.fn().mockResolvedValue(undefined),
    ...fields,
  };
  return doc;
};

let currentDocs: Record<string, unknown>[] = [];
const findReturns = (orders: object[]) => {
  currentDocs = orders as Record<string, unknown>[];
  // Mirrors the real chain: find().sort().limit()
  mockedOrders.find.mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue(orders),
    }),
  });
};

/**
 * Stands in for MongoDB's conditional update: applies $set only when the
 * observation is newer, using the same rule the real filter encodes. Writes
 * land on the fake document, so the tests keep asserting outcomes rather than
 * which write mechanism was used.
 */
const conditionalUpdate = async (
  filter: Record<string, unknown>,
  update: { $set: Record<string, unknown> }
) => {
  const doc = currentDocs.find((d) => String(d._id) === String(filter._id));
  if (!doc) return null;
  const observed = {
    status: update.$set.status as never,
    filledQty: (update.$set.filledQty as number) ?? 0,
  };
  if (!shouldApplyObservation(doc as never, observed)) return null;
  Object.assign(doc, update.$set);
  return doc;
};

const geminiStatus = (overrides: Partial<Record<string, unknown>> = {}) => ({
  order_id: "gemini-1",
  executed_amount: "0",
  remaining_amount: "0.1",
  avg_execution_price: "0",
  is_live: true,
  is_cancelled: false,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: nothing left resting on Gemini's book, so each local order is
  // resolved with an individual status lookup.
  mockedActiveOrders.mockResolvedValue([]);
  mockedOrders.findOneAndUpdate.mockImplementation(conditionalUpdate);
});

describe("tick", () => {
  test("skips orders with no geminiOrderId", async () => {
    findReturns([restingOrder({ geminiOrderId: undefined })]);
    await tick();
    expect(mockedGetStatus).not.toHaveBeenCalled();
  });

  test("leaves status unchanged when Gemini reports no change", async () => {
    const order = restingOrder({});
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(geminiStatus());
    await tick();
    expect(mockedOrders.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("marks FILLED once remaining_amount hits zero", async () => {
    const order = restingOrder({});
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ executed_amount: "0.1", remaining_amount: "0", avg_execution_price: "45000" })
    );
    await tick();
    expect(order.status).toBe("FILLED");
    expect(order.fillPrice).toBe(45000);
    expect(order.filledAt).toBeInstanceOf(Date);
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalled();
    expect(mockedSnapshotNow).toHaveBeenCalled();
  });

  test("marks PARTIALLY_FILLED on a partial fill", async () => {
    const order = restingOrder({});
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ executed_amount: "0.05", remaining_amount: "0.05", avg_execution_price: "45000" })
    );
    await tick();
    expect(order.status).toBe("PARTIALLY_FILLED");
  });

  test("updates the fill when a PARTIALLY_FILLED order fills more without changing status", async () => {
    const order = restingOrder({
      status: "PARTIALLY_FILLED",
      filledQty: 0.05,
      fillPrice: 45000,
    });
    findReturns([order]);
    // Still partially filled (remaining > 0) but more executed at a new avg price.
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ executed_amount: "0.08", remaining_amount: "0.02", avg_execution_price: "45500" })
    );
    await tick();
    expect(order.status).toBe("PARTIALLY_FILLED"); // unchanged
    expect(order.filledQty).toBe(0.08); // but more of it executed
    expect(order.fillPrice).toBe(45500);
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalled();
    expect(mockedSnapshotNow).toHaveBeenCalled();
  });

  test("does NOT re-save a PARTIALLY_FILLED order that executed nothing new", async () => {
    const order = restingOrder({
      status: "PARTIALLY_FILLED",
      filledQty: 0.05,
      fillPrice: 45000,
    });
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ executed_amount: "0.05", remaining_amount: "0.05", avg_execution_price: "45000" })
    );
    await tick();
    expect(mockedOrders.findOneAndUpdate).not.toHaveBeenCalled();
    expect(clearBalancesCache).not.toHaveBeenCalled();
  });

  test("a cancel on an already-recorded partial fill does not re-invalidate balances", async () => {
    // The 0.4 was executed and accounted for on an earlier tick; the cancel
    // itself moves nothing, so it must not trigger another snapshot.
    const order = restingOrder({
      status: "PARTIALLY_FILLED",
      filledQty: 0.4,
      fillPrice: 50000,
    });
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({
        is_cancelled: true,
        executed_amount: "0.4",
        remaining_amount: "0.6",
        avg_execution_price: "50000",
      })
    );
    await tick();
    expect(order.status).toBe("CANCELLED"); // status still recorded
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalled();
    expect(clearBalancesCache).not.toHaveBeenCalled(); // ...but nothing moved
    expect(mockedSnapshotNow).not.toHaveBeenCalled();
  });

  test("marks CANCELLED when Gemini reports the order cancelled", async () => {
    const order = restingOrder({});
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(geminiStatus({ is_cancelled: true }));
    await tick();
    expect(order.status).toBe("CANCELLED");
    expect(mockedSnapshotNow).not.toHaveBeenCalled();
  });

  test("a failed status lookup for one order doesn't stop the others", async () => {
    const bad = restingOrder({ _id: "bad" });
    const good = restingOrder({ _id: "good" });
    findReturns([bad, good]);
    mockedGetStatus
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(
        geminiStatus({ executed_amount: "0.1", remaining_amount: "0", avg_execution_price: "45000" })
      );
    await tick();
    expect(good.status).toBe("FILLED");
  });
});

describe("balance invalidation on execution", () => {
  test("a cancel that partially filled first still invalidates balances", async () => {
    // Gemini cancelled the rest, but 0.4 executed — the shared account's
    // balances moved, so the cache must drop and a snapshot must record it.
    const order = restingOrder({ status: "OPEN" });
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({
        is_cancelled: true,
        executed_amount: "0.4",
        remaining_amount: "0.6",
        avg_execution_price: "50000",
      })
    );

    await tick();

    expect(order.status).toBe("CANCELLED");
    expect(order.filledQty).toBe(0.4);
    expect(order.fillPrice).toBe(50000);
    expect(clearBalancesCache).toHaveBeenCalled();
    expect(mockedSnapshotNow).toHaveBeenCalled();
  });

  test("a cancel with nothing executed leaves balances alone", async () => {
    const order = restingOrder({ status: "OPEN" });
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ is_cancelled: true, executed_amount: "0", remaining_amount: "1" })
    );

    await tick();

    expect(order.status).toBe("CANCELLED");
    expect(clearBalancesCache).not.toHaveBeenCalled();
    expect(mockedSnapshotNow).not.toHaveBeenCalled();
  });
});

describe("active-order batching", () => {
  test("resolves still-resting orders from ONE active-orders call, with no per-order lookups", async () => {
    // The steady state: three orders resting, nothing filled. This used to cost
    // three status calls per tick and now costs none.
    const orders = [
      restingOrder({ _id: "o1", geminiOrderId: "g1" }),
      restingOrder({ _id: "o2", geminiOrderId: "g2" }),
      restingOrder({ _id: "o3", geminiOrderId: "g3" }),
    ];
    findReturns(orders);
    mockedActiveOrders.mockResolvedValue([
      geminiStatus({ order_id: "g1" }),
      geminiStatus({ order_id: "g2" }),
      geminiStatus({ order_id: "g3" }),
    ]);

    await tick();

    expect(mockedActiveOrders).toHaveBeenCalledTimes(1);
    expect(mockedGetStatus).not.toHaveBeenCalled();
    expect(mockedOrders.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("picks up a fill reported in the active list without a status lookup", async () => {
    const order = restingOrder({ geminiOrderId: "g1" });
    findReturns([order]);
    mockedActiveOrders.mockResolvedValue([
      geminiStatus({
        order_id: "g1",
        executed_amount: "0.05",
        remaining_amount: "0.05",
        avg_execution_price: "45000",
      }),
    ]);

    await tick();

    expect(mockedGetStatus).not.toHaveBeenCalled();
    expect(order.status).toBe("PARTIALLY_FILLED");
    expect(order.filledQty).toBe(0.05);
    expect(clearBalancesCache).toHaveBeenCalled();
  });

  test("only orders missing from the active list cost a status lookup", async () => {
    const stillResting = restingOrder({ _id: "o1", geminiOrderId: "g1" });
    const goneFromBook = restingOrder({ _id: "o2", geminiOrderId: "g2" });
    findReturns([stillResting, goneFromBook]);
    mockedActiveOrders.mockResolvedValue([geminiStatus({ order_id: "g1" })]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({
        order_id: "g2",
        executed_amount: "0.1",
        remaining_amount: "0",
        avg_execution_price: "50000",
      })
    );

    await tick();

    expect(mockedGetStatus).toHaveBeenCalledTimes(1);
    expect(mockedGetStatus).toHaveBeenCalledWith("g2");
    expect(goneFromBook.status).toBe("FILLED");
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test("caps per-tick status lookups so a burst of fills can't spike the API", async () => {
    const many = Array.from({ length: MAX_STATUS_LOOKUPS_PER_TICK + 10 }, (_, i) =>
      restingOrder({ _id: `o${i}`, geminiOrderId: `g${i}` })
    );
    findReturns(many);
    mockedActiveOrders.mockResolvedValue([]); // all gone from the book at once
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ executed_amount: "0.1", remaining_amount: "0", avg_execution_price: "50000" })
    );

    await tick();

    expect(mockedGetStatus).toHaveBeenCalledTimes(MAX_STATUS_LOOKUPS_PER_TICK);
    // The overflow is simply left for the next tick, not dropped.
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalledTimes(MAX_STATUS_LOOKUPS_PER_TICK);
  });

  test("a failed active-orders call skips the pass instead of falling back to N lookups", async () => {
    findReturns([restingOrder({})]);
    mockedActiveOrders.mockRejectedValue(new Error("429 Too Many Requests"));

    await tick();

    expect(mockedGetStatus).not.toHaveBeenCalled();
  });

  test("does not call Gemini at all when nothing is resting locally", async () => {
    findReturns([]);
    await tick();
    expect(mockedActiveOrders).not.toHaveBeenCalled();
  });
});

