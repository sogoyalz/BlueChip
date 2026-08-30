/**
 * The market page: candles, the timeframe tabs, and the route the watchlist's
 * Chart button lands on. It was 0% covered — including the unknown-market
 * branch and the h1 that only got promoted after an accessibility scan finally
 * visited this route.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";
import type { Mock } from "vitest";

import MarketDetail from "./MarketDetail";
import PricesContext from "./PricesContext";
import GeneralContext from "./GeneralContext";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useParams: () => ({ symbol: (globalThis as { __sym?: string }).__sym ?? "BTCUSD" }),
  useNavigate: () => navigate,
}));
vi.mock("axios", () => ({ __esModule: true, default: { get: vi.fn() } }));
vi.mock("react-toastify", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("./shared/CandleChart", () => ({
  default: ({ candles, label }: { candles: unknown[]; label: string }) => (
    <div data-testid="candles" data-count={candles.length} data-label={label} />
  ),
}));
vi.mock("./shared/DepthPanel", () => ({ default: () => <div data-testid="depth" /> }));

const mockedGet = axios.get as unknown as Mock;
const openTradeWindow = vi.fn();

const candles = (n: number) =>
  Array.from({ length: n }, (_, i) => [i, 1, 2, 0.5, 1.5, 10]);

const renderPage = (symbols = [{ symbol: "BTCUSD", base: "BTC", name: "Bitcoin" }]) =>
  render(
    <GeneralContext.Provider
      value={{
        openTradeWindow, closeTradeWindow: vi.fn(),
        openBuyWindow: vi.fn(), closeBuyWindow: vi.fn(),
        orderVersion: 0, notifyOrderPlaced: vi.fn(),
      }}
    >
      <PricesContext.Provider
        value={{
          prices: { BTCUSD: { price: 78255.53, changePct24h: 2.04, updatedAt: Date.now(), source: "ws" } },
          symbols,
          isStale: false,
        }}
      >
        <MarketDetail />
      </PricesContext.Provider>
    </GeneralContext.Provider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { __sym?: string }).__sym = "BTCUSD";
  mockedGet.mockResolvedValue({ data: { candles: candles(300) } });
});

describe("the market page", () => {
  test("names the pair in an h1, like every other route", async () => {
    renderPage();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Bitcoin (BTC/USD)");
  });

  test("shows the live price and its 24h change", async () => {
    renderPage();
    expect(await screen.findByText(/\$78,255\.53/)).toBeInTheDocument();
    expect(screen.getByText(/\+2\.04% \(24h\)/)).toBeInTheDocument();
  });

  test("passes only the visible window of candles to the chart", async () => {
    renderPage();
    const chart = await screen.findByTestId("candles");
    // 300 fetched, VISIBLE_CANDLES drawn — the slice is memoised so the chart
    // is not handed a fresh array on every price tick.
    expect(Number(chart.getAttribute("data-count"))).toBe(120);
    expect(chart).toHaveAttribute("data-label", "BTC");
  });

  test("refetches when the timeframe changes", async () => {
    renderPage();
    await screen.findByTestId("candles");
    expect(mockedGet).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "1D" }));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(mockedGet.mock.calls[1][1].params.timeframe).toBe("1day");
  });

  test("the timeframe tabs report which one is selected", async () => {
    renderPage();
    await screen.findByTestId("candles");
    const oneHour = screen.getByRole("tab", { name: "1H" });
    expect(oneHour).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "1D" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "1D" })).toHaveAttribute("aria-selected", "true"),
    );
    expect(oneHour).toHaveAttribute("aria-selected", "false");
  });

  test("Buy and Sell open the ticket for THIS pair", async () => {
    renderPage();
    await screen.findByTestId("candles");

    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(openTradeWindow).toHaveBeenCalledWith("BTCUSD", "BUY");

    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(openTradeWindow).toHaveBeenCalledWith("BTCUSD", "SELL");
  });

  test("a failed candle load tells the user instead of rendering an empty chart", async () => {
    mockedGet.mockRejectedValue(new Error("upstream down"));
    renderPage();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not load chart data."));
  });
});

describe("an unknown pair", () => {
  test("says so and offers a way back, once symbols have loaded", async () => {
    (globalThis as { __sym?: string }).__sym = "NOPEUSD";
    renderPage();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/Unknown market/);

    fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  test("does not claim a pair is unknown while symbols are still loading", async () => {
    (globalThis as { __sym?: string }).__sym = "NOPEUSD";
    renderPage([]); // symbols not yet fetched
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(screen.queryByText(/Unknown market/)).not.toBeInTheDocument();
  });
});
