import React from "react";
import { render, screen } from "@testing-library/react";
import PnLValue from "./PnLValue";

const numEl = () => document.querySelector(".num")!;
const arrow = () => document.querySelector(".pnl-arrow");

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

  test("a negative percent still reads as a loss in value mode", () => {
    render(<PnLValue value={-80.5} percent={-2.44} showArrow />);
    expect(numEl()).toHaveClass("loss");
    expect(arrow()).toHaveTextContent("▼");
  });

  // "We don't know" is a third state, not a gain. The unknown placeholder is
  // an em dash, which does not start with a hyphen, so the loss test missed it
  // — every unknown value was painted green, and callers passing showArrow got
  // an up arrow beside a figure they had explicitly marked unavailable.
  // Summary and TopBar both do exactly that when a load fails.
  describe("an unknown value is neither a gain nor a loss", () => {
    test("the placeholder is not coloured as a gain", () => {
      render(<PnLValue text="—" />);
      expect(numEl()).not.toHaveClass("profit");
      expect(numEl()).not.toHaveClass("loss");
    });

    test("and shows no arrow even when asked for one", () => {
      render(<PnLValue text="—" showArrow />);
      expect(arrow()).toBeNull();
    });

    test("a non-finite value renders the placeholder, not 'Infinity'", () => {
      // The old formatter tested isNaN, which Infinity passes, so it reached
      // the screen as the literal word.
      render(<PnLValue value={Infinity} showArrow />);
      expect(screen.getByText("—")).toBeInTheDocument();
      expect(screen.queryByText(/Infinity/)).toBeNull();
      expect(arrow()).toBeNull();
    });

    test("a null value gets no colour and no arrow", () => {
      render(<PnLValue value={null} showArrow />);
      expect(numEl()).not.toHaveClass("profit");
      expect(arrow()).toBeNull();
    });
  });
});
