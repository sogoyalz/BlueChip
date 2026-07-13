import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { VerticalGraph } from "./VerticalGraph";

import DataTable, { Column } from "./shared/DataTable";
import EmptyState from "./shared/EmptyState";
import PnLValue from "./shared/PnLValue";
import StatCard from "./shared/StatCard";
import { Holding } from "../types";
import { API_URL } from "../config";

// Safe number formatter — a malformed row (null price) won't blank the page.
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

const columns: Column<Holding>[] = [
  { key: "symbol", label: "Asset" },
  { key: "qty", label: "Qty." },
  { key: "price", label: "Price", render: (h) => fmt(h.price) },
  { key: "curVal", label: "Cur. val", render: (h) => fmt((h.price ?? 0) * h.qty) },
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
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auth rides the httpOnly cookie (withCredentials); this component only
    // mounts after Home.tsx has verified the session.
    let cancelled = false;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      axios
        .get<Holding[]>(`${API_URL}/api/holdings`, {
          withCredentials: true,
        })
        .then((res) => {
          if (!cancelled) setHoldings(res.data);
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
  }, []);

  const labels = holdings.map((h) => h.symbol);

  const totalCurrent = holdings.reduce(
    (sum, h) => sum + (h.price ?? 0) * h.qty,
    0
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Value (USD)",
        data: holdings.map((h) => (h.price ?? 0) * h.qty),
        backgroundColor: "#e50914",
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };

  return (
    <>
      <h3 className="title">Holdings ({holdings.length})</h3>

      <DataTable
        columns={columns}
        rows={holdings}
        rowKey={(h) => h.symbol}
        loading={loading}
        loadingLabel="Loading holdings…"
        emptyContent={
          <EmptyState message="No holdings yet. Buy the first crypto from the watchlist." />
        }
      />

      <div className="row">
        <StatCard label="Current value">{fmt$(totalCurrent)}</StatCard>
      </div>
      <div className="panel chart-panel">
        <VerticalGraph data={data} />
      </div>
    </>
  );
};

export default Holdings;
