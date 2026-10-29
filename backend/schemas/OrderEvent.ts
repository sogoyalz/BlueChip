import type { Types } from "mongoose";
import type { OrderStatus } from "./OrdersSchema";

export const ORDER_EVENT_KINDS = ["INTENT_RECORDED", "CONFIRMATION_PENDING", "EXCHANGE_OBSERVED", "REJECTED", "LOOKUP_FAILED", "RECHECK_REQUESTED", "MANUAL_REVIEW_REQUIRED"] as const;
export interface OrderEvent {
  kind: typeof ORDER_EVENT_KINDS[number];
  at: Date;
  status?: OrderStatus;
  filledQty?: number;
  actorId?: Types.ObjectId | string;
  note?: string;
}
export const RECENT_EVENT_LIMIT = 50;
export function orderEvent(kind: OrderEvent["kind"], fields: Omit<Partial<OrderEvent>, "kind" | "at"> = {}): OrderEvent {
  return { ...fields, kind, at: new Date() };
}
/** Append with the state change in the same atomic MongoDB update. */
export function appendOrderEvent(kind: OrderEvent["kind"], fields: Omit<Partial<OrderEvent>, "kind" | "at"> = {}) {
  return { $each: [orderEvent(kind, fields)], $slice: -RECENT_EVENT_LIMIT };
}
