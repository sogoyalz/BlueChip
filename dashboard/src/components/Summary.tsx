import React, { useState, useEffect } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import PnLValue from "./shared/PnLValue";
import StatCard from "./shared/StatCard";
import { Holding } from "../types";

// Compact "3.74k" style used by this panel; falls back for malformed rows.
const k = (n: number) =>
  typeof n === "number" && !isNaN(n) ? `${(n / 1000).toFixed(2)}k` : "—";

const Summary = () => {
  const [allHoldings, setAllHoldings] = useState<Holding[]>([]);
  const [cookies] = useCookies(["token"]);

  useEffect(() => {
    axios
      .get<Holding[]>("http://localhost:3002/allHoldings", {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAllHoldings(res.data))
      .catch((err) => {
        console.error("Failed to load holdings summary:", err);
        toast.error("Could not load holdings summary.");
      });
  }, [cookies.token]);

  const investment = allHoldings.reduce(
    (sum, stock) => sum + stock.avg * stock.qty,
    0
  );
  const currentValue = allHoldings.reduce(
    (sum, stock) => sum + stock.price * stock.qty,
    0
  );
  const pnl = currentValue - investment;
  const pnlPercent = investment > 0 ? (pnl / investment) * 100 : 0;

  return (
    <>
      <div className="username">
        <h6>Hi, User!</h6>
        <hr className="divider" />
      </div>

      <div className="section">
        <span>
          <p>Equity</p>
        </span>
        <div className="row">
          <StatCard label="Margin available">3.74k</StatCard>
          <StatCard label="Margins used">0.00</StatCard>
          <StatCard label="Opening balance">3.74k</StatCard>
        </div>
      </div>

      <div className="section">
        <span>
          <p>Holdings ({allHoldings.length})</p>
        </span>
        <div className="row">
          <StatCard label="P&L">
            <PnLValue
              text={`${k(pnl)} (${pnl >= 0 ? "+" : ""}${pnlPercent.toFixed(
                2
              )}%)`}
              showArrow
            />
          </StatCard>
          <StatCard label="Current value">{k(currentValue)}</StatCard>
          <StatCard label="Investment">{k(investment)}</StatCard>
        </div>
      </div>
    </>
  );
};

export default Summary;
