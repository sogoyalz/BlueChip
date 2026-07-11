import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import PnLValue from "./shared/PnLValue";
import StatCard from "./shared/StatCard";
import { linePath } from "./shared/Sparkline";
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

const STARTING_CASH = 100000;

const RANGES = ["1D", "1W", "1M", "ALL"] as const;

interface HistoryPoint {
  ts: number;
  value: number;
}

// Chart geometry (SVG user units; the svg itself is fluid).
const CW = 760;
const CH = 260;

const Summary = () => {
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    // During the ?token= login handoff the first render has no cookie yet;
    // fetching then would just toast an error. The effect re-runs once
    // Home.tsx stores the cookie.
    if (!cookies.token) return;
    const opts = { params: { token: cookies.token }, withCredentials: true };
    axios
      .get<Holding[]>(`${API_URL}/allHoldings`, opts)
      .then((res) => setAllHoldings(res.data))
      .catch((err) => {
        console.error("Failed to load holdings summary:", err);
        toast.error("Could not load holdings summary.");
      });
    axios
      .get<Account>(`${API_URL}/api/account`, opts)
      .then((res) => setAccount(res.data))
      .catch((err) => console.error("Failed to load account:", err));
  }, [cookies.token]);

  useEffect(() => {
    if (!cookies.token) return;
    axios
      .get<{ points: HistoryPoint[] }>(`${API_URL}/api/portfolio/history`, {
        params: { token: cookies.token, range },
        withCredentials: true,
      })
      .then((res) => setHistory(res.data.points))
      .catch((err) => console.error("Failed to load portfolio history:", err));
  }, [cookies.token, range]);

  const investment = allHoldings.reduce(
    (sum, h) => sum + h.avgCost * h.qty,
    0
  );
  const currentValue = allHoldings.reduce(
    (sum, h) => sum + (h.price ?? h.avgCost) * h.qty,
    0
  );

  // Today's move, approximated from each holding's 24h-change percentage.
  const dayPL = allHoldings.reduce(
    (sum, h) =>
      sum + (h.price ?? h.avgCost) * h.qty * ((h.dayChangePct ?? 0) / 100),
    0
  );
  const dayPct = currentValue > 0 ? (dayPL / (currentValue - dayPL)) * 100 : 0;

  const balance = account?.balance ?? 0;
  const portfolioValue = account?.portfolioValue ?? currentValue + balance;
  const totalReturn = portfolioValue - STARTING_CASH;
  const totalReturnPct = (totalReturn / STARTING_CASH) * 100;

  // Real snapshot history; a brand-new account renders a flat baseline.
  const chart = useMemo(() => {
    let series = history.map((p) => p.value);
    if (series.length < 2) {
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
  }, [history, portfolioValue]);

  const stroke = chart.up ? "#00c853" : "#ff5252"; // --gain / --loss

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <div className="dash-header">
        <div>
          <h2 className="dash-title">
            Hi, {account?.username ?? "trader"}!
          </h2>
          <p className="dash-date">{dateStr} · Crypto markets never close</p>
        </div>
      </div>

      <div className="row cols-4">
        <StatCard
          label="Portfolio value"
          delta={<PnLValue text={fmtPct(dayPct)} />}
          sub="cash + holdings"
        >
          {fmt$(portfolioValue, 0)}
        </StatCard>
        <StatCard
          label="Today's P/L"
          delta={<PnLValue text={fmtPct(dayPct)} showArrow />}
          sub="unrealized, 24h"
        >
          {signed$(dayPL, 0)}
        </StatCard>
        <StatCard
          label="Total return"
          delta={<PnLValue text={fmtPct(totalReturnPct)} showArrow />}
          sub="since you started"
        >
          {signed$(totalReturn, 0)}
        </StatCard>
        <StatCard label="Buying power" sub="available cash">
          {fmt$(balance, 0)}
        </StatCard>
      </div>

      <div className="panel chart-card">
        <div className="chart-head">
          <div>
            <p className="chart-label">Portfolio value</p>
            <h3 className="chart-value">{fmt$(portfolioValue)}</h3>
            <p className="chart-delta">
              <PnLValue text={`${signed$(dayPL)} (${fmtPct(dayPct)})`} />
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
        </div>
      </div>
    </>
  );
};

export default Summary;
