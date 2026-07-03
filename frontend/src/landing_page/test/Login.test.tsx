import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// react-router-dom v7 ships as exports-only ESM, which CRA's (frozen) Jest
// resolver cannot load. We only use <Link> here, so mock it with a plain <a>.
jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }),
  { virtual: true }
);

jest.mock("axios", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock("react-toastify", () => ({
  ToastContainer: () => null,
  toast: { error: jest.fn(), success: jest.fn() },
}));

import axios from "axios";
import { toast } from "react-toastify";
import Login from "../login/Login";

const mockedPost = axios.post as jest.Mock;
const mockedToastError = toast.error as unknown as jest.Mock;

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
    jest.clearAllMocks();
  });

  test("posts the entered credentials and shows a failed-login message", async () => {
    mockedPost.mockResolvedValue({
      data: { success: false, message: "Incorrect password or email" },
    });
    render(<Login />);
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
    render(<Login />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith("All fields are required")
    );
    // the form unlocks so the user can retry
    expect(screen.getByRole("button", { name: /login/i })).toBeEnabled();
  });
});
