/**
 * The top bar: the BTC/ETH ticker and the Live/Delayed pill.
 *
 * The pill is the app's only signal that prices have gone stale — during a
 * feed outage the backend keeps broadcasting on schedule with frozen numbers,
 * so "Live" over minutes-old prices is precisely the failure it exists to
 * prevent. None of it was covered.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import TopBar from "./TopBar";
import PricesContext from "./PricesContext";
import GeneralContext from "./GeneralContext";

vi.mock("axios", () => ({
  __esModule: true,
  default: { get: vi.fn().mockResolvedValue({ data: { username: "trader" } }), post: vi.fn() },
}));

const tick = (price: number, changePct24h: number) => ({
  price,
  changePct24h,
  updatedAt: Date.now(),
  source: "ws" as const,
});

const renderBar = (
  prices: Record<string, ReturnType<typeof tick>>,
  isStale = false,
) =>
  render(
    <MemoryRouter>
      <GeneralContext.Provider
        value={{
          openTradeWindow: vi.fn(), closeTradeWindow: vi.fn(),
          openBuyWindow: vi.fn(), closeBuyWindow: vi.fn(),
          orderVersion: 0, notifyOrderPlaced: vi.fn(),
        }}
      >
        <PricesContext.Provider value={{ prices, symbols: [], isStale }}>
          <TopBar />
        </PricesContext.Provider>
      </GeneralContext.Provider>
    </MemoryRouter>,
  );

describe("the ticker", () => {
  test("shows both pairs with their price and signed change", () => {
    renderBar({ BTCUSD: tick(78255.53, 2.04), ETHUSD: tick(2457.78, -1.5) });
    expect(screen.getByText("BTC / USD")).toBeInTheDocument();
    expect(screen.getByText("78,255.53")).toBeInTheDocument();
    expect(screen.getByText(/\+2\.04%/)).toBeInTheDocument();
    expect(screen.getByText(/-1\.50%/)).toBeInTheDocument();
  });

  test("a pair with no tick shows a dash, not a fabricated zero", () => {
    renderBar({});
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
  });

  test("a sub-$1 price keeps the decimals it needs", () => {
    renderBar({ BTCUSD: tick(0.0899, 1) });
    expect(screen.getByText("0.0899")).toBeInTheDocument();
  });
});

describe("the staleness pill", () => {
  test("reads Live when prices are fresh", () => {
    renderBar({ BTCUSD: tick(1, 1) }, false);
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByText("Delayed")).not.toBeInTheDocument();
  });

  test("reads Delayed when they are not", () => {
    // The backend keeps broadcasting frozen prices on schedule during an
    // outage, so this cannot be inferred from "did a frame arrive".
    renderBar({ BTCUSD: tick(1, 1) }, true);
    expect(screen.getByText("Delayed")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  test("the decorative dot is hidden from assistive tech", () => {
    renderBar({ BTCUSD: tick(1, 1) });
    expect(document.querySelector(".live-dot")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("landmarks", () => {
  test("the bar is a banner, so landmark navigation does not skip it", () => {
    renderBar({ BTCUSD: tick(1, 1) });
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  test("the paper-trading disclaimer is always present", () => {
    renderBar({});
    expect(screen.getByRole("note")).toHaveTextContent(/not real money/i);
  });
});
