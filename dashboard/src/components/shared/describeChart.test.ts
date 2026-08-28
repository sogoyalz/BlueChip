import { describeCategoryChart } from "./describeChart";

const pct = (n: number) => `${n.toFixed(2)} percent`;

describe("describeCategoryChart", () => {
  test("names every category and its value", () => {
    const out = describeCategoryChart(
      { labels: ["BTC", "ETH"], datasets: [{ data: [3.21, 1.5] }] } as never,
      "Watchlist 24-hour movement",
      pct,
    );
    expect(out).toBe(
      "Watchlist 24-hour movement. 2 entries: BTC 3.21 percent, ETH 1.50 percent.",
    );
  });

  test("says so when there is nothing to plot", () => {
    expect(
      describeCategoryChart({ labels: [], datasets: [] } as never, "Holdings", pct),
    ).toBe("Holdings. No data available.");
  });

  test("uses the singular for one entry", () => {
    const out = describeCategoryChart(
      { labels: ["BTC"], datasets: [{ data: [1] }] } as never,
      "Holdings",
      pct,
    );
    expect(out).toContain("1 entry:");
  });

  test("survives a dataset shorter than the labels", () => {
    const out = describeCategoryChart(
      { labels: ["BTC", "ETH"], datasets: [{ data: [1] }] } as never,
      "Holdings",
      pct,
    );
    expect(out).toContain("ETH 0.00 percent");
  });
});
