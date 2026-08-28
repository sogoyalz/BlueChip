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
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
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
import {
  placeGeminiOrder,
  cancelGeminiOrder,
  clearBalancesCache,
} from "../services/geminiPrivate";
import { shouldApplyObservation } from "../services/orderState";
import { snapshotNow } from "../services/snapshots";

const mockedUser = UserModel as unknown as Record<string, jest.Mock>;
const mockedOrders = OrdersModel as unknown as Record<string, jest.Mock>;
const mockedGetPrice = getPrice as jest.Mock;
const mockedIsFresh = isFresh as jest.Mock;
const mockedPlaceGeminiOrder = placeGeminiOrder as jest.Mock;
const mockedCancelGeminiOrder = cancelGeminiOrder as jest.Mock;

const token = () => jwt.sign({ id: "user-1" }, process.env.TOKEN_KEY as string);

/**
 * Stands in for MongoDB's conditional update: applies $set only when the
 * observation is newer, using the same rule the real filter encodes.
 */
const conditionalUpdateOn = (doc: Record<string, unknown>) =>
  jest.fn(async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    const observed = {
      status: update.$set.status as never,
      filledQty: (update.$set.filledQty as number) ?? 0,
    };
    if (!shouldApplyObservation(doc as never, observed)) return null;
    Object.assign(doc, update.$set);
    return doc;
  });
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
  // "No order recorded for this key yet" is the right baseline: jest.clearAllMocks
  // clears call history but NOT implementations, so a mockResolvedValue set by one
  // test otherwise leaks into every later one — which silently short-circuited the
  // idempotency check and made unrelated tests pass for the wrong reason.
  mockedOrders.findOne.mockResolvedValue(null);
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

  test("a true race (both requests pass findOne, insert loses to the unique index) still returns the winner's order, not a 500", async () => {
    // Neither request sees the other's row yet — findOne returns nothing for
    // both, so both go on to place on Gemini (which dedupes on client_order_id)
    // and both call create(). The unique (userId, clientOrderId) index lets
    // only the first insert through; this request's create() is the loser.
    mockedOrders.findOne
      .mockResolvedValueOnce(null) // pre-insert idempotency check: not seen yet
      .mockResolvedValueOnce(
        fakeOrderDoc({ symbol: "BTCUSD", side: "BUY", clientOrderId: "key-race", status: "FILLED" })
      ); // post-11000 lookup: the winner's row
    mockedOrders.create.mockRejectedValueOnce({ code: 11000 });

    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
      clientOrderId: "key-race",
    });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("FILLED");
    // Gemini was still hit once (dedup happens there); no balance-cache churn
    // from this losing branch since it returns the existing doc, not a fresh fill.
    expect(mockedPlaceGeminiOrder).toHaveBeenCalledTimes(1);
  });

  test("a create() failure unrelated to the unique index (no clientOrderId) still surfaces as a 500", async () => {
    mockedOrders.create.mockRejectedValueOnce(new Error("Mongo connection lost"));
    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });
    expect(res.status).toBe(500);
  });

  test("a placement TIMEOUT does not claim the order failed", async () => {
    // A timeout is not a rejection: the request may have reached Gemini and
    // been accepted. Telling the user it "could not be placed" asserts
    // something we do not know, and invites a retry that could double-place.
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    mockedPlaceGeminiOrder.mockRejectedValueOnce(timeout);

    const res = await authedPost().send({
      symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0.1, clientOrderId: "k-timeout",
    });

    expect(res.status).toBe(504); // gateway timeout, not 502
    expect(res.body.message).toMatch(/may still have been placed/i);
    // With an idempotency key a retry is safe, and the copy says so.
    expect(res.body.message).toMatch(/retrying with the same request is safe/i);
    expect(mockedOrders.create).not.toHaveBeenCalled();
  });

  test("a timeout WITHOUT an idempotency key warns instead of inviting a retry", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    mockedPlaceGeminiOrder.mockRejectedValueOnce(timeout);

    const res = await authedPost().send({
      symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0.1,
    });

    expect(res.status).toBe(504);
    expect(res.body.message).toMatch(/check your orders before trying again/i);
    expect(res.body.message).not.toMatch(/safe/i);
  });

  test("a genuine rejection still reports a plain failure", async () => {
    mockedPlaceGeminiOrder.mockRejectedValueOnce(new Error("400 InvalidPrice"));
    const res = await authedPost().send({
      symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0.1,
    });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/could not be placed/i);
  });

  test("a persist failure AFTER the order executed still invalidates balances", async () => {
    // The order is live on Gemini and 0.1 BTC has already changed hands; only
    // the local write failed. Logging the orphan is not enough — the cached
    // balance is now provably wrong, and every /api/account and /api/holdings
    // read serves that wrong figure until the TTL expires. The snapshot series
    // would also silently skip the trade.
    mockedOrders.create.mockRejectedValueOnce(new Error("Mongo connection lost"));

    const res = await authedPost().send({
      symbol: "BTCUSD",
      side: "BUY",
      type: "MARKET",
      qty: 0.1,
    });

    expect(res.status).toBe(500); // caller still sees the failure
    expect(clearBalancesCache).toHaveBeenCalled();
    expect(snapshotNow).toHaveBeenCalled();
  });

  test("a persist failure with NOTHING executed leaves balances alone", async () => {
    // Nothing traded, so there is nothing to invalidate.
    mockedPlaceGeminiOrder.mockResolvedValue(
      geminiFill({ executed_amount: "0", remaining_amount: "0.1", avg_execution_price: "0" })
    );
    mockedOrders.create.mockRejectedValueOnce(new Error("Mongo connection lost"));

    await authedPost().send({ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0.1 });

    expect(clearBalancesCache).not.toHaveBeenCalled();
    expect(snapshotNow).not.toHaveBeenCalled();
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
    // "resting" is what the test always meant; it just asserted the narrower
    // OPEN. A partially-filled limit still has its remainder on the book.
    const filter = mockedOrders.find.mock.calls.at(-1)![0];
    expect(filter.userId).toBe("user-1");
    expect(filter.status.$in).toEqual(["OPEN", "PARTIALLY_FILLED"]);
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
    mockedOrders.findOneAndUpdate.mockImplementation(conditionalUpdateOn(restingOrder));
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
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalled();
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

  test("a PARTIALLY_FILLED limit order can still be cancelled", async () => {
    // A resting limit that partly crossed keeps its remainder on the book, so
    // the exchange will still accept a cancel. The route used to query
    // status:"OPEN" only, so it 409'd with "already filled or cancelled" for an
    // order the exchange was still holding — and the Cancel button disappeared
    // from the UI at the same moment, leaving the remainder stuck on the shared
    // account until it happened to fill.
    const partial = fakeOrderDoc({
      status: "PARTIALLY_FILLED",
      filledQty: 0.4,
      geminiOrderId: "gemini-1",
      userId: "user-1",
    });
    mockedOrders.findOne.mockResolvedValue(partial);
    mockedOrders.findOneAndUpdate.mockImplementation(conditionalUpdateOn(partial));
    mockedCancelGeminiOrder.mockResolvedValue(
      geminiFill({ is_cancelled: true, executed_amount: "0.4" })
    );

    const res = await request(app)
      .post("/api/orders/64a000000000000000000001/cancel")
      .set("Authorization", `Bearer ${token()}`)
      .set("X-Requested-With", "XMLHttpRequest");

    expect(res.status).toBe(200);
    expect(mockedCancelGeminiOrder).toHaveBeenCalledWith("gemini-1");
    expect(partial.status).toBe("CANCELLED");
  });

  test("the lookup asks for every resting status, not just OPEN", async () => {
    mockedOrders.findOne.mockResolvedValue(null);
    await request(app)
      .post("/api/orders/64a000000000000000000001/cancel")
      .set("Authorization", `Bearer ${token()}`)
      .set("X-Requested-With", "XMLHttpRequest");

    // The value carries mongoose's trusted marker, so assert on the array.
    const filter = mockedOrders.findOne.mock.calls.at(-1)![0];
    expect(filter.status.$in).toEqual(["OPEN", "PARTIALLY_FILLED"]);
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
    mockedOrders.findOneAndUpdate.mockImplementation(conditionalUpdateOn(restingOrder));
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

  test("a cancel does not overwrite a fill an orderSync tick already recorded", async () => {
    // The race this guard exists for: a sync tick observed the order fully
    // filled and wrote FILLED/1.0 while the cancel was still in flight. The
    // cancel's own observation (0.4 executed) is older, and CANCELLED is
    // terminal — so landing it would strand 0.6 of filled quantity in a state
    // orderSync never revisits.
    const order = fakeOrderDoc({
      status: "FILLED",
      filledQty: 1,
      fillPrice: 50000,
      geminiOrderId: "gemini-1",
      userId: "user-1",
    });
    mockedOrders.findOne.mockResolvedValue(order);
    mockedOrders.findOneAndUpdate.mockImplementation(conditionalUpdateOn(order));
    mockedOrders.findById.mockResolvedValue(order);
    mockedCancelGeminiOrder.mockResolvedValue(
      geminiFill({ is_cancelled: true, executed_amount: "0.4", avg_execution_price: "49000" })
    );

    const res = await request(app)
      .post("/api/orders/64a000000000000000000001/cancel")
      .set("Authorization", `Bearer ${token()}`)
      .set("X-Requested-With", "XMLHttpRequest");

    expect(res.status).toBe(200);
    expect(order.status).toBe("FILLED"); // the newer observation stands
    expect(order.filledQty).toBe(1);
    expect(order.fillPrice).toBe(50000);
    // ...and the caller is told the real state, not the one the cancel lost with
    expect(res.body.order.status).toBe("FILLED");
  });
});
