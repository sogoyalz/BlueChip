import React, { useState, useContext } from "react";
import axios from "axios";
import { toast } from "react-toastify";

import StatCard from "./shared/StatCard";
import { Account } from "../types";
import { API_URL } from "../config";
import { usd } from "./shared/format";
import { accountErrorMessage, accountErrorToast } from "./shared/apiError";
import GeneralContext from "./GeneralContext";
import { useRefresh } from "./shared/useRefresh";


const Funds = () => {
  const [account, setAccount] = useState<Account | null>(null);

  const { orderVersion } = useContext(GeneralContext);
  useRefresh(async (signal) => {
    await axios
      .get<Account>(`${API_URL}/api/account`, {
        withCredentials: true,
        signal,
      })
      .then((res) => { if (!signal.aborted) setAccount(res.data); })
      .catch((err) => {
        if (signal.aborted) return;
        console.error("Failed to load account:", err);
        toast.error(
          accountErrorMessage(err, "Could not load account."),
          accountErrorToast(err, "funds-account-error"),
        );
      });
  }, orderVersion);

  const portfolioValue = account?.portfolioValue ?? account?.balance ?? 0;
  // The backend says so when it could not price every holding, in which case
  // this total omits one and is known to be too low.
  const portfolioKnown =
    account !== null && account.portfolioValueComplete !== false;

  return (
    <>
      <h1 className="title">Funds</h1>

      <div className="row cols-4">
        <StatCard label="Cash balance" sub="total cash, including order holds">
          {account ? usd(account.balance) : "—"}
        </StatCard>
        <StatCard label="Buying power" sub="available to trade">
          {account ? usd(account.availableBalance ?? account.balance) : "—"}
        </StatCard>
        <StatCard label="Portfolio value" sub="cash + holdings">
          {portfolioKnown ? usd(portfolioValue) : "—"}
        </StatCard>
      </div>

      <div className="panel funds-note">
        {/* h3, not h4: the stat cards above are h2, and a heading level
            must not be skipped. */}
        <h3>How funds work here</h3>
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
