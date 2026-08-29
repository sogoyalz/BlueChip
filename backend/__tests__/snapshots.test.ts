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
  SnapshotModel: { find: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
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

/**
 * The history route downsamples in the database via $bucketAuto, so the mock
 * stands in for the aggregation result: one row per bucket, already in
 * chronological order, carrying the last value in each bucket.
 */
const historyReturns = (buckets: object[]) =>
  mockedSnapshots.aggregate.mockResolvedValue(buckets);

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

  test("writes NO snapshot when a balance amount is not a finite number", async () => {
    // Amounts arrive as strings. A malformed one becomes NaN or Infinity and
    // poisons the whole total. Recording a wrong portfolio value is worse than
    // recording none — and an Infinity actually persists (verified against a
    // real database), permanently corrupting the history series.
    mockedGetBalances.mockResolvedValue([
      { currency: "USD", amount: "40000", available: "40000", availableForWithdrawal: "40000" },
      { currency: "BTC", amount: "not-a-number", available: "0", availableForWithdrawal: "0" },
    ]);
    await expect(snapshotNow()).resolves.toBeUndefined();
    expect(mockedSnapshots.create).not.toHaveBeenCalled();
  });

  test("writes NO snapshot when an amount overflows to Infinity", async () => {
    mockedGetBalances.mockResolvedValue([
      { currency: "USD", amount: "1e999", available: "0", availableForWithdrawal: "0" },
    ]);
    await expect(snapshotNow()).resolves.toBeUndefined();
    expect(mockedSnapshots.create).not.toHaveBeenCalled();
  });

  test("writes NO snapshot when a live price is non-finite", async () => {
    mockedGetPrice.mockReturnValue({ price: Infinity });
    mockedGetBalances.mockResolvedValue([
      { currency: "BTC", amount: "1", available: "1", availableForWithdrawal: "1" },
    ]);
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
    historyReturns(snaps);
    const res = await request(app)
      .get("/api/portfolio/history?range=1W")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(2);
    expect(res.body.points[1].value).toBe(105000);
    // The history is account-wide, not per user — nothing scopes it by userId.
    const pipeline = mockedSnapshots.aggregate.mock.calls[0][0];
    expect(JSON.stringify(pipeline)).not.toContain("userId");
  });

  test("asks the database to downsample rather than reading the collection", async () => {
    // Snapshots accumulate every 15 minutes plus one per fill: ~2,900 after a
    // month, ~35,000 after a year. Reading them all to emit 200 points grew
    // without bound. The reduction has to happen database-side, and the point
    // count must not depend on how much history exists.
    mockedUser.findById.mockResolvedValue({ _id: "u1", username: "a" });
    historyReturns([]);

    await request(app)
      .get("/api/portfolio/history?range=ALL")
      .set("Authorization", `Bearer ${token("u1")}`);

    expect(mockedSnapshots.aggregate).toHaveBeenCalled();
    expect(mockedSnapshots.find).not.toHaveBeenCalled();
    const pipeline = mockedSnapshots.aggregate.mock.calls[0][0];
    const bucket = pipeline.find((st: Record<string, unknown>) => "$bucketAuto" in st);
    expect(bucket.$bucketAuto.buckets).toBe(200);
    // $last, so the final bucket carries the newest snapshot rather than an
    // older one from inside the same span.
    expect(bucket.$bucketAuto.output.ts).toEqual({ $last: "$ts" });
  });

  test("a ranged request filters before bucketing, ALL does not", async () => {
    mockedUser.findById.mockResolvedValue({ _id: "u1", username: "a" });

    historyReturns([]);
    await request(app)
      .get("/api/portfolio/history?range=1W")
      .set("Authorization", `Bearer ${token("u1")}`);
    const ranged = mockedSnapshots.aggregate.mock.calls[0][0];
    expect(ranged[0].$match.ts.$gte).toBeInstanceOf(Date);

    mockedSnapshots.aggregate.mockClear();
    historyReturns([]);
    await request(app)
      .get("/api/portfolio/history?range=ALL")
      .set("Authorization", `Bearer ${token("u1")}`);
    const all = mockedSnapshots.aggregate.mock.calls[0][0];
    expect(all.some((st: Record<string, unknown>) => "$match" in st)).toBe(false);
  });

  test("an empty history returns no points rather than failing", async () => {
    mockedUser.findById.mockResolvedValue({ _id: "u1", username: "a" });
    historyReturns([]);
    const res = await request(app)
      .get("/api/portfolio/history?range=ALL")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([]);
  });

  test("a single snapshot survives downsampling", async () => {
    mockedUser.findById.mockResolvedValue({ _id: "u1", username: "a" });
    historyReturns([{ valueCents: 123456, ts: new Date("2026-02-01") }]);
    const res = await request(app)
      .get("/api/portfolio/history?range=ALL")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.body.points).toEqual([
      { ts: new Date("2026-02-01").getTime(), value: 1234.56 },
    ]);
  });

  test("excludes stored points that are not finite", async () => {
    // typeof Infinity === "number", so the original guard let a poisoned row
    // straight through to the chart, where it produces NaN path coordinates.
    mockedUser.findById.mockResolvedValue({ _id: "u1", username: "a" });
    historyReturns([
      { valueCents: 100000, ts: new Date("2026-01-01") },
      { valueCents: Infinity, ts: new Date("2026-01-02") },
      { valueCents: 120000, ts: new Date("2026-01-03") },
    ]);

    const res = await request(app)
      .get("/api/portfolio/history?range=ALL")
      .set("Authorization", `Bearer ${token("u1")}`);

    expect(res.status).toBe(200);
    expect(res.body.points.map((p: { value: number }) => p.value)).toEqual([1000, 1200]);
  });

  test("passes the database's buckets straight through, newest last", async () => {
    // The reduction itself is MongoDB's job now, so a mocked model cannot
    // demonstrate it — that is asserted against a real database in
    // persistence.integration.test.ts. What this covers is that the route does
    // not reorder or drop what it is handed.
    const buckets = Array.from({ length: 200 }, (_, i) => ({
      valueCents: i * 100,
      ts: new Date(1700000000000 + i * 60000),
    }));
    historyReturns(buckets);
    const res = await request(app)
      .get("/api/portfolio/history?range=ALL")
      .set("Authorization", `Bearer ${token("u1")}`);
    expect(res.body.points).toHaveLength(200);
    expect(res.body.points[res.body.points.length - 1].value).toBe(199);
    const ts = res.body.points.map((p: { ts: number }) => p.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });
});
