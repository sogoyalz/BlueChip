/**
 * Order engine + /api/orders route tests. Models, the price feed, and the
 * Gemini sandbox client are mocked; JWT is real.
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
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: {
    find: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  },
}));
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(),
  isFresh: jest.fn(),
  getAllPrices: jest.fn(() => ({})),
  startPolling: jest.fn(),
}));
jest.mock("../services/geminiPrivate", () => ({
  placeGeminiOrder: jest.fn(),
  cancelGeminiOrder: jest.fn(),
  getGeminiOrderStatus: jest.fn(),
  getGeminiBalances: jest.fn().mockResolvedValue([]),
  clearBalancesCache: jest.fn(),
}));
jest.mock("../services/snapshots", () => ({
  snapshotNow: jest.fn().mockResolvedValue(undefined),
  startSnapshots: jest.fn(),
}));

import { app } from "../index";
import { UserModel } from "../model/UserModel";
import { OrdersModel } from "../model/OrdersModel";
import { getPrice, isFresh } from "../services/priceFeed";
import { placeGeminiOrder, cancelGeminiOrder } from "../services/geminiPrivate";

const mockedUser = UserModel as unknown as Record<string, jest.Mock>;
const mockedOrders = OrdersModel as unknown as Record<string, jest.Mock>;
const mockedGetPrice = getPrice as jest.Mock;
const mockedIsFresh = isFresh as jest.Mock;
const mockedPlaceGeminiOrder = placeGeminiOrder as jest.Mock;
const mockedCancelGeminiOrder = cancelGeminiOrder as jest.Mock;

const token = () => jwt.sign({ id: "user-1" }, process.env.TOKEN_KEY as string);
const alice = { _id: "user-1", username: "alice", email: "a@b.com" };

const authedPost = () =>
  request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token()}`)
    .set("X-Requested-With", "XMLHttpRequest");

/** A fake order document whose save() just records the mutation. */
const fakeOrderDoc = (fields: object) => {
  const doc: Record<string, unknown> = {
    _id: "order-1",
    ...fields,
    save: jest.fn().mockResolvedValue(undefined),
  };
  return doc;
};

