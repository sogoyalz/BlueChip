/**
 * The order journey, end to end, against a real database.
 *
 * Signup -> login -> place -> reconcile -> read back. This path spans auth,
 * the order engine, the exchange client, the reconciler and the orders route,
 * and nothing else exercises it as one sequence: the unit suites each mock the
 * pieces on either side of the part they cover, so a break in the seams
 * between them would pass every one of them.
 *
 * Only the Gemini network calls are faked — everything else is the real thing,
 * including Mongo, the real indexes, bcrypt and JWT.
 */
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

process.env.TOKEN_KEY = "integration-only-key-that-is-long-enough-32ch";
process.env.ORDER_RATE_MAX = "10000";
process.env.GENERAL_RATE_MAX = "10000";
process.env.AUTH_RATE_MAX = "10000";

// The exchange is the one thing we cannot talk to for real.
jest.mock("../services/geminiPrivate", () => ({
  placeGeminiOrder: jest.fn(),
  cancelGeminiOrder: jest.fn(),
  getGeminiOrderStatus: jest.fn(),
  getGeminiActiveOrders: jest.fn().mockResolvedValue([]),
  getGeminiBalances: jest.fn().mockResolvedValue([
    { currency: "USD", amount: "50000", available: "50000", availableForWithdrawal: "50000" },
  ]),
  clearBalancesCache: jest.fn(),
}));
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(() => ({ price: 50000, changePct24h: 1, updatedAt: Date.now(), source: "rest" })),
  isFresh: jest.fn(() => true),
  getAllPrices: jest.fn(() => ({})),
  startPolling: jest.fn(),
  stopPolling: jest.fn(),
}));

import { app } from "../index";
import { OrdersModel } from "../model/OrdersModel";
import { placeGeminiOrder, getGeminiOrderStatus } from "../services/geminiPrivate";
import { tick } from "../services/orderSync";

jest.setTimeout(60_000);

let mongod: MongoMemoryServer;
const csrf = (r: request.Test) => r.set("X-Requested-With", "XMLHttpRequest");

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  mongoose.set("sanitizeFilter", true);
  await mongoose.connect(mongod.getUri());
  await OrdersModel.createIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const geminiOrder = (over: Record<string, unknown> = {}) => ({
  order_id: "gem-1",
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
  ...over,
});

describe("a user's first order, end to end", () => {
  let cookie: string;

  test("signs up and receives a session", async () => {
    const res = await csrf(request(app).post("/signup")).send({
      email: "Journey@Example.com", // mixed case: normalisation is part of the path
      password: "correct-horse-battery",
      username: "journey",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("journey@example.com");
    expect(res.body).not.toHaveProperty("password");
    cookie = (res.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    expect(cookie).toMatch(/^token=/);
  });

  test("the session is accepted by a protected route", async () => {
    const res = await request(app).get("/api/orders").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("places a market order that fills", async () => {
    (placeGeminiOrder as jest.Mock).mockResolvedValue(geminiOrder());

    const res = await csrf(request(app).post("/api/orders"))
      .set("Cookie", cookie)
      .send({ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0.1, clientOrderId: "journey-1" });

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      status: "FILLED",
      symbol: "BTCUSD",
      qty: 0.1,
      filledQty: 0.1,
      fillPrice: 50000,
    });
  });

  test("the order is readable back, scoped to its owner", async () => {
    const res = await request(app).get("/api/orders").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].symbol).toBe("BTCUSD");
  });

  test("retrying with the same idempotency key does not place a second order", async () => {
    // The real partial index enforces this, not a mock.
    const res = await csrf(request(app).post("/api/orders"))
      .set("Cookie", cookie)
      .send({ symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0.1, clientOrderId: "journey-1" });

    expect(res.status).toBe(201);
    expect(await OrdersModel.countDocuments()).toBe(1);
  });

  test("a resting limit order is reconciled to FILLED by the sync tick", async () => {
    (placeGeminiOrder as jest.Mock).mockResolvedValue(
      geminiOrder({ order_id: "gem-2", executed_amount: "0", remaining_amount: "0.2", is_live: true })
    );
    const placed = await csrf(request(app).post("/api/orders"))
      .set("Cookie", cookie)
      .send({ symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 0.2, limitPrice: 49000 });
    expect(placed.body.order.status).toBe("OPEN");

    // It leaves Gemini's book, fully filled, and the reconciler picks it up.
    (getGeminiOrderStatus as jest.Mock).mockResolvedValue(
      geminiOrder({ order_id: "gem-2", executed_amount: "0.2", remaining_amount: "0", avg_execution_price: "49000" })
    );
    await tick();

    const res = await request(app).get("/api/orders").set("Cookie", cookie);
    const limitOrder = res.body.find((o: { geminiOrderId: string }) => o.geminiOrderId === "gem-2");
    expect(limitOrder).toMatchObject({ status: "FILLED", filledQty: 0.2, fillPrice: 49000 });
  });

  test("another user cannot see these orders", async () => {
    const other = await csrf(request(app).post("/signup")).send({
      email: "other@example.com",
      password: "correct-horse-battery",
      username: "other",
    });
    const otherCookie = (other.headers["set-cookie"] as unknown as string[])[0].split(";")[0];

    const res = await request(app).get("/api/orders").set("Cookie", otherCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("logging out revokes the session for real", async () => {
    await csrf(request(app).post("/logout")).set("Cookie", cookie).send({});

    const res = await request(app).get("/api/orders").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });
});
