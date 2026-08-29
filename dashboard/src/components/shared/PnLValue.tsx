import React from "react";

import { NON_FINITE, num } from "./format";

interface PnLValueProps {
  value?: number | null;
  percent?: number;
  text?: string;
  showArrow?: boolean;
}

/**
 * A P&L figure with gain/loss colouring and an optional arrow.
 *
 * Two modes:
 *   value-mode: <PnLValue value={80} percent={2.44} showArrow />
 *   text-mode:  <PnLValue text="-1.60%" /> — the sign of the string decides
 *
 * Three states, not two. "We don't know" is neither a gain nor a loss, and it
 * used to be painted as a gain: the unknown placeholder is an em dash, which
 * does not start with a hyphen, so the loss test missed it and callers passing
 * `showArrow` got a green ▲ next to a value they had explicitly marked as
 * unavailable. Summary and TopBar both do exactly that when a load fails —
 * the same "don't render a number we don't have" rule the rest of the app
 * follows, applied to the colour as well as the digits.
 */
const isKnown = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

const PnLValue = ({ value, percent, text, showArrow = false }: PnLValueProps) => {
  const isText = text !== undefined;
  const body = isText
    ? String(text)
    : percent !== undefined
    ? `${num(value)} (${isKnown(value) && value < 0 ? "" : "+"}${num(percent)}%)`
    : num(value);

  // Unknown in either mode: the placeholder in text mode, a non-finite number
  // in value mode. Non-finite matters on its own — the old formatter used
  // isNaN, so an Infinity reached the screen as the literal word "Infinity".
  const unknown = isText
    ? String(text).trim() === NON_FINITE || String(text).trim() === ""
    : !isKnown(value);

  const trimmed = String(text).trim();
  const isGain = isText ? !trimmed.startsWith("-") : (value ?? 0) >= 0;
  const cls = unknown ? "" : isGain ? "profit" : "loss";

  return (
    <span className="pnl">
      {showArrow && !unknown && (
        <span className={`pnl-arrow ${cls}`} aria-hidden="true">
          {isGain ? "▲" : "▼"}
        </span>
      )}
      <span className={cls ? `num ${cls}` : "num"}>{body}</span>
    </span>
  );
};

export default PnLValue;
