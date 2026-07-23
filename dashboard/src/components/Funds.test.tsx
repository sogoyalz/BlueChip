import React from "react";
import { render, screen } from "@testing-library/react";
import axios from "axios";
import Funds from "./Funds";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const mockedGet = axios.get as jest.Mock;

const renderFunds = () => render(<Funds />);

describe("Funds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders the shared account balances from the API", async () => {
    mockedGet.mockResolvedValue({
      data: {
        username: "alice",
        email: "a@b.com",
        balance: 80000,
        portfolioValue: 112500,
      },
    });
    renderFunds();
    expect(await screen.findByText("$80,000.00")).toBeInTheDocument();
    expect(screen.getByText("$112,500.00")).toBeInTheDocument();
  });

  test("explains the shared sandbox account", async () => {
    mockedGet.mockResolvedValue({
      data: { username: "alice", email: "a@b.com", balance: 100000 },
    });
    renderFunds();
    expect(
      await screen.findByText(/gemini's sandbox exchange/i)
    ).toBeInTheDocument();
  });
});
