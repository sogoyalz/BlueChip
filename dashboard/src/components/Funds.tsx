import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "react-toastify";

import StatCard from "./shared/StatCard";
import { Account } from "../types";
import { API_URL } from "../config";

const fmt$ = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const Funds = () => {
  const [account, setAccount] = useState<Account | null>(null);

  const loadAccount = useCallback(() => {
    axios
      .get<Account>(`${API_URL}/api/account`, {
        withCredentials: true,
      })
      .then((res) => setAccount(res.data))
      .catch((err) => {
        console.error("Failed to load account:", err);
        toast.error("Could not load account.");
      });
  }, []);

  useEffect(loadAccount, [loadAccount]);

  const portfolioValue = account?.portfolioValue ?? account?.balance ?? 0;

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
      </div>

      <div className="panel funds-note">
        <h4>How funds work here</h4>
        <p>
          BlueChip trades for real against Gemini's sandbox exchange — real
          order matching, real fills, at real live prices, but with test
          funds on a dedicated sandbox account. No real money is ever
          deposited, withdrawn, or at risk. Every trader shares the same
          account, so the balance and holdings above reflect everyone's
          trades together.
        </p>
      </div>
    </>
  );
};

export default Funds;
