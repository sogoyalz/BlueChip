import "dotenv/config";

import express from "express";
import mongoose from "mongoose";

import bodyParser from "body-parser";
import cors from "cors";

import cookieParser from "cookie-parser";

import { HoldingsModel } from "./model/HoldingsModel";
import { OrdersModel } from "./model/OrdersModel";
import { UserModel } from "./model/UserModel";
import authRoute from "./routes/AuthRoute";
import marketRoute from "./routes/MarketRoute";
import orderRoute from "./routes/OrderRoute";
import portfolioRoute from "./routes/PortfolioRoute";
import { verifyToken } from "./middlewares/AuthMiddleware";
import { STARTING_CASH, roundUsd } from "./util/money";
import { getPrice, startPolling } from "./services/priceFeed";
import { startGeminiWs } from "./services/geminiWs";
import { startMatcher } from "./services/matcher";
import { snapshotUser, startSnapshots } from "./services/snapshots";
import { authLimiter, generalLimiter } from "./middlewares/rateLimit";
import { isWsConnected } from "./services/geminiWs";
import { SYMBOLS } from "./config/symbols";
import { isFresh } from "./services/priceFeed";
import { fetchSymbols } from "./services/gemini";
import { validateSymbolsAgainstGemini } from "./config/symbols";

const PORT = process.env.PORT || 3002;
const uri = process.env.MONGO_URL;

const app = express();

// Render (and most hosts) sit behind a reverse proxy; without this the
// rate limiter would bucket every visitor under the proxy's IP.
app.set("trust proxy", 1);

const corsOrigins = (
  process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001"
).split(",");

app.use(
  cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // <-- REQUIRED so cookies are allowed
  })
);
app.use(bodyParser.json({ limit: "10kb" })); // no endpoint needs big bodies
app.use(cookieParser());
app.use(generalLimiter);

app.use(["/signup", "/login"], authLimiter); // brute-force protection
app.use("/", authRoute); // mounts /signup, /login, /
app.use("/", marketRoute); // mounts /api/symbols, /api/prices (public)
app.use("/", orderRoute); // mounts /api/orders* (auth)
app.use("/", portfolioRoute); // mounts /api/leaderboard (auth)

app.get("/allHoldings", verifyToken, async (req, res) => {
  try {
    const holdings = await HoldingsModel.find({ userId: req.user!._id });
    // Enrich with live prices from the shared Gemini cache.
    const enriched = holdings.map((h) => {
      const live = getPrice(h.symbol);
      return {
        _id: h._id,
        symbol: h.symbol,
        qty: h.qty,
        avgCost: h.avgCost,
        price: live?.price,
        dayChangePct: live?.changePct24h,
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch holdings" });
  }
});

app.get("/api/account", verifyToken, async (req, res) => {
  try {
    const user = req.user!;
    const balance = roundUsd(user.balance ?? STARTING_CASH);
    const holdings = await HoldingsModel.find({ userId: user._id });
    const holdingsValue = holdings.reduce((sum, h) => {
      const live = getPrice(h.symbol);
      return sum + h.qty * (live?.price ?? h.avgCost);
    }, 0);
    res.json({
      username: user.username,
      email: user.email,
      balance,
      portfolioValue: roundUsd(balance + holdingsValue),
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch account" });
  }
});

// Health check — also the keep-alive ping target so the free-tier host
// doesn't sleep (which would pause the matcher and snapshots).
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    wsConnected: isWsConnected(),
    pricesFresh: SYMBOLS.some((s) => isFresh(s.symbol)),
  });
});

// Start over: wipe holdings and open orders, restore the starting balance.
app.post("/api/account/reset", verifyToken, async (req, res) => {
  try {
    const userId = req.user!._id;
    await OrdersModel.updateMany(
      { userId, status: "OPEN" },
      { $set: { status: "CANCELLED", reason: "Account reset" } }
    );
    await HoldingsModel.deleteMany({ userId });
    await UserModel.updateOne(
      { _id: userId },
      { $set: { balance: STARTING_CASH } }
    );
    void snapshotUser(userId);
    res.json({ message: "Account reset", balance: STARTING_CASH });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to reset account" });
  }
});

// Idempotent, runs on every boot: brings pre-rework documents up to the
// current data model (users without a balance, holdings/orders from the
// old global collections, the retired positions collection).
const migrate = async (): Promise<void> => {
  const backfilled = await UserModel.updateMany(
    { balance: { $exists: false } },
    { $set: { balance: STARTING_CASH } }
  );
  if (backfilled.modifiedCount > 0) {
    console.log(`migrate: seeded balance for ${backfilled.modifiedCount} user(s)`);
  }
  const oldHoldings = await HoldingsModel.deleteMany({ userId: { $exists: false } });
  const oldOrders = await OrdersModel.deleteMany({ userId: { $exists: false } });
  if (oldHoldings.deletedCount || oldOrders.deletedCount) {
    console.log(
      `migrate: purged ${oldHoldings.deletedCount} legacy holding(s), ${oldOrders.deletedCount} legacy order(s)`
    );
  }
  try {
    await mongoose.connection.dropCollection("positions");
    console.log("migrate: dropped legacy positions collection");
  } catch {
    // collection already gone — nothing to do
  }
};

const start = async (): Promise<void> => {
  try {
    if (!uri) {
      throw new Error("MONGO_URL is not set");
    }
    await mongoose.connect(uri);
    console.log("db connected");
    await migrate();
    // Drop curated symbols Gemini no longer trades, then start the shared
    // price poller. Only when run directly — tests import app without timers.
    await validateSymbolsAgainstGemini(fetchSymbols);
    // WebSocket streams live trades into the cache; the REST poller runs
    // underneath at a relaxed cadence as fallback + 24h-change source.
    startGeminiWs();
    startPolling(30_000);
    startMatcher();
    startSnapshots();
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
