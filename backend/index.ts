import "dotenv/config";

import express from "express";
import mongoose from "mongoose";

import bodyParser from "body-parser";
import cors from "cors";

import cookieParser from "cookie-parser";

import { HoldingsModel } from "./model/HoldingsModel";
import { PositionsModel } from "./model/PositionsModel";
import { OrdersModel } from "./model/OrdersModel";
import authRoute from "./routes/AuthRoute";
import { verifyToken } from "./middlewares/AuthMiddleware";

const PORT = process.env.PORT || 3002;
const uri = process.env.MONGO_URL;

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"], // your two React apps
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // <-- REQUIRED so cookies are allowed
  })
);
app.use(bodyParser.json());
app.use(cookieParser());

app.use("/", authRoute); // mounts /signup, /login, /

app.get("/allHoldings", verifyToken, async (req, res) => {
  try {
    const allHoldings = await HoldingsModel.find({});
    res.json(allHoldings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch holdings" });
  }
});

app.get("/allPositions", verifyToken, async (req, res) => {
  try {
    const allPositions = await PositionsModel.find({});
    res.json(allPositions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch positions" });
  }
});

app.get("/allOrders", verifyToken, async (req, res) => {
  try {
    const allOrders = await OrdersModel.find({});
    res.json(allOrders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

app.post("/neworder", verifyToken, async (req, res) => {
  try {
    const { name, qty, price, mode } = req.body;

    // basic validation
    if (!name || qty == null || price == null || !mode) {
      res.status(400).json({ message: "name, qty, price and mode are required" });
      return;
    }
    if (mode !== "BUY" && mode !== "SELL") {
      res.status(400).json({ message: "mode must be BUY or SELL" });
      return;
    }
    // Number.isFinite also rejects NaN, so non-numeric input can't slip
    // past the comparisons below (NaN <= 0 is false).
    const numQty = Number(qty);
    const numPrice = Number(price);
    if (!Number.isFinite(numQty) || numQty <= 0) {
      res.status(400).json({ message: "qty must be a number > 0" });
      return;
    }
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      res.status(400).json({ message: "price must be a number >= 0" });
      return;
    }

    const newOrder = new OrdersModel({
      name,
      qty: numQty,
      price: numPrice,
      mode,
    });

    await newOrder.save();
    res.status(201).json({ message: "order saved", order: newOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save order" });
  }
});

const start = async (): Promise<void> => {
  try {
    if (!uri) {
      throw new Error("MONGO_URL is not set");
    }
    await mongoose.connect(uri);
    console.log("db connected");
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
