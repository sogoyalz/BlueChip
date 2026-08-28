import React from "react";

import { TradeMode } from "../../types";
import { useOrderTicket } from "./useOrderTicket";

import "./BuySellModal.css";
import { usd } from "./format";

interface BuySellModalProps {
  uid: string; // Gemini pair, e.g. "BTCUSD"
  initialMode?: TradeMode;
}

/**
 * The order ticket's presentation. Everything about placing the order —
 * validation, the idempotency key, submission and outcome handling — lives in
 * useOrderTicket, where it can be tested without rendering a modal.
 */
const BuySellModal = ({ uid, initialMode = "BUY" }: BuySellModalProps) => {
  const {
    mode, setMode,
    orderType, setOrderType, switchToLimit,
    qty, setQty,
    limitPrice, setLimitPrice,
    balance, submitting,
    isBuy, livePrice, base, estimated,
    submit,
    close,
  } = useOrderTicket(uid, initialMode);

  return (
    <div
      className="trade-overlay"
      onClick={close}
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
              {livePrice ? ` · ${usd(livePrice)}` : ""}
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
                  value={livePrice ? usd(livePrice) : "…"}
                />
              </fieldset>
            )}
          </div>
        </div>

        <div className="buttons">
          <span className="num">
            {isBuy ? "Est. cost" : "Est. proceeds"} {usd(estimated)}
            {balance !== null && ` · Cash ${usd(balance)}`}
          </span>
          <div>
            <button
              type="button"
              className={`btn ${isBuy ? "btn-red" : "btn-outline"}`}
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Placing…" : isBuy ? "Buy" : "Sell"}
            </button>
            <button
              type="button"
              className="btn btn-grey"
              onClick={close}
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
