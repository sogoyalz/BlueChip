import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";


vi.mock("axios", () => ({
  __esModule: true,
  default: { post: vi.fn() },
}));

vi.mock("react-toastify", () => ({
  ToastContainer: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
}));

import axios from "axios";
import { toast } from "react-toastify";
import Login from "../login/Login";
import type { Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DASHBOARD_URL } from "../../config";

const mockedPost = axios.post as Mock;
const mockedToastError = toast.error as unknown as Mock;
const mockedToastSuccess = toast.success as unknown as Mock;

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: "a@b.com" },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: "pw" },
  });
  fireEvent.click(screen.getByRole("button", { name: /login/i }));
};

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("posts the entered credentials and shows a failed-login message", async () => {
    mockedPost.mockResolvedValue({
      data: { success: false, message: "Incorrect password or email" },
    });
    render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>,
        );
    fillAndSubmit();

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        "http://localhost:3002/login",
        { email: "a@b.com", password: "pw" },
        { withCredentials: true }
      )
    );
    expect(mockedToastError).toHaveBeenCalledWith("Incorrect password or email");
  });

  test("hands off to the dashboard once the session cookie is set", async () => {
    // The only uncovered path in this file: the success branch. The response
    // has already set the httpOnly cookie, so the dashboard is authenticated
    // the moment it loads — there is no token to pass along.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let assigned = "";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() { return assigned; },
        set href(v: string) { assigned = v; },
      },
    });

    mockedPost.mockResolvedValue({ data: { success: true, message: "Welcome back" } });
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fillAndSubmit();

    await waitFor(() => expect(mockedToastSuccess).toHaveBeenCalledWith("Welcome back"));
    // Deferred so the toast is readable before the page changes.
    expect(assigned).toBe("");
    vi.advanceTimersByTime(1200);
    expect(assigned).toBe(DASHBOARD_URL);
    vi.useRealTimers();
  });

  test("shows the server's message when the API answers with a 4xx", async () => {
    mockedPost.mockRejectedValue({
      response: { data: { message: "All fields are required" } },
    });
    render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>,
        );
    fillAndSubmit();

    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith("All fields are required")
    );
    // the form unlocks so the user can retry
    expect(screen.getByRole("button", { name: /login/i })).toBeEnabled();
  });
});
