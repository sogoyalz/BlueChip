import React, { useState, useEffect, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";

import DataTable, { Column } from "./shared/DataTable";
import EmptyState from "./shared/EmptyState";
import ConfirmDialog from "./shared/ConfirmDialog";
import GeneralContext from "./GeneralContext";
import { Order, OrderStatus } from "../types";
import { API_URL } from "../config";
import { num } from "./shared/format";


const STATUS_CLASS: Record<OrderStatus, string> = {
  FILLED: "filled",
  PARTIALLY_FILLED: "filled",
  OPEN: "open",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
};

const Orders = () => {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchOrders = useCallback((showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    axios
      .get<Order[]>(`${API_URL}/api/orders`, {
        withCredentials: true,
      })
      .then((res) => setAllOrders(res.data))
      .catch((err) => {
        console.error("Failed to load orders:", err);
        if (showSpinner) {
          toast.error("Could not load orders.", { toastId: "orders-error" });
        }
      })
      .finally(() => {
        if (showSpinner) setLoading(false);
      });
  }, []);

  // Refetch as soon as an order is accepted, rather than waiting up to 10s for
  // the next poll and leaving the user wondering where it went.
  const { orderVersion } = useContext(GeneralContext);
  useEffect(() => {
    if (orderVersion > 0) fetchOrders(false);
  }, [orderVersion, fetchOrders]);

  useEffect(() => {
    // Auth rides the httpOnly cookie; this component only mounts once the
    // session is verified, so no per-render token guard is needed.
    fetchOrders(true);
    // Quiet refresh so limit fills show up while watching.
    const timer = setInterval(() => fetchOrders(false), 10000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  // The order awaiting confirmation, and the one currently being cancelled.
  // Separate, because the dialog stays open and disabled while in flight.
  const [pendingCancel, setPendingCancel] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async (order: Order) => {
    setCancelling(true);
    try {
      const { data } = await axios.post<{ order: Order }>(
        `${API_URL}/api/orders/${order._id}/cancel`,
        {},
        { withCredentials: true }
      );
      // The exchange is the source of truth: an order can fill in the moment
      // before the cancel lands, and the route returns 200 saying so. Reporting
      // that as "Cancelled" would tell the user the opposite of what happened.
      if (data.order?.status === "FILLED") {
        toast.info(`${order.symbol} filled before the cancel reached the exchange`);
      } else {
        toast.success(`Cancelled ${order.symbol} limit order`);
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message
        : undefined;
      toast.error(message || "Could not cancel order.");
    } finally {
      setCancelling(false);
      setPendingCancel(null);
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
    {
      key: "qty",
      label: "Qty.",
      // Keyed off what actually executed rather than the status label: an order
      // can carry a partial fill under PARTIALLY_FILLED, under CANCELLED (the
      // cancel landed after part of it traded), or under OPEN (a resting limit
      // that partly crossed). In every one of those the requested amount alone
      // hides a real trade.
      render: (o) =>
        o.status !== "FILLED" &&
        typeof o.filledQty === "number" &&
        o.filledQty < o.qty
          ? `${o.filledQty} / ${o.qty}`
          : o.qty,
    },
    {
      key: "price",
      label: "Price",
      render: (o) => {
        // A resting order's own price is the relevant one; the qty column
        // carries any partial fill it has taken so far.
        if (o.status === "OPEN") {
          return o.type === "LIMIT" ? `${num(o.limitPrice)} (limit)` : "—";
        }
        // Otherwise, if any of it traded, the price it traded at is the fact.
        if (typeof o.fillPrice === "number") return num(o.fillPrice);
        return o.type === "LIMIT" ? `${num(o.limitPrice)} (limit)` : "—";
      },
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
          <button
            className="btn btn-grey btn-small"
            aria-label={`Cancel ${o.side.toLowerCase()} order for ${o.qty} ${o.symbol}`}
            onClick={() => setPendingCancel(o)}
          >
            Cancel
          </button>
        ) : null,
    },
  ];

  const openCount = allOrders.filter((o) => o.status === "OPEN").length;

  return (
    <>
      <h1 className="title">
        Orders ({allOrders.length}){openCount > 0 && ` · ${openCount} open`}
      </h1>

      <DataTable
        label="Your orders"
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

      {pendingCancel && (
        <ConfirmDialog
          title="Cancel this order?"
          destructive
          pending={cancelling}
          confirmLabel="Cancel order"
          pendingLabel="Cancelling…"
          cancelLabel="Keep it"
          body={
            <>
              This cannot be undone. The order is resting on the exchange and may
              still fill before the cancellation reaches it.
              <span className="confirm-detail">
                {pendingCancel.side} {pendingCancel.qty} {pendingCancel.symbol}
                {typeof pendingCancel.limitPrice === "number"
                  ? ` at ${num(pendingCancel.limitPrice)}`
                  : ""}
              </span>
            </>
          }
          onConfirm={() => handleCancel(pendingCancel)}
          onDismiss={() => setPendingCancel(null)}
        />
      )}
    </>
  );
};

export default Orders;
