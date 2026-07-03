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

// Safe number formatter — a malformed row (null price/avg) won't blank the page.
const fmt = (n: number) => (typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—");

const pnlOf = (stock: Holding) => stock.price * stock.qty - stock.avg * stock.qty;

const columns: Column<Holding>[] = [
  { key: "name", label: "Instrument" },
  { key: "qty", label: "Qty." },
  { key: "avg", label: "Avg. cost", render: (s) => fmt(s.avg) },
  { key: "price", label: "LTP", render: (s) => fmt(s.price) },
  { key: "curVal", label: "Cur. val", render: (s) => fmt(s.price * s.qty) },
  {
    key: "pnl",
    label: "P&L",
    render: (s) => <PnLValue value={pnlOf(s)} />,
  },
  {
    key: "net",
    label: "Net chg.",
    render: (s) => <PnLValue text={s.net} />,
  },
  {
    key: "day",
    label: "Day chg.",
    render: (s) => <PnLValue text={s.day} showArrow />,
  },
];

const Holdings = () => {
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    setLoading(true);
    axios
      .get<Holding[]>("http://localhost:3002/allHoldings", {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAllHoldings(res.data))
      .catch((err) => {
        console.error("Failed to load holdings:", err);
        toast.error("Could not load holdings.");
      })
      .finally(() => setLoading(false));
  }, [cookies.token]);

  const labels = allHoldings.map((stock) => stock.name);

  const totalInvestment = allHoldings.reduce(
    (sum, stock) => sum + stock.avg * stock.qty,
    0
  );
  const totalCurrent = allHoldings.reduce(
    (sum, stock) => sum + stock.price * stock.qty,
    0
  );
  const totalPnl = totalCurrent - totalInvestment;
  const totalPnlPercent =
    totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

  const data = {
    labels,
    datasets: [
      {
        label: "Price",
        data: allHoldings.map((stock) => stock.price),
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
        rowKey={(stock) => stock.name}
        loading={loading}
        loadingLabel="Loading holdings…"
        emptyContent={
          <EmptyState message="You don't have any holdings yet." />
        }
      />

      <div className="row">
        <StatCard label="Total investment">{fmt(totalInvestment)}</StatCard>
        <StatCard label="Current value">{fmt(totalCurrent)}</StatCard>
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
