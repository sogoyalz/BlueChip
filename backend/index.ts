import "dotenv/config";

import express from "express";
import mongoose from "mongoose";

import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";

import cookieParser from "cookie-parser";

import { OrdersModel } from "./model/OrdersModel";
import { UserModel } from "./model/UserModel";
import authRoute from "./routes/AuthRoute";
import marketRoute from "./routes/MarketRoute";
import orderRoute from "./routes/OrderRoute";
import portfolioRoute from "./routes/PortfolioRoute";
import { verifyToken } from "./middlewares/AuthMiddleware";
import { toCents, fromCents } from "./util/money";
import { getPrice, startPolling } from "./services/priceFeed";
import { startGeminiWs } from "./services/geminiWs";
import { startOrderSync } from "./services/orderSync";
import { getGeminiBalances } from "./services/geminiPrivate";
import { startSnapshots } from "./services/snapshots";
import { startSseBroadcast } from "./services/sse";
import { authLimiter, generalLimiter } from "./middlewares/rateLimit";
import { requireCsrfHeader } from "./middlewares/csrf";
import { isWsConnected } from "./services/geminiWs";
import { SYMBOLS } from "./config/symbols";
import { isFresh } from "./services/priceFeed";
import { fetchSymbols } from "./services/gemini";
import { validateSymbolsAgainstGemini } from "./config/symbols";

// Last-resort safety nets. Several paths are fire-and-forget (void
// snapshotNow(), timers); without these, a stray rejection would crash the
// process under Node's default. Log and keep serving on an unhandled
// rejection; on a truly uncaught exception the process is in an unknown
// state, so log and exit so the host can restart cleanly.
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
  process.exit(1);
});

// Defense-in-depth against NoSQL injection: strip $-operators from query
// filters unless a call site explicitly wraps them in mongoose.trusted()
// (orderSync's $in scan and the portfolio history $gte range do).
mongoose.set("sanitizeFilter", true);

const PORT = process.env.PORT || 3002;
const uri = process.env.MONGO_URL;

const app = express();

// Render (and most hosts) sit behind a reverse proxy; without this the
// rate limiter would bucket every visitor under the proxy's IP.
app.set("trust proxy", 1);

// Security headers. This is a JSON + SSE API (it never serves HTML), so a
// content-security-policy would only risk breaking the event stream for no
// gain; the rest of helmet's defaults (HSTS, no-sniff, frameguard, referrer
// policy, etc.) all apply. crossOriginResourcePolicy is relaxed so the
// separate-origin dashboard can consume responses.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const corsOrigins = (
  process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001"
).split(",");

app.use(
  cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    // X-Requested-With is our CSRF header — must be allowed through preflight.
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true, // <-- REQUIRED so cookies are allowed
  })
);
app.use(bodyParser.json({ limit: "10kb" })); // no endpoint needs big bodies
app.use(cookieParser());
app.use(generalLimiter);

// CSRF: every state-changing request (POST/PUT/DELETE) must carry the custom
// header a browser only lets same-origin/CORS-permitted JS set. Safe methods
// (GET/HEAD/OPTIONS) — public market data and the SSE stream — are unaffected.
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  return requireCsrfHeader(req, res, next);
});

app.use(["/signup", "/login"], authLimiter); // brute-force protection
app.use("/", authRoute); // mounts /signup, /login, /
app.use("/", marketRoute); // mounts /api/symbols, /api/prices (public)
app.use("/", orderRoute); // mounts /api/orders* (auth)
app.use("/", portfolioRoute); // mounts /api/portfolio/history (auth)

// The shared Gemini sandbox account's holdings — every logged-in user sees
// the same balances, enriched with live prices from the shared cache.
app.get("/api/holdings", verifyToken, async (_req, res) => {
  try {
    const balances = await getGeminiBalances();
    const holdings = balances
      .filter((b) => b.currency !== "USD" && Number(b.amount) > 0)
      .map((b) => {
        const symbol = `${b.currency}USD`;
        const live = getPrice(symbol);
        return {
          symbol,
          qty: Number(b.amount),
          price: live?.price,
          dayChangePct: live?.changePct24h,
        };
      });
    res.json(holdings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch holdings" });
  }
});

app.get("/api/account", verifyToken, async (req, res) => {
  try {
    const user = req.user!;
    const balances = await getGeminiBalances();
    const usd = balances.find((b) => b.currency === "USD");
    // Accumulate in integer cents so the portfolio total never drifts sub-cent
    // across many holdings; convert back to dollars only for the response.
    const balanceCents = toCents(Number(usd?.amount ?? 0));
    let holdingsCents = 0;
    for (const b of balances) {
      if (b.currency === "USD") continue;
      const live = getPrice(`${b.currency}USD`);
      holdingsCents += toCents(Number(b.amount) * (live?.price ?? 0));
    }
    res.json({
      username: user.username,
      email: user.email,
      balance: fromCents(balanceCents),
      portfolioValue: fromCents(balanceCents + holdingsCents),
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch account" });
  }
});

// Health check — also the keep-alive ping target so the free-tier host
// doesn't sleep (which would pause order syncing and snapshots).
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    wsConnected: isWsConnected(),
    pricesFresh: SYMBOLS.some((s) => isFresh(s.symbol)),
  });
});

// One-shot data-model migration for pre-rework documents. Orders/balances/
// holdings now live on the real Gemini sandbox account, not in Mongo, so the
// old per-user ledger collections and fields are dropped rather than migrated.
//
// DESTRUCTIVE: this drops collections. It must NOT run on every boot (the
// free-tier host restarts constantly). It only runs when RUN_MIGRATIONS=true
// is explicitly set for a deploy, then should be unset again.
const migrate = async (): Promise<void> => {
  await UserModel.updateMany(
    {},
    { $unset: { balance: "", realizedPnl: "" } }
  );
  await OrdersModel.updateMany({}, { $unset: { realizedPnl: "" } });
  for (const collection of ["positions", "holdings", "holding"]) {
    try {
      await mongoose.connection.dropCollection(collection);
      console.log(`migrate: dropped legacy ${collection} collection`);
    } catch {
      // collection already gone — nothing to do
    }
  }
};

const start = async (): Promise<void> => {
  try {
    if (!uri) {
      throw new Error("MONGO_URL is not set");
    }
    // A weak/short JWT secret is brute-forceable offline. Refuse to boot
    // without a sufficiently long one rather than silently signing with it.
    if (!process.env.TOKEN_KEY || process.env.TOKEN_KEY.length < 32) {
      throw new Error("TOKEN_KEY is not set or is too short (need >= 32 chars)");
    }
    await mongoose.connect(uri);
    console.log("db connected");
    if (process.env.RUN_MIGRATIONS === "true") {
      console.log("RUN_MIGRATIONS=true — running one-shot data-model migration");
      await migrate();
    }
    // Drop curated symbols Gemini no longer trades, then start the shared
    // price poller. Only when run directly — tests import app without timers.
    await validateSymbolsAgainstGemini(fetchSymbols);
    // WebSocket streams live trades into the cache; the REST poller runs
    // underneath at a relaxed cadence as fallback + 24h-change source.
    startGeminiWs();
    startPolling(30_000);
    startOrderSync();
    startSnapshots();
    startSseBroadcast();
    app.listen(PORT, () => {
      console.log(`app started on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
  }
};

// Only boot the server when run directly; tests import the app instead.
if (require.main === module) {
  start();
}

export { app };
