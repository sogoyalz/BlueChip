/**
 * Order engine + /api/orders route tests. Models and the price feed are
 * mocked; JWT is real.
 */
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.TOKEN_KEY = "test-secret";
// This suite fires dozens of orders — keep the per-user limiter out of the way.
process.env.ORDER_RATE_MAX = "10000";
process.env.GENERAL_RATE_MAX = "10000";

jest.mock("../model/UserModel", () => ({
  UserModel: {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock("../model/HoldingsModel", () => ({
  HoldingsModel: {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: {
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(),
  isFresh: jest.fn(),
  getAllPrices: jest.fn(() => ({})),
  startPolling: jest.fn(),
}));
jest.mock("../services/snapshots", () => ({
  snapshotUser: jest.fn().mockResolvedValue(undefined),
}));

import { app } from "../index";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";
import { OrdersModel } from "../model/OrdersModel";
import { getPrice, isFresh } from "../services/priceFeed";
import { applyFillEffects } from "../services/orderEngine";

const mockedUser = UserModel as unknown as Record<string, jest.Mock>;
const mockedHoldings = HoldingsModel as unknown as Record<string, jest.Mock>;
const mockedOrders = OrdersModel as unknown as Record<string, jest.Mock>;
const mockedGetPrice = getPrice as jest.Mock;
const mockedIsFresh = isFresh as jest.Mock;

const token = () => jwt.sign({ id: "user-1" }, process.env.TOKEN_KEY as string);
const alice = { _id: "user-1", username: "alice", email: "a@b.com", balance: 100000 };

const authedPost = () =>
  request(app).post("/api/orders").set("Authorization", `Bearer ${token()}`);

/** A fake order document whose save() just records the mutation. */
const fakeOrderDoc = (fields: object) => {
  const doc: Record<string, unknown> = {
    _id: "order-1",
    ...fields,
    save: jest.fn().mockResolvedValue(undefined),
  };
  return doc;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedUser.findById.mockResolvedValue(alice);
  mockedIsFresh.mockReturnValue(true);
  mockedGetPrice.mockReturnValue({ price: 50000, changePct24h: 1, updatedAt: Date.now(), source: "rest" });
  mockedOrders.create.mockImplementation(async (doc: object) => fakeOrderDoc(doc));
  // Happy-path portfolio effects
  mockedUser.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockedHoldings.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockedHoldings.findOne.mockResolvedValue({ qty: 1, avgCost: 45000 });
  mockedHoldings.findOneAndUpdate.mockResolvedValue({});
  mockedHoldings.deleteMany.mockResolvedValue({ deletedCount: 0 });
});

describe("POST /api/orders — validation", () => {
  test("rejects unauthenticated requests with 401", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 1 });
    expect(res.status).toBe(401);
  });

  test.each([
    [{ symbol: "AAPL", side: "BUY", type: "MARKET", qty: 1 }, "unsupported symbol"],
    [{ symbol: "BTCUSD", side: "HOLD", type: "MARKET", qty: 1 }, "bad side"],
    [{ symbol: "BTCUSD", side: "BUY", type: "STOP", qty: 1 }, "bad type"],
    [{ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: "abc" }, "NaN qty"],
    [{ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0 }, "zero qty"],
    [{ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: -2 }, "negative qty"],
    [{ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 2e6 }, "qty over cap"],
    [{ symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 1 }, "LIMIT without limitPrice"],
    [{ symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 1, limitPrice: -5 }, "negative limitPrice"],
  ])("rejects %j with 400 (%s)", async (body, _desc) => {
    const res = await authedPost().send(body);
    expect(res.status).toBe(400);
    expect(mockedOrders.create).not.toHaveBeenCalled();
  });

  test("rejects orders when market data is stale with 503", async () => {
    mockedIsFresh.mockReturnValue(false);
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.status).toBe(503);
    expect(mockedOrders.create).not.toHaveBeenCalled();
  });

  test("rejects a market order whose notional exceeds the cap", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 1000, // 1000 * 50000 = 50M > 10M cap
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/orders — market fills", () => {
  test("a BUY debits the exact notional and upserts the holding", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("FILLED");
    expect(res.body.order.fillPrice).toBe(50000);
    // Conditional atomic debit of exactly 0.1 * 50000
    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: "user-1", balance: { $gte: 5000 } },
      { $inc: { balance: -5000 } }
    );
    expect(mockedHoldings.findOneAndUpdate).toHaveBeenCalled();
  });

  test("a BUY with insufficient funds is recorded REJECTED", async () => {
    mockedUser.updateOne.mockResolvedValue({ modifiedCount: 0 }); // debit refused
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 3, // 150k > 100k balance
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("REJECTED");
    expect(res.body.order.reason).toMatch(/insufficient funds/i);
    expect(mockedHoldings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("a failed holding upsert refunds the debit", async () => {
    mockedHoldings.findOneAndUpdate.mockRejectedValue(new Error("db down"));
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.body.order.status).toBe("REJECTED");
    // Second updateOne call is the refund
    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: "user-1" },
      { $inc: { balance: 5000 } }
    );
  });

  test("a SELL decrements the holding (guarded), cleans dust, credits proceeds + realized P&L", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "SELL",
      type: "MARKET",
      qty: 0.2,
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("FILLED");
    const [filter, update] = mockedHoldings.updateOne.mock.calls[0];
    expect(filter.userId).toBe("user-1");
    expect(filter.symbol).toBe("BTCUSD");
    expect(filter.qty.$gte).toBeCloseTo(0.2, 6);
    expect(update).toEqual({ $inc: { qty: -0.2 } });
    expect(mockedHoldings.deleteMany).toHaveBeenCalled();
    // proceeds 0.2 * 50000 = 10000; realized (50000 - 45000) * 0.2 = 1000
    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: "user-1" },
      { $inc: { balance: 10000, realizedPnl: 1000 } }
    );
    expect(res.body.order.realizedPnl).toBe(1000);
  });

  test("a losing SELL books a negative realized P&L", async () => {
    mockedHoldings.findOne.mockResolvedValue({ qty: 1, avgCost: 60000 });
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "SELL",
      type: "MARKET",
      qty: 0.1,
    });
    // (50000 - 60000) * 0.1 = -1000
    expect(res.body.order.realizedPnl).toBe(-1000);
    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: "user-1" },
      { $inc: { balance: 5000, realizedPnl: -1000 } }
    );
  });

  test("a SELL without enough quantity is recorded REJECTED", async () => {
    mockedHoldings.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "SELL",
      type: "MARKET",
      qty: 5,
    });
    expect(res.body.order.status).toBe("REJECTED");
    expect(res.body.order.reason).toMatch(/insufficient quantity/i);
    expect(mockedUser.updateOne).not.toHaveBeenCalled(); // no credit
  });

  test("coerces numeric strings (regression from the old /neworder)", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: "0.1",
    });
    expect(res.status).toBe(201);
    expect(res.body.order.qty).toBe(0.1);
  });
});

