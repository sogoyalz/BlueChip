import { AxiosError } from "axios";

import {
  accountErrorMessage,
  accountErrorToast,
  isExchangeUnavailable,
  EXCHANGE_TOAST_ID,
} from "./apiError";

const axiosErr = (status: number, data: unknown): AxiosError => {
  const e = new AxiosError("failed");
  e.response = { status, data } as AxiosError["response"];
  return e;
};

describe("it can never throw, because every caller is in a catch block", () => {
  // The first version called axios.isAxiosError. A partially-stubbed axios
  // made that undefined, so the helper threw INSIDE the error handler and no
  // toast appeared at all — the failure was silent. An existing test caught it.
  test.each([
    ["undefined", undefined],
    ["null", null],
    ["a bare string", "boom"],
    ["a plain Error", new Error("network")],
    ["an object with no response", { message: "x" }],
    ["a response with no data", { response: { status: 503 } }],
    ["a number", 42],
  ])("survives %s", (_label, value) => {
    expect(() => isExchangeUnavailable(value)).not.toThrow();
    expect(() => accountErrorMessage(value, "fallback")).not.toThrow();
    expect(accountErrorMessage(value, "fallback")).toBe("fallback");
  });
});

describe("recognising an unavailable exchange", () => {
  test("a 503 with the code is recognised", () => {
    expect(
      isExchangeUnavailable(axiosErr(503, { code: "exchange_unavailable" })),
    ).toBe(true);
  });

  test("a plain 500 is not — that is a real failure", () => {
    expect(isExchangeUnavailable(axiosErr(500, { message: "boom" }))).toBe(false);
  });

  test("a 503 without the code is not assumed", () => {
    expect(isExchangeUnavailable(axiosErr(503, { message: "busy" }))).toBe(false);
  });

  test("a non-axios error is not", () => {
    expect(isExchangeUnavailable(new Error("network"))).toBe(false);
  });
});

describe("what the user is told", () => {
  test("the server's explanation is used when it sends one", () => {
    const msg = accountErrorMessage(
      axiosErr(503, {
        code: "exchange_unavailable",
        message: "The exchange connection is not configured on this server.",
      }),
      "Could not load account.",
    );
    expect(msg).toBe("The exchange connection is not configured on this server.");
  });

  test("a real failure keeps the caller's own wording", () => {
    expect(accountErrorMessage(axiosErr(500, {}), "Could not load account.")).toBe(
      "Could not load account.",
    );
  });
});

describe("deduping", () => {
  test("every exchange-unavailable notice shares one id, so it shows once", () => {
    const err = axiosErr(503, { code: "exchange_unavailable" });
    expect(accountErrorToast(err, "account-error").toastId).toBe(EXCHANGE_TOAST_ID);
    expect(accountErrorToast(err, "holdings-error").toastId).toBe(EXCHANGE_TOAST_ID);
  });

  test("genuine failures stay distinguishable", () => {
    const err = axiosErr(500, {});
    expect(accountErrorToast(err, "account-error").toastId).toBe("account-error");
    expect(accountErrorToast(err, "holdings-error").toastId).toBe("holdings-error");
  });
});
