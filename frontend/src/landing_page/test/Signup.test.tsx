import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("axios", () => ({ __esModule: true, default: { post: vi.fn() } }));
vi.mock("react-toastify", () => ({
  ToastContainer: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
}));

import axios from "axios";
import { toast } from "react-toastify";
import Signup from "../signup/Signup";
import type { Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DASHBOARD_URL } from "../../config";

const mockedPost = axios.post as Mock;
const mockedError = toast.error as unknown as Mock;
const mockedSuccess = toast.success as unknown as Mock;

/**
 * Signup is the twin of Login and had no tests at all, while Login had two.
 * It carries more: a username field, a success path that hands off to the
 * dashboard on a cookie the response just set, and a duplicate-email 409 that
 * arrives as a 4xx body rather than an exception message.
 */
const renderSignup = () =>
  render(
    <MemoryRouter>
      <Signup />
    </MemoryRouter>,
  );

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "trader" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: /create account|sign ?up/i }));
};

let assigned: string;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  assigned = "";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() { return assigned; },
      set href(v: string) { assigned = v; },
    },
  });
});
afterEach(() => vi.useRealTimers());

describe("Signup", () => {
  test("posts every field, and with credentials so the cookie comes back", async () => {
    mockedPost.mockResolvedValue({ data: { success: true, message: "ok" } });
    renderSignup();
    fillAndSubmit();

    await waitFor(() => expect(mockedPost).toHaveBeenCalled());
    const [, body, config] = mockedPost.mock.calls[0];
    expect(body).toMatchObject({
      email: "a@b.com",
      username: "trader",
      password: "password123",
    });
    // Without withCredentials the auth cookie is never stored and the
    // dashboard would bounce straight back to login.
    expect(config).toMatchObject({ withCredentials: true });
  });

  test("hands off to the dashboard on success", async () => {
    mockedPost.mockResolvedValue({ data: { success: true, message: "Welcome" } });
    renderSignup();
    fillAndSubmit();

    await waitFor(() => expect(mockedSuccess).toHaveBeenCalledWith("Welcome"));
    // The redirect is deferred so the toast is readable first.
    expect(assigned).toBe("");
    vi.advanceTimersByTime(1200);
    expect(assigned).toBe(DASHBOARD_URL);
  });

  test("a rejected signup shows the server's reason and does not navigate", async () => {
    mockedPost.mockResolvedValue({ data: { success: false, message: "User already exists" } });
    renderSignup();
    fillAndSubmit();

    await waitFor(() => expect(mockedError).toHaveBeenCalledWith("User already exists"));
    vi.advanceTimersByTime(2000);
    expect(assigned).toBe("");
  });

  test("a 4xx body is surfaced verbatim — that is how a duplicate email arrives", async () => {
    mockedPost.mockRejectedValue({ response: { data: { message: "User already exists" } } });
    renderSignup();
    fillAndSubmit();
    await waitFor(() => expect(mockedError).toHaveBeenCalledWith("User already exists"));
  });

  test("a failure with no message still says something useful", async () => {
    mockedPost.mockRejectedValue(new Error("network down"));
    renderSignup();
    fillAndSubmit();
    await waitFor(() =>
      expect(mockedError).toHaveBeenCalledWith("Something went wrong. Please try again."),
    );
  });

  test("the button re-enables after a failure, so a retry is possible", async () => {
    mockedPost.mockRejectedValue(new Error("network down"));
    renderSignup();
    fillAndSubmit();

    await waitFor(() => expect(mockedError).toHaveBeenCalled());
    const button = screen.getByRole("button", { name: /create account|sign ?up/i });
    expect(button).not.toBeDisabled();
  });

  test("the button stays disabled after success, so one signup is one account", async () => {
    mockedPost.mockResolvedValue({ data: { success: true, message: "ok" } });
    renderSignup();
    fillAndSubmit();

    await waitFor(() => expect(mockedSuccess).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /creating|create account|sign ?up/i })).toBeDisabled();
  });
});
