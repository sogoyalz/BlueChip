import { sandboxBase, envInteger } from "../config/runtime";

export interface TradingRules { tickSize: string; quoteIncrement: string; minOrderSize: number }
const cache = new Map<string, { rules: TradingRules; expires: number }>();
const inFlight = new Map<string, Promise<TradingRules>>();

/** Rules come from the same environment that executes the order. Fail closed. */
export async function getTradingRules(symbol: string): Promise<TradingRules> {
  const cached = cache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.rules;
  const pending = inFlight.get(symbol);
  if (pending) return pending;
  const request = (async () => {
    const base = sandboxBase(process.env.GEMINI_PRIVATE_API_URL);
    const response = await fetch(`${base}/v1/symbols/details/${symbol.toLowerCase()}`, {
      signal: AbortSignal.timeout(envInteger("GEMINI_TIMEOUT_MS", 8_000, 1, 60_000)),
    });
    if (!response.ok) throw new Error("Exchange trading rules unavailable");
    const raw = await response.json() as Record<string, unknown>;
    const tick = Number(raw.tick_size), quote = Number(raw.quote_increment), min = Number(raw.min_order_size);
    if (![tick, quote, min].every(n => Number.isFinite(n) && n > 0) || tick > 1 || quote > 1 ||
        String(raw.symbol).toUpperCase() !== symbol || raw.status !== "open") {
      throw new Error("Exchange market is unavailable or returned invalid trading rules");
    }
    const rules = { tickSize: String(raw.tick_size), quoteIncrement: String(raw.quote_increment), minOrderSize: min };
    cache.set(symbol, { rules, expires: Date.now() + 3_600_000 });
    return rules;
  })();
  inFlight.set(symbol, request);
  try { return await request; } finally { inFlight.delete(symbol); }
}
