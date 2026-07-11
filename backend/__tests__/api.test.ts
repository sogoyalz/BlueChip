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
jest.mock("../model/HoldingsModel", () => ({
  HoldingsModel: { find: jest.fn() },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: { find: jest.fn(), create: jest.fn() },
}));
jest.mock("../services/snapshots", () => ({
  snapshotUser: jest.fn().mockResolvedValue(undefined),
}));

import { app } from "../index";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";

const mockedUserModel = UserModel as unknown as {
  findOne: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
};
const mockedHoldingsModel = HoldingsModel as unknown as { find: jest.Mock };

const validToken = () => jwt.sign({ id: "user-1" }, process.env.TOKEN_KEY as string);

const decode = (token: string) =>
  jwt.verify(token, process.env.TOKEN_KEY as string) as JwtPayload;

const alice = {
  _id: "user-1",
  username: "alice",
  email: "a@b.com",
  balance: 100000,
  createdAt: new Date("2026-01-01"),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /signup", () => {
  test("rejects missing fields with 400", async () => {
    const res = await request(app).post("/signup").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockedUserModel.create).not.toHaveBeenCalled();
  });

  test("rejects an already-registered email with 409", async () => {
    mockedUserModel.findOne.mockResolvedValue({ _id: "existing" });
    const res = await request(app)
      .post("/signup")
      .send({ email: "a@b.com", password: "pw", username: "a" });
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
      balance: 100000,
    });
    const res = await request(app)
      .post("/signup")
      .send({ email: "a@b.com", password: "pw", username: "a" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      id: "user-1",
      email: "a@b.com",
      username: "a",
    });
    expect(JSON.stringify(res.body)).not.toContain("somesecrethash");
    expect(decode(res.body.token).id).toBe("user-1");
  });
});

describe("POST /login", () => {
  test("rejects missing fields with 400", async () => {
    const res = await request(app).post("/login").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects an unknown email with 401", async () => {
    mockedUserModel.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post("/login")
      .send({ email: "a@b.com", password: "pw" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("rejects a wrong password with 401", async () => {
    mockedUserModel.findOne.mockResolvedValue({
      _id: "user-1",
      password: await bcrypt.hash("right-password", 4),
    });
    const res = await request(app)
      .post("/login")
      .send({ email: "a@b.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("logs in with correct credentials", async () => {
    mockedUserModel.findOne.mockResolvedValue({
      _id: "user-1",
      password: await bcrypt.hash("right-password", 4),
    });
    const res = await request(app)
      .post("/login")
      .send({ email: "a@b.com", password: "right-password" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(decode(res.body.token).id).toBe("user-1");
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toContain("token=");
  });
});

describe("POST / (session check)", () => {
  test("reports status false without a token", async () => {
    const res = await request(app).post("/").send({});
    expect(res.body).toEqual({ status: false });
  });

  test("reports status false for a garbage token", async () => {
    const res = await request(app)
      .post("/")
      .set("Cookie", ["token=not-a-jwt"])
      .send({});
    expect(res.body).toEqual({ status: false });
  });

  test("reports status true and the username for a valid cookie", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    const res = await request(app)
      .post("/")
      .set("Cookie", [`token=${validToken()}`])
      .send({});
    expect(res.body).toEqual({ status: true, user: "alice" });
  });

  test("accepts the token in the request body (cross-site production flow)", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    const res = await request(app).post("/").send({ token: validToken() });
    expect(res.body).toEqual({ status: true, user: "alice" });
  });
});

describe("GET /allHoldings", () => {
  test("rejects requests without a token with 401", async () => {
    const res = await request(app).get("/allHoldings");
    expect(res.status).toBe(401);
  });

  test("rejects an invalid token with 401", async () => {
    const badToken = jwt.sign({ id: "user-1" }, "some-other-key");
    const res = await request(app)
      .get("/allHoldings")
      .set("Authorization", `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  test("returns only the authenticated user's holdings", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    mockedHoldingsModel.find.mockResolvedValue([
      { symbol: "BTCUSD", qty: 0.5, avgCost: 60000 },
    ]);
    const res = await request(app)
      .get("/allHoldings")
      .set("Authorization", `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(mockedHoldingsModel.find).toHaveBeenCalledWith({ userId: "user-1" });
    expect(res.body).toEqual([{ symbol: "BTCUSD", qty: 0.5, avgCost: 60000 }]);
  });

  test("accepts the token as a query param (dashboard sends it that way)", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    mockedHoldingsModel.find.mockResolvedValue([]);
    const res = await request(app).get(`/allHoldings?token=${validToken()}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/account", () => {
  test("rejects requests without a token with 401", async () => {
    const res = await request(app).get("/api/account");
    expect(res.status).toBe(401);
  });

  test("returns the authenticated user's account with balance", async () => {
    mockedUserModel.findById.mockResolvedValue(alice);
    const res = await request(app)
      .get("/api/account")
      .set("Authorization", `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
    expect(res.body.email).toBe("a@b.com");
    expect(res.body.balance).toBe(100000);
  });
});
