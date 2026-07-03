import React from "react";

interface StatCardProps {
  label: string;
  children: React.ReactNode;
}

// Uppercase label under a large value. Compose the value from children so
// callers can pass a plain string or a <PnLValue />.
const StatCard = ({ label, children }: StatCardProps) => (
  <div className="col">
    <h5>{children}</h5>
    <p>{label}</p>
  </div>
);

export default StatCard;