/** A Gemini order/new response, fully filled by default. */
const geminiFill = (overrides: Partial<Record<string, unknown>> = {}) => ({
  order_id: "gemini-1",
  symbol: "btcusd",
  side: "buy",
  type: "exchange limit",
  price: "50500",
  avg_execution_price: "50000",
  executed_amount: "0.1",
  remaining_amount: "0",
  is_live: false,
  is_cancelled: false,
  timestampms: Date.now(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedUser.findById.mockResolvedValue(alice);
  mockedIsFresh.mockReturnValue(true);
  mockedGetPrice.mockReturnValue({ price: 50000, changePct24h: 1, updatedAt: Date.now(), source: "rest" });
  mockedOrders.create.mockImplementation(async (doc: object) => fakeOrderDoc(doc));
  mockedPlaceGeminiOrder.mockResolvedValue(geminiFill());
});

describe("POST /api/orders — validation", () => {
  test("rejects unauthenticated requests with 401", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("X-Requested-With", "XMLHttpRequest") // pass CSRF; isolate the auth check
      .send({ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 1 });
    expect(res.status).toBe(401);
  });

  test("rejects a state-changing request without the CSRF header with 403", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token()}`)
      .send({ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 1 });
    expect(res.status).toBe(403);
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
    expect(mockedPlaceGeminiOrder).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders — market fills", () => {
  test("a BUY places an IOC limit order crossed above the market price", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("FILLED");
    expect(res.body.order.fillPrice).toBe(50000);
    expect(res.body.order.geminiOrderId).toBe("gemini-1");

    const [call] = mockedPlaceGeminiOrder.mock.calls[0];
    expect(call.symbol).toBe("BTCUSD");
    expect(call.side).toBe("buy");
    expect(Number(call.price)).toBeGreaterThan(50000); // crossed above market
    expect(call.options).toEqual(["immediate-or-cancel"]);
  });

  test("a SELL crosses below the market price", async () => {
    await authedPost().send({
      symbol: "BTCUSD",
      side: "SELL",
      type: "MARKET",
      qty: 0.1,
    });
    const [call] = mockedPlaceGeminiOrder.mock.calls[0];
    expect(call.side).toBe("sell");
    expect(Number(call.price)).toBeLessThan(50000);
  });

  test("a MARKET order Gemini doesn't fill at all is recorded REJECTED", async () => {
    mockedPlaceGeminiOrder.mockResolvedValue(
      geminiFill({ executed_amount: "0", remaining_amount: "0.1", is_cancelled: true })
    );
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("REJECTED");
    expect(res.body.order.reason).toMatch(/did not fill/i);
  });

  test("a partially-filled MARKET order is recorded PARTIALLY_FILLED", async () => {
    mockedPlaceGeminiOrder.mockResolvedValue(
      geminiFill({ executed_amount: "0.05", remaining_amount: "0.05" })
    );
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.body.order.status).toBe("PARTIALLY_FILLED");
  });

  test("a Gemini placement failure surfaces as a 502", async () => {
    mockedPlaceGeminiOrder.mockRejectedValue(new Error("Gemini /v1/order/new responded 500"));
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.status).toBe(502);
    expect(mockedOrders.create).not.toHaveBeenCalled();
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
  test("a plausible BUY limit rests OPEN on Gemini", async () => {
    mockedPlaceGeminiOrder.mockResolvedValue(
      geminiFill({ executed_amount: "0", remaining_amount: "0.1", is_live: true })
    );
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
    const [call] = mockedPlaceGeminiOrder.mock.calls[0];
    expect(call.options).toBeUndefined();
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
    expect(mockedPlaceGeminiOrder).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders — idempotency (clientOrderId)", () => {
  test("passes clientOrderId through to Gemini and persists it", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
      clientOrderId: "key-abc",
    });
    expect(res.status).toBe(201);
    expect(mockedPlaceGeminiOrder.mock.calls[0][0].clientOrderId).toBe("key-abc");
    expect(mockedOrders.create.mock.calls[0][0].clientOrderId).toBe("key-abc");
  });

  test("a retry with the same clientOrderId returns the existing order without re-placing", async () => {
    // Simulate the first attempt already recorded: findOne finds it.
    mockedOrders.findOne.mockResolvedValue(
      fakeOrderDoc({ symbol: "BTCUSD", side: "BUY", clientOrderId: "key-dup", status: "FILLED" })
    );
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
      clientOrderId: "key-dup",
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("FILLED");
    // Neither the exchange nor a second insert was touched.
    expect(mockedPlaceGeminiOrder).not.toHaveBeenCalled();
    expect(mockedOrders.create).not.toHaveBeenCalled();
  });

  test("rejects a non-string clientOrderId with 400", async () => {
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
      clientOrderId: { not: "a string" },
    });
    expect(res.status).toBe(400);
    expect(mockedPlaceGeminiOrder).not.toHaveBeenCalled();
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
  test("cancels on Gemini first, then reconciles the local order", async () => {
    const restingOrder = fakeOrderDoc({
      status: "OPEN",
      geminiOrderId: "gemini-1",
      userId: "user-1",
    });
    mockedOrders.findOne.mockResolvedValue(restingOrder);
    mockedCancelGeminiOrder.mockResolvedValue(
      geminiFill({ is_cancelled: true, executed_amount: "0" })
    );

    const res = await request(app)
      .post("/api/orders/64a000000000000000000001/cancel")
      .set("Authorization", `Bearer ${token()}`)
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(200);
    expect(mockedCancelGeminiOrder).toHaveBeenCalledWith("gemini-1");
    expect(restingOrder.status).toBe("CANCELLED");
    expect(restingOrder.save).toHaveBeenCalled();
  });

  test("returns 404 (not 500) for a malformed order id", async () => {
    const res = await request(app)
      .post("/api/orders/not-an-objectid/cancel")
      .set("Authorization", `Bearer ${token()}`)
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(404);
    expect(mockedOrders.findOne).not.toHaveBeenCalled();
    expect(mockedCancelGeminiOrder).not.toHaveBeenCalled();
  });

  test("returns 409 when the order is no longer open locally", async () => {
    mockedOrders.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/orders/64a000000000000000000001/cancel")
      .set("Authorization", `Bearer ${token()}`)
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(409);
    expect(mockedCancelGeminiOrder).not.toHaveBeenCalled();
  });

  test("marks FILLED if Gemini's order filled before the cancel landed", async () => {
    const restingOrder = fakeOrderDoc({
      status: "OPEN",
      geminiOrderId: "gemini-1",
      userId: "user-1",
    });
    mockedOrders.findOne.mockResolvedValue(restingOrder);
    mockedCancelGeminiOrder.mockResolvedValue(
      geminiFill({ is_cancelled: false, executed_amount: "0.1", remaining_amount: "0" })
    );

    const res = await request(app)
      .post("/api/orders/64a000000000000000000001/cancel")
      .set("Authorization", `Bearer ${token()}`)
      .set("X-Requested-With", "XMLHttpRequest");
    expect(res.status).toBe(200);
    expect(restingOrder.status).toBe("FILLED");
  });
});
