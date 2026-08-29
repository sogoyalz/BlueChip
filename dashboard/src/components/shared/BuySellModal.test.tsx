import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";

import BuySellModal from "./BuySellModal";
import GeneralContext from "../GeneralContext";
import PricesContext from "../PricesContext";
import type { Mock } from "vitest";

vi.mock("axios", () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn() },
}));

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const mockedGet = axios.get as Mock;
const mockedPost = axios.post as Mock;
const mockedIsAxiosError = axios.isAxiosError as unknown as Mock;
const mockedToastError = toast.error as Mock;
const mockedToastSuccess = toast.success as Mock;
const mockedToastInfo = toast.info as Mock;

const closeTradeWindow = vi.fn();
const notifyOrderPlaced = vi.fn();

const renderModal = () =>
  render(
    <GeneralContext.Provider
      value={{
        openTradeWindow: vi.fn(),
        closeTradeWindow,
        openBuyWindow: vi.fn(),
        closeBuyWindow: vi.fn(),
        orderVersion: 0,
        notifyOrderPlaced,
      }}
    >
      <PricesContext.Provider
        value={{
          prices: { BTCUSD: { price: 50000, changePct24h: 1, updatedAt: Date.now(), source: "rest" } },
          symbols: [{ symbol: "BTCUSD", base: "BTC", name: "Bitcoin" }],
          isStale: false,
        }}
      >
        <BuySellModal uid="BTCUSD" />
      </PricesContext.Provider>
    </GeneralContext.Provider>
  );

// <legend> inside a <fieldset> isn't a real label association, so query by id.
const enterQty = (value: string) => {
  fireEvent.change(document.getElementById("qty") as HTMLInputElement, { target: { value } });
};
const enterLimitPrice = (value: string) => {
  fireEvent.change(document.getElementById("price") as HTMLInputElement, { target: { value } });
};

const clickBuy = () => fireEvent.click(screen.getByRole("button", { name: /^buy$/i }));

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue({ data: { balance: 100000 } });
  mockedIsAxiosError.mockReturnValue(false);
});

