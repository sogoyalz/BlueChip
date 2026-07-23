import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";

import BuySellModal from "./BuySellModal";
import GeneralContext from "../GeneralContext";
import PricesContext from "../PricesContext";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), isAxiosError: jest.fn() },
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

const mockedGet = axios.get as jest.Mock;
const mockedPost = axios.post as jest.Mock;
const mockedIsAxiosError = axios.isAxiosError as unknown as jest.Mock;
const mockedToastError = toast.error as jest.Mock;
const mockedToastSuccess = toast.success as jest.Mock;
const mockedToastInfo = toast.info as jest.Mock;

const closeTradeWindow = jest.fn();

const renderModal = () =>
  render(
    <GeneralContext.Provider
      value={{
        openTradeWindow: jest.fn(),
        closeTradeWindow,
        openBuyWindow: jest.fn(),
        closeBuyWindow: jest.fn(),
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
  jest.clearAllMocks();
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
});
