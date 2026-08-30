/**
 * The session gate. It decides whether you see the dashboard or get sent to
 * login, and it had no tests at all.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import type { Mock } from "vitest";

import Home from "./Home";
import { LOGIN_URL } from "../config";

vi.mock("axios", () => ({
  __esModule: true,
  default: { post: vi.fn(), get: vi.fn() },
}));

// The children are exercised by their own suites; this is about the gate.
vi.mock("./TopBar", () => ({ default: () => <div data-testid="topbar" /> }));
vi.mock("./Dashboard", () => ({ default: () => <div data-testid="dashboard" /> }));
vi.mock("./PricesContext", () => ({
  PricesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockedPost = axios.post as unknown as Mock;

let assigned: string;
beforeEach(() => {
  vi.clearAllMocks();
  assigned = "";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return assigned;
      },
      set href(v: string) {
        assigned = v;
      },
    },
  });
});

describe("Home session gate", () => {
  test("renders nothing while the check is in flight", () => {
    mockedPost.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Home />);
    // Not a spinner and not the dashboard: showing the dashboard before the
    // session is confirmed would flash authenticated content at a signed-out
    // visitor.
    expect(container).toBeEmptyDOMElement();
    expect(assigned).toBe("");
  });

  test("renders the dashboard once the session is confirmed", async () => {
    mockedPost.mockResolvedValue({ data: { status: true, user: "trader" } });
    render(<Home />);
    expect(await screen.findByTestId("dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
    expect(assigned).toBe("");
  });

  test("sends the cookie with the check", async () => {
    mockedPost.mockResolvedValue({ data: { status: true } });
    render(<Home />);
    await screen.findByTestId("dashboard");
    // Auth rides an httpOnly cookie; without withCredentials it is never sent
    // and every session would look invalid.
    expect(mockedPost).toHaveBeenCalledWith(
      expect.any(String),
      {},
      expect.objectContaining({ withCredentials: true }),
    );
  });

  test("redirects to login when the session is rejected", async () => {
    mockedPost.mockResolvedValue({ data: { status: false } });
    render(<Home />);
    await waitFor(() => expect(assigned).toBe(LOGIN_URL));
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });

  test("redirects when the check fails outright", async () => {
    mockedPost.mockRejectedValue(new Error("backend down"));
    render(<Home />);
    await waitFor(() => expect(assigned).toBe(LOGIN_URL));
  });

  test("does not navigate after unmount", async () => {
    // The cancelled guard: a check that resolves after the user has already
    // left must not yank them to login from wherever they went.
    let resolve!: (v: unknown) => void;
    mockedPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { unmount } = render(<Home />);
    unmount();
    resolve({ data: { status: false } });
    await Promise.resolve();
    expect(assigned).toBe("");
  });

  test("does not navigate after unmount when the check rejects", async () => {
    let reject!: (e: unknown) => void;
    mockedPost.mockReturnValue(new Promise((_r, rj) => { reject = rj; }));
    const { unmount } = render(<Home />);
    unmount();
    reject(new Error("late failure"));
    await Promise.resolve();
    expect(assigned).toBe("");
  });
});