describe("POST /api/orders — limit placement", () => {
  test("a plausible BUY limit rests OPEN", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "LIMIT",
      qty: 0.1,
      limitPrice: 45000,
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("OPEN");
    expect(res.body.order.limitPrice).toBe(45000);
    // No portfolio effects at placement
    expect(mockedUser.updateOne).not.toHaveBeenCalled();
  });

  test("soft-rejects a BUY limit the user can't afford with 422", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "LIMIT",
      qty: 10,
      limitPrice: 49000, // 490k > 100k balance
    });
    expect(res.status).toBe(422);
    expect(mockedOrders.create).not.toHaveBeenCalled();
  });

  test("soft-rejects a SELL limit for more than is held with 422", async () => {
    mockedHoldings.findOne.mockResolvedValue({ qty: 0.05 });
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "SELL",
      type: "LIMIT",
      qty: 1,
      limitPrice: 60000,
    });
    expect(res.status).toBe(422);
  });

  test("rejects an implausibly distant limitPrice with 400", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "LIMIT",
      qty: 0.1,
      limitPrice: 50000 * 200,
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders", () => {
  test("returns the user's orders newest first", async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ _id: "o1" }]),
    };
    mockedOrders.find.mockReturnValue(chain);
    const res = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(mockedOrders.find).toHaveBeenCalledWith({ userId: "user-1" });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  test("?status=open filters to resting orders", async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    mockedOrders.find.mockReturnValue(chain);
    await request(app)
      .get("/api/orders?status=open")
      .set("Authorization", `Bearer ${token()}`);
    expect(mockedOrders.find).toHaveBeenCalledWith({
      userId: "user-1",
      status: "OPEN",
    });
  });
});

describe("POST /api/orders/:id/cancel", () => {
  test("cancels an OPEN order atomically", async () => {
    mockedOrders.findOneAndUpdate.mockResolvedValue({ _id: "o1", status: "CANCELLED" });
    const res = await request(app)
      .post("/api/orders/o1/cancel")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "o1", userId: "user-1", status: "OPEN" },
      { $set: { status: "CANCELLED" } },
      { new: true }
    );
  });

  test("returns 409 when the order is no longer open", async () => {
    mockedOrders.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/orders/o1/cancel")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(409);
  });
});

describe("applyFillEffects — SELL epsilon guard", () => {
  test("allows selling an entire position despite float dust", async () => {
    await applyFillEffects("user-1", "BTCUSD", "SELL", 0.3, 50000);
    const [filter] = mockedHoldings.updateOne.mock.calls[0];
    // Guard must tolerate a stored qty of 0.30000000000000004-style dust
    expect(filter.qty.$gte).toBeLessThan(0.3);
  });
});
