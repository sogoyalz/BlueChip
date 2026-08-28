// One-shot, gated, DESTRUCTIVE data-model migration.
//
// Runs only when RUN_MIGRATIONS=true, because the free-tier host restarts
// constantly and this drops collections. See docs/PROJECT_GUIDE.md for the
// deploy sequence: migrate, verify the index independently, clear the flag.

import mongoose from "mongoose";
import { OrdersModel } from "./model/OrdersModel";

const ORDER_IDEMPOTENCY_INDEX = "userId_1_clientOrderId_1";

export const migrate = async (): Promise<void> => {
  // Legacy field cleanup goes through the RAW driver collection, not the
  // models. Mongoose's `strict` mode silently strips paths that are not in the
  // schema from update operators — and `balance`/`realizedPnl` were removed
  // from the schemas in the pivot, which is exactly why we are unsetting them.
  // Through a model this $unset becomes an empty update and does nothing at
  // all, with no error and modifiedCount undefined. Verified against a real
  // database: the fields survived two full migration runs.
  const users = mongoose.connection.collection("users");
  const orders = mongoose.connection.collection("orders");
  const u = await users.updateMany({}, { $unset: { balance: "", realizedPnl: "" } });
  const o = await orders.updateMany({}, { $unset: { realizedPnl: "" } });
  console.log(
    `migrate: cleared legacy fields from ${u.modifiedCount} user(s) and ${o.modifiedCount} order(s)`
  );

  // The (userId, clientOrderId) index used to be `sparse`, which does not mean
  // "skip documents without the field" on a COMPOUND index — see the comment in
  // schemas/OrdersSchema.ts. MongoDB cannot change an existing index's options,
  // so a legacy one has to be dropped before the corrected partial index can be
  // created.
  //
  // Only drop it if it IS the legacy one. Re-running the migration must not
  // destroy a healthy index and then depend on something else to rebuild it.
  const existing = (await orders.indexes()).find(
    (i) => i.name === ORDER_IDEMPOTENCY_INDEX
  );
  if (existing && !existing.partialFilterExpression) {
    await orders.dropIndex(ORDER_IDEMPOTENCY_INDEX);
    console.log("migrate: dropped legacy sparse clientOrderId index");
  } else if (existing) {
    console.log("migrate: clientOrderId index already correct — leaving it alone");
  }

  // Build the schema's indexes explicitly and WAIT for them. Mongoose's
  // autoIndex would otherwise do this in the background, racing the drop above:
  // if its createIndex lands first it fails with IndexOptionsConflict (reported
  // on an `index` event nothing listens to), and the drop then leaves the
  // collection with NO uniqueness constraint at all, silently.
  await OrdersModel.createIndexes();

  // Post-condition. If this is wrong, idempotency protection is not in force
  // and duplicate submissions can double-insert, so say so unmissably rather
  // than letting a "successful" deploy hide it.
  const after = (await orders.indexes()).find(
    (i) => i.name === ORDER_IDEMPOTENCY_INDEX
  );
  if (after?.partialFilterExpression) {
    console.log("migrate: clientOrderId partial index verified");
  } else {
    console.error(
      "migrate: FAILED — the (userId, clientOrderId) partial index is not in " +
        "place. Order idempotency is NOT protected. Do not clear " +
        "RUN_MIGRATIONS; investigate before taking traffic. Found:",
      after ?? "no index"
    );
  }

  // Check before dropping so the log reflects what actually happened — a
  // migration that reports work it didn't do is worse than a quiet one.
  const present = new Set(
    (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name)
  );
  for (const collection of ["positions", "holdings", "holding"]) {
    if (!present.has(collection)) continue;
    try {
      await mongoose.connection.dropCollection(collection);
      console.log(`migrate: dropped legacy ${collection} collection`);
    } catch (err) {
      console.warn(`migrate: could not drop ${collection}:`, (err as Error).message);
    }
  }
};


