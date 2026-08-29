import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";

import DepthPanel from "./DepthPanel";

vi.mock("axios", () => ({ __esModule: true, default: { get: vi.fn() } }));
const mockedGet = axios.get as unknown as ReturnType<typeof vi.fn>;

const book = (over: Record<string, unknown> = {}) => ({
  data: {
    symbol: "BTCUSD",
    bids: [[50000, 1.5]],
    asks: [[50010, 2]],
    updatedAt: 1,
    ...over,
  },
});

beforeEach(() => vi.clearAllMocks());

describe("DepthPanel", () => {
  test("renders nothing until the book has levels", async () => {
    mockedGet.mockResolvedValue(book({ bids: [], asks: [] }));
    const { container } = render(<DepthPanel symbol="BTCUSD" />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(container.querySelector(".depth-panel")).toBeNull();
  });

  test("shows both sides and the spread", async () => {
    mockedGet.mockResolvedValue(book());
    render(<DepthPanel symbol="BTCUSD" />);
    expect(await screen.findByText("50,000.00")).toBeInTheDocument();
    expect(screen.getByText("50,010.00")).toBeInTheDocument();
    expect(screen.getByText(/Spread 10\.00/)).toBeInTheDocument();
  });

  test("updates the existing DOM instead of rebuilding it", async () => {
    // Side used to be declared inside DepthPanel's render body, which makes it
    // a new component TYPE every render — React then unmounts and recreates
    // the whole subtree rather than updating it, on every 2.5s poll. Node
    // identity across a re-render is what tells the two apart.
    mockedGet.mockResolvedValue(book());
    const { rerender } = render(<DepthPanel symbol="BTCUSD" />);
    const first = await screen.findByText("50,000.00");

    rerender(<DepthPanel symbol="BTCUSD" />);
    const second = screen.getByText("50,000.00");

    expect(second).toBe(first);
  });

  test("prices a sub-$1 asset with more decimals than a large one", async () => {
    mockedGet.mockResolvedValue(book({ bids: [[0.0899, 1]], asks: [[0.09, 1]] }));
    render(<DepthPanel symbol="DOGEUSD" />);
    expect(await screen.findByText("0.0899")).toBeInTheDocument();
  });
});
