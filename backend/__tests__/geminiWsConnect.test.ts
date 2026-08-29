/**
 * The WebSocket reliability model: reconnect with backoff, a watchdog for
 * half-open sockets, and a generation counter so a zombie socket can never
 * write over a live one.
 *
 * The file's own header lists these as its guarantees, and connect(),
 * scheduleReconnect(), startGeminiWs() and stopGeminiWs() were all uncovered —
 * the reconnect path only runs when the network misbehaves, which is exactly
 * when nobody is watching.
 */
type Handler = (...args: unknown[]) => void;

class FakeSocket {
  static instances: FakeSocket[] = [];
  handlers: Record<string, Handler[]> = {};
  sent: string[] = [];
  terminated = false;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  on(event: string, fn: Handler) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  emit(event: string, ...args: unknown[]) {
    for (const fn of this.handlers[event] ?? []) fn(...args);
  }
}

jest.mock("ws", () => ({
  __esModule: true,
  default: class {
    constructor(url: string) {
      return new (require("./geminiWsConnect.test").FakeSocketRef)(url) as never;
    }
  },
}));

// The mock factory is hoisted above this file's body, so it reaches the class
// through a late-bound reference rather than closing over it.
export const FakeSocketRef = FakeSocket;

import {
  startGeminiWs,
  stopGeminiWs,
  isWsConnected,
  backoffDelay,
} from "../services/geminiWs";

const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1];

beforeEach(() => {
  jest.useFakeTimers();
  FakeSocket.instances = [];
});
afterEach(() => {
  stopGeminiWs();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("connecting", () => {
  test("opens a socket and subscribes to the l2 feed on open", () => {
    startGeminiWs();
    expect(FakeSocket.instances).toHaveLength(1);

    latest().emit("open");
    expect(isWsConnected()).toBe(true);

    const sub = JSON.parse(latest().sent[0]);
    expect(sub.type).toBe("subscribe");
    expect(sub.subscriptions[0].name).toBe("l2");
    expect(sub.subscriptions[0].symbols).toContain("BTCUSD");
  });

  test("starting twice does not open a second socket", () => {
    startGeminiWs();
    startGeminiWs();
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe("reconnecting", () => {
  test("a close schedules a reconnect rather than giving up", () => {
    startGeminiWs();
    latest().emit("open");
    latest().emit("close");

    expect(isWsConnected()).toBe(false);
    // The delay carries +/-20% jitter, so advance past its maximum rather
    // than trying to predict the value production actually drew.
    jest.advanceTimersByTime(2_000);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
  });

  test("backoff grows and is capped", () => {
    const fixed = () => 0.5; // remove the jitter
    expect(backoffDelay(0, fixed)).toBe(1000);
    expect(backoffDelay(1, fixed)).toBe(2000);
    expect(backoffDelay(2, fixed)).toBe(4000);
    expect(backoffDelay(50, fixed)).toBe(30000);
  });

  test("a socket from a previous generation cannot write over the live one", () => {
    startGeminiWs();
    const zombie = latest();
    zombie.emit("open");
    zombie.emit("close");
    jest.advanceTimersByTime(2_000);

    const live = latest();
    expect(live).not.toBe(zombie);
    live.emit("open");
    expect(isWsConnected()).toBe(true);

    // The old socket closing again must not mark the new connection down.
    zombie.emit("close");
    expect(isWsConnected()).toBe(true);
  });

  test("a zombie that opens late terminates itself instead of subscribing", () => {
    startGeminiWs();
    const zombie = latest();
    zombie.emit("close");
    jest.advanceTimersByTime(2_000);

    zombie.emit("open"); // arrives after a newer socket exists
    expect(zombie.terminated).toBe(true);
    expect(zombie.sent).toHaveLength(0);
  });
});

describe("the watchdog", () => {
  test("terminates a socket that has gone silent past the timeout", () => {
    startGeminiWs();
    latest().emit("open");
    const socket = latest();

    // Checked every 10s, and isStalled needs age strictly greater than 30s,
    // so the first check that can trip is the one at 40s.
    jest.advanceTimersByTime(45_000);
    expect(socket.terminated).toBe(true);
    expect(isWsConnected()).toBe(false);
  });

  test("leaves a socket alone while messages keep arriving", () => {
    startGeminiWs();
    latest().emit("open");
    const socket = latest();

    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(9_000);
      socket.emit("message", Buffer.from('{"type":"heartbeat"}'));
    }
    expect(socket.terminated).toBe(false);
    expect(isWsConnected()).toBe(true);
  });
});

describe("stopping", () => {
  test("terminates the socket and cancels any pending reconnect", () => {
    startGeminiWs();
    latest().emit("open");
    const socket = latest();

    stopGeminiWs();
    expect(socket.terminated).toBe(true);
    expect(isWsConnected()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a close after stop does not resurrect the connection", () => {
    startGeminiWs();
    const socket = latest();
    stopGeminiWs();

    socket.emit("close");
    jest.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
