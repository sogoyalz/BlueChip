import React, { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";

import GeneralContext from "./GeneralContext";
import { usePrices } from "./PricesContext";
import CandleChart from "./shared/CandleChart";
import PnLValue from "./shared/PnLValue";
import Skeleton from "./shared/Skeleton";
import { Candle, CandleTimeframe } from "../types";
import { API_URL } from "../config";

const TIMEFRAMES: { value: CandleTimeframe; label: string }[] = [
  { value: "15m", label: "15m" },
  { value: "1hr", label: "1H" },
  { value: "6hr", label: "6H" },
  { value: "1day", label: "1D" },
];

const fmt$ = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const MarketDetail = () => {
  const { symbol = "" } = useParams();
  const navigate = useNavigate();
  const { prices, symbols } = usePrices();
  const generalContext = useContext(GeneralContext);

  const [timeframe, setTimeframe] = useState<CandleTimeframe>("1hr");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  const pair = symbol.toUpperCase();
  const info = symbols.find((s) => s.symbol === pair);
  const tick = prices[pair];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get<{ candles: Candle[] }>(`${API_URL}/api/candles/${pair}`, {
        params: { timeframe },
      })
      .then((res) => {
        if (!cancelled) setCandles(res.data.candles);
      })
      .catch((err) => {
        console.error("Failed to load candles:", err);
        if (!cancelled) toast.error("Could not load chart data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair, timeframe]);

  // Symbols are still loading, or the pair genuinely doesn't exist.
  if (symbols.length > 0 && !info) {
    return (
      <>
        <h3 className="title">Unknown market “{pair}”</h3>
        <button className="btn btn-grey" onClick={() => navigate("/")}>
          Back to dashboard
        </button>
      </>
    );
  }

  return (
    <>
      <div className="dash-header">
        <div>
          <h2 className="dash-title">
            {info ? `${info.name} (${info.base}/USD)` : pair}
          </h2>
          <p className="dash-date">
            {tick ? (
              <>
                {fmt$(tick.price)}{" "}
                <PnLValue
                  text={`${tick.changePct24h >= 0 ? "+" : ""}${tick.changePct24h.toFixed(2)}% (24h)`}
                  showArrow
                />
              </>
            ) : (
              "Loading price…"
            )}
          </p>
        </div>
        <div>
          <button
            className="btn btn-red"
            onClick={() => generalContext.openTradeWindow(pair, "BUY")}
          >
            Buy
          </button>{" "}
          <button
            className="btn btn-outline"
            onClick={() => generalContext.openTradeWindow(pair, "SELL")}
          >
            Sell
          </button>
        </div>
      </div>

      <div className="panel chart-card">
        <div className="chart-head">
          <p className="chart-label">Price history · Gemini</p>
          <div className="range-tabs" role="tablist" aria-label="Timeframe">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                role="tab"
                aria-selected={timeframe === tf.value}
                className={timeframe === tf.value ? "range-tab selected" : "range-tab"}
                onClick={() => setTimeframe(tf.value)}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-body candle-body">
          {loading ? (
            <Skeleton label="Loading chart…" />
          ) : (
            <CandleChart candles={candles.slice(-120)} />
          )}
        </div>
      </div>
    </>
  );
};

export default MarketDetail;
