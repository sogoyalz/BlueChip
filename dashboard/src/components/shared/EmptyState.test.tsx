import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  test("renders the message without an action by default", () => {
    render(<EmptyState message="Nothing here yet." />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("renders and fires the call-to-action", () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        message="No orders."
        actionLabel="Open watchlist"
        onAction={onAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open watchlist" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
