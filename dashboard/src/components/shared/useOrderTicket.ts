import { useState, useContext, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "react-toastify";

import GeneralContext from "../GeneralContext";
import { usePrices } from "../PricesContext";
import { Account, Order, OrderType, TradeMode } from "../../types";
import { API_URL } from "../../config";
import { usd } from "./format";

/**
 * Everything about placing an order, separated from everything about drawing
 * the ticket.
 *
 * The interesting behaviour here is not the form — it is the idempotency key
 * lifecycle and the mapping from a server outcome to what the user is told.
 * Both are trading correctness, and both were previously reachable only by
 * rendering a modal and clicking through it.
 */
export function useOrderTicket(uid: string, initialMode: TradeMode) {
  const [mode, setMode] = useState<TradeMode>(initialMode);
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const generalContext = useContext(GeneralContext);
  const { prices, symbols } = usePrices();

  // Idempotency key for the in-flight submission. Generated on first submit,
  // reused across retries (so a retry after a slow-but-successful request
  // doesn't place a second order), cleared once an order is accepted.
  const clientOrderIdRef = useRef<string | null>(null);

  // Reusing the key across a retry is the point — it's what stops a
  // slow-but-successful first attempt from double-filling. But the moment any
  // order parameter changes this is a *different* order: keeping the key would
  // make the server return the previous order and silently drop the edit.
  useEffect(() => {
    clientOrderIdRef.current = null;
  }, [qty, limitPrice, mode, orderType]);

  const isBuy = mode === "BUY";
  const livePrice = prices[uid]?.price;
  const base = symbols.find((s) => s.symbol === uid)?.base ?? uid;

  // Show available cash so the user knows what they can afford.
  useEffect(() => {
    axios
      .get<Account>(`${API_URL}/api/account`, { withCredentials: true })
      .then((res) => setBalance(res.data.balance))
      .catch((err) => console.error("Failed to load balance:", err));
  }, []);

  const numQty = Number(qty);
  const numLimit = Number(limitPrice);
  const effectivePrice = orderType === "LIMIT" ? numLimit : livePrice ?? 0;
  const estimated =
    Number.isFinite(numQty) && numQty > 0 && Number.isFinite(effectivePrice)
      ? numQty * effectivePrice
      : 0;

  const switchToLimit = useCallback(() => {
    setOrderType("LIMIT");
    // Prefill with the live price so the user tweaks, not types from scratch.
    if (!limitPrice && livePrice) setLimitPrice(String(livePrice));
  }, [limitPrice, livePrice]);

  const submit = async () => {
    // A second click while the first request is still in flight would place a
    // second order; the button is disabled, but the guard belongs here too.
    if (submitting) return;

    // Mirror the server's validation so bad input fails fast with a clear
    // message instead of a generic request error.
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast.error("Quantity must be a number greater than 0.");
      return;
    }
    if (orderType === "LIMIT" && (!Number.isFinite(numLimit) || numLimit <= 0)) {
      toast.error("Limit price must be a number greater than 0.");
      return;
    }
    setSubmitting(true);
    // One key per submission, stable across retries of that submission.
    if (!clientOrderIdRef.current) {
      clientOrderIdRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    try {
      const { data } = await axios.post<{ order: Order }>(
        `${API_URL}/api/orders`,
        {
          symbol: uid,
          side: mode,
          type: orderType,
          qty: numQty,
          clientOrderId: clientOrderIdRef.current,
          ...(orderType === "LIMIT" ? { limitPrice: numLimit } : {}),
        },
        { withCredentials: true }
      );
      // The server responded with an order outcome — this attempt is done, so
      // the next submission is a genuinely new order and needs a fresh key.
      clientOrderIdRef.current = null;
      const order = data.order;
      // Announce before the toasts: whatever the outcome, the server has
      // recorded it and the orders list should stop showing a stale view.
      generalContext.notifyOrderPlaced();
      if (order.status === "FILLED") {
        toast.success(
          `${isBuy ? "Bought" : "Sold"} ${order.qty} ${base} at ${usd(order.fillPrice!)}`
        );
        generalContext.closeTradeWindow();
      } else if (order.status === "PARTIALLY_FILLED") {
        // A market order is immediate-or-cancel: whatever didn't cross the
        // book is gone, so this is the final outcome, not a pending one.
        const filled = order.filledQty ?? order.qty;
        toast.success(
          `${isBuy ? "Bought" : "Sold"} ${filled} of ${order.qty} ${base} at ` +
            `${usd(order.fillPrice!)} — the rest didn't fill.`
        );
        generalContext.closeTradeWindow();
      } else if (order.status === "OPEN") {
        toast.info(
          `Limit ${mode.toLowerCase()} placed: ${order.qty} ${base} @ ${usd(order.limitPrice!)}`
        );
        generalContext.closeTradeWindow();
      } else {
        // REJECTED — an order outcome, not a request error
        toast.error(order.reason || "Order rejected.");
      }
    } catch (err) {
      console.error("Failed to place order:", err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message
        : undefined;
      toast.error(message || "Failed to place order. Please try again.");
      // Keep the window open AND keep clientOrderIdRef so a retry reuses the
      // same key — if the first attempt actually reached the exchange, the
      // retry dedupes instead of placing a second order.
    } finally {
      setSubmitting(false);
    }
  };

  return {
    mode, setMode,
    orderType, setOrderType, switchToLimit,
    qty, setQty,
    limitPrice, setLimitPrice,
    balance, submitting,
    isBuy, livePrice, base, estimated,
    submit,
    close: () => generalContext.closeTradeWindow(),
  };
}
