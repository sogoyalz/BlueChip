// Explicitly opt-in test-fund writes. Never changes the exchange origin.
import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const requireBackend = createRequire(new URL("../backend/package.json", import.meta.url));
requireBackend("dotenv").config({ path: new URL("../backend/.env", import.meta.url), quiet: true });
process.env.MONITORING_WEBHOOK_URL = ""; // Failure injection must not notify external services.
if (!process.argv.includes("--execute")) throw Error("Add --execute to authorize two small sandbox limit orders and their cleanup.");
const userId = process.argv.find(arg => arg.startsWith("--user-id="))?.slice(10);
if (!/^[a-f0-9]{24}$/i.test(userId ?? "")) throw Error("Supply --user-id=<existing operator MongoDB ID>.");
const api = "http://localhost:3002";
const mongoose = requireBackend("mongoose");
mongoose.set("autoIndex", false); mongoose.set("autoCreate", false); mongoose.set("sanitizeFilter", true);
const { OrdersModel } = requireBackend("./dist/model/OrdersModel");
const { UserModel } = requireBackend("./dist/model/UserModel");
const { createSecretToken } = requireBackend("./dist/util/SecretToken");
const { placeOrder, cancelOrder } = requireBackend("./dist/services/orderEngine");
const { applyObservation } = requireBackend("./dist/services/orderState");
const { getTradingRules } = requireBackend("./dist/services/tradingRules");
const { setPrice } = requireBackend("./dist/services/priceFeed");
const { fetchTickerV2 } = requireBackend("./dist/services/gemini");
const { getGeminiOrderByClientId } = requireBackend("./dist/services/geminiPrivate");
const { isOperator } = requireBackend("./dist/middlewares/OperatorMiddleware");
const originalFetch = globalThis.fetch;
const tracked = [];
let headers;
const result = { checkedAt: new Date().toISOString(), environment: "Gemini sandbox", maxOrders: process.argv.includes("--recovery-only") ? 1 : 2, maxNotionalUsdPerOrder: 5, checks: [] };
async function request(path, body) {
  const response = await originalFetch(api + path, { method: body === undefined ? "GET" : "POST", headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
  const data = await response.json();
  if (!response.ok) throw Error(`Local API check failed (${response.status})`);
  return data;
}
async function untilObserved(id) {
  const deadline = Date.now() + 45_000;
  do {
    const order = await OrdersModel.findById(id);
    if (order && !["PENDING", "UNKNOWN"].includes(order.status)) return order;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  throw Error("Background reconciliation did not recover the order within 45 seconds");
}
async function cleanup(item) {
  let order = await OrdersModel.findById(item.id);
  if (!order || ["FILLED", "CANCELLED", "REJECTED"].includes(order.status)) return;
  let exchangeId = order.geminiOrderId ?? item.exchangeId;
  if (!exchangeId) exchangeId = String((await getGeminiOrderByClientId(item.clientId)).order_id);
  const observation = await cancelOrder(exchangeId);
  await applyObservation(order._id, { ...observation, filledQty: observation.filledQty ?? 0, actorId: userId });
}
try {
  await mongoose.connect(process.env.MONGO_URL);
  const user = await UserModel.findById(userId);
  assert(user && isOperator(userId), "Selected user must be explicitly allowlisted");
  headers = { Authorization: `Bearer ${createSecretToken(userId, user.tokenVersion)}`, "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };
  const session = await request("/api/session");
  assert.equal(session.isOperator, true, "Restart the backend to load the operator allowlist");
  result.checks.push("operator_session_verified");
  const rules = await getTradingRules("BTCUSD");
  const bookResponse = await originalFetch("https://api.sandbox.gemini.com/v1/book/btcusd", { signal: AbortSignal.timeout(10_000) });
  assert(bookResponse.ok); const book = await bookResponse.json();
  const bid = Number(book.bids?.[0]?.price), ask = Number(book.asks?.[0]?.price), step = Number(rules.quoteIncrement);
  assert(Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0);
  const limitPrice = Number((Math.floor(bid * 0.5 / step) * step).toFixed(8));
  const qty = String(rules.minOrderSize);
  assert(limitPrice > 0 && limitPrice < ask && Number(qty) * limitPrice <= 5, "Minimum test exceeds the $5 sandbox limit");
  const input = () => ({ symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty, limitPrice: String(limitPrice), clientOrderId: randomUUID() });

  if (!process.argv.includes("--recovery-only")) {
  const normal = (await request("/api/orders", input())).order;
  tracked.push({ id: normal._id, exchangeId: normal.geminiOrderId });
  assert.equal(normal.status, "OPEN", "Expected a resting low-price test limit");
  const cancelled = (await request(`/api/orders/${normal._id}/cancel`, {})).order;
  assert.equal(cancelled.status, "CANCELLED");
  result.checks.push("live_limit_placement_and_owner_cancellation");
  }
  const quote = await fetchTickerV2("BTCUSD");
  setPrice("BTCUSD", { price: quote.close, source: "rest" });

  const instructions = input(); let writes = 0, acceptedId;
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (String(args[0]) === "https://api.sandbox.gemini.com/v1/order/new") {
      writes += 1;
      if (response.ok) {
        const accepted = await response.clone().json(); acceptedId = String(accepted.order_id);
        throw Object.assign(new Error("Validation deliberately discarded the accepted sandbox acknowledgement"), { name: "TimeoutError" });
      }
    }
    return response;
  };
  let uncertain;
  try { uncertain = await placeOrder(userId, instructions); }
  finally {
    globalThis.fetch = originalFetch;
    const stored = await OrdersModel.findOne({ userId, clientOrderId: instructions.clientOrderId });
    if (stored) tracked.push({ id: stored._id, exchangeId: acceptedId, clientId: stored.exchangeClientOrderId });
  }
  assert.equal(uncertain.status, "UNKNOWN");
  const replay = await placeOrder(userId, instructions);
  assert.equal(String(replay._id), String(uncertain._id)); assert.equal(writes, 1);
  const recovered = await untilObserved(uncertain._id);
  assert.equal(recovered.status, "OPEN"); assert.equal(recovered.geminiOrderId, acceptedId);
  assert(recovered.recentEvents.some(event => event.kind === "EXCHANGE_OBSERVED"));
  await request(`/api/orders/${recovered._id}/cancel`, {});
  result.checks.push("lost_acknowledgement_persisted_as_unknown", "same_key_replay_kept_original_order", "running_reconciler_recovered_original_exchange_order", "recovered_order_cancelled");
} catch (error) {
  result.error = String(error.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[database URI redacted]");
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  for (const item of tracked) {
    try { await cleanup(item); }
    catch { result.cleanupFailed = true; process.exitCode = 1; }
  }
  result.orders = [];
  for (const item of tracked) {
    const order = await OrdersModel.findById(item.id);
    result.orders.push({ localId: String(item.id), exchangeId: order?.geminiOrderId ?? item.exchangeId, status: order?.status, filledQty: order?.filledQty ?? 0 });
  }
  if (mongoose.connection.readyState) await mongoose.disconnect();
  console.log(JSON.stringify(result, null, 2));
}
