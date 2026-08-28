import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";

import Orders from "./Orders";
import { Order } from "../types";

// react-router v7's entrypoint doesn't resolve under CRA's jest config, and
// Orders only needs useNavigate (for the empty-state action).
jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), isAxiosError: jest.fn() },
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

const mockedGet = axios.get as jest.Mock;
const mockedPost = axios.post as jest.Mock;

const order = (fields: Partial<Order>): Order => ({
  _id: "o1",
  symbol: "BTCUSD",
  side: "BUY",
  type: "LIMIT",
  status: "OPEN",
  qty: 1,
  createdAt: new Date().toISOString(),
  ...fields,
});

const renderOrders = (rows: Order[]) => {
  mockedGet.mockResolvedValue({ data: rows });
  return render(<Orders />);
};

beforeEach(() => {
  jest.clearAllMocks();
  (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
  // Cancelling asks for confirmation; assume "yes" unless a test says otherwise.
  window.confirm = jest.fn(() => true);
});

describe("Orders partial-fill reporting", () => {
  test("shows the executed amount on a PARTIALLY_FILLED order", async () => {
    renderOrders([
      order({ status: "PARTIALLY_FILLED", qty: 1, filledQty: 0.4, fillPrice: 50000 }),
    ]);
    expect(await screen.findByText("0.4 / 1")).toBeInTheDocument();
    expect(screen.getByText("50,000.00")).toBeInTheDocument();
  });

  test("shows the executed amount on a CANCELLED order that partly filled first", async () => {
    // The cancel landed after 0.4 had already traded. Showing "1" and the limit
    // price would tell the user nothing executed, which is false.
    renderOrders([
      order({ status: "CANCELLED", qty: 1, filledQty: 0.4, fillPrice: 50000, limitPrice: 49000 }),
    ]);
    expect(await screen.findByText("0.4 / 1")).toBeInTheDocument();
    expect(screen.getByText("50,000.00")).toBeInTheDocument();
    expect(screen.queryByText("49,000.00 (limit)")).not.toBeInTheDocument();
  });

  test("a cancelled order that never filled still shows its limit price", async () => {
    renderOrders([order({ status: "CANCELLED", qty: 1, limitPrice: 49000 })]);
    expect(await screen.findByText("49,000.00 (limit)")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  test("a fully FILLED order shows the plain quantity", async () => {
    renderOrders([order({ status: "FILLED", qty: 1, filledQty: 1, fillPrice: 50000 })]);
    await screen.findByText("50,000.00");
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
  });

  test("a resting order keeps showing its limit price, with the partial in the qty column", async () => {
    renderOrders([
      order({ status: "OPEN", qty: 1, filledQty: 0.2, fillPrice: 49000, limitPrice: 49000 }),
    ]);
    expect(await screen.findByText("0.2 / 1")).toBeInTheDocument();
    expect(screen.getByText("49,000.00 (limit)")).toBeInTheDocument();
  });
});

describe("Orders cancel confirmation", () => {
  test("declining the confirmation cancels nothing", async () => {
    // Cancelling is irreversible and sits one click from every resting row, so
    // it must not be possible to trigger it by a stray click.
    window.confirm = jest.fn(() => false);
    renderOrders([order({ status: "OPEN", qty: 1, limitPrice: 49000 })]);
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("the prompt names the order being cancelled", async () => {
    renderOrders([order({ status: "OPEN", side: "BUY", qty: 1, symbol: "BTCUSD", limitPrice: 49000 })]);
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("BTCUSD"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("buy"));
  });
});

describe("Orders cancel outcome", () => {
  test("reports a fill when the order filled before the cancel landed", async () => {
    renderOrders([order({ status: "OPEN", qty: 1, limitPrice: 49000 })]);
    await screen.findByRole("button", { name: /cancel/i });
    mockedPost.mockResolvedValue({ data: { order: order({ status: "FILLED" }) } });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("filled before the cancel"))
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  test("reports a cancel when the order really was cancelled", async () => {
    renderOrders([order({ status: "OPEN", qty: 1, limitPrice: 49000 })]);
    await screen.findByRole("button", { name: /cancel/i });
    mockedPost.mockResolvedValue({ data: { order: order({ status: "CANCELLED" }) } });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Cancelled"))
    );
  });
});
