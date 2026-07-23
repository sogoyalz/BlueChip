import React from "react";
import { render, screen } from "@testing-library/react";
import axios from "axios";
import { toast } from "react-toastify";
import Holdings from "./Holdings";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// chart.js needs a real canvas; the graph isn't under test here.
jest.mock("./VerticalGraph", () => ({
  VerticalGraph: () => <div data-testid="vertical-graph" />,
}));

const mockedGet = axios.get as jest.Mock;
const mockedToastError = toast.error as unknown as jest.Mock;

const holdings = [
  { symbol: "BTCUSD", qty: 2, price: 150, dayChangePct: -1.6 },
  { symbol: "ETHUSD", qty: 3, price: 180, dayChangePct: 0.25 },
];

const renderHoldings = () => render(<Holdings />);

describe("Holdings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  test("surfaces an error toast when the request fails", async () => {
    mockedGet.mockRejectedValue(new Error("network down"));
    renderHoldings();
    expect(await screen.findByText(/no holdings yet/i)).toBeInTheDocument();
    expect(mockedToastError).toHaveBeenCalledWith("Could not load holdings.");
  });
});
