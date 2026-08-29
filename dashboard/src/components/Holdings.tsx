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
import { num, usd } from "./shared/format";


const columns: Column<Holding>[] = [
  { key: "symbol", label: "Asset" },
  { key: "qty", label: "Qty." },
  { key: "price", label: "Price", render: (h) => num(h.price) },
  { key: "curVal", label: "Cur. val", render: (h) => num((h.price ?? 0) * h.qty) },
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
  // Whether we have ever actually received holdings. An empty array is a real
  // "no positions"; a failed request is "we don't know", and in a trading UI
  // those must not render as the same thing. Sticky once true, so a failed
  // background refresh doesn't blank a page that already has good data.
  const [loaded, setLoaded] = useState(false);
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
          if (!cancelled) {
            setHoldings(res.data);
            setLoaded(true);
          }
        })
        .catch((err) => {
          console.error("Failed to load holdings:", err);
          if (showSpinner) {
            toast.error("Could not load holdings.", { toastId: "holdings-error" });
          }
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
      <h1 className="title">Holdings{loaded ? ` (${holdings.length})` : ""}</h1>

      <DataTable
        label="Your holdings"
        columns={columns}
        rows={holdings}
        rowKey={(h) => h.symbol}
        loading={loading}
        loadingLabel="Loading holdings…"
        emptyContent={
          loaded ? (
            <EmptyState message="No holdings yet. Buy the first crypto from the watchlist." />
          ) : (
            <EmptyState message="Couldn't load holdings. Retrying…" />
          )
        }
      />

      <div className="row">
        <StatCard label="Current value">
          {loaded ? usd(totalCurrent) : "—"}
        </StatCard>
      </div>
      <div className="panel chart-panel">
        <VerticalGraph data={data} />
      </div>
    </>
  );
};

export default Holdings;
