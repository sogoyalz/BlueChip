// Account and holdings views over the shared Gemini sandbox account.
//
// Lifted out of the route handlers so the money aggregation can be tested
// without standing up HTTP. Totals are accumulated in INTEGER CENTS: summing
// many float dollar amounts drifts sub-cent, summing integer cents does not.

import { getGeminiBalances, GeminiBalance } from "./geminiPrivate";
import { getPrice } from "./priceFeed";
import { toCents, fromCents } from "../util/money";

export interface HoldingView {
  symbol: string;
  qty: number;
  price?: number;
  dayChangePct?: number;
}

export interface AccountTotals {
  balance: number;
  portfolioValue: number;
}

/** A finite, positive quantity of a non-USD asset. */
function isTradableBalance(b: GeminiBalance): boolean {
  const amount = Number(b.amount);
  // Number.isFinite as well as > 0: a malformed amount can be Infinity, which
  // passes a bare `> 0` and then serialises to null over JSON.
  return b.currency !== "USD" && Number.isFinite(amount) && amount > 0;
}

/** The shared account's non-USD holdings, priced from the shared cache. */
export async function getHoldings(): Promise<HoldingView[]> {
  const balances = await getGeminiBalances();
  return balances.filter(isTradableBalance).map((b) => {
    const symbol = `${b.currency}USD`;
    const live = getPrice(symbol);
    return {
      symbol,
      qty: Number(b.amount),
      price: live?.price,
      dayChangePct: live?.changePct24h,
    };
  });
}

/**
 * Cash and total portfolio value, in dollars at the edge.
 *
 * toCents throws on anything non-finite, so a malformed balance fails loudly
 * here rather than being reported as a null portfolio value.
 */
export async function getAccountTotals(): Promise<AccountTotals> {
  const balances = await getGeminiBalances();
  const usd = balances.find((b) => b.currency === "USD");
  const balanceCents = toCents(Number(usd?.amount ?? 0));

  let holdingsCents = 0;
  for (const b of balances) {
    if (b.currency === "USD") continue;
    const live = getPrice(`${b.currency}USD`);
    holdingsCents += toCents(Number(b.amount) * (live?.price ?? 0));
  }

  return {
    balance: fromCents(balanceCents),
    portfolioValue: fromCents(balanceCents + holdingsCents),
  };
}
