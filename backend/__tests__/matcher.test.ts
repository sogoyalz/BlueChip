/**
 * Matcher tests: crossing logic, atomic claims, and fill-time rejection.
 */
jest.mock("../model/UserModel", () => ({
  UserModel: { updateOne: jest.fn(), findById: jest.fn() },
}));
jest.mock("../model/HoldingsModel", () => ({
  HoldingsModel: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}));
jest.mock("../model/OrdersModel", () => ({
  OrdersModel: {
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock("../services/priceFeed", () => ({
  getPrice: jest.fn(),
  isFresh: jest.fn(),
}));
jest.mock("../services/snapshots", () => ({
  snapshotUser: jest.fn().mockResolvedValue(undefined),
}));

import { tick, crossed } from "../services/matcher";
import { OrdersModel } from "../model/OrdersModel";
import { UserModel } from "../model/UserModel";
import { HoldingsModel } from "../model/HoldingsModel";
import { getPrice, isFresh } from "../services/priceFeed";

const mockedOrders = OrdersModel as unknown as Record<string, jest.Mock>;
const mockedUser = UserModel as unknown as Record<string, jest.Mock>;
const mockedHoldings = HoldingsModel as unknown as Record<string, jest.Mock>;
const mockedGetPrice = getPrice as jest.Mock;
const mockedIsFresh = isFresh as jest.Mock;

const openLimit = (fields: object) => ({
  _id: "o1",
  userId: "user-1",
  symbol: "BTCUSD",
  type: "LIMIT",
  status: "OPEN",
  qty: 0.1,
  ...fields,
});

const findReturns = (orders: object[]) => {
  mockedOrders.find.mockReturnValue({ limit: jest.fn().mockResolvedValue(orders) });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedIsFresh.mockReturnValue(true);
  mockedUser.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockedHoldings.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockedHoldings.findOne.mockResolvedValue({ qty: 1, avgCost: 50000 });
  mockedHoldings.findOneAndUpdate.mockResolvedValue({});
  mockedHoldings.deleteMany.mockResolvedValue({ deletedCount: 0 });
  mockedOrders.findOneAndUpdate.mockResolvedValue({ _id: "o1" }); // claim wins
});

describe("crossed", () => {
  test("BUY fills at or below the limit; SELL at or above", () => {
    expect(crossed("BUY", 44999, 45000)).toBe(true);
    expect(crossed("BUY", 45000, 45000)).toBe(true);
    expect(crossed("BUY", 45001, 45000)).toBe(false);
    expect(crossed("SELL", 55001, 55000)).toBe(true);
    expect(crossed("SELL", 55000, 55000)).toBe(true);
    expect(crossed("SELL", 54999, 55000)).toBe(false);
  });
});

describe("tick", () => {
  test("fills a crossed BUY limit at the market price (price-or-better)", async () => {
    findReturns([openLimit({ side: "BUY", limitPrice: 45000 })]);
    mockedGetPrice.mockReturnValue({ price: 44000 });
    await tick();
    // Claimed atomically OPEN -> FILLED at market 44000, not the 45000 limit
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "o1", status: "OPEN" },
      { $set: expect.objectContaining({ status: "FILLED", fillPrice: 44000 }) }
    );
    // Portfolio effects ran: debit 0.1 * 44000 = 4400
    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: "user-1", balance: { $gte: 4400 } },
      { $inc: { balance: -4400 } }
    );
  });

  test("skips an uncrossed order entirely", async () => {
    findReturns([openLimit({ side: "BUY", limitPrice: 45000 })]);
    mockedGetPrice.mockReturnValue({ price: 46000 });
    await tick();
    expect(mockedOrders.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockedUser.updateOne).not.toHaveBeenCalled();
  });

  test("fills a crossed SELL limit and books realized P&L", async () => {
    findReturns([openLimit({ side: "SELL", limitPrice: 55000 })]);
    mockedGetPrice.mockReturnValue({ price: 56000 });
    await tick();
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalled();
    // Credit 0.1 * 56000 = 5600; realized (56000 - 50000) * 0.1 = 600
    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: "user-1" },
      { $inc: { balance: 5600, realizedPnl: 600 } }
    );
    // realized P&L persisted onto the order after the fill
    expect(mockedOrders.updateOne).toHaveBeenCalledWith(
      { _id: "o1" },
      { $set: { realizedPnl: 600 } }
    );
  });

  test("never fills on stale market data", async () => {
    findReturns([openLimit({ side: "BUY", limitPrice: 45000 })]);
    mockedIsFresh.mockReturnValue(false);
    await tick();
    expect(mockedOrders.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("a lost claim (user cancelled first) causes no portfolio mutation", async () => {
    findReturns([openLimit({ side: "BUY", limitPrice: 45000 })]);
    mockedGetPrice.mockReturnValue({ price: 44000 });
    mockedOrders.findOneAndUpdate.mockResolvedValue(null); // cancel won the race
    await tick();
    expect(mockedUser.updateOne).not.toHaveBeenCalled();
    expect(mockedHoldings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("insufficient funds at fill time flips the order to REJECTED", async () => {
    findReturns([openLimit({ side: "BUY", limitPrice: 45000 })]);
    mockedGetPrice.mockReturnValue({ price: 44000 });
    mockedUser.updateOne.mockResolvedValue({ modifiedCount: 0 }); // debit refused
    await tick();
    expect(mockedOrders.updateOne).toHaveBeenCalledWith(
      { _id: "o1" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "REJECTED" }),
      })
    );
  });

  test("one bad order doesn't stop the rest of the pass", async () => {
    findReturns([
      openLimit({ _id: "bad", side: "BUY", limitPrice: 45000 }),
      openLimit({ _id: "good", side: "BUY", limitPrice: 45000 }),
    ]);
    mockedGetPrice.mockReturnValue({ price: 44000 });
    mockedOrders.findOneAndUpdate
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValueOnce({ _id: "good" });
    await expect(tick()).resolves.toBeUndefined();
    expect(mockedOrders.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });
});
