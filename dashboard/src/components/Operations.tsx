import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../config";
import { useRefresh } from "./shared/useRefresh";
import DataTable from "./shared/DataTable";
import { DiagnosticOrder, dateLabel, diagnosticError } from "./OrderDiagnostics";

interface Queue {
  orders: DiagnosticOrder[]; total: number; nextCursor: string; exchangeConfigured: boolean;
  sync: { active: boolean; lastStartedAt: string | null; lastCompletedAt: string | null; lastFailureCode: string | null;
    lastPass: { checked: number; changed: number; failed: number; manualReview: number } | null };
}
const Operations = () => {
  const [data, setData] = useState<Queue | null>(null);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState("");
  const [loadedCursor, setLoadedCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  useRefresh(async signal => {
    try {
      const response = await axios.get<Queue>(`${API_URL}/api/operations/orders`, { withCredentials: true, signal, params: cursor ? { cursor } : {} });
      if (!signal.aborted) { setData(response.data); setLoadedCursor(cursor); setError(""); }
    } catch (err) { if (!signal.aborted) setError(diagnosticError(err, "Could not load operations queue.")); }
  }, `${cursor}:${version}`);
  const loading = loadedCursor !== cursor;
  return <section className="order-operations">
    <h1 className="title">Order operations</h1>
    <p>Unresolved orders across the shared sandbox account, oldest first. Open an order to investigate or schedule a status lookup.</p>
    {error && <p role="alert">{error} <button className="btn btn-grey" onClick={() => setVersion(value => value + 1)}>Retry</button></p>}
    {data && <>
      <p>Unresolved: <strong>{data.total}</strong> · Exchange credentials: {data.exchangeConfigured ? "Configured (connection not verified)" : "Missing"}</p>
      <p>Reconciler: {data.sync.active ? "Running" : "Idle"} · Last completed: {dateLabel(data.sync.lastCompletedAt)}</p>
      {data.sync.lastFailureCode && <p role="status">Last pass issue: {data.sync.lastFailureCode}</p>}
      {data.sync.lastPass && <p>Last pass: {data.sync.lastPass.checked} checked, {data.sync.lastPass.changed} changed, {data.sync.lastPass.failed} failed, {data.sync.lastPass.manualReview} require manual review.</p>}
    </>}
    {!error && <DataTable<DiagnosticOrder> label="Unresolved orders" rows={loading ? [] : data?.orders ?? []}
      rowKey={order => order._id} loading={loading} loadingLabel="Loading unresolved orders…" emptyContent={<p>No unresolved orders.</p>}
      columns={[
        { key: "symbol", label: "Asset" }, { key: "side", label: "Side" }, { key: "status", label: "Status" },
        { key: "createdAt", label: "Created", render: order => dateLabel(order.createdAt) },
        { key: "recoveryMode", label: "Recovery", render: order => order.recoveryMode === "manual_investigation" ? "Manual investigation" : "Automatic lookup" },
        { key: "details", label: "Details", render: order => <Link className="order-detail-link" to={`/orders/${order._id}`} aria-label={`Inspect ${order.symbol} order ${order._id}`}>Inspect</Link> },
      ]} />}
    <nav aria-label="Operations queue pages" className="operations-pages">
      <button className="btn btn-grey" disabled={loading || previous.length === 0} onClick={() => {
        setCursor(previous[previous.length - 1]); setPrevious(previous.slice(0, -1));
      }}>Previous page</button>
      <button className="btn btn-grey" disabled={loading || !data?.nextCursor || Boolean(error)} onClick={() => {
        setPrevious([...previous, cursor]); setCursor(data!.nextCursor);
      }}>Next page</button>
    </nav>
  </section>;
};
export default Operations;
