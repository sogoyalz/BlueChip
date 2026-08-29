/**
 * Integration tests against a REAL MongoDB.
 *
 * Every other suite mocks the models, which makes them structurally blind to
 * anything that is a property of the driver or the server rather than of our
 * own logic. Three separate bugs in this codebase reached a passing test suite
 * that way:
 *
 *   1. The (userId, clientOrderId) index was declared `sparse`, which does NOT
 *      mean "skip documents without the field" on a COMPOUND index. Every order
 *      placed without an idempotency key was indexed under clientOrderId: null,
 *      so a user's second keyless order was rejected — after it was already live
 *      on the exchange.
 *
 *   2. The migration's $unset ran through a mongoose Model, and `strict` mode
 *      silently strips paths that are not in the schema. The fields being
 *      removed were exactly such paths, so the update was empty and the
 *      migration did nothing while reporting success.
 *
 *   3. The conditional write that fixes the cancel/orderSync race wrapped
 *      trusted() around the whole filter instead of each nested operator.
 *      Mongoose casts that as a literal value: the query threw a CastError and
 *      never executed. All 175 mocked tests passed.
 *
 * These tests exercise the real thing. They are slower than the rest of the
 * suite by design.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

jest.setTimeout(60_000);

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // Mirror the application's own global setting — it changes query semantics.
  mongoose.set("sanitizeFilter", true);
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// Imported after connect so model registration behaves as it does at boot.
import { OrdersModel } from "../model/OrdersModel";
import { SnapshotModel } from "../model/SnapshotModel";
import { applyObservation, shouldApplyObservation } from "../services/orderState";
import { IOrder } from "../schemas/OrdersSchema";

const userId = () => new mongoose.Types.ObjectId();
const baseOrder = (over: Partial<IOrder> = {}): IOrder => ({
  userId: userId(),
  symbol: "BTCUSD",
  side: "BUY",
  type: "LIMIT",
  status: "OPEN",
  qty: 1,
  createdAt: new Date(),
  ...over,
});

beforeEach(async () => {
  await OrdersModel.deleteMany({});
  await SnapshotModel.deleteMany({});
});

describe("idempotency index (bug 1: sparse on a compound index)", () => {
  beforeAll(async () => {
    await OrdersModel.createIndexes();
  });

  test("the index is partial, not sparse", async () => {
    const idx = (await OrdersModel.collection.indexes()).find(
      (i) => i.name === "userId_1_clientOrderId_1"
    );
    expect(idx).toBeDefined();
    expect(idx!.unique).toBe(true);
    expect(idx!.partialFilterExpression).toEqual({ clientOrderId: { $type: "string" } });
    expect(idx!.sparse).toBeUndefined();
  });

  test("a user can place many orders with no idempotency key", async () => {
    const uid = userId();
    await OrdersModel.create(baseOrder({ userId: uid }));
    await OrdersModel.create(baseOrder({ userId: uid }));
    await OrdersModel.create(baseOrder({ userId: uid }));
    expect(await OrdersModel.countDocuments({ userId: uid })).toBe(3);
  });

  test("the same key twice for one user is still rejected", async () => {
    const uid = userId();
    await OrdersModel.create(baseOrder({ userId: uid, clientOrderId: "k1" }));
    await expect(
      OrdersModel.create(baseOrder({ userId: uid, clientOrderId: "k1" }))
    ).rejects.toMatchObject({ code: 11000 });
  });

  test("the same key for two different users is allowed", async () => {
    await OrdersModel.create(baseOrder({ userId: userId(), clientOrderId: "shared" }));
    await expect(
      OrdersModel.create(baseOrder({ userId: userId(), clientOrderId: "shared" }))
    ).resolves.toBeDefined();
  });
});

describe("conditional order writes (bug 3: the query must actually execute)", () => {
  test("the filter is accepted by the driver and does not throw", async () => {
    // The CastError version of this passed every mocked test.
    const o = await OrdersModel.create(baseOrder());
    await expect(
      applyObservation(o._id, { status: "FILLED", filledQty: 1, fillPrice: 50000 })
    ).resolves.not.toBeNull();
  });

  test("a stale observation cannot overwrite a newer one, in either order", async () => {
    const FILL = { status: "FILLED" as const, filledQty: 1, fillPrice: 50000 };
    const CANCEL = { status: "CANCELLED" as const, filledQty: 0.4, fillPrice: 49000 };

    const a = await OrdersModel.create(baseOrder());
    await applyObservation(a._id, FILL);
    await applyObservation(a._id, CANCEL);
    expect(await OrdersModel.findById(a._id)).toMatchObject({ status: "FILLED", filledQty: 1 });

    const b = await OrdersModel.create(baseOrder());
    await applyObservation(b._id, CANCEL);
    await applyObservation(b._id, FILL);
    expect(await OrdersModel.findById(b._id)).toMatchObject({ status: "FILLED", filledQty: 1 });
  });

  test("concurrent writers converge on the exchange's real state", async () => {
    const FILL = { status: "FILLED" as const, filledQty: 1, fillPrice: 50000 };
    const CANCEL = { status: "CANCELLED" as const, filledQty: 0.4, fillPrice: 49000 };
    for (let i = 0; i < 25; i++) {
      const o = await OrdersModel.create(baseOrder());
      await Promise.all([applyObservation(o._id, FILL), applyObservation(o._id, CANCEL)]);
      expect(await OrdersModel.findById(o._id)).toMatchObject({ status: "FILLED", filledQty: 1 });
    }
  });

  test("a cancel with nothing executed still applies to a resting order", async () => {
    const o = await OrdersModel.create(baseOrder());
    await applyObservation(o._id, { status: "CANCELLED", filledQty: 0 });
    expect(await OrdersModel.findById(o._id)).toMatchObject({ status: "CANCELLED" });
  });

  test("orders predating filledQty are treated as zero, not skipped", async () => {
    const o = await OrdersModel.create(baseOrder());
    await OrdersModel.collection.updateOne({ _id: o._id }, { $unset: { filledQty: "" } });
    await applyObservation(o._id, {
      status: "PARTIALLY_FILLED",
      filledQty: 0.1,
      fillPrice: 45000,
    });
    expect(await OrdersModel.findById(o._id)).toMatchObject({
      status: "PARTIALLY_FILLED",
      filledQty: 0.1,
    });
  });

  test("a fill reaches a TERMINAL order that predates filledQty", async () => {
    // The in-memory rule says apply (0 stored < 0.5 observed is strictly newer
    // knowledge, and that branch ignores terminal status). The database filter
    // used to disagree: its missing-field branch also demanded a non-terminal
    // status, so this write was silently dropped and the two halves of the
    // "same rule, expressed twice" contract diverged.
    //
    // Reachable for real: an order marked REJECTED before filledQty existed,
    // which orderSync later observes as having executed.
    const o = await OrdersModel.create(baseOrder({ status: "REJECTED" }));
    await OrdersModel.collection.updateOne({ _id: o._id }, { $unset: { filledQty: "" } });

    const stored = await OrdersModel.findById(o._id);
    expect(
      shouldApplyObservation(
        { status: stored!.status, filledQty: stored!.filledQty },
        { status: "FILLED", filledQty: 0.5 }
      )
    ).toBe(true);

    await applyObservation(o._id, { status: "FILLED", filledQty: 0.5, fillPrice: 40000 });
    expect(await OrdersModel.findById(o._id)).toMatchObject({
      status: "FILLED",
      filledQty: 0.5,
    });
  });

  test("the rule and the database filter agree across the whole matrix", async () => {
    // The filter is the database-side twin of shouldApplyObservation. Anywhere
    // they disagree is a write that silently vanishes (or one that should have
    // been rejected and was not), so assert them against each other directly.
    const statuses = ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"] as const;
    for (const status of statuses) {
      for (const storedQty of [undefined, 0, 0.4]) {
        for (const observedQty of [0, 0.4, 1]) {
          const o = await OrdersModel.create(baseOrder({ status, filledQty: storedQty }));
          if (storedQty === undefined) {
            await OrdersModel.collection.updateOne(
              { _id: o._id },
              { $unset: { filledQty: "" } }
            );
          }
          const expected = shouldApplyObservation(
            { status, filledQty: storedQty },
            { status: "FILLED", filledQty: observedQty }
          );
          const result = await applyObservation(o._id, {
            status: "FILLED",
            filledQty: observedQty,
          });
          expect({ status, storedQty, observedQty, applied: result !== null }).toEqual({
            status,
            storedQty,
            observedQty,
            applied: expected,
          });
        }
      }
    }
  });
});

describe("a malformed fill price does not strand the order", () => {
  test("the status is still recorded when avg_execution_price is unusable", async () => {
    // Gemini sends amounts as strings, so a malformed avg_execution_price
    // becomes NaN. Mongoose refuses NaN for a Number path with a CastError,
    // which used to fail the ENTIRE update — leaving the order in a resting
    // status forever. orderSync would then refetch it and fail again every
    // five seconds while the user saw a filled order still listed as open.
    const o = await OrdersModel.create(baseOrder());
    await expect(
      applyObservation(o._id, { status: "FILLED", filledQty: 1, fillPrice: NaN })
    ).resolves.not.toBeNull();

    const stored = await OrdersModel.findById(o._id);
    expect(stored).toMatchObject({ status: "FILLED", filledQty: 1 });
    // The price we could not read is absent, not stored as something wrong.
    expect(stored!.fillPrice).toBeUndefined();
  });

  test("a good fill price is still recorded", async () => {
    const o = await OrdersModel.create(baseOrder());
    await applyObservation(o._id, { status: "FILLED", filledQty: 1, fillPrice: 50000 });
    expect(await OrdersModel.findById(o._id)).toMatchObject({ fillPrice: 50000 });
  });

  test("Infinity is refused the same way", async () => {
    const o = await OrdersModel.create(baseOrder());
    await expect(
      applyObservation(o._id, { status: "FILLED", filledQty: 1, fillPrice: Infinity })
    ).resolves.not.toBeNull();
    expect((await OrdersModel.findById(o._id))!.fillPrice).toBeUndefined();
  });
});

describe("non-finite money never reaches storage", () => {
  test("mongoose rejects a NaN total outright", async () => {
    await expect(
      SnapshotModel.create({ valueCents: NaN, cashCents: 0, ts: new Date() })
    ).rejects.toThrow();
  });

  test("Infinity IS storable — which is why toCents refuses it upstream", async () => {
    // Left as an executable record of why the guard exists: the database will
    // happily keep this, and `typeof Infinity === "number"` passes any naive
    // filter written to skip bad points.
    const doc = await SnapshotModel.create({
      valueCents: Infinity,
      cashCents: 0,
      ts: new Date(),
    });
    const stored = await SnapshotModel.findById(doc._id).lean();
    expect(Number.isFinite(stored!.valueCents)).toBe(false);
    expect(typeof stored!.valueCents).toBe("number");
  });
});

describe("portfolio history downsamples in the database", () => {
  // The route hands MongoDB a $bucketAuto pipeline. Mocked tests can assert the
  // pipeline's shape but not what the server does with it, so the reduction
  // itself is verified here. Measured against a real database: at 35,000
  // snapshots this returns 200 rows in ~61ms where reading everything and
  // downsampling in JavaScript took ~173ms — and, more importantly, the rows
  // crossing the wire stay constant as history grows.
  const MAX_POINTS = 200;

  const seed = async (n: number) => {
    await SnapshotModel.deleteMany({});
    if (n === 0) return;
    const now = Date.now();
    const docs = Array.from({ length: n }, (_, i) => ({
      valueCents: 1_000_000 + i,
      cashCents: 500_000,
      ts: new Date(now - (n - 1 - i) * 15 * 60_000),
    }));
    await SnapshotModel.insertMany(docs);
  };

  const bucket = () =>
    SnapshotModel.aggregate<{ ts: Date; valueCents: number }>([
      { $sort: { ts: 1 } },
      {
        $bucketAuto: {
          groupBy: "$ts",
          buckets: MAX_POINTS,
          output: { ts: { $last: "$ts" }, valueCents: { $last: "$valueCents" } },
        },
      },
    ]);

  test.each([
    [0, 0],
    [1, 1],
    [50, 50],
    [199, 199],
    [200, 200],
  ])("%i snapshots produce %i points", async (n, expected) => {
    await seed(n);
    expect(await bucket()).toHaveLength(expected);
  });

  test("thousands of snapshots still produce at most 200 points", async () => {
    await seed(5_000);
    const points = await bucket();
    expect(points.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(points.length).toBeGreaterThan(0);
  });

  test("the newest snapshot is never lost to downsampling", async () => {
    await seed(5_000);
    const newest = await SnapshotModel.findOne().sort({ ts: -1 });
    const points = await bucket();
    expect(points[points.length - 1].ts.getTime()).toBe(newest!.ts.getTime());
    expect(points[points.length - 1].valueCents).toBe(newest!.valueCents);
  });

  test("buckets come back in chronological order", async () => {
    await seed(1_000);
    const ts = (await bucket()).map((b) => b.ts.getTime());
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });
});

