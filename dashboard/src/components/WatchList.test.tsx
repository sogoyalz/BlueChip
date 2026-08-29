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

const renderWatchList = (priceOverride: Record<string, unknown> = prices) =>
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
      <PricesContext.Provider
        value={{ prices: priceOverride as typeof prices, symbols, isStale: false }}
      >
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

  test("a symbol with no price shows no direction at all", () => {
    // `(undefined ?? 0) < 0` is false, so a missing tick rendered the green
    // "up" class and an up arrow beside the "—" placeholder — asserting a rise
    // for a value we do not have.
    renderWatchList({});

    const pct = document.querySelector(".percent")!;
    expect(pct).toHaveTextContent("—");
    expect(pct).not.toHaveClass("up");
    expect(pct).not.toHaveClass("down");
    expect(document.querySelector(".item-info svg")).toBeNull();
  });

  test("every action button says which asset it acts on", () => {
    // MUI's Tooltip title becomes the button's accessible name. Buy and Chart
    // named the asset; Sell said only "Sell", so all eight rows produced the
    // same name and a screen-reader user could not tell which one they were
    // about to sell. axe cannot catch this — the button HAS a name, it is just
    // not a distinguishing one — and the existing count assertions passed
    // happily with the ambiguous version.
    renderWatchList();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") || b.textContent || "");

    expect(new Set(names).size).toBe(names.length); // all distinct
    for (const name of names) {
      expect(name).toMatch(/BTC|ETH/);
    }
  });

  test("each row's actions target that row's symbol", () => {
    renderWatchList();
    const charts = screen.getAllByRole("button", { name: /chart/i });
    expect(charts[0]).toHaveAccessibleName(/BTC/i);
    expect(charts[1]).toHaveAccessibleName(/ETH/i);
  });
});
