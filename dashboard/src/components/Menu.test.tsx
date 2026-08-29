import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";

import Menu from "./Menu";

vi.mock("axios", () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn() },
}));
const mockedGet = axios.get as unknown as ReturnType<typeof vi.fn>;

const renderAt = (path: string) => {
  mockedGet.mockResolvedValue({ data: { username: "trader" } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Menu />
    </MemoryRouter>,
  );
};

beforeEach(() => vi.clearAllMocks());

describe("Menu navigation", () => {
  // The active item was distinguished by colour alone, so nothing announced
  // which page you were on.
  test("marks the current page with aria-current", async () => {
    renderAt("/orders");
    const orders = await screen.findByRole("link", { name: "Orders" });
    expect(orders).toHaveAttribute("aria-current", "page");
  });

  test("and only the current one", async () => {
    renderAt("/orders");
    await screen.findByRole("link", { name: "Orders" });
    expect(screen.getByRole("link", { name: "Holdings" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("a route with no nav entry marks nothing current", async () => {
    renderAt("/market/BTCUSD");
    await screen.findByRole("link", { name: "Dashboard" });
    for (const name of ["Dashboard", "Orders", "Holdings", "Funds"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
  });
});

describe("the account dropdown", () => {
  const openIt = async () => {
    renderAt("/");
    const trigger = await screen.findByRole("button", { name: /trader/i });
    fireEvent.click(trigger);
    return trigger;
  };

  test("opens and closes on the trigger", async () => {
    const trigger = await openIt();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
  });

  test("Escape closes it and hands focus back to the trigger", async () => {
    const trigger = await openIt();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument(),
    );
    expect(document.activeElement).toBe(trigger);
  });

  test("a click outside closes it", async () => {
    await openIt();
    fireEvent.mouseDown(document.body);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument(),
    );
  });

  test("a click inside does NOT close it", async () => {
    await openIt();
    fireEvent.mouseDown(screen.getByRole("button", { name: /logout/i }));
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });

  test("does not claim menu semantics it has no children for", async () => {
    // aria-haspopup="menu" promises menuitem children and arrow-key
    // navigation. This is one button revealing one other button.
    const trigger = await openIt();
    expect(trigger).not.toHaveAttribute("aria-haspopup");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
