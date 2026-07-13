/**
 * orderSync tests: reconciles local order status against Gemini's real
 * order state (Gemini itself does all the matching now).
 */
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn() },
}));
jest.mock("../services/geminiPrivate", () => ({
  getGeminiOrderStatus: jest.fn(),
  clearBalancesCache: jest.fn(),
}));
jest.mock("../services/snapshots", () => ({
  snapshotNow: jest.fn().mockResolvedValue(undefined),
}));

import { tick } from "../services/orderSync";
import { OrdersModel } from "../model/OrdersModel";
import { getGeminiOrderStatus } from "../services/geminiPrivate";
import { snapshotNow } from "../services/snapshots";

const mockedOrders = OrdersModel as unknown as Record<string, jest.Mock>;
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

const findReturns = (orders: object[]) => {
  mockedOrders.find.mockReturnValue({ limit: jest.fn().mockResolvedValue(orders) });
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
    expect(order.save).not.toHaveBeenCalled();
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
    expect(order.save).toHaveBeenCalled();
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

  test("updates fillPrice when a PARTIALLY_FILLED order fills more without changing status", async () => {
    const order = restingOrder({ status: "PARTIALLY_FILLED", fillPrice: 45000 });
    findReturns([order]);
    // Still partially filled (remaining > 0) but more executed at a new avg price.
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ executed_amount: "0.08", remaining_amount: "0.02", avg_execution_price: "45500" })
    );
    await tick();
    expect(order.status).toBe("PARTIALLY_FILLED"); // unchanged
    expect(order.fillPrice).toBe(45500); // but the fill price advanced
    expect(order.save).toHaveBeenCalled();
    expect(mockedSnapshotNow).toHaveBeenCalled();
  });

  test("does NOT re-save a PARTIALLY_FILLED order whose fill price is unchanged", async () => {
    const order = restingOrder({ status: "PARTIALLY_FILLED", fillPrice: 45000 });
    findReturns([order]);
    mockedGetStatus.mockResolvedValue(
      geminiStatus({ executed_amount: "0.05", remaining_amount: "0.05", avg_execution_price: "45000" })
    );
    await tick();
    expect(order.save).not.toHaveBeenCalled();
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
