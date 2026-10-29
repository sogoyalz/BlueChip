import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../config";
import { Order } from "../types";
import { useRefresh } from "./shared/useRefresh";
import { price } from "./shared/format";

export interface DiagnosticOrder extends Order {
  ownerId?: string;
  clientOrderId?: string;
  exchangeClientOrderId?: string;
  submittedAmount?: string;
  submittedPrice?: string;
  lastCheckedAt?: string;
  nextCheckAt?: string;
  reconciliationAttempts: number;
  reconciliationMessage?: string;
  recoveryMode: "observed" | "automatic_lookup" | "manual_investigation";
  recentEvents: { kind: string; at: string; status?: string; filledQty?: number; note?: string }[];
}
export const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not yet recorded";
export const diagnosticError = (error: unknown, fallback: string): string => axios.isAxiosError(error)
  ? error.response?.data?.message || fallback : fallback;

const OrderDiagnostics = () => {
  const { id } = useParams();
  const [data, setData] = useState<{ order: DiagnosticOrder; isOperator: boolean } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  // Key data by ID so a slow route change can never display another order.
  const [loadedId, setLoadedId] = useState<string>();
  useRefresh(async signal => {
    try {
      const response = await axios.get(`${API_URL}/api/orders/${encodeURIComponent(id ?? "")}/diagnostics`, { withCredentials: true, signal });
      if (!signal.aborted) { setData(response.data); setLoadedId(id); setError(""); }
    } catch (err) { if (!signal.aborted) setError(diagnosticError(err, "Could not load order diagnostics.")); }
  }, `${id}:${version}`);
  const order = loadedId === id ? data?.order : undefined;
  const recheck = async () => {
    setBusy(true); setNotice("");
    try {
      const response = await axios.post(`${API_URL}/api/operations/orders/${id}/reconcile`, {}, { withCredentials: true });
      setNotice(response.data.message); setVersion(value => value + 1);
    } catch (err) { setNotice(diagnosticError(err, "Could not schedule lookup.")); }
    finally { setBusy(false); }
  };
  return <section className="order-diagnostics">
    <Link className="order-detail-link" to="/orders">← Orders</Link>
    <h1 className="title">Order details</h1>
    {error && <p role="alert">{error} <button className="btn btn-grey" onClick={() => setVersion(value => value + 1)}>Retry</button></p>}
    {!order && !error && <p role="status">Loading order details…</p>}
    {order && <>
      <h2>{order.side} {order.qty} {order.symbol}</h2>
      <p>Status: <strong>{order.status}</strong> · {order.type}</p>
      {order.status === "PENDING" || order.status === "UNKNOWN" ? <p role="status">
        Awaiting exchange confirmation. Do not place a replacement order.
        {order.recoveryMode === "manual_investigation" ? " An exchange identifier is missing; an operator must investigate." : " The server will keep looking up the original order."}
      </p> : null}
      {order.reconciliationMessage && <p>{order.reconciliationMessage}</p>}
      <dl className="diagnostic-facts">
        <dt>Created</dt><dd>{dateLabel(order.createdAt)}</dd>
        <dt>Executed quantity</dt><dd>{order.filledQty ?? 0}</dd>
        <dt>Execution price</dt><dd>{price(order.fillPrice, 18)}</dd>
        <dt>Submitted amount / price</dt><dd>{order.submittedAmount ?? "Not recorded"} / {order.submittedPrice ?? "Not recorded"}</dd>
        <dt>Order reference</dt><dd>{order._id}</dd>
        <dt>Exchange reference</dt><dd>{order.geminiOrderId ?? "Not yet confirmed"}</dd>
        <dt>Exchange client reference</dt><dd>{order.exchangeClientOrderId ?? "Not recorded"}</dd>
        <dt>Last lookup</dt><dd>{dateLabel(order.lastCheckedAt)}</dd>
        <dt>Next lookup</dt><dd>{["PENDING", "UNKNOWN", "OPEN", "PARTIALLY_FILLED"].includes(order.status) ? dateLabel(order.nextCheckAt) : "Complete"}</dd>
        <dt>Recorded reconciliation attempts</dt><dd>{order.reconciliationAttempts}</dd>
      </dl>
      {data?.isOperator && ["PENDING", "UNKNOWN"].includes(order.status) && order.recoveryMode === "automatic_lookup" &&
        <button className="btn btn-grey" onClick={recheck} disabled={busy}>{busy ? "Scheduling…" : "Schedule status lookup"}</button>}
      {notice && <p role="status">{notice}</p>}
      <h2>Recent activity</h2>
      <p>Up to 50 recent local events are retained. Older orders may have no recorded activity. Times show when this server recorded an event.</p>
      {order.recentEvents.length === 0 ? <p>No recorded activity.</p> : <ol className="order-timeline">
        {[...order.recentEvents].reverse().map((event, index) => <li key={`${event.at}:${index}`}>
          <time dateTime={event.at}>{dateLabel(event.at)}</time>{" · "}
          {event.kind.toLowerCase().replaceAll("_", " ")}{event.status ? ` · ${event.status}` : ""}
          {event.filledQty !== undefined ? ` · executed ${event.filledQty}` : ""}
          {event.note && <p>{event.note}</p>}
        </li>)}
      </ol>}
    </>}
  </section>;
};
export default OrderDiagnostics;
