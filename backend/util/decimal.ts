/** Exact decimal arithmetic for exchange increments; never round user limits. */
function parts(value: number | string): { units: bigint; scale: number } {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || text.length > 80) throw new Error("Invalid decimal value");
  const exponent = Number(match[3] ?? 0);
  let scale = (match[2]?.length ?? 0) - exponent;
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 18 || scale > 18) throw new Error("Unsupported decimal precision");
  let units = BigInt(match[1] + (match[2] ?? ""));
  if (scale < 0) { units *= 10n ** BigInt(-scale); scale = 0; }
  return { units, scale };
}

function align(value: number | string, increment: number | string) {
  const a = parts(value), b = parts(increment);
  const scale = Math.max(a.scale, b.scale);
  const units = a.units * 10n ** BigInt(scale - a.scale);
  const step = b.units * 10n ** BigInt(scale - b.scale);
  if (step <= 0n) throw new Error("Invalid exchange increment");
  return { units, step, scale };
}

function render(units: bigint, scale: number): string {
  const digits = units.toString().padStart(scale + 1, "0");
  if (!scale) return digits;
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "");
}

export function canonicalDecimal(value: number | string): string {
  const { units, scale } = parts(value);
  if (units <= 0n) throw new Error("Value must be positive");
  return render(units, scale);
}

export function exactIncrement(value: number | string, increment: number | string): string {
  const { units, step, scale } = align(value, increment);
  if (units <= 0n || units % step !== 0n) throw new Error(`Value must be a positive multiple of ${increment}`);
  return render(units, scale);
}

/** BUY cap rounds down, SELL floor rounds up, preserving the slippage bound. */
export function marketLimit(price: number, side: "BUY" | "SELL", increment: number | string): string {
  const { units, step, scale } = align(price, increment);
  const numerator = units * (side === "BUY" ? 101n : 99n);
  const divisor = 100n * step;
  let ticks = numerator / divisor;
  if (side === "SELL" && numerator % divisor) ticks += 1n;
  if (ticks <= 0n) throw new Error("Price is below the exchange increment");
  return render(ticks * step, scale);
}
