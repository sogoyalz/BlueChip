/**
 * Signed Gemini private-API client: header/signature shape, nonce
 * monotonicity, and the boot-time sandbox guard.
 */
const originalFetch = global.fetch;

beforeEach(() => {
  jest.resetModules();
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_API_SECRET = "test-secret";
  delete process.env.GEMINI_PRIVATE_API_URL;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("boot-time sandbox guard", () => {
  test("refuses to load if GEMINI_PRIVATE_API_URL is not sandbox", () => {
    process.env.GEMINI_PRIVATE_API_URL = "https://api.gemini.com";
    expect(() => require("../services/geminiPrivate")).toThrow(/sandbox/i);
  });

  test("loads fine with the default sandbox URL", () => {
    expect(() => require("../services/geminiPrivate")).not.toThrow();
  });

  test("loads fine with an explicit sandbox URL", () => {
    process.env.GEMINI_PRIVATE_API_URL = "https://api.sandbox.gemini.com";
    expect(() => require("../services/geminiPrivate")).not.toThrow();
  });
});

describe("signed requests", () => {
  test("sends X-GEMINI-* headers with a base64 payload and hex HMAC-SHA384 signature", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ order_id: "1" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { placeGeminiOrder } = require("../services/geminiPrivate");
    await placeGeminiOrder({
      symbol: "BTCUSD",
      amount: "0.1",
      price: "50000",
      side: "buy",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.sandbox.gemini.com/v1/order/new");
    expect(opts.method).toBe("POST");

    const headers = opts.headers as Record<string, string>;
    expect(headers["X-GEMINI-APIKEY"]).toBe("test-key");
    expect(headers["Content-Type"]).toBe("text/plain");

    const payloadJson = JSON.parse(
      Buffer.from(headers["X-GEMINI-PAYLOAD"], "base64").toString("utf8")
    );
    expect(payloadJson.request).toBe("/v1/order/new");
    expect(payloadJson.symbol).toBe("btcusd");
    expect(typeof payloadJson.nonce).toBe("number");

    expect(headers["X-GEMINI-SIGNATURE"]).toMatch(/^[0-9a-f]{96}$/);
  });

  test("nonce strictly increases across consecutive calls", async () => {
    const seen: number[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url, opts) => {
      const headers = opts.headers as Record<string, string>;
      const payload = JSON.parse(
        Buffer.from(headers["X-GEMINI-PAYLOAD"], "base64").toString("utf8")
      );
      seen.push(payload.nonce);
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;

    // Use an uncached endpoint: getGeminiBalances() coalesces/caches, which
    // would (correctly) collapse repeat calls into one fetch. cancelGeminiOrder
    // hits the same signed geminiPrivatePost/nonce path without caching.
    const { cancelGeminiOrder } = require("../services/geminiPrivate");
    await cancelGeminiOrder("1");
    await cancelGeminiOrder("2");
    await cancelGeminiOrder("3");

    expect(seen[1]).toBeGreaterThan(seen[0]);
    expect(seen[2]).toBeGreaterThan(seen[1]);
  });

  test("throws on a non-ok response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch;

    const { cancelGeminiOrder } = require("../services/geminiPrivate");
    await expect(cancelGeminiOrder("123")).rejects.toThrow(/responded 400/);
  });

  test("throws if API key/secret are missing", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_SECRET;
    const { getGeminiBalances } = require("../services/geminiPrivate");
    await expect(getGeminiBalances()).rejects.toThrow(/not configured/);
  });
});

describe("balances cache invalidation", () => {
  const okJson = (body: unknown) => ({ ok: true, json: async () => body });
  const balances = [{ currency: "USD", amount: "100", available: "100", availableForWithdrawal: "100" }];

  test("serves a second read from cache when nothing invalidated it", async () => {
    const mockFetch = jest.fn().mockResolvedValue(okJson(balances));
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getGeminiBalances } = require("../services/geminiPrivate");
    await getGeminiBalances();
    await getGeminiBalances();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("a fetch that was in flight when the cache was cleared does not repopulate it", async () => {
    // Exactly the post-fill race: /v1/balances is already in flight when an
    // order fills and clears the cache. Its result is pre-fill, so caching it
    // would serve stale balances for the whole TTL right when they matter.
    const resolvers: Array<(v: unknown) => void> = [];
    const mockFetch = jest
      .fn()
      .mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getGeminiBalances, clearBalancesCache } = require("../services/geminiPrivate");

    const inFlight = getGeminiBalances();
    clearBalancesCache(); // a fill landed mid-fetch
    resolvers[0](okJson(balances));
    await inFlight;

    void getGeminiBalances();
    expect(mockFetch).toHaveBeenCalledTimes(2); // went back to Gemini, not the cache
  });
});

describe("request timeouts", () => {
  test("every signed request carries an abort signal", async () => {
    // fetch() has no default timeout. Without one, a hung connection holds the
    // handler open forever — and for an order placement the caller cannot tell
    // whether it reached the exchange.
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { getGeminiBalances } = require("../services/geminiPrivate");
    await getGeminiBalances();

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});
