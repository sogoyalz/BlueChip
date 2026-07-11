import React, { useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "../../config";

// Live prices straight from the platform's public market-data endpoint
// (which in turn mirrors Gemini). Renders nothing until the first
// successful fetch, so the landing page never looks broken if the
// backend is asleep or unreachable.

interface TickerEntry {
  price: number;
  changePct24h: number;
}

const POLL_MS = 5000;

const fmtPrice = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 4 : 2,
  }).format(n);

function LiveTicker() {
  const [prices, setPrices] = useState<Record<string, TickerEntry> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      axios
        .get<{ prices: Record<string, TickerEntry> }>(`${API_URL}/api/prices`)
        .then((res) => {
          if (!cancelled && Object.keys(res.data.prices).length > 0) {
            setPrices(res.data.prices);
          }
        })
        .catch(() => {
          // keep the last good data (or stay hidden) — never look broken
        });
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!prices) return null;

  return (
    <div className="container text-center mb-5" data-testid="live-ticker">
      <div className="d-flex justify-content-center gap-3 flex-wrap">
        {Object.entries(prices).map(([symbol, tick]) => {
          const up = tick.changePct24h >= 0;
          return (
            <span className="panel ticker-pill" key={symbol}>
              <strong>{symbol.replace(/USD$/, "")}</strong>{" "}
              {fmtPrice(tick.price)}{" "}
              <span className={up ? "ticker-up" : "ticker-down"}>
                {up ? "▲" : "▼"}
                {Math.abs(tick.changePct24h).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
      <p className="fine-print mt-3 mb-0">
        Live prices · Gemini market data · crypto never closes
      </p>
    </div>
  );
}

export default LiveTicker;
