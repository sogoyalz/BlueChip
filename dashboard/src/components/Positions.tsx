import React, { useState, useEffect } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import DataTable, { Column } from "./shared/DataTable";
import EmptyState from "./shared/EmptyState";
import PnLValue from "./shared/PnLValue";
import { Position } from "../types";

const fmt = (n: number) => (typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—");

const columns: Column<Position>[] = [
  { key: "product", label: "Product" },
  { key: "name", label: "Instrument", cellClass: () => "align-left" },
  { key: "qty", label: "Qty." },
  { key: "avg", label: "Avg.", render: (s) => fmt(s.avg) },
  { key: "price", label: "LTP", render: (s) => fmt(s.price) },
  {
    key: "pnl",
    label: "P&L",
    render: (s) => <PnLValue value={s.price * s.qty - s.avg * s.qty} />,
  },
  {
    key: "day",
    label: "Chg.",
    render: (s) => <PnLValue text={s.day} showArrow />,
  },
];

const Positions = () => {
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    setLoading(true);
    axios
      .get<Position[]>("http://localhost:3002/allPositions", {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAllPositions(res.data))
      .catch((err) => {
        console.error("Failed to load positions:", err);
        toast.error("Could not load positions.");
      })
      .finally(() => setLoading(false));
  }, [cookies.token]);

  return (
    <>
      <h3 className="title">Positions ({allPositions.length})</h3>

      <DataTable
        columns={columns}
        rows={allPositions}
        loading={loading}
        loadingLabel="Loading positions…"
        emptyContent={
          <EmptyState message="You don't have any open positions." />
        }
      />
    </>
  );
};

export default Positions;