describe("BuySellModal client-side validation", () => {
  test("rejects a non-numeric/zero quantity without calling the API", async () => {
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0");
    clickBuy();
    expect(mockedToastError).toHaveBeenCalledWith("Quantity must be a number greater than 0.");
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("rejects a non-numeric/zero limit price on a LIMIT order without calling the API", async () => {
    renderModal();
    await screen.findByText(/Cash/);
    fireEvent.click(screen.getByRole("tab", { name: /limit/i }));
    enterQty("1");
    enterLimitPrice("0");
    clickBuy();
    expect(mockedToastError).toHaveBeenCalledWith("Limit price must be a number greater than 0.");
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe("BuySellModal submit outcomes", () => {
  test.each([
    ["FILLED", { status: "FILLED", qty: 0.1, fillPrice: 50000 }],
    ["OPEN", { status: "OPEN", qty: 0.1, limitPrice: 45000 }],
    ["PARTIALLY_FILLED", { status: "PARTIALLY_FILLED", qty: 1, filledQty: 0.4, fillPrice: 50000 }],
    ["REJECTED", { status: "REJECTED", reason: "Order did not fill" }],
  ])("a %s response tells the orders list to refetch", async (_label, order) => {
    // Whatever the outcome, the server has recorded it. Without this the new
    // order was invisible until the next 10s poll and looked like it vanished.
    mockedPost.mockResolvedValue({ data: { order } });
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");
    clickBuy();
    await waitFor(() => expect(notifyOrderPlaced).toHaveBeenCalledTimes(1));
  });

  test("a failed submission does NOT tell the list to refetch", async () => {
    mockedPost.mockRejectedValue(new Error("Network Error"));
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");
    clickBuy();
    await waitFor(() => expect(mockedToastError).toHaveBeenCalled());
    expect(notifyOrderPlaced).not.toHaveBeenCalled();
  });

  test("a FILLED response shows a success toast and closes the window", async () => {
    mockedPost.mockResolvedValue({
      data: { order: { status: "FILLED", qty: 0.1, fillPrice: 50000 } },
    });
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");
    clickBuy();
    await waitFor(() => expect(closeTradeWindow).toHaveBeenCalled());
    expect(mockedToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Bought 0.1 BTC")
    );
  });

  test("an OPEN (resting limit) response shows an info toast and closes the window", async () => {
    mockedPost.mockResolvedValue({
      data: { order: { status: "OPEN", qty: 0.1, limitPrice: 45000 } },
    });
    renderModal();
    await screen.findByText(/Cash/);
    fireEvent.click(screen.getByRole("tab", { name: /limit/i }));
    enterQty("0.1");
    enterLimitPrice("45000");
    clickBuy();
    await waitFor(() => expect(closeTradeWindow).toHaveBeenCalled());
    expect(mockedToastInfo).toHaveBeenCalledWith(expect.stringContaining("Limit buy placed"));
  });

  test("an OPEN limit that partly crossed reports what already traded", async () => {
    // placeOrder returns OPEN (not PARTIALLY_FILLED) for a limit order that
    // partly crossed on the way in — the remainder is resting, but 0.4 has
    // already traded. Announcing only the requested 1.0 would tell the user
    // nothing executed, the same falsehood the orders table avoids.
    mockedPost.mockResolvedValue({
      data: {
        order: {
          status: "OPEN",
          qty: 1,
          filledQty: 0.4,
          fillPrice: 44900,
          limitPrice: 45000,
        },
      },
    });
    renderModal();
    await screen.findByText(/Cash/);
    fireEvent.click(screen.getByRole("tab", { name: /limit/i }));
    enterQty("1");
    enterLimitPrice("45000");
    clickBuy();

    await waitFor(() => expect(mockedToastInfo).toHaveBeenCalled());
    const message = mockedToastInfo.mock.calls.at(-1)![0] as string;
    expect(message).toContain("0.4 of 1");
    expect(message).toContain("$44,900.00");
    expect(message).toContain("resting");
    expect(message).not.toContain("Limit buy placed");
  });

  test("a PARTIALLY_FILLED response is reported as a fill, not a rejection", async () => {
    // A market order is immediate-or-cancel, so a partial fill is the final
    // outcome — the user really did buy 0.4 BTC and must not be told otherwise.
    mockedPost.mockResolvedValue({
      data: {
        order: { status: "PARTIALLY_FILLED", qty: 1, filledQty: 0.4, fillPrice: 50000 },
      },
    });
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("1");
    clickBuy();
    await waitFor(() => expect(closeTradeWindow).toHaveBeenCalled());
    expect(mockedToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Bought 0.4 of 1 BTC")
    );
    expect(mockedToastError).not.toHaveBeenCalled();
  });

  test("a REJECTED response shows the server's reason and keeps the window open", async () => {
    mockedPost.mockResolvedValue({
      data: { order: { status: "REJECTED", reason: "Order did not fill (immediate-or-cancel)" } },
    });
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");
    clickBuy();
    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith("Order did not fill (immediate-or-cancel)")
    );
    expect(closeTradeWindow).not.toHaveBeenCalled();
  });

  test("a network/server error shows a fallback toast and keeps the window open", async () => {
    mockedPost.mockRejectedValue(new Error("Network Error"));
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");
    clickBuy();
    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith("Failed to place order. Please try again.")
    );
    expect(closeTradeWindow).not.toHaveBeenCalled();
  });

  test("surfaces the backend's error message when the response carries one", async () => {
    mockedIsAxiosError.mockReturnValue(true);
    mockedPost.mockRejectedValue({
      response: { data: { message: "Market data unavailable — try again shortly" } },
    });
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");
    clickBuy();
    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith("Market data unavailable — try again shortly")
    );
  });
});

describe("BuySellModal idempotency key", () => {
  test("reuses the same clientOrderId across a failed retry, but issues a new one after a completed order", async () => {
    mockedPost.mockRejectedValueOnce(new Error("Network Error"));
    mockedPost.mockResolvedValueOnce({
      data: { order: { status: "FILLED", qty: 0.1, fillPrice: 50000 } },
    });
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");

    clickBuy();
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    const firstKey = mockedPost.mock.calls[0][1].clientOrderId;
    expect(firstKey).toBeTruthy();
    // Wait for the button to re-enable (submitting -> false) before clicking again.
    await screen.findByRole("button", { name: /^buy$/i });

    clickBuy();
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(2));
    const secondKey = mockedPost.mock.calls[1][1].clientOrderId;
    expect(secondKey).toBe(firstKey); // retry after failure reuses the key
    await screen.findByRole("button", { name: /^buy$/i });

    clickBuy();
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(3));
    const thirdKey = mockedPost.mock.calls[2][1].clientOrderId;
    expect(thirdKey).not.toBe(firstKey); // new order after success gets a fresh key
  });

  test("editing the order after a failure issues a new clientOrderId", async () => {
    // The key exists to dedupe a retry of the SAME order. Once the user
    // changes the quantity it's a different order — reusing the key would make
    // the server return the previous one and silently drop the edit.
    mockedPost.mockRejectedValueOnce(new Error("Network Error"));
    mockedPost.mockResolvedValueOnce({
      data: { order: { status: "FILLED", qty: 0.5, fillPrice: 50000 } },
    });
    renderModal();
    await screen.findByText(/Cash/);
    enterQty("0.1");

    clickBuy();
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    const firstKey = mockedPost.mock.calls[0][1].clientOrderId;
    await screen.findByRole("button", { name: /^buy$/i });

    enterQty("0.5"); // different order now
    clickBuy();
    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(2));
    expect(mockedPost.mock.calls[1][1].qty).toBe(0.5);
    expect(mockedPost.mock.calls[1][1].clientOrderId).not.toBe(firstKey);
  });
});

describe("BuySellModal keyboard access", () => {
  // The ticket is the app's most important interactive surface; before this it
  // announced role="dialog" but let Tab wander into the page behind it and
  // ignored Escape entirely.
  test("announces itself as a modal dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: /buy BTCUSD/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("focus starts inside the ticket, not on the page behind it", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test("Tab cycles within the ticket instead of escaping to the page", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: /cancel/i });
    cancel.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(cancel);
  });

  test("Escape closes it, the same as Cancel", () => {
    renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeTradeWindow).toHaveBeenCalledTimes(1);
  });

  test("the read-only market price stays out of the tab order", () => {
    renderModal();
    const price = screen.getByDisplayValue("$50,000.00");
    expect(price).toHaveAttribute("tabindex", "-1");
  });
});
