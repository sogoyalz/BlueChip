import React, { useState, useContext } from "react";

import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import GeneralContext from "../GeneralContext";
import { TradeMode } from "../../types";

import "./BuySellModal.css";

interface BuySellModalProps {
  uid: string;
  initialMode?: TradeMode;
}

const BuySellModal = ({ uid, initialMode = "BUY" }: BuySellModalProps) => {
  const [mode, setMode] = useState<TradeMode>(initialMode);
  const [stockQuantity, setStockQuantity] = useState(1);
  const [stockPrice, setStockPrice] = useState(0.0);

  const generalContext = useContext(GeneralContext);
  const [cookies] = useCookies(["token"]);

  const isBuy = mode === "BUY";
  const marginRequired =
    Number.isFinite(stockQuantity) && Number.isFinite(stockPrice)
      ? Math.max(stockQuantity * stockPrice, 0)
      : 0;

  const handleSubmit = async () => {
    // Mirror the server's validation so bad input fails fast with a clear
    // message instead of a generic request error.
    if (!Number.isFinite(stockQuantity) || stockQuantity <= 0) {
      toast.error("Quantity must be a number greater than 0.");
      return;
    }
    if (!Number.isFinite(stockPrice) || stockPrice < 0) {
      toast.error("Price must be a number of at least 0.");
      return;
    }
    try {
      await axios.post(
        "http://localhost:3002/neworder",
        {
          name: uid,
          qty: stockQuantity,
          price: stockPrice,
          mode,
        },
        {
          params: { token: cookies.token },
          withCredentials: true,
        }
      );
      toast.success(`${isBuy ? "Buy" : "Sell"} order placed for ${uid}`);
      generalContext.closeTradeWindow();
    } catch (err) {
      console.error("Failed to place order:", err);
      toast.error("Failed to place order. Please try again.");
      // keep the window open so the user can retry
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
          <span className="window-title">{uid}</span>
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
          <div className="inputs">
            <fieldset>
              <legend>Qty.</legend>
              <input
                type="number"
                name="qty"
                id="qty"
                onChange={(e) => setStockQuantity(Number(e.target.value))}
                value={stockQuantity}
              />
            </fieldset>
            <fieldset>
              <legend>Price</legend>
              <input
                type="number"
                name="price"
                id="price"
                step="0.05"
                onChange={(e) => setStockPrice(Number(e.target.value))}
                value={stockPrice}
              />
            </fieldset>
          </div>
        </div>

        <div className="buttons">
          <span className="num">
            Margin required ₹{marginRequired.toFixed(2)}
          </span>
          <div>
            <button
              type="button"
              className={`btn ${isBuy ? "btn-red" : "btn-outline"}`}
              onClick={handleSubmit}
            >
              {isBuy ? "Buy" : "Sell"}
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
      </div>
    </div>
  );
};

export default BuySellModal;
