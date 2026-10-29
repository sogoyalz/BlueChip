// Read-only checks. Does not import application models, create indexes, or trade.
import fs from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
const requireBackend = createRequire(new URL("../backend/package.json", import.meta.url));
const envFile = new URL("../backend/.env", import.meta.url);
const env = { ...(fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, "utf8")) : {}), ...process.env };
const checks = [];
async function check(name, operation) {
  try { checks.push({ name, status: "passed", detail: await operation() }); }
  catch { checks.push({ name, status: "failed", detail: "Check failed. Inspect configuration/connectivity without sharing secrets." }); }
}
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw Error();
  return response.json();
}
const sandbox = "https://api.sandbox.gemini.com";
await check("public sandbox symbols", async () => {
  const symbols = await json(`${sandbox}/v1/symbols`);
  if (!Array.isArray(symbols) || !symbols.includes("btcusd")) throw Error();
  return `${symbols.length} symbols; BTCUSD listed`;
});
for (const symbol of ["btcusd", "dogeusd"]) await check(`public sandbox ${symbol} rules`, async () => {
  const rules = await json(`${sandbox}/v1/symbols/details/${symbol}`);
  if (!(Number(rules.tick_size) > 0 && Number(rules.quote_increment) > 0 && Number(rules.min_order_size) > 0)) throw Error();
  return { status: rules.status, tickSize: rules.tick_size, quoteIncrement: rules.quote_increment, minimum: rules.min_order_size };
});
await check("public sandbox ticker", async () => {
  const ticker = await json(`${sandbox}/v2/ticker/btcusd`);
  if (!(Number(ticker.close) > 0)) throw Error();
  return "BTCUSD close is a positive number";
});
if (env.MONGO_URL) await check("configured MongoDB (read-only)", async () => {
  const { MongoClient } = requireBackend("mongodb");
  const client = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect(); const db = client.db(); await db.command({ ping: 1 });
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
    const required = ["userId_1_clientOrderId_1", "exchangeClientOrderId_1", "userId_1_createdAt_-1__id_-1", "userId_1_status_1_createdAt_-1__id_-1", "status_1_lastCheckedAt_1__id_1", "status_1_createdAt_1__id_1"];
    const indexes = names.includes("orders") ? await db.collection("orders").listIndexes().toArray() : [];
    return { connected: true, missingOrderIndexes: required.filter(name => !indexes.some(index => index.name === name)),
      note: "Missing indexes must be reviewed before rollout; this check makes no changes." };
  } finally { await client.close(); }
});
else checks.push({ name: "configured MongoDB", status: "skipped", detail: "MONGO_URL missing" });

for (const [label, key, suffix] of [["landing", "LIVE_LANDING_URL", "/"], ["dashboard", "LIVE_DASHBOARD_URL", "/"], ["API readiness", "LIVE_API_URL", "/readyz"]]) {
  if (!env[key]) { checks.push({ name: label, status: "skipped", detail: `${key} is not known/configured` }); continue; }
  await check(label, async () => {
    const url = new URL(env[key]);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error();
    const target = new URL(suffix, url.origin);
    const response = await fetch(target, { signal: AbortSignal.timeout(20_000), redirect: "error" });
    if (!response.ok) throw Error();
    if (key === "LIVE_API_URL" && (await response.json()).ready !== true) throw Error();
    return { origin: url.origin, status: response.status };
  });
}
checks.push({ name: "authenticated sandbox trading", status: "skipped", detail: "Public-only validation requested; no signed exchange requests were made." });
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
if (checks.some(check => check.status === "failed")) process.exitCode = 1;
