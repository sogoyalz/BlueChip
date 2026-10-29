/** Validate only the fields that can make an order terminal. Missing/null
 * amounts must never become zero through JavaScript coercion. */
export function usableExchangeObservation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  const amount = (raw: unknown) => (typeof raw === "string" && raw.trim() !== "" || typeof raw === "number") &&
    Number.isFinite(Number(raw)) && Number(raw) >= 0;
  const id = result.order_id;
  return (typeof id === "string" && id.length > 0 || typeof id === "number" && Number.isSafeInteger(id) && id > 0) &&
    amount(result.executed_amount) && amount(result.remaining_amount) &&
    typeof result.is_cancelled === "boolean" && typeof result.is_live === "boolean";
}
