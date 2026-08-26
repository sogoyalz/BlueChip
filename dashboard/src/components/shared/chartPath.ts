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
  pad = 0
): string => {
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const rng = mx - mn || 1;
  return (
    "M" +
    vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = pad + (h - 2 * pad) - ((v - mn) / rng) * (h - 2 * pad);
        return `${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" L")
  );
};
