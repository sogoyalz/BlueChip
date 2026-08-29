// Reconciling an exchange observation onto a local order.
//
// Two writers touch the same order: the cancel route (one-shot, user initiated)
// and orderSync (every 5s). Both used to read the document, mutate it, and
// save() — and mongoose's default versioning only guards array paths, so two
// concurrent scalar writes were last-write-wins. A cancel that observed a
// partial fill could land after a sync that observed the order fully filled,
// overwriting FILLED/1.0 with CANCELLED/0.4. Because CANCELLED is terminal,
// orderSync's resting filter would never revisit the order and the divergence
// from the exchange became permanent.
//
// There is no need for a lock. An order's executed amount on the exchange only
// ever increases, so it doubles as a version number: the observation reporting
// MORE executed is the more recent truth, whichever write lands first. Writes
// are applied conditionally on that, in a single atomic update, so there is no
// read-modify-write window at all.

import { trusted } from "mongoose";
import { OrdersModel } from "../model/OrdersModel";
import { IOrder, OrderStatus } from "../schemas/OrdersSchema";
import { HydratedDocument, Types } from "mongoose";

/** Statuses orderSync stops reconciling — nothing revisits an order once here. */
export const TERMINAL_STATUSES = new Set<OrderStatus>([
  "FILLED",
  "CANCELLED",
  "REJECTED",
]);

/**
 * Statuses that mean the order is still live on the exchange's book.
 *
 * PARTIALLY_FILLED belongs here: a resting limit that partly crossed keeps its
 * remainder on the book, and orderSync has always reconciled it as resting.
 * The cancel path and the UI used to gate on OPEN alone, which made exactly
 * those orders uncancellable — no button, and a 409 claiming "already filled
 * or cancelled" for an order the exchange still held.
 */
export const RESTING_STATUSES: OrderStatus[] = ["OPEN", "PARTIALLY_FILLED"];

/** What the exchange told us about an order, at some moment. */
export interface Observation {
  status: OrderStatus;
  filledQty: number; // executed_amount — monotonically non-decreasing
  fillPrice?: number;
  reason?: string;
}

interface StoredState {
  status: string;
  filledQty?: number;
}

/**
 * Should this observation replace what we have stored?
 *
 * Exported separately from the update so the rule can be reasoned about and
 * tested on its own; the database filter below encodes exactly the same thing.
 */
export function shouldApplyObservation(
  stored: StoredState,
  observed: { status: OrderStatus; filledQty: number }
): boolean {
  const storedQty = stored.filledQty ?? 0; // orders predating the field
  if (observed.filledQty > storedQty) return true; // strictly newer knowledge
  if (observed.filledQty < storedQty) return false; // strictly older knowledge
  // Same executed amount: the observation adds nothing about fills, so only let
  // it refine a status that is not already final.
  return !TERMINAL_STATUSES.has(stored.status as OrderStatus);
}

/**
 * Apply an observation atomically. Returns the updated document, or null when
 * the observation was stale and nothing was written.
 *
 * The filter is the database-side twin of shouldApplyObservation: apply when
 * strictly more executed, or when the executed amount matches and the stored
 * status is not yet terminal. Orders with no filledQty at all are treated as
 * zero, which is what they are.
 */
export async function applyObservation(
  orderId: Types.ObjectId | string,
  observed: Observation
): Promise<HydratedDocument<IOrder> | null> {
  const notTerminal = [...TERMINAL_STATUSES];

  // The database-side twin of shouldApplyObservation, branch by branch:
  //   filledQty < observed          -> strictly newer knowledge, always apply
  //   field missing, observed > 0   -> the same case: stored is 0, observed is
  //                                    more ($lt never matches a missing field,
  //                                    so this needs its own branch)
  //   qty tie (equal, or both zero) -> only refine a non-terminal status
  const newerKnowledge: Record<string, unknown>[] = [
    { filledQty: trusted({ $lt: observed.filledQty }) },
  ];
  if (observed.filledQty > 0) {
    newerKnowledge.push({ filledQty: trusted({ $exists: false }) });
  }
  const qtyTie: Record<string, unknown>[] = [
    {
      filledQty: trusted({ $exists: false }),
      status: trusted({ $nin: notTerminal }),
    },
    { filledQty: observed.filledQty, status: trusted({ $nin: notTerminal }) },
  ];

  const set: Record<string, unknown> = { status: observed.status };
  if (observed.filledQty > 0) {
    set.filledQty = observed.filledQty;
    set.filledAt = new Date();
    if (observed.fillPrice !== undefined) set.fillPrice = observed.fillPrice;
  }
  if (observed.reason !== undefined) set.reason = observed.reason;

  // trusted() goes around each operator object individually, not the filter as
  // a whole — sanitizeFilter is global, and mongoose otherwise casts a nested
  // operator as a literal field value (a CastError at query time, invisible to
  // any test that mocks the model).
  return OrdersModel.findOneAndUpdate(
    { _id: orderId, $or: [...newerKnowledge, ...qtyTie] },
    { $set: set },
    { returnDocument: "after" }
  );
}
