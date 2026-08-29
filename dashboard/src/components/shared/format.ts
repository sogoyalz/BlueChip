// Number formatting shared across the dashboard.
//
// These were previously redefined in six components with quietly different
// behaviour — Summary's currency helper took the absolute value because its
// caller supplied the sign, while every other copy did not. Naming each
// variant explicitly is what stops that drift from coming back.
//
// Everything here is display-only. Money arithmetic lives on the backend, in
// integer cents.

const NON_FINITE = "—";

/** "1,234.56" — grouped and fixed to 2dp. Non-finite renders as an em dash. */
export const num = (n: number | null | undefined, dp = 2): string =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : NON_FINITE;

/** "$1,234.56", sign included for negatives. */
export const usd = (n: number | null | undefined, dp = 2): string =>
  typeof n === "number" && Number.isFinite(n) ? `$${num(n, dp)}` : NON_FINITE;

/** "$1,234.56" for ±1234.56 — magnitude only. Pair with signedUsd. */
export const usdAbs = (n: number, dp = 2): string => usd(Math.abs(n), dp);

/** "+$1,234.56" / "-$1,234.56" — the sign leads, outside the currency mark. */
export const signedUsd = (n: number, dp = 2): string =>
  (n >= 0 ? "+" : "-") + usdAbs(n, dp);

/** "+1.23%" / "-1.23%". */
export const pct = (n: number, dp = 2): string =>
  (n >= 0 ? "+" : "") + n.toFixed(dp) + "%";

/**
 * Market prices carry more decimals as they get smaller — 80,412.55 needs two,
 * 0.0899 would round to nothing at two.
 */
export const price = (n: number): string =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: n >= 1000 ? 2 : 4,
  });
