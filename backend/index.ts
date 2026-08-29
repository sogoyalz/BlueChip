import "dotenv/config";

import express from "express";
import mongoose from "mongoose";

import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";

import cookieParser from "cookie-parser";

import authRoute from "./routes/AuthRoute";
import marketRoute from "./routes/MarketRoute";
import orderRoute from "./routes/OrderRoute";
import portfolioRoute from "./routes/PortfolioRoute";
import { startPolling } from "./services/priceFeed";
import { startGeminiWs } from "./services/geminiWs";
import { startOrderSync } from "./services/orderSync";
import { startSnapshots } from "./services/snapshots";
import { startSseBroadcast } from "./services/sse";
import { authLimiter, generalLimiter } from "./middlewares/rateLimit";
import accountRoute from "./routes/AccountRoute";
import { migrate } from "./migrations";
import { installShutdownHandlers } from "./lifecycle";
import { requireCsrfHeader } from "./middlewares/csrf";
import { isWsConnected } from "./services/geminiWs";
import { SYMBOLS } from "./config/symbols";
import { isFresh } from "./services/priceFeed";
import { fetchSymbols } from "./services/gemini";
import { log } from "./util/logger";
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

// Trimmed: "a.com, b.com" is the natural way to write this in a dashboard env
// var, and an untrimmed " b.com" matches no origin — a silent 401-everywhere
// login failure in production rather than a visible misconfiguration.
const corsOrigins = (
  process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    // X-Requested-With is our CSRF header — must be allowed through preflight.
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    // Cross-origin JS can only read the handful of "simple" response headers
    // unless they are named here. Without this the dashboard sees the header
    // as undefined and silently falls back to counting the page it received.
    exposedHeaders: ["X-Total-Count"],
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
app.use("/", accountRoute); // mounts /api/holdings, /api/account (auth)

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
    // Not fatal — the app runs correctly without it — but the orphaned-fill
    // alert is the one signal that cannot be reconstructed after the fact, and
    // on a host where nobody tails stdout it currently reaches no one. Say so
    // once at boot rather than letting the silence pass for health.
    if (process.env.NODE_ENV === "production" && !process.env.MONITORING_WEBHOOK_URL) {
      log.warn("boot.no_alert_destination", {
        detail:
          "MONITORING_WEBHOOK_URL is unset — alerts stay on stdout only, so an " +
          "orphaned fill will not reach anyone.",
      });
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
    const server = app.listen(PORT, () => {
      console.log(`app started on port ${PORT}`);
    });
    installShutdownHandlers(server);
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
export { migrate } from "./migrations";
