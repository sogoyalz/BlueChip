import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";

import GeneralContext from "./GeneralContext";
import { usePrices } from "./PricesContext";

import { Tooltip, Grow } from "@mui/material";

import {
  BarChartOutlined,
  KeyboardArrowDown,
  KeyboardArrowUp,
} from "@mui/icons-material";

import { SymbolInfo, TickerPrice } from "../types";
import { DoughnutChart } from "./DoughnoutChart";

// Brand ramp: accent reds first, then warm/neutral steps that stay legible on
// the dark surface; entries beyond the eight slots fold to a muted gray.
const CATEGORICAL = [
  "#e50914",
  "#ff5252",
  "#a1050d",
  "#ff8a80",
  "#d9d9d9",
  "#a0a0a0",
  "#666666",
  "#7a2e2e",
];
const sliceColor = (i: number) => (i < CATEGORICAL.length ? CATEGORICAL[i] : "#4a4a4a");

const fmtPrice = (n: number) =>
  n >= 1000
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const WatchList = () => {
  const { prices, symbols } = usePrices();
  const [query, setQuery] = useState("");

  const q = query.trim().toUpperCase();
  const visible = symbols.filter(
    (s) =>
      !q ||
      s.symbol.includes(q) ||
      s.base.includes(q) ||
      s.name.toUpperCase().includes(q)
  );

  // Doughnut compares each asset's 24h movement — raw prices would let BTC
  // dwarf every other slice.
  const movers = visible.filter((s) => prices[s.symbol]);
  const data = {
    labels: movers.map((s) => s.base),
    datasets: [
      {
        label: "24h move (%)",
        data: movers.map((s) => Math.abs(prices[s.symbol]?.changePct24h ?? 0)),
        backgroundColor: movers.map((_, i) => sliceColor(i)),
        // 2px surface-colored gap between slices (canvas can't resolve CSS
        // vars, so this mirrors --surface from index.css)
        borderColor: "#131316",
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="watchlist-container">
      <div className="search-container">
        <input
          type="text"
          name="search"
          id="search"
          placeholder="Search e.g. BTC, ETH, SOL"
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="counts">
          {visible.length} / {symbols.length}
        </span>
      </div>

      <ul className="list">
        {visible.map((s) => (
          <WatchListItem info={s} tick={prices[s.symbol]} key={s.symbol} />
        ))}
      </ul>

      <div className="watchlist-chart">
        <DoughnutChart data={data} />
      </div>
    </div>
  );
};

export default WatchList;

const WatchListItem = ({
  info,
  tick,
}: {
  info: SymbolInfo;
  tick?: TickerPrice;
}) => {
  const isDown = (tick?.changePct24h ?? 0) < 0;
  const pct = tick ? `${tick.changePct24h >= 0 ? "+" : ""}${tick.changePct24h.toFixed(2)}%` : "—";

  return (
    <li>
      <div className="item">
        <div className="item-symbol">
          <div className="symbol-badge">{info.base.slice(0, 3)}</div>
          <p className="symbol-name">{info.base}</p>
        </div>
        <div className="item-info">
          <span className={`percent ${isDown ? "down" : "up"}`}>{pct}</span>
          {isDown ? (
            <KeyboardArrowDown className="down" />
          ) : (
            <KeyboardArrowUp className="up" />
          )}
          <span className="price">{tick ? fmtPrice(tick.price) : "…"}</span>
        </div>
      </div>
      {/* Always rendered. Mounting these on mouseenter meant they never
          existed on a touch device (a tap fires no mouseenter) and could never
          be tabbed to. The hover reveal is now purely a fine-pointer refinement
          in CSS. */}
      <WatchListActions symbol={info.symbol} base={info.base} />
    </li>
  );
};

const WatchListActions = ({ symbol, base }: { symbol: string; base: string }) => {
  const generalContext = useContext(GeneralContext);
  const navigate = useNavigate();

  return (
    <span className="actions">
      <span>
        <Tooltip
          title={`Buy ${base}`}
          placement="top"
          arrow
          slots={{ transition: Grow }}
        >
          <button
            className="buy"
            onClick={() => generalContext.openTradeWindow(symbol, "BUY")}
          >
            Buy
          </button>
        </Tooltip>
        <Tooltip
          title="Sell"
          placement="top"
          arrow
          slots={{ transition: Grow }}
        >
          <button
            className="sell"
            onClick={() => generalContext.openTradeWindow(symbol, "SELL")}
          >
            Sell
          </button>
        </Tooltip>
        <Tooltip
          title="Chart"
          placement="top"
          arrow
          slots={{ transition: Grow }}
        >
          <button
            className="action"
            aria-label={`${base} chart`}
            onClick={() => navigate(`/market/${symbol}`)}
          >
            <BarChartOutlined className="icon" />
          </button>
        </Tooltip>
      </span>
    </span>
  );
};
