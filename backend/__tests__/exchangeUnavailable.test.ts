/**
 * Absent or rejected exchange credentials is a setup state, not a fault.
 * A fresh clone has no Gemini sandbox key, and reporting that as a 500
 * "Failed to fetch account" makes an ordinary setup step indistinguishable
 * from a bug — and points whoever hits it at entirely the wrong problem.
 */
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.TOKEN_KEY = "test-secret";

jest.mock("../model/UserModel", () => ({
  UserModel: { findOne: jest.fn(), findById: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
}));
jest.mock("../services/geminiPrivate", () => {
  class GeminiUnavailableError extends Error {
    constructor(public reason: string, message: string) {
      super(message);
      this.name = "GeminiUnavailableError";
    }
  }
  return {
    GeminiUnavailableError,
    getGeminiBalances: jest.fn(),
    clearBalancesCache: jest.fn(),
    placeGeminiOrder: jest.fn(),
    cancelGeminiOrder: jest.fn(),
    getGeminiOrderStatus: jest.fn(),
    getGeminiActiveOrders: jest.fn(),
  };
});
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(), isFresh: jest.fn(), getAllPrices: jest.fn(() => ({})), startPolling: jest.fn(),
}));

import { app } from "../index";
import { UserModel } from "../model/UserModel";
import { getGeminiBalances, GeminiUnavailableError } from "../services/geminiPrivate";

const token = () => jwt.sign({ id: "user-1", tv: 0 }, "test-secret");

beforeEach(() => {
  jest.clearAllMocks();
  (UserModel.findById as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: "user-1", username: "u", email: "e", tokenVersion: 0 }),
  });
});

describe.each([
  ["not_configured", "no key on this server"],
  ["rejected", "the exchange refused our key"],
])("when the exchange is unavailable (%s)", (reason, msg) => {
  beforeEach(() => {
    (getGeminiBalances as jest.Mock).mockRejectedValue(
      new (GeminiUnavailableError as unknown as new (r: string, m: string) => Error)(reason, msg)
    );
  });

  test("/api/account answers 503 with a recognisable code, not 500", async () => {
    const res = await request(app).get("/api/account").set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("exchange_unavailable");
    expect(res.body.message).toMatch(/exchange/i);
    // The server's own credentials must never travel to the client.
    expect(JSON.stringify(res.body)).not.toMatch(/key|secret|signature/i);
  });

  test("/api/holdings does the same", async () => {
    const res = await request(app).get("/api/holdings").set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("exchange_unavailable");
  });
});

test("a genuine failure is still a 500", async () => {
  (getGeminiBalances as jest.Mock).mockRejectedValue(new Error("mongo exploded"));
  const res = await request(app).get("/api/account").set("Authorization", `Bearer ${token()}`);
  expect(res.status).toBe(500);
  expect(res.body.code).toBeUndefined();
});
