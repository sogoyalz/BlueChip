/**
 * API contract tests. Mongoose models are mocked so no database is needed;
 * bcrypt and JWT are real.
 */
import request from "supertest";
import jwt, { JwtPayload } from "jsonwebtoken";
import bcrypt from "bcrypt";

process.env.TOKEN_KEY = "test-secret";

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
jest.mock("../model/PositionsModel", () => ({
  PositionsModel: { find: jest.fn() },
}));
jest.mock("../model/OrdersModel", () => {
  const OrdersModel = jest.fn(function (this: Record<string, unknown>, doc: object) {
    Object.assign(this, doc);
    this.save = jest.fn().mockResolvedValue(undefined);
  }) as jest.Mock & { find: jest.Mock };
  OrdersModel.find = jest.fn();
  return { OrdersModel };
});

import { app } from "../index";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";
import { OrdersModel } from "../model/OrdersModel";

const mockedUserModel = UserModel as unknown as {
  findOne: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
};
const mockedHoldingsModel = HoldingsModel as unknown as { find: jest.Mock };
const mockedOrdersModel = OrdersModel as unknown as jest.Mock & { find: jest.Mock };

const validToken = () => jwt.sign({ id: "user-1" }, process.env.TOKEN_KEY as string);

const decode = (token: string) =>
  jwt.verify(token, process.env.TOKEN_KEY as string) as JwtPayload;

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
  test("reports status false without a cookie", async () => {
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
    mockedUserModel.findById.mockResolvedValue({ _id: "user-1", username: "alice" });
    const res = await request(app)
      .post("/")
      .set("Cookie", [`token=${validToken()}`])
      .send({});
    expect(res.body).toEqual({ status: true, user: "alice" });
  });
});

describe("GET /allHoldings (auth guard)", () => {
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

  test("returns holdings for a valid bearer token", async () => {
    mockedUserModel.findById.mockResolvedValue({ _id: "user-1", username: "alice" });
    mockedHoldingsModel.find.mockResolvedValue([{ name: "INFY", qty: 2 }]);
    const res = await request(app)
      .get("/allHoldings")
      .set("Authorization", `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ name: "INFY", qty: 2 }]);
  });

  test("accepts the token as a query param (dashboard sends it that way)", async () => {
    mockedUserModel.findById.mockResolvedValue({ _id: "user-1", username: "alice" });
    mockedHoldingsModel.find.mockResolvedValue([]);
    const res = await request(app).get(`/allHoldings?token=${validToken()}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /neworder", () => {
  const authed = () =>
    request(app)
      .post("/neworder")
      .set("Authorization", `Bearer ${validToken()}`);

  beforeEach(() => {
    mockedUserModel.findById.mockResolvedValue({ _id: "user-1", username: "alice" });
  });

  test("rejects requests without a token with 401", async () => {
    const res = await request(app)
      .post("/neworder")
      .send({ name: "INFY", qty: 1, price: 100, mode: "BUY" });
    expect(res.status).toBe(401);
  });

  test("rejects missing fields with 400", async () => {
    const res = await authed().send({ name: "INFY", mode: "BUY" });
    expect(res.status).toBe(400);
    expect(mockedOrdersModel).not.toHaveBeenCalled();
  });

  test("rejects a non-numeric qty with 400 (NaN regression)", async () => {
    const res = await authed().send({
      name: "INFY",
      qty: "abc",
      price: 100,
      mode: "BUY",
    });
    expect(res.status).toBe(400);
    expect(mockedOrdersModel).not.toHaveBeenCalled();
  });

  test("rejects a zero or negative qty with 400", async () => {
    for (const qty of [0, -3]) {
      const res = await authed().send({ name: "INFY", qty, price: 100, mode: "BUY" });
      expect(res.status).toBe(400);
    }
    expect(mockedOrdersModel).not.toHaveBeenCalled();
  });

  test("rejects a negative price with 400", async () => {
    const res = await authed().send({
      name: "INFY",
      qty: 1,
      price: -5,
      mode: "BUY",
    });
    expect(res.status).toBe(400);
    expect(mockedOrdersModel).not.toHaveBeenCalled();
  });

  test("rejects an unknown mode with 400", async () => {
    const res = await authed().send({
      name: "INFY",
      qty: 1,
      price: 100,
      mode: "HOLD",
    });
    expect(res.status).toBe(400);
    expect(mockedOrdersModel).not.toHaveBeenCalled();
  });

  test("saves a valid order and coerces numeric strings", async () => {
    const res = await authed().send({
      name: "INFY",
      qty: "2",
      price: "99.5",
      mode: "BUY",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("order saved");
    expect(mockedOrdersModel).toHaveBeenCalledWith({
      name: "INFY",
      qty: 2,
      price: 99.5,
      mode: "BUY",
    });
  });
});
