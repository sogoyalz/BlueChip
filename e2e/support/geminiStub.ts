import http from "http";
import { AddressInfo } from "net";

/**
 * A stand-in for Gemini's sandbox, so the browser journey can run an order all
 * the way to "it appears in the list" without depending on the network or on
 * the shared sandbox account's balance.
 *
 * It is mounted under a /sandbox path prefix deliberately: the real client
 * refuses to boot unless its base URL mentions the sandbox, and that guard is
 * there to stop a shared API key ever pointing at production. Satisfying it
 * rather than disabling it keeps the test honest about how the app boots.
 */
export interface GeminiStub {
  url: string;
  /** Orders the stub has accepted, newest last. */
  placed: Array<Record<string, unknown>>;
  close: () => Promise<void>;
}

const PAIRS = ["btcusd", "ethusd", "solusd"];

function candles(): Array<[number, number, number, number, number, number]> {
  const now = Date.now();
  // Most recent first, matching Gemini's ordering.
  return Array.from({ length: 200 }, (_, i) => {
    const base = 50_000 + Math.sin(i / 7) * 900;
    return [
      now - i * 3_600_000,
      base,
      base + 260,
      base - 260,
      base + 120,
      12.5,
    ] as [number, number, number, number, number, number];
  });
}

export async function startGeminiStub(): Promise<GeminiStub> {
  const placed: Array<Record<string, unknown>> = [];
  let nextOrderId = 1000;

  const server = http.createServer((req, res) => {
    const path = (req.url ?? "").replace(/^\/sandbox/, "");
    const send = (body: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (path === "/v1/symbols") return send(PAIRS);

    const ticker = path.match(/^\/v2\/ticker\/([a-z]+)$/);
    if (ticker) {
      return send({
        symbol: ticker[1],
        open: "49000.00",
        close: "50000.00",
        bid: "49990.00",
        ask: "50010.00",
      });
    }

    if (/^\/v2\/candles\//.test(path)) return send(candles());

    if (path === "/v1/balances") {
      return send([
        { currency: "USD", amount: "100000", available: "100000", availableForWithdrawal: "100000" },
        { currency: "BTC", amount: "2", available: "2", availableForWithdrawal: "2" },
      ]);
    }

    // Signed endpoints put their arguments in the base64 payload header, not
    // the body — same as the real API.
    const payloadHeader = req.headers["x-gemini-payload"];
    const payload = payloadHeader
      ? JSON.parse(Buffer.from(String(payloadHeader), "base64").toString())
      : {};

    if (path === "/v1/order/new") {
      const id = String(nextOrderId++);
      const order = {
        order_id: id,
        id,
        client_order_id: payload.client_order_id,
        symbol: payload.symbol,
        side: payload.side,
        price: payload.price,
        avg_execution_price: payload.price,
        // Fills immediately and completely: the journey under test is
        // placement through to display, not partial-fill accounting, which
        // the backend integration suite already covers.
        original_amount: payload.amount,
        executed_amount: payload.amount,
        remaining_amount: "0",
        is_live: false,
        is_cancelled: false,
        timestampms: Date.now(),
      };
      placed.push(order);
      return send(order);
    }

    if (path === "/v1/orders") return send([]);

    if (path === "/v1/order/status") {
      const found = placed.find((o) => o.order_id === payload.order_id);
      return found ? send(found) : send({ message: "not found" }, 404);
    }

    send({ message: `stub has no route for ${path}` }, 404);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/sandbox`,
    placed,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
