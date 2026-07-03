import React from "react";

const fmt = (n: number | null | undefined) =>
  typeof n === "number" && !isNaN(n) ? n.toFixed(2) : "—";

interface PnLValueProps {
  value?: number | null;
  percent?: number;
  text?: string;
  showArrow?: boolean;
}

// A P&L figure with gain/loss colouring and an optional arrow.
// Two modes:
//   value-mode: <PnLValue value={80} percent={2.44} showArrow />
//   text-mode:  <PnLValue text="-1.60%" /> — sign of the string decides colour
const PnLValue = ({ value, percent, text, showArrow = false }: PnLValueProps) => {
  const isText = text !== undefined;
  const isGain = isText
    ? !String(text).trim().startsWith("-")
    : (value ?? 0) >= 0;
  const cls = isGain ? "profit" : "loss";

  const body = isText
    ? String(text)
    : percent !== undefined
    ? `${fmt(value)} (${(value ?? 0) >= 0 ? "+" : ""}${fmt(percent)}%)`
    : fmt(value);

  return (
    <span className="pnl">
      {showArrow && (
        <span className={`pnl-arrow ${cls}`} aria-hidden="true">
          {isGain ? "▲" : "▼"}
        </span>
      )}
      <span className={`num ${cls}`}>{body}</span>
    </span>
  );
};

export default PnLValue;
