import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axios from "axios";
import OrderDiagnostics, { DiagnosticOrder } from "./OrderDiagnostics";
import Operations from "./Operations";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn() } }));
const get = vi.mocked(axios.get), post = vi.mocked(axios.post);
const order: DiagnosticOrder = {
  _id: "o1", symbol: "BTCUSD", side: "BUY", type: "LIMIT", qty: 0.1, status: "UNKNOWN",
  createdAt: "2026-01-01", reconciliationAttempts: 2, recoveryMode: "automatic_lookup", exchangeClientOrderId: "original-exchange-id",
  recentEvents: [{ kind: "INTENT_RECORDED", at: "2026-01-01", status: "PENDING" }],
};
const renderDetails = () => render(<MemoryRouter initialEntries={["/orders/o1"]}>
  <Routes><Route path="/orders/:id" element={<OrderDiagnostics />} /></Routes>
</MemoryRouter>);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(axios.isAxiosError).mockReturnValue(false); });

test("the owner sees original references and a warning, without operator controls", async () => {
  get.mockResolvedValue({ data: { order, isOperator: false } }); renderDetails();
  expect(await screen.findByText(/Do not place a replacement/)).toBeInTheDocument();
  expect(screen.getByText("original-exchange-id")).toBeInTheDocument();
  expect(screen.getByText(/intent recorded/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Schedule status lookup/ })).not.toBeInTheDocument();
});

test("only an operator can schedule a lookup and sees the server result", async () => {
  get.mockResolvedValue({ data: { order, isOperator: true } });
  post.mockResolvedValue({ data: { message: "Status lookup scheduled. The order will not be resubmitted." } }); renderDetails();
  fireEvent.click(await screen.findByRole("button", { name: "Schedule status lookup" }));
  expect(await screen.findByText(/Status lookup scheduled/)).toBeInTheDocument();
  expect(post).toHaveBeenCalledWith(expect.stringContaining("/api/operations/orders/o1/reconcile"), {}, { withCredentials: true });
});

test("missing identifiers explain manual investigation and disable automatic action", async () => {
  get.mockResolvedValue({ data: { order: { ...order, recoveryMode: "manual_investigation", recentEvents: [] }, isOperator: true } }); renderDetails();
  expect(await screen.findByText(/operator must investigate/)).toBeInTheDocument();
  expect(screen.getByText("No recorded activity.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Schedule status lookup" })).not.toBeInTheDocument();
});

test("a failed detail request has a working retry", async () => {
  get.mockRejectedValueOnce(new Error()); renderDetails();
  const alert = await screen.findByRole("alert"); expect(alert).toHaveTextContent("Could not load order diagnostics");
  get.mockResolvedValue({ data: { order, isOperator: false } }); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("original-exchange-id")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});

test("operator queue shows lookup health and navigates cursor pages", async () => {
  get.mockResolvedValue({ data: { orders: [order], total: 51, nextCursor: "next", exchangeConfigured: false,
    sync: { active: false, lastCompletedAt: null, lastFailureCode: "exchange_unavailable", lastPass: { checked: 0, changed: 0, failed: 0, manualReview: 0 } } } });
  render(<MemoryRouter><Operations /></MemoryRouter>);
  expect(await screen.findByRole("table", { name: "Unresolved orders" })).toBeInTheDocument();
  await screen.findByText("BTCUSD"); expect(screen.getByText(/Exchange credentials: Missing/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.stringContaining("/api/operations/orders"), expect.objectContaining({ params: { cursor: "next" } })));
});

test("a denied operator request displays the backend error and no queue", async () => {
  vi.mocked(axios.isAxiosError).mockReturnValue(true);
  get.mockRejectedValue({ response: { status: 403, data: { message: "Operator access required" } } });
  render(<MemoryRouter><Operations /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Operator access required");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
