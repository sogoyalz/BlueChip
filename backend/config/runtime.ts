/** Parse environment numbers explicitly: zero must not silently mean default. */
export function envInteger(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function sandboxBase(raw = "https://api.sandbox.gemini.com"): string {
  const url = new URL(raw);
  const plainOrigin = raw === url.origin || raw === `${url.origin}/`;
  if (plainOrigin && url.origin === "https://api.sandbox.gemini.com") return url.origin;
  // Only the isolated browser test harness may use a local exchange stub.
  if (process.env.NODE_ENV === "test" && process.env.GEMINI_ALLOW_TEST_URL === "true" &&
      url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      !url.username && !url.password && !url.search && !url.hash &&
      raw === `${url.origin}/sandbox`) return raw;
  throw new Error("GEMINI_PRIVATE_API_URL must be the exact HTTPS Gemini sandbox origin");
}
