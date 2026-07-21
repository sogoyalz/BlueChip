import React, { useEffect, useRef, useState } from "react";
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

// Direction a symbol's price moved on the latest update, used to fire a
// one-shot color pulse on the pill. Cleared once the pulse has played.
type FlashDir = "up" | "down";

function LiveTicker() {
  const [prices, setPrices] = useState<Record<string, TickerEntry> | null>(
    null
  );
  const [flash, setFlash] = useState<Record<string, FlashDir>>({});
  const prevPrices = useRef<Record<string, number>>({});
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      axios
        .get<{ prices: Record<string, TickerEntry> }>(`${API_URL}/api/prices`)
        .then((res) => {
          const next = res.data.prices;
          if (cancelled || Object.keys(next).length === 0) return;

          // Flag which symbols moved so their pills pulse once. Compare
          // against the last seen price, then remember the new one.
          const moved: Record<string, FlashDir> = {};
          for (const [symbol, tick] of Object.entries(next)) {
            const prev = prevPrices.current[symbol];
            if (prev !== undefined && tick.price !== prev) {
              moved[symbol] = tick.price > prev ? "up" : "down";
            }
            prevPrices.current[symbol] = tick.price;
          }

          setPrices(next);

          if (Object.keys(moved).length > 0) {
            setFlash(moved);
            // Clear each flag after the pulse so the animation can retrigger.
            for (const symbol of Object.keys(moved)) {
              clearTimeout(flashTimers.current[symbol]);
              flashTimers.current[symbol] = setTimeout(() => {
                setFlash((f) => {
                  const { [symbol]: _drop, ...rest } = f;
                  return rest;
                });
              }, 900);
            }
          }
        })
        .catch(() => {
          // keep the last good data (or stay hidden) — never look broken
        });
    };
    load();
    const timer = setInterval(load, POLL_MS);
    const timers = flashTimers.current;
    return () => {
      cancelled = true;
      clearInterval(timer);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  if (!prices) return null;

  return (
    <div className="container text-center mb-5" data-testid="live-ticker">
      <div className="d-flex justify-content-center gap-3 flex-wrap">
        {Object.entries(prices).map(([symbol, tick]) => {
          const up = tick.changePct24h >= 0;
          return (
            <span
              className="panel ticker-pill"
              key={symbol}
              data-flash={flash[symbol]}
            >
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
