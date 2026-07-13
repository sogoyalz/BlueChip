/**
 * API contract tests. Mongoose models are mocked so no database is needed;
 * bcrypt and JWT are real.
 */
import request from "supertest";
import jwt, { JwtPayload } from "jsonwebtoken";
import bcrypt from "bcrypt";

process.env.TOKEN_KEY = "test-secret";
// Auth limits are exercised in hardening.test.ts; keep them out of the way here.
process.env.AUTH_RATE_MAX = "10000";
process.env.GENERAL_RATE_MAX = "10000";

jest.mock("../model/UserModel", () => ({
  UserModel: {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn(), create: jest.fn() },
}));
jest.mock("../services/geminiPrivate", () => ({
  getGeminiBalances: jest.fn(),
}));
jest.mock("../services/snapshots", () => ({
  snapshotNow: jest.fn().mockResolvedValue(undefined),
  startSnapshots: jest.fn(),
}));

import { app } from "../index";
import { UserModel } from "../model/UserModel";
import { getGeminiBalances } from "../services/geminiPrivate";

const mockedUserModel = UserModel as unknown as {
  findOne: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
};
const mockedGetBalances = getGeminiBalances as jest.Mock;

// tv must match the stored user's tokenVersion (0 for the alice mock below).
const validToken = () =>
  jwt.sign({ id: "user-1", tv: 0 }, process.env.TOKEN_KEY as string);

// State-changing requests must carry the CSRF header; wrap post() to add it.
const csrfPost = (path: string) =>
  request(app).post(path).set("X-Requested-With", "XMLHttpRequest");

const decode = (token: string) =>
  jwt.verify(token, process.env.TOKEN_KEY as string) as JwtPayload;

