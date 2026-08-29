/**
 * Trading correctness, tested without rendering a modal.
 *
 * Validation, the idempotency-key lifecycle and the mapping from a server
 * outcome to what the user is told are the parts of the ticket that matter;
 * before the hook existed they could only be reached by clicking through a
 * rendered form.
 */
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";

import { useOrderTicket } from "./useOrderTicket";
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
const closeTradeWindow = vi.fn();
const notifyOrderPlaced = vi.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GeneralContext.Provider
    value={{
      openTradeWindow: vi.fn(),
      closeTradeWindow,
      orderVersion: 0,
      notifyOrderPlaced,
      openBuyWindow: vi.fn(),
      closeBuyWindow: vi.fn(),
    }}
  >
    <PricesContext.Provider
      value={{
        prices: { BTCUSD: { price: 50000, changePct24h: 1, updatedAt: Date.now(), source: "ws" } },
        symbols: [{ symbol: "BTCUSD", base: "BTC", name: "Bitcoin" }],
        isStale: false,
      }}
    >
      {children}
    </PricesContext.Provider>
  </GeneralContext.Provider>
);

const setup = () => renderHook(() => useOrderTicket("BTCUSD", "BUY"), { wrapper });
const orderBody = (call = 0) => mockedPost.mock.calls[call][1];

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue({ data: { balance: 100000 } });
  (axios.isAxiosError as unknown as Mock).mockReturnValue(false);
});

describe("validation", () => {
  test.each([["", "empty"], ["0", "zero"], ["-1", "negative"], ["abc", "non-numeric"]])(
    "a %s quantity (%s) never reaches the API",
    async (value) => {
      const { result } = setup();
      act(() => result.current.setQty(value));
      await act(async () => { await result.current.submit(); });
      expect(mockedPost).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/quantity/i));
    }
  );

  test("a LIMIT order without a valid price never reaches the API", async () => {
    const { result } = setup();
    act(() => { result.current.setQty("1"); result.current.switchToLimit(); });
    act(() => result.current.setLimitPrice("0"));
    await act(async () => { await result.current.submit(); });
    expect(mockedPost).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/limit price/i));
  });

  test("switching to LIMIT prefills the live price rather than an empty field", () => {
    const { result } = setup();
    act(() => result.current.switchToLimit());
    expect(result.current.limitPrice).toBe("50000");
  });
});

describe("idempotency key lifecycle", () => {
  test("a retry after failure reuses the key, so the exchange dedupes", async () => {
    mockedPost.mockRejectedValueOnce(new Error("network"));
    mockedPost.mockResolvedValueOnce({ data: { order: { status: "FILLED", qty: 1, fillPrice: 50000 } } });
    const { result } = setup();
    act(() => result.current.setQty("1"));

    await act(async () => { await result.current.submit(); });
    await act(async () => { await result.current.submit(); });

    expect(orderBody(0).clientOrderId).toBe(orderBody(1).clientOrderId);
  });

  test("editing the order between attempts issues a NEW key", async () => {
    // Same key with different terms would make the server return the previous
    // order and silently drop the edit.
    mockedPost.mockRejectedValueOnce(new Error("network"));
    mockedPost.mockResolvedValueOnce({ data: { order: { status: "FILLED", qty: 2, fillPrice: 50000 } } });
    const { result } = setup();
    act(() => result.current.setQty("1"));
    await act(async () => { await result.current.submit(); });

    act(() => result.current.setQty("2"));
    await act(async () => { await result.current.submit(); });

    expect(orderBody(1).clientOrderId).not.toBe(orderBody(0).clientOrderId);
    expect(orderBody(1).qty).toBe(2);
  });

  test("a completed order gets a fresh key next time", async () => {
    mockedPost.mockResolvedValue({ data: { order: { status: "REJECTED", reason: "no fill" } } });
    const { result } = setup();
    act(() => result.current.setQty("1"));
    await act(async () => { await result.current.submit(); });
    await act(async () => { await result.current.submit(); });
    expect(orderBody(1).clientOrderId).not.toBe(orderBody(0).clientOrderId);
  });
});

describe("duplicate submission", () => {
  test("a second submit while one is in flight is ignored", async () => {
    let resolve!: (v: unknown) => void;
    mockedPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = setup();
    act(() => result.current.setQty("1"));

    let first!: Promise<void>;
    act(() => { first = result.current.submit(); });
    await waitFor(() => expect(result.current.submitting).toBe(true));
    await act(async () => { await result.current.submit(); }); // the double click

    expect(mockedPost).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ data: { order: { status: "FILLED", qty: 1, fillPrice: 50000 } } });
      await first;
    });
  });
});

describe("server outcomes", () => {
  test.each([
    ["FILLED", { status: "FILLED", qty: 1, fillPrice: 50000 }, "success", true],
    ["PARTIALLY_FILLED", { status: "PARTIALLY_FILLED", qty: 2, filledQty: 0.5, fillPrice: 50000 }, "success", true],
    ["OPEN", { status: "OPEN", qty: 1, limitPrice: 49000 }, "info", true],
    ["REJECTED", { status: "REJECTED", reason: "Insufficient funds" }, "error", false],
  ])("%s is reported as a %s and %s the window", async (_l, order, kind, closes) => {
    mockedPost.mockResolvedValue({ data: { order } });
    const { result } = setup();
    act(() => result.current.setQty("1"));
    await act(async () => { await result.current.submit(); });

    expect((toast as unknown as Record<string, Mock>)[kind]).toHaveBeenCalled();
    expect(notifyOrderPlaced).toHaveBeenCalledTimes(1); // the list must refresh either way
    if (closes) expect(closeTradeWindow).toHaveBeenCalled();
    else expect(closeTradeWindow).not.toHaveBeenCalled();
  });

  test("a rejected order shows the server's reason", async () => {
    mockedPost.mockResolvedValue({ data: { order: { status: "REJECTED", reason: "Insufficient funds" } } });
    const { result } = setup();
    act(() => result.current.setQty("1"));
    await act(async () => { await result.current.submit(); });
    expect(toast.error).toHaveBeenCalledWith("Insufficient funds");
  });

  test("a request failure keeps the window open and announces nothing", async () => {
    mockedPost.mockRejectedValue(new Error("network down"));
    const { result } = setup();
    act(() => result.current.setQty("1"));
    await act(async () => { await result.current.submit(); });

    expect(toast.error).toHaveBeenCalled();
    expect(closeTradeWindow).not.toHaveBeenCalled();
    expect(notifyOrderPlaced).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  test("the backend's own message is surfaced when it sends one", async () => {
    (axios.isAxiosError as unknown as Mock).mockReturnValue(true);
    mockedPost.mockRejectedValue({ response: { data: { message: "Market data unavailable" } } });
    const { result } = setup();
    act(() => result.current.setQty("1"));
    await act(async () => { await result.current.submit(); });
    expect(toast.error).toHaveBeenCalledWith("Market data unavailable");
  });
});

describe("estimated cost", () => {
  test("uses the live price for MARKET and the typed price for LIMIT", () => {
    const { result } = setup();
    act(() => result.current.setQty("2"));
    expect(result.current.estimated).toBe(100000); // 2 × 50,000 live

    act(() => result.current.switchToLimit());
    act(() => result.current.setLimitPrice("40000"));
    expect(result.current.estimated).toBe(80000);
  });

  test("is zero rather than NaN for junk input", () => {
    const { result } = setup();
    act(() => result.current.setQty("abc"));
    expect(result.current.estimated).toBe(0);
  });
});
