// Curated list of Gemini spot pairs the platform supports. Kept small so
// the REST poller stays well under Gemini's public rate limit
// (~8 symbols x 6 polls/min = 48 req/min vs the 120/min cap).

export interface SymbolInfo {
  symbol: string; // Gemini pair id, e.g. "BTCUSD"
  base: string; // asset ticker, e.g. "BTC"
  name: string; // display name, e.g. "Bitcoin"
}

export const SYMBOLS: SymbolInfo[] = [
  { symbol: "BTCUSD", base: "BTC", name: "Bitcoin" },
  { symbol: "ETHUSD", base: "ETH", name: "Ethereum" },
  { symbol: "SOLUSD", base: "SOL", name: "Solana" },
  { symbol: "DOGEUSD", base: "DOGE", name: "Dogecoin" },
  { symbol: "XRPUSD", base: "XRP", name: "XRP" },
  { symbol: "LTCUSD", base: "LTC", name: "Litecoin" },
  { symbol: "LINKUSD", base: "LINK", name: "Chainlink" },
  { symbol: "AVAXUSD", base: "AVAX", name: "Avalanche" },
];

const symbolSet = new Set(SYMBOLS.map((s) => s.symbol));

export function isSupported(symbol: string): boolean {
  return symbolSet.has(symbol);
}

export function getSymbolInfo(symbol: string): SymbolInfo | undefined {
  return SYMBOLS.find((s) => s.symbol === symbol);
}

/**
 * Cross-check the curated list against Gemini's live symbol directory and
 * drop anything Gemini no longer trades (delistings happen — e.g. the
 * MATIC→POL migration). Called once at boot; a network failure leaves the
 * list untouched rather than emptying it.
 */
export async function validateSymbolsAgainstGemini(
  fetchSymbols: () => Promise<string[]>
): Promise<void> {
  try {
    const live = new Set((await fetchSymbols()).map((s) => s.toUpperCase()));
    for (let i = SYMBOLS.length - 1; i >= 0; i--) {
      if (!live.has(SYMBOLS[i].symbol)) {
        console.warn(
          `[symbols] ${SYMBOLS[i].symbol} not listed on Gemini — dropping`
        );
        symbolSet.delete(SYMBOLS[i].symbol);
        SYMBOLS.splice(i, 1);
      }
    }
  } catch (err) {
    console.warn("[symbols] could not validate against Gemini:", err);
  }
}
