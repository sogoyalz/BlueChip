import React from "react";
import { render, screen, act } from "@testing-library/react";
import axios from "axios";

import { PricesProvider, usePrices } from "./PricesContext";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), defaults: { headers: { common: {} } } },
}));

const mockedGet = axios.get as jest.Mock;

// Minimal stand-in for the browser's EventSource so we can drive the stream.
class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, (e: unknown) => void> = {};
  onerror: (() => void) | null = null;
  close = jest.fn();

  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(name: string, cb: (e: unknown) => void) {
    this.listeners[name] = cb;
  }
  emit(name: string, data: unknown) {
    this.listeners[name]?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

const Probe = () => {
  const { isStale, prices } = usePrices();
  return (
    <>
      <span data-testid="stale">{String(isStale)}</span>
      <span data-testid="btc">{prices.BTCUSD?.price ?? "none"}</span>
    </>
  );
};

const tick = { price: 50000, changePct24h: 1, updatedAt: Date.now(), source: "ws" as const };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  FakeEventSource.last = null;
  (global as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
  mockedGet.mockResolvedValue({ data: [] }); // /api/symbols
});

afterEach(() => {
  jest.useRealTimers();
});

describe("stale DATA, as opposed to a stale stream", () => {
  // The broadcaster ships the whole price cache every 2s whether or not
  // anything in it changed. So when Gemini's feed dies, frames keep arriving
  // on schedule carrying frozen prices — and a check based on "did a frame
  // arrive recently" stays happy while the numbers on screen are minutes old.
  // That is precisely the situation the Live/Delayed pill exists to report.
  //
  // Both timestamps come from the server, so comparing them is immune to clock
  // skew between the browser and the backend.
  const tickAt = (updatedAt: number) => ({
    BTCUSD: { price: 50000, changePct24h: 1, updatedAt, source: "ws" as const },
  });

  test("flags stale when the frame carries prices the server already knew were old", () => {
    render(
      <PricesProvider>
        <Probe />
      </PricesProvider>
    );
    const serverNow = 1_000_000;
    act(() =>
      FakeEventSource.last!.emit("prices", {
        prices: tickAt(serverNow - 60_000), // a minute stale when it was sent
        updatedAt: serverNow,
      })
    );
    expect(screen.getByTestId("stale")).toHaveTextContent("true");
    // ...and the last known prices are still shown, marked delayed not blanked
    expect(screen.getByTestId("btc")).toHaveTextContent("50000");
  });

  test("does not flag stale for prices that were fresh when sent", () => {
    render(
      <PricesProvider>
        <Probe />
      </PricesProvider>
    );
    const serverNow = 1_000_000;
    act(() =>
      FakeEventSource.last!.emit("prices", {
        prices: tickAt(serverNow - 500),
        updatedAt: serverNow,
      })
    );
    expect(screen.getByTestId("stale")).toHaveTextContent("false");
  });

  test("recovers when the feed comes back", () => {
    render(
      <PricesProvider>
        <Probe />
      </PricesProvider>
    );
    const serverNow = 1_000_000;
    act(() =>
      FakeEventSource.last!.emit("prices", { prices: tickAt(serverNow - 60_000), updatedAt: serverNow })
    );
    expect(screen.getByTestId("stale")).toHaveTextContent("true");
    act(() =>
      FakeEventSource.last!.emit("prices", { prices: tickAt(serverNow + 1000), updatedAt: serverNow + 1000 })
    );
    expect(screen.getByTestId("stale")).toHaveTextContent("false");
  });
});

describe("PricesContext staleness", () => {
  test("clears the stale flag once the stream delivers prices", () => {
    render(
      <PricesProvider>
        <Probe />
      </PricesProvider>
    );
    expect(screen.getByTestId("stale")).toHaveTextContent("true");

    act(() => FakeEventSource.last!.emit("prices", { prices: { BTCUSD: tick } }));

    expect(screen.getByTestId("stale")).toHaveTextContent("false");
    expect(screen.getByTestId("btc")).toHaveTextContent("50000");
  });

  test("goes stale when the stream stops delivering, without an error", () => {
    // EventSource retries a dropped connection silently — no error surfaces
    // here. Only the clock can tell us the prices on screen are frozen.
    render(
      <PricesProvider>
        <Probe />
      </PricesProvider>
    );
    act(() => FakeEventSource.last!.emit("prices", { prices: { BTCUSD: tick } }));
    expect(screen.getByTestId("stale")).toHaveTextContent("false");

    act(() => {
      jest.advanceTimersByTime(20_000); // > STALE_AFTER_MS with no new frame
    });

    expect(screen.getByTestId("stale")).toHaveTextContent("true");
    // The last known prices stay on screen — flagged as delayed, not blanked.
    expect(screen.getByTestId("btc")).toHaveTextContent("50000");
  });

  test("a fresh frame clears the flag again", () => {
    render(
      <PricesProvider>
        <Probe />
      </PricesProvider>
    );
    act(() => FakeEventSource.last!.emit("prices", { prices: { BTCUSD: tick } }));
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.getByTestId("stale")).toHaveTextContent("true");

    act(() => FakeEventSource.last!.emit("prices", { prices: { BTCUSD: tick } }));

    expect(screen.getByTestId("stale")).toHaveTextContent("false");
  });
});
