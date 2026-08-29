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

const mockedPost = axios.post as Mock;
const mockedToastError = toast.error as unknown as Mock;

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
