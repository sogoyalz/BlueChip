import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
process.env.TOKEN_KEY = "recovery-test-secret-with-at-least-32-characters";
jest.mock("../services/tradingRules", () => ({ getTradingRules: jest.fn(async () => ({ tickSize: "0.00000001", quoteIncrement: "0.00001", minOrderSize: 0.00001 })) }));
jest.mock("../services/geminiPrivate", () => ({ ...jest.requireActual("../services/geminiPrivate"),
  placeGeminiOrder: jest.fn(), getGeminiOrderByClientId: jest.fn(), getGeminiOrderStatus: jest.fn(),
  getGeminiActiveOrders: jest.fn(async () => []), clearBalancesCache: jest.fn(),
}));
jest.mock("../services/snapshots", () => ({ snapshotNow: jest.fn(async () => undefined) }));
import { OrdersModel } from "../model/OrdersModel";
import { UserModel } from "../model/UserModel";
import { createSecretToken } from "../util/SecretToken";
import { app } from "../index";
import { applyObservation } from "../services/orderState";
import { appendOrderEvent } from "../schemas/OrderEvent";
import { getReconciliationStatus } from "../services/reconciliationDiagnostics";
import { placeOrder } from "../services/orderEngine";
import { tick } from "../services/orderSync";
import { getTradingRules } from "../services/tradingRules";
import { setPrice } from "../services/priceFeed";
import { placeGeminiOrder, getGeminiOrderByClientId, getGeminiActiveOrders, getGeminiOrderStatus, GeminiUnavailableError } from "../services/geminiPrivate";

jest.setTimeout(60_000);
let mongo: MongoMemoryServer;
const uid = new mongoose.Types.ObjectId();
const input = { symbol: "BTCUSD", side: "BUY", type: "MARKET", qty: 0.1, clientOrderId: "recovery" } as const;
const filled = (id = "exchange-1") => ({ order_id: id, executed_amount: "0.1", remaining_amount: "0", avg_execution_price: "50000", is_live: false, is_cancelled: false });
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  mongoose.set("sanitizeFilter", true);
  await mongoose.connect(mongo.getUri());
  await OrdersModel.createIndexes();
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => {
  jest.clearAllMocks();
  delete process.env.OPERATOR_USER_IDS;
  await OrdersModel.deleteMany({});
  await UserModel.deleteMany({});
  setPrice("BTCUSD", { price: 50000 });
  setPrice("DOGEUSD", { price: 0.0899 });
  (getGeminiActiveOrders as jest.Mock).mockResolvedValue([]);
  (placeGeminiOrder as jest.Mock).mockResolvedValue(filled());
});

