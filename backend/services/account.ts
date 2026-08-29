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
  /**
   * False when at least one holding could not be priced, so portfolioValue
   * omits its value. Callers must not present an incomplete total as a
   * definite figure.
   */
  complete: boolean;
}

export interface PortfolioCents {
  cashCents: number;
  holdingsCents: number;
  valueCents: number;
  complete: boolean;
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
 * The shared account valued in INTEGER CENTS, with a flag saying whether every
 * holding could actually be priced.
 *
 * `?? 0` used to stand in for a missing price, which valued the position at
 * nothing and folded that into the total — a figure known to be too low, but
 * presented as definite. Reachable whenever a balance is in an asset outside
 * the eight curated symbols (the shared sandbox account can hold anything), or
 * before the price cache has warmed.
 *
 * toCents still throws on anything non-finite, so a malformed balance fails
 * loudly rather than being reported as a null value.
 *
 * One calculation, used by both the account endpoint and the snapshot writer,
 * because two copies of this had already drifted: this one took only the first
 * USD row, the snapshot writer summed all of them.
 */
export async function portfolioCents(): Promise<PortfolioCents> {
  const balances = await getGeminiBalances();

  let cashCents = 0;
  let holdingsCents = 0;
  let complete = true;

  for (const b of balances) {
    if (b.currency === "USD") {
      cashCents += toCents(Number(b.amount));
      continue;
    }
    const live = getPrice(`${b.currency}USD`);
    if (live === undefined) {
      // Skip it AND say so, rather than counting it as zero.
      complete = false;
      continue;
    }
    holdingsCents += toCents(Number(b.amount) * live.price);
  }

  return { cashCents, holdingsCents, valueCents: cashCents + holdingsCents, complete };
}

/** Cash and total portfolio value, in dollars at the edge. */
export async function getAccountTotals(): Promise<AccountTotals> {
  const { cashCents, valueCents, complete } = await portfolioCents();
  return {
    balance: fromCents(cashCents),
    portfolioValue: fromCents(valueCents),
    complete,
  };
}
