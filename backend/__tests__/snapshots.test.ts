/**
 * Snapshot service + history endpoint tests (shared portfolio, not per-user).
 */
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.TOKEN_KEY = "test-secret";

jest.mock("../model/UserModel", () => ({
  UserModel: { findById: jest.fn() },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn() },
}));
jest.mock("../model/SnapshotModel", () => ({
  SnapshotModel: { find: jest.fn(), create: jest.fn() },
}));
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(),
  getAllPrices: jest.fn(() => ({})),
}));
jest.mock("../services/geminiPrivate", () => ({
  getGeminiBalances: jest.fn(),
}));

import { app } from "../index";
import { snapshotNow } from "../services/snapshots";
import { UserModel } from "../model/UserModel";
import { SnapshotModel } from "../model/SnapshotModel";
import { getPrice } from "../services/priceFeed";
import { getGeminiBalances } from "../services/geminiPrivate";

const mockedUser = UserModel as unknown as Record<string, jest.Mock>;
const mockedSnapshots = SnapshotModel as unknown as Record<string, jest.Mock>;
const mockedGetPrice = getPrice as jest.Mock;
const mockedGetBalances = getGeminiBalances as jest.Mock;

const token = (id: string) => jwt.sign({ id }, process.env.TOKEN_KEY as string);

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetPrice.mockReturnValue({ price: 50000 });
});

describe("snapshotNow", () => {
  test("records cash + live-priced non-USD balances", async () => {
    mockedGetBalances.mockResolvedValue([
      { currency: "USD", amount: "40000", available: "40000", availableForWithdrawal: "40000" },
      { currency: "BTC", amount: "1", available: "1", availableForWithdrawal: "1" },
    ]);
    await snapshotNow();
    // Money is stored as integer cents: $40,000 cash + 1 BTC @ $50,000.
    expect(mockedSnapshots.create).toHaveBeenCalledWith(
      expect.objectContaining({ cashCents: 4000000, valueCents: 9000000 })
    );
  });

  test("never throws (fire-and-forget safety)", async () => {
    mockedGetBalances.mockRejectedValue(new Error("gemini down"));
    await expect(snapshotNow()).resolves.toBeUndefined();
    expect(mockedSnapshots.create).not.toHaveBeenCalled();
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

  test("returns ascending shared points and filters by range", async () => {
    // Stored as integer cents; the API converts back to dollars at the edge.
    const snaps = [
      { valueCents: 10000000, ts: new Date("2026-07-01") },
      { valueCents: 10500000, ts: new Date("2026-07-05") },
    ];
    mockedSnapshots.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(snaps) });
    const res = await request(app)
      .get("/api/portfolio/history?range=1W")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(2);
    expect(res.body.points[1].value).toBe(105000);
    const [filter] = mockedSnapshots.find.mock.calls[0];
    expect(filter.userId).toBeUndefined();
    expect(filter.ts.$gte).toBeInstanceOf(Date);
  });

  test("downsamples long histories to at most ~200 points, keeping the newest", async () => {
    // valueCents = i*100 → dollars = i, so the newest point is $999.
    const snaps = Array.from({ length: 1000 }, (_, i) => ({
      valueCents: i * 100,
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
