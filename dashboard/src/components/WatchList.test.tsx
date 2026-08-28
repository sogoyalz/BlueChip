import React from "react";
import { render, screen } from "@testing-library/react";

import WatchList from "./WatchList";
import PricesContext from "./PricesContext";
import GeneralContext from "./GeneralContext";

// react-router v7's entrypoint doesn't resolve under CRA's jest config, and
// WatchList only needs useNavigate (for the chart action).
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

// Chart.js needs a real canvas; the doughnut isn't under test here.
vi.mock("./DoughnoutChart", () => ({
  DoughnutChart: () => <div data-testid="doughnut" />,
}));

const symbols = [
  { symbol: "BTCUSD", base: "BTC", name: "Bitcoin" },
  { symbol: "ETHUSD", base: "ETH", name: "Ethereum" },
];
const prices = {
  BTCUSD: { price: 50000, changePct24h: 1.2, updatedAt: Date.now(), source: "ws" as const },
  ETHUSD: { price: 2500, changePct24h: -0.4, updatedAt: Date.now(), source: "ws" as const },
};

const renderWatchList = () =>
  render(
    <GeneralContext.Provider
      value={{
        openTradeWindow: vi.fn(),
        closeTradeWindow: vi.fn(),
        openBuyWindow: vi.fn(),
        closeBuyWindow: vi.fn(),
        orderVersion: 0,
        notifyOrderPlaced: vi.fn(),
      }}
    >
      <PricesContext.Provider value={{ prices, symbols, isStale: false }}>
        <WatchList />
      </PricesContext.Provider>
    </GeneralContext.Provider>
  );

describe("WatchList trade actions", () => {
  test("Buy, Sell and Chart are present without any hover", () => {
    // These used to mount only on mouseenter. A touch tap fires
    // touchstart/touchend/click and never mouseenter, so on a phone the actions
    // never rendered at all — and because the chart link is one of them, there
    // was no route to the market page either. Trading was impossible on mobile.
    renderWatchList();

    expect(screen.getAllByRole("button", { name: /^buy\b/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^sell\b/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /chart/i })).toHaveLength(2);
  });

  test("the actions are reachable by keyboard", () => {
    // Same root cause: a control that only exists while hovered can never be
    // tabbed to.
    renderWatchList();
    const buy = screen.getAllByRole("button", { name: /^buy\b/i })[0];
    buy.focus();
    expect(document.activeElement).toBe(buy);
  });

  test("each row's actions target that row's symbol", () => {
    renderWatchList();
    const charts = screen.getAllByRole("button", { name: /chart/i });
    expect(charts[0]).toHaveAccessibleName(/BTC/i);
    expect(charts[1]).toHaveAccessibleName(/ETH/i);
  });
});
