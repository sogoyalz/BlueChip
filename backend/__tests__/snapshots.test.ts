/**
 * Snapshot service + history endpoint tests.
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
jest.mock("../model/SnapshotModel", () => ({
  SnapshotModel: { find: jest.fn(), create: jest.fn(), insertMany: jest.fn() },
}));
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(),
  getAllPrices: jest.fn(() => ({})),
}));

import { app } from "../index";
import { snapshotAll, snapshotUser } from "../services/snapshots";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";
import { SnapshotModel } from "../model/SnapshotModel";
import { getPrice } from "../services/priceFeed";

const mockedUser = UserModel as unknown as Record<string, jest.Mock>;
const mockedHoldings = HoldingsModel as unknown as Record<string, jest.Mock>;
const mockedSnapshots = SnapshotModel as unknown as Record<string, jest.Mock>;
const mockedGetPrice = getPrice as jest.Mock;

const token = (id: string) => jwt.sign({ id }, process.env.TOKEN_KEY as string);

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetPrice.mockReturnValue({ price: 50000 });
});

describe("snapshotUser", () => {
  test("records cash + live holdings value", async () => {
    mockedUser.findById.mockResolvedValue({ _id: "u1", balance: 40000 });
    mockedHoldings.find.mockResolvedValue([
      { symbol: "BTCUSD", qty: 1, avgCost: 45000 },
    ]);
    await snapshotUser("u1");
    expect(mockedSnapshots.create).toHaveBeenCalledWith(
      expect.objectContaining({ cash: 40000, value: 90000 })
    );
  });

  test("never throws (fire-and-forget safety)", async () => {
    mockedUser.findById.mockRejectedValue(new Error("db down"));
    await expect(snapshotUser("u1")).resolves.toBeUndefined();
    expect(mockedSnapshots.create).not.toHaveBeenCalled();
  });
});

describe("snapshotAll", () => {
  test("writes one snapshot per user in a single insertMany", async () => {
    mockedUser.find.mockResolvedValue([
      { _id: "u1", balance: 100000 },
      { _id: "u2", balance: 60000 },
    ]);
    mockedHoldings.find.mockResolvedValue([
      { userId: "u2", symbol: "BTCUSD", qty: 0.5, avgCost: 40000 },
    ]);
    await snapshotAll();
    const docs = mockedSnapshots.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ value: 100000, cash: 100000 });
    expect(docs[1]).toMatchObject({ value: 85000, cash: 60000 }); // 60k + 0.5*50k
  });
});

describe("GET /api/portfolio/history", () => {
  beforeEach(() => {
    mockedUser.findById.mockResolvedValue({ _id: "u1", username: "alice" });
  });

  test("requires auth", async () => {
    const res = await request(app).get("/api/portfolio/history");
    expect(res.status).toBe(401);
  });

  test("rejects an unknown range with 400", async () => {
    const res = await request(app)
      .get("/api/portfolio/history?range=5Y")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.status).toBe(400);
  });

  test("returns ascending user-scoped points and filters by range", async () => {
    const snaps = [
      { value: 100000, ts: new Date("2026-07-01") },
      { value: 105000, ts: new Date("2026-07-05") },
    ];
    mockedSnapshots.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(snaps) });
    const res = await request(app)
      .get("/api/portfolio/history?range=1W")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(2);
    expect(res.body.points[1].value).toBe(105000);
    const [filter] = mockedSnapshots.find.mock.calls[0];
    expect(filter.userId).toBe("u1");
    expect(filter.ts.$gte).toBeInstanceOf(Date);
  });

  test("downsamples long histories to at most ~200 points, keeping the newest", async () => {
    const snaps = Array.from({ length: 1000 }, (_, i) => ({
      value: i,
      ts: new Date(1700000000000 + i * 60000),
    }));
    mockedSnapshots.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(snaps) });
    const res = await request(app)
      .get("/api/portfolio/history?range=ALL")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.body.points.length).toBeLessThanOrEqual(201);
    expect(res.body.points[res.body.points.length - 1].value).toBe(999);
  });
});
