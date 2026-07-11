import React, { useState, useEffect } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";
import { VerticalGraph } from "./VerticalGraph";

import DataTable, { Column } from "./shared/DataTable";
import EmptyState from "./shared/EmptyState";
import PnLValue from "./shared/PnLValue";
import StatCard from "./shared/StatCard";
import { Holding } from "../types";
import { API_URL } from "../config";

// Safe number formatter — a malformed row (null price/avg) won't blank the page.
const fmt = (n: number | undefined) =>
  typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—";

const fmt$ = (n: number) =>
  typeof n === "number" && !isNaN(n)
    ? "$" +
      n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";

// Live price falls back to avg cost until the backend cache has a tick.
const priceOf = (h: Holding) => h.price ?? h.avgCost;
const pnlOf = (h: Holding) => priceOf(h) * h.qty - h.avgCost * h.qty;

const columns: Column<Holding>[] = [
  { key: "symbol", label: "Asset" },
  { key: "qty", label: "Qty." },
  { key: "avgCost", label: "Avg. cost", render: (h) => fmt(h.avgCost) },
  { key: "price", label: "Price", render: (h) => fmt(priceOf(h)) },
  { key: "curVal", label: "Cur. val", render: (h) => fmt(priceOf(h) * h.qty) },
  {
    key: "pnl",
    label: "P&L",
    render: (h) => <PnLValue value={pnlOf(h)} />,
  },
  {
    key: "day",
    label: "24h chg.",
    render: (h) =>
      typeof h.dayChangePct === "number" ? (
        <PnLValue
          text={`${h.dayChangePct >= 0 ? "+" : ""}${h.dayChangePct.toFixed(2)}%`}
          showArrow
        />
      ) : (
        "—"
      ),
  },
];

const Holdings = () => {
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    // During the ?token= login handoff the first render has no cookie yet;
    // stay in the loading state until Home.tsx stores it and this re-runs.
    if (!cookies.token) return;
    let cancelled = false;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      axios
        .get<Holding[]>(`${API_URL}/allHoldings`, {
          params: { token: cookies.token },
          withCredentials: true,
        })
        .then((res) => {
          if (!cancelled) setAllHoldings(res.data);
        })
        .catch((err) => {
          console.error("Failed to load holdings:", err);
          if (showSpinner) toast.error("Could not load holdings.");
        })
        .finally(() => {
          if (showSpinner && !cancelled) setLoading(false);
        });
    };
    load(true);
    // Refresh quietly so live prices and new fills show up while the page is open.
    const timer = setInterval(() => load(false), 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cookies.token]);

  const labels = allHoldings.map((h) => h.symbol);

  const totalInvestment = allHoldings.reduce(
    (sum, h) => sum + h.avgCost * h.qty,
    0
  );
  const totalCurrent = allHoldings.reduce(
    (sum, h) => sum + priceOf(h) * h.qty,
    0
  );
  const totalPnl = totalCurrent - totalInvestment;
  const totalPnlPercent =
    totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

  const data = {
    labels,
    datasets: [
      {
        label: "Value (USD)",
        data: allHoldings.map((h) => priceOf(h) * h.qty),
        backgroundColor: "#e50914",
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };

  return (
    <>
      <h3 className="title">Holdings ({allHoldings.length})</h3>

      <DataTable
        columns={columns}
        rows={allHoldings}
        rowKey={(h) => h.symbol}
        loading={loading}
        loadingLabel="Loading holdings…"
        emptyContent={
          <EmptyState message="You don't have any holdings yet. Buy your first crypto from the watchlist." />
        }
      />

      <div className="row">
        <StatCard label="Total investment">{fmt$(totalInvestment)}</StatCard>
        <StatCard label="Current value">{fmt$(totalCurrent)}</StatCard>
        <StatCard label="P&L">
          <PnLValue value={totalPnl} percent={totalPnlPercent} showArrow />
        </StatCard>
      </div>
      <div className="panel chart-panel">
        <VerticalGraph data={data} />
      </div>
    </>
  );
};

export default Holdings;
