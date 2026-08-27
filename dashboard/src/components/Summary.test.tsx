import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";

import Summary from "./Summary";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const mockedGet = axios.get as jest.Mock;

// $10k of holdings up 5% today, sitting next to $90k of idle cash.
const holdings = [{ symbol: "BTCUSD", qty: 0.2, price: 50000, dayChangePct: 5 }];
const account = {
  username: "alice",
  email: "a@b.com",
  balance: 90000,
  portfolioValue: 100000,
};

const routeGet = (url: string) => {
  if (url.includes("/api/holdings")) return Promise.resolve({ data: holdings });
  if (url.includes("/api/account")) return Promise.resolve({ data: account });
  return Promise.resolve({ data: { points: [] } });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGet.mockImplementation(routeGet);
});

describe("Summary day-change percentage", () => {
  test("measures the day move against portfolio value, not holdings alone", async () => {
    render(<Summary />);
    await waitFor(() => expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0));

    // The $500 move is 0.5% of the $100k portfolio the figure is displayed on.
    // Dividing by holdings alone would print +5.26% — a ten-fold overstatement
    // driven entirely by how much cash happens to be sitting idle.
    await waitFor(() => expect(screen.getAllByText("+0.50%").length).toBeGreaterThan(0));
    expect(screen.queryByText("+5.26%")).not.toBeInTheDocument();
  });

  test("still reports the dollar move from holdings only", async () => {
    render(<Summary />);
    // Cash doesn't move, so the dollar figure is unaffected by the base change.
    await waitFor(() =>
      expect(screen.getAllByText(/\+\$500\.00/).length).toBeGreaterThan(0)
    );
  });
});

describe("Summary unknown-value handling", () => {
  test("shows placeholders, not $0, when the account call fails", async () => {
    // Rendering "$0" for a balance we failed to fetch is not a neutral
    // placeholder in a trading app — it reads as "your portfolio is empty".
    mockedGet.mockImplementation((url: string) => {
      if (url.includes("/api/holdings")) return Promise.resolve({ data: holdings });
      if (url.includes("/api/account")) return Promise.reject(new Error("500"));
      return Promise.resolve({ data: { points: [] } });
    });

    render(<Summary />);

    await waitFor(() => expect(screen.getAllByText("—").length).toBeGreaterThan(0));
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  test("shows a placeholder for today's P/L when holdings fail to load", async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url.includes("/api/holdings")) return Promise.reject(new Error("500"));
      if (url.includes("/api/account")) return Promise.resolve({ data: account });
      return Promise.resolve({ data: { points: [] } });
    });

    render(<Summary />);

    // The account figures are known and still render; only the holdings-derived
    // P/L is unknown.
    await waitFor(() => expect(screen.getAllByText(/\$100,000/).length).toBeGreaterThan(0));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  test("renders real figures when everything loads", async () => {
    render(<Summary />);
    await waitFor(() =>
      expect(screen.getAllByText(/\+\$500\.00/).length).toBeGreaterThan(0)
    );
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});

describe("Summary chart with nothing to plot", () => {
  test("does not draw a baseline from a portfolio value it does not have", async () => {
    // No snapshot history AND a failed account load: the only number available
    // to anchor a flat line is the 0 fallback. Drawing it asserts a value we
    // never received, right below stat cards that correctly read "—".
    mockedGet.mockImplementation((url: string) => {
      if (url.includes("/api/holdings")) return Promise.resolve({ data: [] });
      if (url.includes("/api/account")) return Promise.reject(new Error("down"));
      return Promise.resolve({ data: { points: [] } });
    });

    const { container } = render(<Summary />);
    await waitFor(() =>
      expect(screen.getAllByText("—").length).toBeGreaterThan(0)
    );

    expect(container.querySelector("svg path")).toBeNull();
    expect(screen.getByText(/no portfolio history/i)).toBeInTheDocument();
  });

  test("still draws a flat baseline when the current value IS known", async () => {
    // One real number is enough to anchor an honest flat line.
    mockedGet.mockImplementation((url: string) => {
      if (url.includes("/api/holdings")) return Promise.resolve({ data: holdings });
      if (url.includes("/api/account")) return Promise.resolve({ data: account });
      return Promise.resolve({ data: { points: [] } });
    });

    const { container } = render(<Summary />);
    await waitFor(() => expect(container.querySelector("svg path")).not.toBeNull());
    expect(screen.queryByText(/no portfolio history/i)).not.toBeInTheDocument();
  });
});

