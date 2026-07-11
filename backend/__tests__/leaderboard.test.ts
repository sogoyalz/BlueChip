/**
 * Leaderboard tests: ranking math, memoization, auth guard.
 */
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.TOKEN_KEY = "test-secret";

jest.mock("../model/UserModel", () => ({
  UserModel: { find: jest.fn(), findById: jest.fn() },
}));
jest.mock("../model/HoldingsModel", () => ({
  HoldingsModel: { find: jest.fn() },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn() },
}));
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(),
  getAllPrices: jest.fn(() => ({})),
}));

import { app } from "../index";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";
import { getPrice } from "../services/priceFeed";
import { clearLeaderboardMemo } from "../routes/PortfolioRoute";

const mockedUser = UserModel as unknown as Record<string, jest.Mock>;
const mockedHoldings = HoldingsModel as unknown as Record<string, jest.Mock>;
const mockedGetPrice = getPrice as jest.Mock;

const token = (id: string) => jwt.sign({ id }, process.env.TOKEN_KEY as string);

beforeEach(() => {
  jest.clearAllMocks();
  clearLeaderboardMemo();
  mockedGetPrice.mockImplementation((symbol: string) =>
    symbol === "BTCUSD" ? { price: 50000 } : { price: 3000 }
  );
  mockedUser.find.mockResolvedValue([
    { _id: "u1", username: "alice", balance: 50000 },
    { _id: "u2", username: "bob", balance: 100000 },
    { _id: "u3", username: "carol", balance: 90000 },
  ]);
  mockedHoldings.find.mockResolvedValue([
    // alice: 50k cash + 2 BTC @ 50k = 150k total
    { userId: "u1", symbol: "BTCUSD", qty: 2, avgCost: 40000 },
    // carol: 90k cash + 1 ETH @ 3k = 93k total
    { userId: "u3", symbol: "ETHUSD", qty: 1, avgCost: 2500 },
  ]);
});

describe("GET /api/leaderboard", () => {
  test("requires auth", async () => {
    const res = await request(app).get("/api/leaderboard");
    expect(res.status).toBe(401);
  });

  test("ranks users by cash + live holdings value and marks me", async () => {
    mockedUser.findById.mockResolvedValue({ _id: "u3", username: "carol" });
    const res = await request(app)
      .get("/api/leaderboard")
      .set("Authorization", `Bearer ${token("u3")}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: { username: string }) => r.username)).toEqual([
      "alice", // 150k
      "bob", // 100k
      "carol", // 93k
    ]);
    expect(res.body.rows[0].value).toBe(150000);
    expect(res.body.rows[0].returnPct).toBe(50);
    expect(res.body.me).toEqual({
      rank: 3,
      username: "carol",
      value: 93000,
      returnPct: -7,
    });
    expect(res.body.totalUsers).toBe(3);
  });

  test("memoizes: a second request within the TTL doesn't re-query", async () => {
    mockedUser.findById.mockResolvedValue({ _id: "u1", username: "alice" });
    await request(app)
      .get("/api/leaderboard")
      .set("Authorization", `Bearer ${token("u1")}`);
    await request(app)
      .get("/api/leaderboard")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(mockedUser.find).toHaveBeenCalledTimes(1);
    expect(mockedHoldings.find).toHaveBeenCalledTimes(1);
  });
});
