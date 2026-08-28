/**
 * The charts are canvas or bare SVG — a screen reader gets nothing from them
 * unless the element carries a name. These assert the name is actually there
 * and says something specific.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import CandleChart from "./CandleChart";
import { Candle } from "../../types";

jest.mock("react-chartjs-2", () => ({
  Chart: (props: Record<string, unknown>) => <canvas {...props} />,
}));

// The chart plumbing ships ESM that CRA's jest transform does not process,
// and registering real controllers has nothing to do with the description
// under test — only the aria-label matters here.
jest.mock("chartjs-adapter-date-fns", () => ({}));
jest.mock("chartjs-chart-financial", () => ({
  CandlestickController: class {},
  CandlestickElement: class {},
}));
jest.mock("chart.js", () => ({
  Chart: { register: jest.fn() },
  LinearScale: class {},
  TimeScale: class {},
  Tooltip: class {},
}));

// [ts, open, high, low, close, volume]
const candles: Candle[] = [
  [1735689600000, 100, 110, 95, 105, 1],
  [1735693200000, 105, 130, 104, 120, 1],
  [1735696800000, 120, 122, 90, 118, 1],
];

describe("CandleChart accessible description", () => {
  test("names the asset, the period, the direction and the extremes", () => {
    render(<CandleChart candles={candles} label="BTC" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;

    expect(label).toContain("BTC price chart");
    expect(label).toContain("3 candles");
    expect(label).toContain("$100.00");   // open, from the first candle
    expect(label).toContain("$118.00");   // close, from the last
    expect(label).toContain("up");        // 100 -> 118
    expect(label).toContain("18.00%");
    expect(label).toContain("$130.00");   // high, from the middle candle
    expect(label).toContain("$90.00");    // low, from the last candle
  });

  test("reports a fall as down", () => {
    const falling: Candle[] = [
      [1735689600000, 200, 200, 150, 160, 1],
      [1735693200000, 160, 165, 140, 150, 1],
    ];
    render(<CandleChart candles={falling} label="ETH" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("down");
    expect(label).toContain("25.00%");
  });

  test("says so rather than inventing a range when there is no data", () => {
    render(<CandleChart candles={[]} label="SOL" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "SOL price chart. No data available.",
    );
  });

  test("uses more precision on sub-$10 assets", () => {
    const cheap: Candle[] = [
      [1735689600000, 0.0841, 0.0902, 0.0839, 0.0888, 1],
    ];
    render(<CandleChart candles={cheap} label="DOGE" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("$0.0841");
  });
});
