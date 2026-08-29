import React from "react";
import { render, screen } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";
import Holdings from "./Holdings";
import type { Mock } from "vitest";

vi.mock("axios", () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// chart.js needs a real canvas; the graph isn't under test here.
vi.mock("./VerticalGraph", () => ({
  VerticalGraph: () => <div data-testid="vertical-graph" />,
}));

const mockedGet = axios.get as Mock;
const mockedToastError = toast.error as unknown as Mock;

const holdings = [
  { symbol: "BTCUSD", qty: 2, price: 150, dayChangePct: -1.6 },
  { symbol: "ETHUSD", qty: 3, price: 180, dayChangePct: 0.25 },
];

const renderHoldings = () => render(<Holdings />);

describe("Holdings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows a loading row while the request is in flight", () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    renderHoldings();
    expect(screen.getByText(/loading holdings/i)).toBeInTheDocument();
  });

  test("shows the empty state when there are no holdings", async () => {
    mockedGet.mockResolvedValue({ data: [] });
    renderHoldings();
    expect(await screen.findByText(/no holdings yet/i)).toBeInTheDocument();
    expect(screen.getByText("Holdings (0)")).toBeInTheDocument();
  });

  test("renders rows and computes current value from the data", async () => {
    mockedGet.mockResolvedValue({ data: holdings });
    renderHoldings();
    expect(await screen.findByText("BTCUSD")).toBeInTheDocument();

    // current = 2*150 + 3*180 = 840
    expect(screen.getByText("$840.00")).toBeInTheDocument();

    // 24h-change colouring derives from the sign of the value
    expect(screen.getByText("-1.60%")).toHaveClass("loss");
    expect(screen.getByText("+0.25%")).toHaveClass("profit");
  });

  test("keeps the decimals a sub-dollar price needs", async () => {
    // num() is fixed at 2dp, which turns 0.0899 into "0.09" — the exact case
    // price() exists for.
    mockedGet.mockResolvedValue({
      data: [{ symbol: "DOGEUSD", qty: 100, price: 0.0899, dayChangePct: 1 }],
    });
    renderHoldings();
    expect(await screen.findByText("0.0899")).toBeInTheDocument();
    expect(screen.queryByText("0.09")).not.toBeInTheDocument();
  });

  test("surfaces an error toast when the request fails", async () => {
    mockedGet.mockRejectedValue(new Error("network down"));
    renderHoldings();
    await screen.findByText(/couldn.t load holdings/i);
    // toastId dedupes so a retry / StrictMode double-mount can't stack two
    // identical toasts (visible in the browser before this was added).
    expect(mockedToastError).toHaveBeenCalledWith(
      "Could not load holdings.",
      expect.objectContaining({ toastId: "holdings-error" })
    );
  });

  describe("a failed load is not the same as an empty portfolio", () => {
    test("does not claim the user owns nothing when the request failed", async () => {
      // "No holdings yet. Buy the first crypto" is a statement of fact about
      // the account. On a failed request we do not know it, and asserting it
      // is worse than saying nothing.
      mockedGet.mockRejectedValue(new Error("network down"));
      renderHoldings();
      await screen.findByText(/couldn.t load holdings/i);
      expect(screen.queryByText(/no holdings yet/i)).not.toBeInTheDocument();
    });

    test("shows an unknown current value, not a fabricated $0.00", async () => {
      // A trading UI reporting "$0.00" for an unknown balance does not read as
      // a placeholder — it reads as "your positions are gone".
      mockedGet.mockRejectedValue(new Error("network down"));
      renderHoldings();
      await screen.findByText(/couldn.t load holdings/i);
      expect(screen.getByText("—")).toBeInTheDocument();
      expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    });

    test("omits the count in the heading while it is unknown", async () => {
      mockedGet.mockRejectedValue(new Error("network down"));
      renderHoldings();
      await screen.findByText(/couldn.t load holdings/i);
      expect(screen.queryByText("Holdings (0)")).not.toBeInTheDocument();
      expect(screen.getByText("Holdings")).toBeInTheDocument();
    });

    test("a holding with no price shows no value, not $0.00", async () => {
      // The backend types price as optional and leaves it out whenever the
      // symbol is missing from its price cache. `(price ?? 0) * qty` rendered
      // "0.00", which asserts the position is worthless.
      mockedGet.mockResolvedValue({
        data: [{ symbol: "DOGEUSD", qty: 500, dayChangePct: 1 }],
      });
      renderHoldings();
      await screen.findByText("DOGEUSD");
      expect(screen.queryByText("0.00")).not.toBeInTheDocument();
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    test("one unpriced holding makes the TOTAL unknown, not merely smaller", async () => {
      // Summing an unknown as zero publishes a total we know is too low.
      mockedGet.mockResolvedValue({
        data: [
          { symbol: "BTCUSD", qty: 2, price: 150, dayChangePct: 0 },
          { symbol: "DOGEUSD", qty: 500, dayChangePct: 0 },
        ],
      });
      renderHoldings();
      await screen.findByText("DOGEUSD");
      expect(screen.queryByText("$300.00")).not.toBeInTheDocument();
    });

    test("a genuinely empty portfolio still reports zero, not unknown", async () => {
      // The distinction has to cut both ways or it is useless.
      mockedGet.mockResolvedValue({ data: [] });
      renderHoldings();
      expect(await screen.findByText(/no holdings yet/i)).toBeInTheDocument();
      expect(screen.getByText("$0.00")).toBeInTheDocument();
      expect(screen.getByText("Holdings (0)")).toBeInTheDocument();
    });
  });
});
