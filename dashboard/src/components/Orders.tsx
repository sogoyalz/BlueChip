import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import DataTable, { Column } from "./shared/DataTable";
import EmptyState from "./shared/EmptyState";
import PnLValue from "./shared/PnLValue";
import { Order, OrderStatus } from "../types";
import { API_URL } from "../config";

const fmt = (n: number | undefined) =>
  typeof n === "number" && !isNaN(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const STATUS_CLASS: Record<OrderStatus, string> = {
  FILLED: "filled",
  OPEN: "open",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
};

const Orders = () => {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cookies] = useCookies(["token"]);
  const navigate = useNavigate();

  const fetchOrders = useCallback(
    (showSpinner: boolean) => {
      if (!cookies.token) return;
      if (showSpinner) setLoading(true);
      axios
        .get<Order[]>(`${API_URL}/api/orders`, {
          params: { token: cookies.token },
          withCredentials: true,
        })
        .then((res) => setAllOrders(res.data))
        .catch((err) => {
          console.error("Failed to load orders:", err);
          if (showSpinner) toast.error("Could not load orders.");
        })
        .finally(() => {
          if (showSpinner) setLoading(false);
        });
    },
    [cookies.token]
  );

  useEffect(() => {
    // During the ?token= login handoff the first render has no cookie yet;
    // stay in the loading state until Home.tsx stores it and this re-runs.
    if (!cookies.token) return;
    fetchOrders(true);
    // Quiet refresh so limit fills by the matcher show up while watching.
    const timer = setInterval(() => fetchOrders(false), 10000);
    return () => clearInterval(timer);
  }, [cookies.token, fetchOrders]);

  const handleCancel = async (order: Order) => {
    try {
      await axios.post(
        `${API_URL}/api/orders/${order._id}/cancel`,
        {},
        { params: { token: cookies.token }, withCredentials: true }
      );
      toast.success(`Cancelled ${order.symbol} limit order`);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message
        : undefined;
      toast.error(message || "Could not cancel order.");
    }
    fetchOrders(false);
  };

  const columns: Column<Order>[] = [
    { key: "symbol", label: "Asset" },
    { key: "type", label: "Type" },
    {
      key: "side",
      label: "Side",
      render: (o) => (
        <span className={`mode-chip ${o.side === "BUY" ? "buy" : "sell"}`}>
          {o.side}
        </span>
      ),
    },
    { key: "qty", label: "Qty." },
    {
      key: "price",
      label: "Price",
      render: (o) =>
        o.status === "FILLED"
          ? fmt(o.fillPrice)
          : o.type === "LIMIT"
            ? `${fmt(o.limitPrice)} (limit)`
            : "—",
    },
    {
      key: "pnl",
      label: "Realized P&L",
      render: (o) =>
        o.side === "SELL" && o.status === "FILLED" && o.realizedPnl !== undefined ? (
          <PnLValue value={o.realizedPnl} showArrow />
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (o) => (
        <span
          className={`status-chip ${STATUS_CLASS[o.status]}`}
          title={o.status === "REJECTED" ? o.reason : undefined}
        >
          {o.status}
        </span>
      ),
    },
    {
      key: "time",
      label: "Time",
      render: (o) =>
        new Date(o.filledAt ?? o.createdAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      key: "actions",
      label: "",
      render: (o) =>
        o.status === "OPEN" ? (
          <button className="btn btn-grey btn-small" onClick={() => handleCancel(o)}>
            Cancel
          </button>
        ) : null,
    },
  ];

  const openCount = allOrders.filter((o) => o.status === "OPEN").length;

  return (
    <>
      <h3 className="title">
        Orders ({allOrders.length}){openCount > 0 && ` · ${openCount} open`}
      </h3>

      <DataTable
        columns={columns}
        rows={allOrders}
        rowKey={(o) => o._id}
        loading={loading}
        loadingLabel="Loading orders…"
        emptyContent={
          <EmptyState
            message="You haven't placed any orders yet"
            actionLabel="Get started"
            onAction={() => navigate("/")}
          />
        }
      />
    </>
  );
};

export default Orders;
