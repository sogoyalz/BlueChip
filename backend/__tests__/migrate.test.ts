/**
 * Migration safety.
 *
 * The legacy-field cleanup is the part that failed silently in production
 * shape: `balance` and `realizedPnl` were removed from the schemas in the
 * pivot, and mongoose's `strict` mode strips paths it doesn't know about from
 * update operators — so routing the $unset through a Model turned it into an
 * empty update that reported no error and changed nothing. Verified against a
 * real database: the fields survived two full migration runs.
 *
 * These tests pin the properties that made it wrong, so the shape can't regress.
 */
const dropIndex = jest.fn();
const indexes = jest.fn();
const usersUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const ordersUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const dropCollection = jest.fn();
const listCollections = jest.fn(() => ({ toArray: async () => [] }));

const collection = jest.fn((name: string) =>
  name === "users"
    ? { updateMany: usersUpdateMany }
    : { updateMany: ordersUpdateMany, dropIndex, indexes }
);

jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return {
    ...actual,
    __esModule: true,
    default: {
      ...actual,
      set: jest.fn(),
      connect: jest.fn(),
      connection: {
        collection,
        dropCollection,
        get db() {
          return { listCollections };
        },
      },
    },
    connection: { collection, dropCollection },
  };
});

jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { createIndexes: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("../model/UserModel", () => ({ UserModel: {} }));
jest.mock("../services/geminiPrivate", () => ({ getGeminiBalances: jest.fn() }));
jest.mock("../services/snapshots", () => ({ snapshotNow: jest.fn(), startSnapshots: jest.fn() }));

import { migrate } from "../index";
import { OrdersModel } from "../model/OrdersModel";

const PARTIAL = {
  name: "userId_1_clientOrderId_1",
  partialFilterExpression: { clientOrderId: { $type: "string" } },
};
const LEGACY_SPARSE = { name: "userId_1_clientOrderId_1", sparse: true, unique: true };

beforeEach(() => {
  jest.clearAllMocks();
  indexes.mockResolvedValue([PARTIAL]);
});

describe("legacy field cleanup", () => {
  test("unsets removed fields through the raw driver, not a mongoose Model", async () => {
    // Through a Model, `strict` silently drops `balance`/`realizedPnl` from the
    // $unset because they are no longer schema paths, and the migration becomes
    // a no-op that reports success.
    await migrate();

    expect(collection).toHaveBeenCalledWith("users");
    expect(collection).toHaveBeenCalledWith("orders");
    expect(usersUpdateMany).toHaveBeenCalledWith(
      {},
      { $unset: { balance: "", realizedPnl: "" } }
    );
    expect(ordersUpdateMany).toHaveBeenCalledWith({}, { $unset: { realizedPnl: "" } });
  });
});

describe("idempotency index", () => {
  test("drops a legacy sparse index before rebuilding", async () => {
    indexes.mockResolvedValueOnce([LEGACY_SPARSE]).mockResolvedValueOnce([PARTIAL]);
    await migrate();
    expect(dropIndex).toHaveBeenCalledWith("userId_1_clientOrderId_1");
    expect(OrdersModel.createIndexes).toHaveBeenCalled();
  });

  test("leaves an already-correct partial index alone", async () => {
    // Re-running must not destroy a healthy index and then rely on something
    // else to rebuild it.
    await migrate();
    expect(dropIndex).not.toHaveBeenCalled();
  });

  test("builds indexes explicitly rather than racing mongoose's background build", async () => {
    // If autoIndex's createIndex lands before the drop it fails with
    // IndexOptionsConflict on an event nothing listens to, and the drop then
    // leaves the collection with NO uniqueness constraint, silently.
    indexes.mockResolvedValueOnce([LEGACY_SPARSE]).mockResolvedValueOnce([PARTIAL]);
    await migrate();
    expect(OrdersModel.createIndexes).toHaveBeenCalledTimes(1);
  });

  test("reports loudly when the partial index is not in place afterwards", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    indexes.mockResolvedValueOnce([LEGACY_SPARSE]).mockResolvedValueOnce([]);
    await migrate();
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("idempotency is NOT protected"),
      expect.anything()
    );
    err.mockRestore();
  });
});
