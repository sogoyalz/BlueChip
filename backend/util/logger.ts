// One logging shape for the whole backend, and a way to escalate the few
// conditions a human genuinely needs to see.
//
// Two problems this solves. Handlers used to call console.error(err) with no
// context, so a production 500 arrived as an anonymous stack. And the one
// condition nothing can self-reconcile — an order live on the exchange that we
// failed to record — was written to stdout on a host where nobody is reading
// stdout.
//
// Output is single-line JSON so a log drain can parse it. There is no
// dependency and no vendor: platforms ingest structured stdout, and
// MONITORING_WEBHOOK_URL can forward alerts anywhere that accepts JSON.

type Level = "info" | "warn" | "error" | "alert";

/** Keys whose values must never reach a log, matched case-insensitively. */
const REDACT = /^(password|token|secret|apikey|api_key|authorization|cookie|signature|payload)$/i;

const MAX_VALUE_CHARS = 500;

/**
 * Shallow-redacts a context object. Anything key-matching REDACT becomes
 * "[redacted]"; an Error becomes its name, message and stack; everything else
 * is truncated so a stray large object cannot flood the log.
 */
function safe(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (REDACT.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message, stack: value.stack };
      continue;
    }
    if (value === undefined) continue;
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    out[key] =
      rendered && rendered.length > MAX_VALUE_CHARS
        ? `${rendered.slice(0, MAX_VALUE_CHARS)}…`
        : value;
  }
  return out;
}

function emit(level: Level, event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...safe(context),
  });
  if (level === "error" || level === "alert") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, context: Record<string, unknown> = {}) => emit("info", event, context),
  warn: (event: string, context: Record<string, unknown> = {}) => emit("warn", event, context),
  error: (event: string, context: Record<string, unknown> = {}) => emit("error", event, context),
};

/**
 * Something a human needs to look at, not just a failed request: money moved
 * and our records may not reflect it. Always logged; additionally forwarded if
 * MONITORING_WEBHOOK_URL is set.
 *
 * Fire-and-forget and fully guarded — monitoring must never be able to break
 * the request that reported the problem, and with no webhook configured this
 * is exactly a structured log line, so development and CI need no setup.
 */
export function alert(event: string, context: Record<string, unknown> = {}): void {
  emit("alert", event, context);

  const url = process.env.MONITORING_WEBHOOK_URL;
  if (!url) return;

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, service: "bluechip-backend", ...safe(context) }),
    signal: AbortSignal.timeout(5_000),
  }).catch((err) => {
    // Never throw out of monitoring, and never recurse into alert().
    console.error(
      JSON.stringify({ level: "warn", event: "monitoring.delivery_failed", at: new Date().toISOString(), message: (err as Error).message })
    );
  });
}
