import React from "react";
import { render, screen } from "@testing-library/react";
import { CookiesProvider } from "react-cookie";
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
  { name: "INFY", qty: 2, avg: 110, price: 150, net: "+36.36%", day: "-1.60%" },
  { name: "TCS", qty: 3, avg: 200, price: 180, net: "-10.00%", day: "+0.25%" },
];

const renderHoldings = () =>
  render(
    <CookiesProvider>
      <Holdings />
    </CookiesProvider>
  );

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
    expect(
      await screen.findByText(/don't have any holdings yet/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Holdings (0)")).toBeInTheDocument();
  });

  test("renders rows and computes the summary from the data", async () => {
    mockedGet.mockResolvedValue({ data: holdings });
    renderHoldings();
    expect(await screen.findByText("INFY")).toBeInTheDocument();

    // investment = 2*110 + 3*200 = 820; current = 2*150 + 3*180 = 840
    expect(screen.getByText("820.00")).toBeInTheDocument();
    expect(screen.getByText("840.00")).toBeInTheDocument();
    expect(screen.getByText(/20\.00 \(\+2\.44%\)/)).toBeInTheDocument();

    // per-row P&L: INFY 300-220=80.00 (profit), TCS 540-600=-60.00 (loss)
    expect(screen.getByText("80.00")).toHaveClass("profit");
    expect(screen.getByText("-60.00")).toHaveClass("loss");

    // day-change colouring derives from the sign of the value
    expect(screen.getByText("-1.60%")).toHaveClass("loss");
    expect(screen.getByText("+0.25%")).toHaveClass("profit");
  });

  test("surfaces an error toast when the request fails", async () => {
    mockedGet.mockRejectedValue(new Error("network down"));
    renderHoldings();
    expect(
      await screen.findByText(/don't have any holdings yet/i)
    ).toBeInTheDocument();
    expect(mockedToastError).toHaveBeenCalledWith("Could not load holdings.");
  });
});
