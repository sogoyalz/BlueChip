/**
 * The logging shape, and the guarantee that credentials never reach it.
 */
import { log, alert } from "../util/logger";

const captured: string[] = [];
let errSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  captured.length = 0;
  const grab = (...a: unknown[]) => { captured.push(String(a[0])); };
  errSpy = jest.spyOn(console, "error").mockImplementation(grab);
  logSpy = jest.spyOn(console, "log").mockImplementation(grab);
  warnSpy = jest.spyOn(console, "warn").mockImplementation(grab);
  delete process.env.MONITORING_WEBHOOK_URL;
});

afterEach(() => {
  errSpy.mockRestore(); logSpy.mockRestore(); warnSpy.mockRestore();
});

const parsed = () => JSON.parse(captured[0]);

describe("structured logging", () => {
  test("emits parseable single-line JSON with level, event and timestamp", () => {
    log.error("orders.cancel_failed", { orderId: "abc", userId: "u1" });
    const e = parsed();
    expect(captured[0]).not.toContain("\n");
    expect(e).toMatchObject({ level: "error", event: "orders.cancel_failed", orderId: "abc", userId: "u1" });
    expect(Date.parse(e.at)).not.toBeNaN();
  });

  test("an Error is rendered, not swallowed", () => {
    log.error("orders.place_failed", { err: new Error("boom") });
    expect(parsed().err).toMatchObject({ name: "Error", message: "boom" });
    expect(parsed().err.stack).toContain("boom");
  });
});

describe("credentials never reach the log", () => {
  test.each([
    "password", "token", "secret", "apiKey", "api_key",
    "authorization", "cookie", "signature", "payload",
  ])("%s is redacted", (key) => {
    log.error("auth.failed", { [key]: "super-secret-value", userId: "u1" });
    expect(captured[0]).not.toContain("super-secret-value");
    expect(parsed()[key]).toBe("[redacted]");
    expect(parsed().userId).toBe("u1"); // safe context still survives
  });

  test("redaction is case-insensitive", () => {
    log.error("auth.failed", { Authorization: "Bearer abc.def.ghi" });
    expect(captured[0]).not.toContain("Bearer");
  });

  test("an oversized value is truncated rather than flooding the log", () => {
    log.info("big", { blob: "x".repeat(5000) });
    expect(captured[0].length).toBeLessThan(1500);
  });
});

describe("alert", () => {
  test("always logs, even with no webhook configured", () => {
    alert("orders.orphaned_fill", { geminiOrderId: "gem-1" });
    expect(parsed()).toMatchObject({ level: "alert", event: "orders.orphaned_fill", geminiOrderId: "gem-1" });
  });

  test("does not attempt delivery when no webhook is configured", () => {
    const fetchSpy = jest.spyOn(global, "fetch" as never);
    alert("orders.orphaned_fill", {});
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("forwards to the webhook when one is configured, with secrets redacted", async () => {
    process.env.MONITORING_WEBHOOK_URL = "https://hooks.example/x";
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    alert("orders.orphaned_fill", { geminiOrderId: "gem-1", token: "leaky" });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe("orders.orphaned_fill");
    expect(body.geminiOrderId).toBe("gem-1");
    expect(body.token).toBe("[redacted]");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("a failing webhook never throws into the caller", async () => {
    process.env.MONITORING_WEBHOOK_URL = "https://hooks.example/x";
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    expect(() => alert("orders.orphaned_fill", {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 10)); // let the rejection settle
  });
});