test("concurrent retries reserve one intent and send one exchange request", async () => {
  let complete!: (value: object) => void;
  (placeGeminiOrder as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const first = placeOrder(uid, input);
  while (!complete) await new Promise(resolve => setTimeout(resolve, 5));
  const retry = await placeOrder(uid, input);
  expect(retry.status).toBe("PENDING");
  expect(await OrdersModel.countDocuments()).toBe(1);
  expect(placeGeminiOrder).toHaveBeenCalledTimes(1);
  complete(filled());
  expect((await first).status).toBe("FILLED");
});

test("an uncertain outcome is persisted, never resubmitted, and recovered by client ID", async () => {
  (placeGeminiOrder as jest.Mock).mockRejectedValueOnce(Object.assign(new Error("response lost"), { name: "TimeoutError" }));
  const pending = await placeOrder(uid, input);
  expect(pending.status).toBe("UNKNOWN");
  expect((await placeOrder(uid, input))._id).toEqual(pending._id);
  (getGeminiOrderByClientId as jest.Mock).mockResolvedValue(filled());
  await tick();
  const recovered = await OrdersModel.findById(pending._id);
  expect(recovered).toMatchObject({ status: "FILLED", geminiOrderId: "exchange-1", filledQty: 0.1 });
  expect(getGeminiOrderByClientId).toHaveBeenCalledWith(pending.exchangeClientOrderId);
  expect(placeGeminiOrder).toHaveBeenCalledTimes(1);
});

test("a process-interrupted pending record is recoverable without another write to Gemini", async () => {
  const order = await OrdersModel.create({ userId: uid, ...input, status: "PENDING", exchangeClientOrderId: "persisted-before-crash", createdAt: new Date(Date.now() - 60_000) });
  (getGeminiOrderByClientId as jest.Mock).mockResolvedValue(filled());
  await tick();
  expect((await OrdersModel.findById(order._id))?.status).toBe("FILLED");
  expect(placeGeminiOrder).not.toHaveBeenCalled();
});

test("failed final acknowledgement leaves the already persisted intent for recovery", async () => {
  const update = jest.spyOn(OrdersModel, "findOneAndUpdate").mockRejectedValueOnce(new Error("ack write failed"));
  await expect(placeOrder(uid, input)).rejects.toThrow("ack write failed");
  update.mockRestore();
  const pending = await OrdersModel.findOne({ userId: uid });
  expect(pending?.status).toBe("PENDING");
  await OrdersModel.updateOne({ _id: pending!._id }, { $set: { createdAt: new Date(Date.now() - 60_000) } });
  (getGeminiOrderByClientId as jest.Mock).mockResolvedValue(filled());
  await tick();
  expect((await OrdersModel.findById(pending!._id))?.status).toBe("FILLED");
  expect(placeGeminiOrder).toHaveBeenCalledTimes(1);
});

test("a reused key with edited instructions conflicts without placing again", async () => {
  await placeOrder(uid, input);
  await expect(placeOrder(uid, { ...input, qty: 0.2 })).rejects.toMatchObject({ status: 409 });
  expect(placeGeminiOrder).toHaveBeenCalledTimes(1);
});

test.each([null, "", undefined])("an invalid remaining amount %p is not interpreted as a completed fill", async remaining_amount => {
  (placeGeminiOrder as jest.Mock).mockResolvedValue({ ...filled(), remaining_amount });
  expect((await placeOrder(uid, input)).status).toBe("UNKNOWN");
  expect((await OrdersModel.findOne({ userId: uid }))?.status).toBe("UNKNOWN");
});

test("a failed reservation never sends an order", async () => {
  const create = jest.spyOn(OrdersModel, "create").mockRejectedValueOnce(new Error("db down"));
  await expect(placeOrder(uid, input)).rejects.toThrow("db down");
  create.mockRestore();
  expect(placeGeminiOrder).not.toHaveBeenCalled();
});

test("unconfigured exchange errors remain distinguishable from rejected orders", async () => {
  (placeGeminiOrder as jest.Mock).mockRejectedValueOnce(new GeminiUnavailableError("not_configured", "not configured"));
  await expect(placeOrder(uid, input)).rejects.toBeInstanceOf(GeminiUnavailableError);
  expect((await OrdersModel.findOne({ userId: uid }))?.status).toBe("REJECTED");
});

test("fractional limits are preserved exactly; invalid increments are refused", async () => {
  await placeOrder(uid, { ...input, symbol: "DOGEUSD", type: "LIMIT", qty: 10, limitPrice: 0.0899 });
  expect(placeGeminiOrder).toHaveBeenCalledWith(expect.objectContaining({ price: "0.0899" }));
  await expect(placeOrder(uid, { ...input, clientOrderId: "invalid", type: "LIMIT", limitPrice: 0.000001 })).rejects.toMatchObject({ status: 400 });
});

test("market freshness is checked after waiting for exchange metadata", async () => {
  (getTradingRules as jest.Mock).mockImplementationOnce(async () => {
    setPrice("BTCUSD", { price: 50000, updatedAt: Date.now() - 60_000 });
    return { tickSize: "0.00000001", quoteIncrement: "0.01", minOrderSize: 0.00001 };
  });
  await expect(placeOrder(uid, input)).rejects.toMatchObject({ status: 503 });
  expect(placeGeminiOrder).not.toHaveBeenCalled();
  expect(await OrdersModel.countDocuments()).toBe(0);
});

test("a null exchange payload remains an explicitly uncertain tracked order", async () => {
  (placeGeminiOrder as jest.Mock).mockResolvedValueOnce(null);
  expect((await placeOrder(uid, input)).status).toBe("UNKNOWN");
  expect((await OrdersModel.findOne({ userId: uid }))?.status).toBe("UNKNOWN");
});

test("legacy rows without exchange identifiers cannot block later orders", async () => {
  await OrdersModel.insertMany(Array.from({ length: 500 }, () => ({
    userId: uid, symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 0.1, status: "OPEN",
  })));
  const tracked = await OrdersModel.create({ userId: uid, symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 0.1,
    status: "OPEN", geminiOrderId: "tracked", lastCheckedAt: new Date(0) });
  (getGeminiOrderStatus as jest.Mock).mockResolvedValue(filled("tracked"));
  await tick(); await tick();
  expect((await OrdersModel.findById(tracked._id))?.status).toBe("FILLED");
});

test("more than 500 resting orders all get a reconciliation turn", async () => {
  const rows = await OrdersModel.insertMany(Array.from({ length: 501 }, (_, i) => ({
    userId: uid, symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 0.1,
    status: "OPEN", geminiOrderId: String(i), lastCheckedAt: new Date(0),
  })));
  (getGeminiActiveOrders as jest.Mock).mockResolvedValue(rows.slice(0, 500).map(row => ({
    ...filled(row.geminiOrderId), executed_amount: "0", remaining_amount: "0.1", is_live: true,
  })));
  (getGeminiOrderStatus as jest.Mock).mockResolvedValue(filled("500"));
  await tick(); await tick();
  expect(getGeminiOrderStatus).toHaveBeenCalledWith("500");
  expect((await OrdersModel.findById(rows[500]._id))?.status).toBe("FILLED");
});

test("cursor pages do not lose tied timestamps or expose another user's history", async () => {
  await UserModel.create({ _id: uid, email: "pages@example.com", username: "pages", password: "test-password" });
  await OrdersModel.insertMany(Array.from({ length: 251 }, (_, i) => ({
    userId: i === 250 ? new mongoose.Types.ObjectId() : uid,
    symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 0.1,
    status: i === 0 ? "OPEN" : "FILLED", createdAt: new Date("2026-01-01"),
  })));
  const token = createSecretToken(uid);
  const ids: string[] = [];
  let cursor = "";
  do {
    const result = await request(app).get("/api/orders").query(cursor ? { cursor } : {}).set("Authorization", `Bearer ${token}`);
    expect(result.status).toBe(200);
    expect(result.headers["x-total-count"]).toBe("250");
    ids.push(...result.body.map((row: { _id: string }) => row._id));
    cursor = result.headers["x-next-cursor"];
  } while (cursor);
  expect(ids).toHaveLength(250);
  expect(new Set(ids).size).toBe(250);
  const open = await request(app).get("/api/orders?status=open").set("Authorization", `Bearer ${token}`);
  expect(open.body).toHaveLength(1);
  expect(open.body[0].status).toBe("OPEN");
  const invalid = await request(app).get("/api/orders?cursor=invalid").set("Authorization", `Bearer ${token}`);
  expect(invalid.status).toBe(400);
});

async function operatorFixture() {
  const owner = await UserModel.create({ email: "owner@example.com", username: "owner", password: "test-password" });
  const operator = await UserModel.create({ email: "operator@example.com", username: "operator", password: "test-password" });
  const outsider = await UserModel.create({ email: "outsider@example.com", username: "outsider", password: "test-password" });
  process.env.OPERATOR_USER_IDS = String(operator._id);
  const order = await OrdersModel.create({ userId: owner._id, ...input, status: "UNKNOWN", requestHash: "private-hash",
    exchangeClientOrderId: "recover-me", createdAt: new Date(Date.now() - 60_000) });
  const auth = (user: typeof owner) => `Bearer ${createSecretToken(user._id)}`;
  return { owner, operator, outsider, order, auth };
}

test("diagnostics enforce ownership, hide hashes, and require explicit operator access", async () => {
  const { owner, operator, outsider, order, auth } = await operatorFixture();
  const url = `/api/orders/${order._id}/diagnostics`;
  expect((await request(app).get(url)).status).toBe(401);
  expect((await request(app).get(url).set("Authorization", auth(outsider))).status).toBe(404);
  const own = await request(app).get(url).set("Authorization", auth(owner));
  expect(own.status).toBe(200);
  expect(own.body.order).toMatchObject({ recoveryMode: "automatic_lookup", reconciliationAttempts: 0 });
  expect(own.body.order).not.toHaveProperty("requestHash");
  expect(own.body.order).not.toHaveProperty("ownerId");
  expect((await request(app).get(url).set("Authorization", auth(operator))).body.order.ownerId).toBe(String(owner._id));
  expect((await request(app).get("/api/operations/orders").set("Authorization", auth(owner))).status).toBe(403);
  const session = await request(app).get("/api/session").set("Authorization", auth(owner));
  expect(session.body).toMatchObject({ username: "owner", isOperator: false });
  expect((await request(app).get("/api/session").set("Authorization", auth(operator))).body.isOperator).toBe(true);
  delete process.env.OPERATOR_USER_IDS;
  expect((await request(app).get("/api/operations/orders").set("Authorization", auth(operator))).status).toBe(403);
});

test("the operator queue pages oldest first without losing tied timestamps", async () => {
  const { operator, order, auth } = await operatorFixture();
  await OrdersModel.insertMany(Array.from({ length: 55 }, () => ({ userId: order.userId, symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 1,
    status: "UNKNOWN", createdAt: new Date("2025-01-01") })));
  const first = await request(app).get("/api/operations/orders").set("Authorization", auth(operator));
  expect(first.status).toBe(200); expect(first.body.total).toBe(56); expect(first.body.orders).toHaveLength(50);
  const second = await request(app).get("/api/operations/orders").query({ cursor: first.body.nextCursor }).set("Authorization", auth(operator));
  expect(second.body.orders).toHaveLength(6); expect(second.body.nextCursor).toBe("");
  expect(new Set([...first.body.orders, ...second.body.orders].map((row: { _id: string }) => row._id)).size).toBe(56);
  expect((await request(app).get("/api/operations/orders?cursor=invalid").set("Authorization", auth(operator))).status).toBe(400);
});

test("operator recheck schedules only the original lookup and records its actor atomically", async () => {
  const { owner, operator, order, auth } = await operatorFixture();
  const url = `/api/operations/orders/${order._id}/reconcile`;
  expect((await request(app).post(url).set("Authorization", auth(operator))).status).toBe(403); // CSRF
  expect((await request(app).post(url).set("X-Requested-With", "XMLHttpRequest").set("Authorization", auth(owner))).status).toBe(403);
  const response = await request(app).post(url).set("X-Requested-With", "XMLHttpRequest").set("Authorization", auth(operator));
  expect(response.status).toBe(202);
  const stored = await OrdersModel.findById(order._id);
  expect(stored?.status).toBe("UNKNOWN"); expect(stored?.exchangeClientOrderId).toBe("recover-me");
  expect(stored?.lastCheckedAt).toBeUndefined();
  expect(stored?.recentEvents?.[0]).toMatchObject({ kind: "RECHECK_REQUESTED", actorId: operator._id });
  expect(placeGeminiOrder).not.toHaveBeenCalled(); expect(getGeminiOrderByClientId).not.toHaveBeenCalled();
  expect((await request(app).post(url).set("X-Requested-With", "XMLHttpRequest").set("Authorization", auth(operator))).status).toBe(409);
  (getGeminiOrderByClientId as jest.Mock).mockResolvedValue(filled()); await tick();
  expect(getGeminiOrderByClientId).toHaveBeenCalledWith("recover-me");
  expect((await OrdersModel.findById(order._id))?.status).toBe("FILLED");
  expect(placeGeminiOrder).not.toHaveBeenCalled();
});

test.each(["missing_identifier", "fresh_pending", "terminal"])("recheck refuses unsafe case %s", async scenario => {
  const { operator, order, auth } = await operatorFixture();
  if (scenario === "missing_identifier") await OrdersModel.updateOne({ _id: order._id }, { $unset: { exchangeClientOrderId: "" } });
  if (scenario === "fresh_pending") await OrdersModel.updateOne({ _id: order._id }, { $set: { status: "PENDING", createdAt: new Date() } });
  if (scenario === "terminal") await OrdersModel.updateOne({ _id: order._id }, { $set: { status: "FILLED" } });
  const response = await request(app).post(`/api/operations/orders/${order._id}/reconcile`).set("Authorization", auth(operator)).set("X-Requested-With", "XMLHttpRequest");
  expect(response.status).toBe(409); expect(placeGeminiOrder).not.toHaveBeenCalled();
  expect((await OrdersModel.findById(order._id))?.recentEvents).toHaveLength(0);
});

test("events are bounded and a stale exchange observation cannot append an event", async () => {
  const order = await OrdersModel.create({ userId: uid, ...input, status: "OPEN", filledQty: 0 });
  for (let index = 0; index < 55; index++) await OrdersModel.updateOne({ _id: order._id }, { $push: { recentEvents: appendOrderEvent("RECHECK_REQUESTED", { note: String(index) }) } });
  const bounded = await OrdersModel.findById(order._id);
  expect(bounded?.recentEvents).toHaveLength(50); expect(bounded?.recentEvents?.[0].note).toBe("5");
  await applyObservation(order._id, { status: "FILLED", filledQty: 0.1 });
  expect(await applyObservation(order._id, { status: "CANCELLED", filledQty: 0.05 })).toBeNull();
  const terminal = await OrdersModel.findById(order._id);
  expect(terminal?.recentEvents).toHaveLength(50);
  expect(terminal?.recentEvents?.at(-1)).toMatchObject({ kind: "EXCHANGE_OBSERVED", status: "FILLED", filledQty: 0.1 });
});

test("lookup failures are safely classified and deduplicated, then clear after recovery", async () => {
  const order = await OrdersModel.create({ userId: uid, ...input, status: "UNKNOWN", exchangeClientOrderId: "uncertain" });
  (getGeminiOrderByClientId as jest.Mock).mockRejectedValue(new Error("sensitive upstream body"));
  await tick();
  await OrdersModel.updateOne({ _id: order._id }, { $set: { nextCheckAt: new Date(0) } }); await tick();
  const failed = await OrdersModel.findById(order._id);
  expect(failed).toMatchObject({ reconciliationAttempts: 2, lastReconciliationCode: "lookup_failed" });
  expect(failed?.recentEvents).toHaveLength(1); expect(JSON.stringify(failed?.recentEvents)).not.toContain("sensitive");
  expect(getReconciliationStatus()).toMatchObject({ active: false, lastPass: { checked: 1, failed: 1 } });
  (getGeminiOrderByClientId as jest.Mock).mockResolvedValue(filled());
  await OrdersModel.updateOne({ _id: order._id }, { $set: { nextCheckAt: new Date(0) } }); await tick();
  const recovered = await OrdersModel.findById(order._id);
  expect(recovered?.lastReconciliationCode).toBeUndefined(); expect(recovered?.reconciliationAttempts).toBe(3);
  expect(recovered?.recentEvents?.at(-1)?.kind).toBe("EXCHANGE_OBSERVED");
});
