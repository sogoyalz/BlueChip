import React, { useState, useContext, useEffect, useRef } from "react";

import axios from "axios";
import { toast } from "react-toastify";

import GeneralContext from "../GeneralContext";
import { usePrices } from "../PricesContext";
import { Account, Order, OrderType, TradeMode } from "../../types";
import { API_URL } from "../../config";

import "./BuySellModal.css";

interface BuySellModalProps {
  uid: string; // Gemini pair, e.g. "BTCUSD"
  initialMode?: TradeMode;
}

const fmt$ = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const BuySellModal = ({ uid, initialMode = "BUY" }: BuySellModalProps) => {
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

  const isBuy = mode === "BUY";
  const livePrice = prices[uid]?.price;
  const base = symbols.find((s) => s.symbol === uid)?.base ?? uid;

  // Show available cash so the user knows what they can afford.
  useEffect(() => {
    axios
      .get<Account>(`${API_URL}/api/account`, {
        withCredentials: true,
      })
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

  const switchToLimit = () => {
    setOrderType("LIMIT");
    // Prefill with the live price so the user tweaks, not types from scratch.
    if (!limitPrice && livePrice) setLimitPrice(String(livePrice));
  };

  const handleSubmit = async () => {
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
        {
          withCredentials: true,
        }
      );
      // The server responded with an order outcome — this attempt is done, so
      // the next submission is a genuinely new order and needs a fresh key.
      clientOrderIdRef.current = null;
      const order = data.order;
      if (order.status === "FILLED") {
        toast.success(
          `${isBuy ? "Bought" : "Sold"} ${order.qty} ${base} at ${fmt$(order.fillPrice!)}`
        );
        generalContext.closeTradeWindow();
      } else if (order.status === "OPEN") {
        toast.info(
          `Limit ${mode.toLowerCase()} placed: ${order.qty} ${base} @ ${fmt$(order.limitPrice!)}`
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

  const handleCancelClick = () => {
    generalContext.closeTradeWindow();
  };

  return (
    <div
      className="trade-overlay"
      onClick={handleCancelClick}
      data-testid="trade-overlay"
    >
      <div
        className="trade-modal"
        role="dialog"
        aria-label={`${isBuy ? "Buy" : "Sell"} ${uid}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="window-header">
          <span className="window-title">
            {base}
            <span className="live-quote">
              {livePrice ? ` · ${fmt$(livePrice)}` : ""}
            </span>
          </span>
          <div className="mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={isBuy}
              className={`mode-tab ${isBuy ? "active buy" : ""}`}
              onClick={() => setMode("BUY")}
            >
              Buy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isBuy}
              className={`mode-tab ${!isBuy ? "active sell" : ""}`}
              onClick={() => setMode("SELL")}
            >
              Sell
            </button>
          </div>
        </div>
        <div className="regular-order">
          <div className="type-row" role="tablist" aria-label="Order type">
            <button
              type="button"
              role="tab"
              aria-selected={orderType === "MARKET"}
              className={`mode-tab ${orderType === "MARKET" ? "active buy" : ""}`}
              onClick={() => setOrderType("MARKET")}
            >
              Market
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={orderType === "LIMIT"}
              className={`mode-tab ${orderType === "LIMIT" ? "active buy" : ""}`}
              onClick={switchToLimit}
            >
              Limit
            </button>
          </div>
          <div className="inputs">
            <fieldset>
              <legend>Qty. ({base})</legend>
              <input
                type="number"
                name="qty"
                id="qty"
                step="any"
                min="0"
                placeholder="0.00"
                onChange={(e) => setQty(e.target.value)}
                value={qty}
              />
            </fieldset>
            {orderType === "LIMIT" ? (
              <fieldset>
                <legend>Limit price (USD)</legend>
                <input
                  type="number"
                  name="price"
                  id="price"
                  step="any"
                  min="0"
                  onChange={(e) => setLimitPrice(e.target.value)}
                  value={limitPrice}
                />
              </fieldset>
            ) : (
              <fieldset>
                <legend>Market price</legend>
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  value={livePrice ? fmt$(livePrice) : "…"}
                />
              </fieldset>
            )}
          </div>
        </div>

        <div className="buttons">
          <span className="num">
            {isBuy ? "Est. cost" : "Est. proceeds"} {fmt$(estimated)}
            {balance !== null && ` · Cash ${fmt$(balance)}`}
          </span>
          <div>
            <button
              type="button"
              className={`btn ${isBuy ? "btn-red" : "btn-outline"}`}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Placing…" : isBuy ? "Buy" : "Sell"}
            </button>
            <button
              type="button"
              className="btn btn-grey"
              onClick={handleCancelClick}
            >
              Cancel
            </button>
          </div>
        </div>
        <p className="paper-note">
          Paper trading with simulated funds — not real money. Prices via Gemini.
        </p>
      </div>
    </div>
  );
};

export default BuySellModal;
