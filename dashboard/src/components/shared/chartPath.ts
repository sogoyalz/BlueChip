// SVG path helper shared by the portfolio chart.
//
// (This file used to also export a seeded random walk that drew fake price
// history in the watchlist. Synthetic data has no place next to real live
// prices, so it was removed rather than left to be mistaken for a quote.)

/** Map a series of values to an SVG path, scaled to fit `w` x `h`. */
export const linePath = (
  vals: number[],
  w: number,
  h: number,
  pad = 0,
  timestamps?: number[]
): string => {
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const rng = mx - mn || 1;
  return (
    "M" +
    vals
      .map((v, i) => {
        const timeRange = timestamps ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
        const fraction = timestamps && timeRange > 0 ? (timestamps[i] - timestamps[0]) / timeRange
          : vals.length > 1 ? i / (vals.length - 1) : 0;
        const x = fraction * w;
        const y = pad + (h - 2 * pad) - ((v - mn) / rng) * (h - 2 * pad);
        return `${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" L")
  );
};
