/**
 * The PUBLIC market-data client: every price, candle and symbol in the app
 * arrives through here, and it had no test file at all.
 */
const originalFetch = global.fetch;

beforeEach(() => {
  jest.resetModules();
  delete process.env.GEMINI_API_URL;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("geminiGet", () => {
  test("calls the documented base URL with a JSON Accept header", async () => {
    const mockFetch = jest.fn().mockResolvedValue(ok(["btcusd"]));
    global.fetch = mockFetch as unknown as typeof fetch;

    const { fetchSymbols } = require("../services/gemini");
    await fetchSymbols();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.gemini.com/v1/symbols");
    expect(init.headers.Accept).toBe("application/json");
  });

  test("carries an abort signal, so a hung upstream cannot pin a handler open", async () => {
    const mockFetch = jest.fn().mockResolvedValue(ok([]));
    global.fetch = mockFetch as unknown as typeof fetch;

    const { fetchSymbols } = require("../services/gemini");
    await fetchSymbols();
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("a non-ok response throws with the status, not a silent empty result", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as never;
    const { fetchSymbols } = require("../services/gemini");
    await expect(fetchSymbols()).rejects.toThrow(/responded 503/);
  });

  test("the base URL is overridable, which is how the E2E stub stands in", async () => {
    process.env.GEMINI_API_URL = "http://127.0.0.1:9999/sandbox";
    const mockFetch = jest.fn().mockResolvedValue(ok([]));
    global.fetch = mockFetch as unknown as typeof fetch;

    const { fetchSymbols } = require("../services/gemini");
    await fetchSymbols();
    expect(mockFetch.mock.calls[0][0]).toBe("http://127.0.0.1:9999/sandbox/v1/symbols");
  });
});

describe("fetchTickerV2", () => {
  const ticker = (open: string, close: string) =>
    jest.fn().mockResolvedValue(ok({ symbol: "btcusd", open, close }));

  test("lowercases the path but returns the symbol uppercased", async () => {
    const mockFetch = ticker("100", "110");
    global.fetch = mockFetch as unknown as typeof fetch;

    const { fetchTickerV2 } = require("../services/gemini");
    const t = await fetchTickerV2("BTCUSD");
    expect(mockFetch.mock.calls[0][0]).toContain("/v2/ticker/btcusd");
    expect(t.symbol).toBe("BTCUSD");
  });

  test("computes the 24h change from open and close", async () => {
    global.fetch = ticker("100", "110") as unknown as typeof fetch;
    const { fetchTickerV2 } = require("../services/gemini");
    await expect(fetchTickerV2("btcusd")).resolves.toMatchObject({
      open: 100,
      close: 110,
      changePct24h: 10,
    });
  });

  test("a fall is negative", async () => {
    global.fetch = ticker("200", "150") as unknown as typeof fetch;
    const { fetchTickerV2 } = require("../services/gemini");
    expect((await fetchTickerV2("btcusd")).changePct24h).toBe(-25);
  });

  test.each([
    ["zero", "0"],
    ["unparseable", "not-a-number"],
    ["empty", ""],
  ])("an %s open yields 0 rather than Infinity or NaN", async (_label, open) => {
    global.fetch = ticker(open, "110") as unknown as typeof fetch;
    const { fetchTickerV2 } = require("../services/gemini");
    const t = await fetchTickerV2("btcusd");
    // Guarding the division is what stops Infinity/NaN reaching the cache.
    // priceFeed then refuses the entry outright if the PRICE is unusable.
    expect(Number.isFinite(t.changePct24h)).toBe(true);
    expect(t.changePct24h).toBe(0);
  });
});

describe("fetchCandles", () => {
  test("builds the pair/timeframe path and passes the body through", async () => {
    const bars = [[1, 2, 3, 4, 5, 6]];
    const mockFetch = jest.fn().mockResolvedValue(ok(bars));
    global.fetch = mockFetch as unknown as typeof fetch;

    const { fetchCandles } = require("../services/gemini");
    await expect(fetchCandles("BTCUSD", "1hr")).resolves.toEqual(bars);
    expect(mockFetch.mock.calls[0][0]).toContain("/v2/candles/btcusd/1hr");
  });
});
