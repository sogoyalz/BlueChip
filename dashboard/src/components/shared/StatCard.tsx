import React from "react";

interface StatCardProps {
  label: string;
  children: React.ReactNode;
  /** Optional change line under the value, e.g. a <PnLValue />. */
  delta?: React.ReactNode;
  /** Muted caption next to the delta, e.g. "vs prev close". */
  sub?: string;
}

// Uppercase label over a large value, with an optional delta footer. Compose
// the value from children so callers can pass a plain string or a <PnLValue />.
const StatCard = ({ label, children, delta, sub }: StatCardProps) => (
  <div className="col">
    <p className="col-label">{label}</p>
    <h5>{children}</h5>
    {(delta || sub) && (
      <div className="col-delta">
        {delta}
        {sub && <span className="col-sub">{sub}</span>}
      </div>
    )}
  </div>
);

export default StatCard;
