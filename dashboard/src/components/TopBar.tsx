import React from "react";

import Menu from "./Menu";
import PnLValue from "./shared/PnLValue";
import { usePrices } from "./PricesContext";

const TickerBlock = ({ symbol, label }: { symbol: string; label: string }) => {
  const { prices } = usePrices();
  const tick = prices[symbol];
  return (
    <div className="index-group">
      <p className="index">{label}</p>
      <p className="index-points">
        {tick
          ? tick.price.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : "—"}
      </p>
      <p className="percent">
        {tick ? (
          <PnLValue
            text={`${tick.changePct24h >= 0 ? "+" : ""}${tick.changePct24h.toFixed(2)}%`}
            showArrow
          />
        ) : (
          <PnLValue text="—" />
        )}
      </p>
    </div>
  );
};

const TopBar = () => {
  const { isStale, prices } = usePrices();
  const streaming = Object.values(prices).some((p) => p.source === "ws");

  return (
    <>
      <div className="paper-banner" role="note">
        Paper trading with simulated funds — not real money. Market data via Gemini.
      </div>
      <div className="topbar-container">
        <div className="indices-container">
          <TickerBlock symbol="BTCUSD" label="BTC / USD" />
          <TickerBlock symbol="ETHUSD" label="ETH / USD" />
          <div
            className="live-pill"
            style={isStale ? { opacity: 0.45 } : undefined}
            title={
              isStale
                ? "Market data delayed"
                : streaming
                  ? "Streaming via Gemini WebSocket"
                  : "Live prices from Gemini"
            }
          >
            <span className="live-dot" aria-hidden="true" />
            <span>{isStale ? "Delayed" : "Live"}</span>
          </div>
        </div>

        <Menu />
      </div>
    </>
  );
};

export default TopBar;
