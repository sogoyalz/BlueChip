import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useCookies } from "react-cookie";
import { toast } from "react-toastify";

import PnLValue from "./shared/PnLValue";
import StatCard from "./shared/StatCard";
import { Account } from "../types";
import { API_URL } from "../config";

const STARTING_CASH = 100000;

const fmt$ = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const Funds = () => {
  const [account, setAccount] = useState<Account | null>(null);
  const [resetting, setResetting] = useState(false);
  const [cookies] = useCookies(["token"]);

  const loadAccount = useCallback(() => {
    if (!cookies.token) return;
    axios
      .get<Account>(`${API_URL}/api/account`, {
        params: { token: cookies.token },
        withCredentials: true,
      })
      .then((res) => setAccount(res.data))
      .catch((err) => {
        console.error("Failed to load account:", err);
        toast.error("Could not load account.");
      });
  }, [cookies.token]);

  useEffect(loadAccount, [loadAccount]);

  const handleReset = async () => {
    if (
      !window.confirm(
        "Reset your account? This wipes your holdings and open orders and restores the $100,000 starting balance."
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      await axios.post(
        `${API_URL}/api/account/reset`,
        {},
        { params: { token: cookies.token }, withCredentials: true }
      );
      toast.success("Account reset — fresh $100,000 to trade with.");
      loadAccount();
    } catch (err) {
      console.error("Failed to reset account:", err);
      toast.error("Could not reset account.");
    } finally {
      setResetting(false);
    }
  };

  const portfolioValue = account?.portfolioValue ?? account?.balance ?? 0;
  const totalReturn = portfolioValue - STARTING_CASH;
  const totalReturnPct = (totalReturn / STARTING_CASH) * 100;

  return (
    <>
      <h3 className="title">Funds</h3>

      <div className="row cols-4">
        <StatCard label="Cash balance" sub="available to trade">
          {account ? fmt$(account.balance) : "—"}
        </StatCard>
        <StatCard label="Portfolio value" sub="cash + holdings">
          {account ? fmt$(portfolioValue) : "—"}
        </StatCard>
        <StatCard label="Total return" sub="all time">
          {account ? (
            <PnLValue
              value={totalReturn}
              percent={totalReturnPct}
              showArrow
            />
          ) : (
            "—"
          )}
        </StatCard>
        <StatCard label="Starting capital" sub="simulated funds">
          {fmt$(STARTING_CASH)}
        </StatCard>
      </div>

      <div className="panel funds-note">
        <h4>How funds work here</h4>
        <p>
          BlueChip is a paper-trading platform: every account starts with{" "}
          {fmt$(STARTING_CASH)} of simulated money. Trades execute at real
          live prices from the Gemini exchange, but no real money is ever
          deposited, withdrawn, or at risk.
        </p>
        <p>
          Made a mess of your portfolio? Start over any time — resetting
          wipes your holdings and open orders and restores the starting
          balance.
        </p>
        <button
          className="btn btn-outline"
          onClick={handleReset}
          disabled={resetting || !account}
        >
          {resetting ? "Resetting…" : "Reset account"}
        </button>
      </div>
    </>
  );
};

export default Funds;
