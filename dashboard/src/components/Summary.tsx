import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "react-toastify";

import PnLValue from "./shared/PnLValue";
import StatCard from "./shared/StatCard";
import { linePath } from "./shared/chartPath";
import { Account, Holding } from "../types";
import { API_URL } from "../config";

const fmt$ = (n: number, dp = 2) =>
  "$" +
  Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
const signed$ = (n: number, dp = 2) => (n >= 0 ? "+" : "-") + fmt$(n, dp);
const fmtPct = (p: number) => (p >= 0 ? "+" : "") + p.toFixed(2) + "%";

const RANGES = ["1D", "1W", "1M", "ALL"] as const;

interface HistoryPoint {
  ts: number;
  value: number;
}

// Chart geometry (SVG user units; the svg itself is fluid).
const CW = 760;
const CH = 260;

const Summary = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  // null until the holdings call resolves — an empty array is a real "no
  // positions", which is a different thing from "we don't know".
  const [holdingsLoaded, setHoldingsLoaded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");

  useEffect(() => {
    // Auth rides the httpOnly cookie; this component mounts only after the
    // session is verified.
    const opts = { withCredentials: true };
    axios
      .get<Holding[]>(`${API_URL}/api/holdings`, opts)
      .then((res) => {
        setHoldings(res.data);
        setHoldingsLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load holdings summary:", err);
        // toastId dedupes so a retry / StrictMode double-mount can't stack
        // two identical error toasts.
        toast.error("Could not load holdings summary.", {
          toastId: "holdings-summary-error",
        });
      });
    axios
      .get<Account>(`${API_URL}/api/account`, opts)
      .then((res) => setAccount(res.data))
      .catch((err) => {
        console.error("Failed to load account:", err);
        toast.error("Could not load account.", { toastId: "account-error" });
      });
  }, []);

  useEffect(() => {
    axios
      .get<{ points: HistoryPoint[] }>(`${API_URL}/api/portfolio/history`, {
        params: { range },
        withCredentials: true,
      })
      .then((res) => setHistory(res.data.points))
      .catch((err) => console.error("Failed to load portfolio history:", err));
  }, [range]);

  const currentValue = holdings.reduce((sum, h) => sum + (h.price ?? 0) * h.qty, 0);

  // Today's move, approximated from each holding's 24h-change percentage.
  // Cash doesn't move, so the dollar figure is holdings-only.
  const dayPL = holdings.reduce(
    (sum, h) => sum + (h.price ?? 0) * h.qty * ((h.dayChangePct ?? 0) / 100),
    0
  );

  const balance = account?.balance ?? 0;
  const portfolioValue = account?.portfolioValue ?? currentValue + balance;

  // When a load fails we genuinely do not know these figures. Rendering "$0"
  // for an unknown balance is not a neutral placeholder in a trading app — it
  // reads as "your portfolio is empty", which is alarming and false. Funds.tsx
  // already shows "—" in exactly this situation; match it.
  const money = (known: boolean, render: () => string) => (known ? render() : "—");
  const accountKnown = account !== null;
  // The day percentage needs BOTH sides: the move comes from holdings, the base
  // it is measured against comes from the account. Unknown either way.
  const deltaKnown = accountKnown && holdingsLoaded;

  // The percentage is rendered as the delta on portfolio value (cash +
  // holdings), so it has to be measured against that same base. Dividing by
  // holdings alone overstates the move by the account's cash share.
  const prevPortfolioValue = portfolioValue - dayPL;
  const dayPct = prevPortfolioValue > 0 ? (dayPL / prevPortfolioValue) * 100 : 0;

  // Real snapshot history; a brand-new account renders a flat baseline.
  // Returns null when there is nothing honest to draw.
  const chart = useMemo(() => {
    let series = history.map((p) => p.value);
    if (series.length < 2) {
      // With no recorded history, the only thing we can draw is a flat line at
      // the current value — which is only honest if we actually know it. When
      // the account load failed, portfolioValue is a 0 fallback, and drawing
      // that asserts a figure we never received, directly under stat cards
      // that correctly read "—".
      if (!accountKnown) return null;
      const v = series[0] ?? portfolioValue;
      series = [v, v];
    }
    const line = linePath(series, CW, CH, 14);
    const [lx, ly] = line.split(" L").pop()!.split(" ");
    return {
      line,
      area: `${line} L ${CW} ${CH} L 0 ${CH} Z`,
      lx,
      ly,
      up: series[series.length - 1] >= series[0],
    };
  }, [history, portfolioValue, accountKnown]);

  const stroke = chart?.up ? "#00c853" : "#ff5252"; // --gain / --loss

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <div className="dash-header">
        <div>
          <h1 className="dash-title">
            Hi, {account?.username ?? "trader"}!
          </h1>
          <p className="dash-date">{dateStr} · Crypto markets never close</p>
        </div>
      </div>

      <div className="row cols-4">
        <StatCard
          label="Portfolio value"
          delta={<PnLValue text={money(deltaKnown, () => fmtPct(dayPct))} />}
          sub="shared account: cash + holdings"
        >
          {money(accountKnown, () => fmt$(portfolioValue, 0))}
        </StatCard>
        <StatCard
          label="Today's P/L"
          delta={<PnLValue text={money(deltaKnown, () => fmtPct(dayPct))} showArrow />}
          sub="unrealized, 24h"
        >
          {money(holdingsLoaded, () => signed$(dayPL, 0))}
        </StatCard>
        <StatCard label="Buying power" sub="available cash">
          {money(accountKnown, () => fmt$(balance, 0))}
        </StatCard>
      </div>

      <div className="panel chart-card">
        <div className="chart-head">
          <div>
            <p className="chart-label">Portfolio value</p>
            <h3 className="chart-value">
              {money(accountKnown, () => fmt$(portfolioValue))}
            </h3>
            <p className="chart-delta">
              <PnLValue
                text={money(deltaKnown, () => `${signed$(dayPL)} (${fmtPct(dayPct)})`)}
              />
              <span className="today">today</span>
            </p>
          </div>
          <div className="range-tabs" role="tablist" aria-label="Chart range">
            {RANGES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                className={range === r ? "range-tab selected" : "range-tab"}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-body">
          {chart === null ? (
            <p className="chart-empty">
              No portfolio history to show yet.
            </p>
          ) : (
          <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[65, 130, 195].map((y) => (
              <line key={y} x1="0" y1={y} x2={CW} y2={y} stroke="#222228" strokeWidth="1" />
            ))}
            <path d={chart.area} fill="url(#pf-fill)" />
            <path
              d={chart.line}
              fill="none"
              stroke={stroke}
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={chart.lx} cy={chart.ly} r="4.5" fill={stroke} stroke="#131316" strokeWidth="2.5" />
          </svg>
          )}
        </div>
      </div>
    </>
  );
};

export default Summary;
