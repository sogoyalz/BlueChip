/**
 * Public-readiness tests: rate limiting, health check, body-size cap.
 *
 * NOTE: the auth limiter budget (AUTH_RATE_MAX=3) is shared across this
 * whole file (same IP), so the hammering test runs LAST and the earlier
 * tests' consumption is accounted for.
 */
import request from "supertest";

process.env.TOKEN_KEY = "test-secret";
// Tiny auth window so the 429 path is testable quickly.
process.env.AUTH_RATE_MAX = "3";
process.env.GENERAL_RATE_MAX = "10000";

jest.mock("../model/UserModel", () => ({
  UserModel: { findOne: jest.fn(), findById: jest.fn(), create: jest.fn() },
}));
jest.mock("../model/HoldingsModel", () => ({
  HoldingsModel: { find: jest.fn() },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn() },
}));
jest.mock("../services/snapshots", () => ({
  snapshotUser: jest.fn().mockResolvedValue(undefined),
}));

import { app } from "../index";
import { UserModel } from "../model/UserModel";

const mockedUser = UserModel as unknown as Record<string, jest.Mock>;

describe("GET /healthz", () => {
  test("reports ok with ws + price freshness flags", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.wsConnected).toBe("boolean");
    expect(typeof res.body.pricesFresh).toBe("boolean");
  });
});

describe("body size cap", () => {
  test("rejects payloads over 10kb before they reach any handler", async () => {
    const res = await request(app)
      .post("/signup")
      .send({ email: "a@b.com", password: "pw", username: "a", junk: "y".repeat(20_000) });
    expect(res.status).toBe(413);
  });
});

describe("signup input caps", () => {
  test("rejects oversized fields with 400", async () => {
    // consumes 1 of the 3 auth-limiter slots
    const res = await request(app)
      .post("/signup")
      .send({
        email: "a@b.com",
        username: "x".repeat(100),
        password: "pw",
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too long/i);
  });
});

describe("auth rate limiting (runs last — shares the IP budget)", () => {
  test("hammering /login returns 429 after the limit", async () => {
    mockedUser.findOne.mockResolvedValue(null); // every attempt is a 401
    const attempt = () =>
      request(app).post("/login").send({ email: "a@b.com", password: "x" });

    // Slots 2 and 3 of 3.
    for (let i = 0; i < 2; i++) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/too many/i);
  });
});
