import React, { useMemo } from "react";

// Demo price history is a pseudo-random walk seeded from the symbol, so a
// sparkline is stable across re-renders without storing history in the data
// model. Swap seededWalk for real candle data when a quotes feed exists.
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hashCode = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};

export const seededWalk = (key: string, n: number, drift: number): number[] => {
  const rnd = mulberry32(hashCode(key));
  const out: number[] = [];
  let v = 100;
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * 6 + drift;
    out.push(v);
  }
  return out;
};

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

interface SparklineProps {
  seed: string;
  trend: "up" | "down";
  width?: number;
  height?: number;
}

const Sparkline = ({ seed, trend, width = 56, height = 22 }: SparklineProps) => {
  const d = useMemo(
    () => linePath(seededWalk(seed, 24, trend === "up" ? 0.35 : -0.35), 120, 32),
    [seed, trend]
  );

  return (
    <svg
      viewBox="0 0 120 32"
      preserveAspectRatio="none"
      className={`sparkline ${trend}`}
      style={{ width, height }}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default Sparkline;
