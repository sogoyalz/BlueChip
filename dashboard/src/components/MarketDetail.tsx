import React, { useState, useEffect, useContext, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";

import GeneralContext from "./GeneralContext";
import { usePrices } from "./PricesContext";
import CandleChart from "./shared/CandleChart";
import DepthPanel from "./shared/DepthPanel";
import PnLValue from "./shared/PnLValue";
import Skeleton from "./shared/Skeleton";
import { Candle, CandleTimeframe } from "../types";
import { API_URL } from "../config";
import { usd } from "./shared/format";

const TIMEFRAMES: { value: CandleTimeframe; label: string }[] = [
  { value: "15m", label: "15m" },
  { value: "1hr", label: "1H" },
  { value: "6hr", label: "6H" },
  { value: "1day", label: "1D" },
];


const MarketDetail = () => {
  const { symbol = "" } = useParams();
  const navigate = useNavigate();
  const { prices, symbols } = usePrices();
  const generalContext = useContext(GeneralContext);

  const [timeframe, setTimeframe] = useState<CandleTimeframe>("1hr");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  // Sliced once per candle change rather than on every render: a fresh array
  // here would defeat the memo on CandleChart, since the prop identity is what
  // it compares.
  const visibleCandles = useMemo(() => candles.slice(-120), [candles]);

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
                {usd(tick.price)}{" "}
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
            <CandleChart candles={visibleCandles} />
          )}
        </div>
      </div>

      <DepthPanel symbol={pair} />
    </>
  );
};

export default MarketDetail;
