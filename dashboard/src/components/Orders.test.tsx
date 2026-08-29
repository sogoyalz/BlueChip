import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";

import Orders from "./Orders";
import { Order } from "../types";
import type { Mock } from "vitest";

// react-router v7's entrypoint doesn't resolve under CRA's jest config, and
// Orders only needs useNavigate (for the empty-state action).
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("axios", () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn() },
}));

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const mockedGet = axios.get as Mock;
const mockedPost = axios.post as Mock;

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
  vi.clearAllMocks();
  (axios.isAxiosError as unknown as Mock).mockReturnValue(false);
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

describe("the order count in the heading", () => {
  test("uses the backend's total, not the size of the page returned", async () => {
    // The API caps the list at 100 newest-first, so rendering the array's
    // length told a user with 150 orders they had 100.
    mockedGet.mockResolvedValue({
      data: [order({ _id: "o1" })],
      headers: { "x-total-count": "150" },
    });
    render(<Orders />);
    expect(await screen.findByRole("heading", { name: /Orders \(150\)/ })).toBeInTheDocument();
  });

  test("falls back to the page length when no total is sent", async () => {
    mockedGet.mockResolvedValue({ data: [order({ _id: "o1" }), order({ _id: "o2" })] });
    render(<Orders />);
    expect(await screen.findByRole("heading", { name: /Orders \(2\)/ })).toBeInTheDocument();
  });
});

describe("Orders cancel affordance", () => {
  // The exchange still holds the remainder of a partially-filled limit, so a
  // cancel is both possible and meaningful. Gating the button on OPEN alone
  // hid it at exactly the moment the order became most worth cancelling.
  test("a partially-filled limit order still offers Cancel", async () => {
    renderOrders([
      order({
        _id: "o-partial",
        status: "PARTIALLY_FILLED",
        type: "LIMIT",
        qty: 1,
        filledQty: 0.4,
        limitPrice: 50000,
      }),
    ]);
    expect(
      await screen.findByRole("button", { name: /cancel buy order/i }),
    ).toBeInTheDocument();
  });

  test("a partially-filled MARKET order does not — nothing is resting", async () => {
    // MARKET is immediate-or-cancel: it can wear PARTIALLY_FILLED for the few
    // seconds before orderSync resolves it, but there is no book entry left.
    renderOrders([
      order({ _id: "o-mkt", status: "PARTIALLY_FILLED", type: "MARKET", qty: 1, filledQty: 0.4 }),
    ]);
    await screen.findByText("BTCUSD");
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });

  test("a filled order offers no Cancel", async () => {
    renderOrders([order({ _id: "o-filled", status: "FILLED", type: "LIMIT", qty: 1 })]);
    await screen.findByText("BTCUSD");
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });
});

describe("Orders cancel confirmation", () => {
  const openDialog = async () => {
    renderOrders([order({ status: "OPEN", side: "BUY", qty: 1, symbol: "BTCUSD", limitPrice: 49000 })]);
    fireEvent.click(await screen.findByRole("button", { name: /cancel .*order for/i }));
    return screen.getByRole("alertdialog");
  };

  test("clicking Cancel opens a dialog rather than cancelling immediately", async () => {
    // Cancelling is irreversible and sits one click from every resting row, so
    // a single stray click must not reach the API.
    await openDialog();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("the dialog names exactly what is being cancelled", async () => {
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent("BUY");
    expect(dialog).toHaveTextContent("BTCUSD");
    expect(dialog).toHaveTextContent("49,000.00");
    expect(dialog).toHaveTextContent(/cannot be undone/i);
  });

  test("dismissing it cancels nothing", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: /keep it/i }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("Escape dismisses it", async () => {
    await openDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("confirming sends exactly one cancel, even on a double click", async () => {
    // The dialog stays open and disabled while the request is in flight —
    // window.confirm gave nowhere to show progress, so a slow cancel invited a
    // second click and a second request.
    let resolve!: (v: unknown) => void;
    mockedPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    await openDialog();

    const confirm = screen.getByRole("button", { name: /cancel order/i });
    fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: /cancelling/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /cancelling/i }));

    resolve({ data: { order: order({ status: "CANCELLED" }) } });
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
  });

  test("the confirm button takes focus so the keyboard can act on it", async () => {
    await openDialog();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /cancel order/i }));
  });
});

describe("Orders cancel outcome", () => {
  /** Open the row's dialog and confirm it — the path a user actually takes. */
  const cancelThroughDialog = async () => {
    renderOrders([order({ status: "OPEN", qty: 1, limitPrice: 49000 })]);
    fireEvent.click(await screen.findByRole("button", { name: /cancel .*order for/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel order$/i }));
  };

  test("reports a fill when the order filled before the cancel landed", async () => {
    mockedPost.mockResolvedValue({ data: { order: order({ status: "FILLED" }) } });
    await cancelThroughDialog();

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("filled before the cancel"))
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  test("reports a cancel when the order really was cancelled", async () => {
    mockedPost.mockResolvedValue({ data: { order: order({ status: "CANCELLED" }) } });
    await cancelThroughDialog();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Cancelled"))
    );
  });

  test("a failed cancel surfaces the error and closes the dialog", async () => {
    mockedPost.mockRejectedValue(new Error("network down"));
    await cancelThroughDialog();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
