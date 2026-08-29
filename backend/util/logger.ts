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

/** How deep to walk before collapsing a value to a placeholder. */
const MAX_DEPTH = 4;

/**
 * Redacts a context object for logging.
 *
 * Walks NESTED values, not just the top level. The shallow version replaced a
 * top-level `token` but then stored the original object for anything else, so
 * emit()'s JSON.stringify serialised `{ request: { apiKey: "..." } }` in full
 * — the one thing this module exists to prevent.
 *
 * It also never throws. Serialising is how the size cap is measured, and
 * JSON.stringify dies on a circular structure (an Express req, a Mongoose
 * document, some driver errors). Every call here sits inside a catch block, so
 * a throw would replace the real error with a serialisation error — and in
 * alert() it would break the orphaned-fill path, the one report that cannot be
 * reconstructed afterwards.
 */
function redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && value.length > MAX_VALUE_CHARS) {
      return `${value.slice(0, MAX_VALUE_CHARS)}…`;
    }
    return typeof value === "bigint" || typeof value === "function"
      ? String(value)
      : value;
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Date) return value.toISOString();

  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redact(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (v === undefined) continue;
    out[key] = redact(v, depth + 1, seen);
  }
  return out;
}

function safe(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (REDACT.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value === undefined) continue;
    // An Error is exempt from the size cap below: the stack is the single most
    // useful thing in an error log, and capping it turned the whole object
    // into a truncated string.
    if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message, stack: value.stack };
      continue;
    }
    const cleaned = redact(value, 0, new WeakSet());
    // Size cap, measured on the redacted form so a secret is never rendered
    // just to count its characters.
    if (cleaned !== null && typeof cleaned === "object") {
      let rendered: string;
      try {
        rendered = JSON.stringify(cleaned) ?? "";
      } catch {
        out[key] = "[unserializable]";
        continue;
      }
      out[key] =
        rendered.length > MAX_VALUE_CHARS
          ? `${rendered.slice(0, MAX_VALUE_CHARS)}…`
          : cleaned;
      continue;
    }
    out[key] = cleaned;
  }
  return out;
}

function emit(level: Level, event: string, context: Record<string, unknown>): void {
  let line: string;
  try {
    line = JSON.stringify({
      level,
      event,
      at: new Date().toISOString(),
      ...safe(context),
    });
  } catch {
    // Last resort: report the event even if its context cannot be rendered.
    // Losing the detail beats losing the fact that something happened.
    line = JSON.stringify({
      level,
      event,
      at: new Date().toISOString(),
      contextError: "context could not be serialized",
    });
  }
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