// Pull the JWT out of the Set-Cookie header (auth lives in the cookie, not
// the response body).
const tokenFromCookie = (res: { headers: Record<string, unknown> }): string => {
  const setCookie = res.headers["set-cookie"] as unknown as string[];
  const match = setCookie.join(";").match(/token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

const alice = {
  _id: "user-1",
  username: "alice",
  email: "a@b.com",
  createdAt: new Date("2026-01-01"),
  tokenVersion: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /signup", () => {
  test("rejects missing fields with 400", async () => {
    const res = await csrfPost("/signup").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockedUserModel.create).not.toHaveBeenCalled();
  });

  test("rejects a too-short password with 400", async () => {
    const res = await csrfPost("/signup")
      .send({ email: "a@b.com", password: "short7!", username: "a" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 8/i);
    expect(mockedUserModel.create).not.toHaveBeenCalled();
  });

  test("rejects an already-registered email with 409", async () => {
    mockedUserModel.findOne.mockResolvedValue({ _id: "existing" });
    const res = await csrfPost("/signup")
      .send({ email: "a@b.com", password: "password123", username: "a" });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test("rejects an unparseable email with 400", async () => {
    const res = await csrfPost("/signup")
      .send({ email: "not-an-email", password: "password123", username: "a" });
    expect(res.status).toBe(400);
    expect(mockedUserModel.create).not.toHaveBeenCalled();
  });

  test("normalizes the email to lowercase before lookup and create", async () => {
    mockedUserModel.findOne.mockResolvedValue(null);
    mockedUserModel.create.mockResolvedValue({
      _id: "user-1", email: "a@b.com", username: "a", tokenVersion: 0,
    });
    await csrfPost("/signup")
      .send({ email: "  A@B.com ", password: "password123", username: "a" });
    expect(mockedUserModel.findOne).toHaveBeenCalledWith({ email: "a@b.com" });
    expect(mockedUserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@b.com" })
    );
  });

  test("turns a duplicate-key race (E11000) into a 409, not a 500", async () => {
    mockedUserModel.findOne.mockResolvedValue(null); // passes the pre-check
    mockedUserModel.create.mockRejectedValue({ code: 11000 }); // index rejects
    const res = await csrfPost("/signup")
      .send({ email: "a@b.com", password: "password123", username: "a" });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test("creates a user and never returns the password hash", async () => {
    mockedUserModel.findOne.mockResolvedValue(null);
    mockedUserModel.create.mockResolvedValue({
      _id: "user-1",
      email: "a@b.com",
      username: "a",
      password: "$2b$12$somesecrethash",
    });
    const res = await csrfPost("/signup")
      .send({ email: "a@b.com", password: "password123", username: "a" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      id: "user-1",
      email: "a@b.com",
      username: "a",
    });
    expect(JSON.stringify(res.body)).not.toContain("somesecrethash");
    expect(res.body.token).toBeUndefined(); // token is cookie-only now
    expect(decode(tokenFromCookie(res)).id).toBe("user-1");
  });
});

describe("POST /login", () => {
  test("rejects missing fields with 400", async () => {
    const res = await csrfPost("/login").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects a non-string email (NoSQL operator injection) with 400", async () => {
    const res = await csrfPost("/login")
      .send({ email: { $gt: "" }, password: "whatever" });
    expect(res.status).toBe(400);
    expect(mockedUserModel.findOne).not.toHaveBeenCalled();
  });

  test("rejects a non-string password with 400", async () => {
    const res = await csrfPost("/login")
      .send({ email: "a@b.com", password: { $gt: "" } });
    expect(res.status).toBe(400);
    expect(mockedUserModel.findOne).not.toHaveBeenCalled();
  });

  test("rejects an unknown email with 401", async () => {
    mockedUserModel.findOne.mockResolvedValue(null);
    const res = await csrfPost("/login")
      .send({ email: "a@b.com", password: "pw" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("rejects a wrong password with 401", async () => {
    mockedUserModel.findOne.mockResolvedValue({
      _id: "user-1",
      password: await bcrypt.hash("right-password", 4),
    });
    const res = await csrfPost("/login")
      .send({ email: "a@b.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("logs in with correct credentials", async () => {
    mockedUserModel.findOne.mockResolvedValue({
      _id: "user-1",
      password: await bcrypt.hash("right-password", 4),
    });
    const res = await csrfPost("/login")
      .send({ email: "a@b.com", password: "right-password" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeUndefined(); // token is cookie-only now
    expect(decode(tokenFromCookie(res)).id).toBe("user-1");
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toContain("token=");
  });
});

describe("POST / (session check)", () => {
  test("reports status false without a token", async () => {
    const res = await csrfPost("/").send({});
    expect(res.body).toEqual({ status: false });
  });

  test("reports status false for a garbage token", async () => {
    const res = await csrfPost("/")
      .set("Cookie", ["token=not-a-jwt"])
      .send({});
    expect(res.body).toEqual({ status: false });
  });

  test("reports status true and the username for a valid cookie", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    const res = await csrfPost("/")
      .set("Cookie", [`token=${validToken()}`])
      .send({});
    expect(res.body).toEqual({ status: true, user: "alice" });
  });

  test("accepts the token in the request body (cross-site production flow)", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    const res = await csrfPost("/").send({ token: validToken() });
    expect(res.body).toEqual({ status: true, user: "alice" });
  });

  test("rejects a token whose version is behind the user's (revoked)", async () => {
    // User's tokenVersion was bumped to 1; the token still carries tv:0.
    mockedUserModel.findById.mockResolvedValue({ ...alice, tokenVersion: 1 });
    const res = await csrfPost("/")
      .set("Cookie", [`token=${validToken()}`])
      .send({});
    expect(res.body).toEqual({ status: false });
  });
});

describe("GET /api/holdings", () => {
  test("rejects requests without a token with 401", async () => {
    const res = await request(app).get("/api/holdings");
    expect(res.status).toBe(401);
  });

  test("rejects an invalid token with 401", async () => {
    const badToken = jwt.sign({ id: "user-1" }, "some-other-key");
    const res = await request(app)
      .get("/api/holdings")
      .set("Authorization", `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  test("returns the shared account's non-USD balances", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    mockedGetBalances.mockResolvedValue([
      { currency: "USD", amount: "40000", available: "40000", availableForWithdrawal: "40000" },
      { currency: "BTC", amount: "0.5", available: "0.5", availableForWithdrawal: "0.5" },
    ]);
    const res = await request(app)
      .get("/api/holdings")
      .set("Authorization", `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ symbol: "BTCUSD", qty: 0.5 }),
    ]);
  });

  test("rejects a token supplied as a query param (URL tokens leak into logs)", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    mockedGetBalances.mockResolvedValue([]);
    const res = await request(app).get(`/api/holdings?token=${validToken()}`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/account", () => {
  test("rejects requests without a token with 401", async () => {
    const res = await request(app).get("/api/account");
    expect(res.status).toBe(401);
  });

  test("returns the authenticated user's account with the shared cash balance", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    mockedGetBalances.mockResolvedValue([
      { currency: "USD", amount: "100000", available: "100000", availableForWithdrawal: "100000" },
    ]);
    const res = await request(app)
      .get("/api/account")
      .set("Authorization", `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
    expect(res.body.email).toBe("a@b.com");
    expect(res.body.balance).toBe(100000);
  });
});
