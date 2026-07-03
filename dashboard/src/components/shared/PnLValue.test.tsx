import React from "react";
import { render, screen } from "@testing-library/react";
import PnLValue from "./PnLValue";

describe("PnLValue", () => {
  test("formats a gain with class, arrow and percent", () => {
    render(<PnLValue value={20} percent={2.44} showArrow />);
    const value = screen.getByText("20.00 (+2.44%)");
    expect(value).toHaveClass("profit");
    expect(screen.getByText("▲")).toHaveClass("profit");
  });

  test("formats a loss value", () => {
    render(<PnLValue value={-60} showArrow />);
    expect(screen.getByText("-60.00")).toHaveClass("loss");
    expect(screen.getByText("▼")).toHaveClass("loss");
  });

  test("derives colour from the sign in text mode", () => {
    render(<PnLValue text="-1.60%" />);
    expect(screen.getByText("-1.60%")).toHaveClass("loss");
  });

  test("renders a dash for malformed values", () => {
    render(<PnLValue value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
