import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import DataTable, { Column } from "./shared/DataTable";
import EmptyState from "./shared/EmptyState";
import { Order } from "../types";

const fmt = (n: number) => (typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—");

const columns: Column<Order>[] = [
  { key: "name", label: "Instrument" },
  { key: "qty", label: "Qty." },
  { key: "price", label: "Price", render: (o) => fmt(Number(o.price)) },
  {
    key: "mode",
    label: "Mode",
    render: (o) => (
      <span className={`mode-chip ${o.mode === "BUY" ? "buy" : "sell"}`}>
        {o.mode}
      </span>
    ),
  },
];

const Orders = () => {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    axios
      .get<Order[]>("http://localhost:3002/allOrders", {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAllOrders(res.data))
      .catch((err) => {
        console.error("Failed to load orders:", err);
        toast.error("Could not load orders.");
      })
      .finally(() => setLoading(false));
  }, [cookies.token]);

  return (
    <>
      <h3 className="title">Orders ({allOrders.length})</h3>

      <DataTable
        columns={columns}
        rows={allOrders}
        loading={loading}
        loadingLabel="Loading orders…"
        emptyContent={
          <EmptyState
            message="You haven't placed any orders today"
            actionLabel="Get started"
            onAction={() => navigate("/")}
          />
        }
      />
    </>
  );
};

export default Orders;
