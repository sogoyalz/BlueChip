import bcrypt from "bcrypt";
import { hashPasswordHook } from "../schemas/UserSchema";
import { validateSymbolsAgainstGemini, SYMBOLS, isSupported } from "../config/symbols";

describe("UserSchema hashPasswordHook", () => {
  test("hashes the password when it was modified", async () => {
    const doc = {
      isModified: (path: string) => path === "password",
      password: "plaintext-secret",
    };
    await hashPasswordHook.call(doc);
    expect(doc.password).not.toBe("plaintext-secret");
    expect(await bcrypt.compare("plaintext-secret", doc.password)).toBe(true);
  });

  test("leaves the password alone when it was NOT modified (balance-save regression)", async () => {
    const existingHash = await bcrypt.hash("plaintext-secret", 4);
    const doc = {
      isModified: () => false,
      password: existingHash,
    };
    await hashPasswordHook.call(doc);
    expect(doc.password).toBe(existingHash);
  });
});

describe("symbols config", () => {
  test("isSupported knows the curated pairs", () => {
    expect(isSupported("BTCUSD")).toBe(true);
    expect(isSupported("AAPL")).toBe(false);
  });

  test("validateSymbolsAgainstGemini drops delisted pairs", async () => {
    const before = SYMBOLS.length;
    const live = SYMBOLS.map((s) => s.symbol).filter((s) => s !== "AVAXUSD");
    await validateSymbolsAgainstGemini(async () => live);
    expect(SYMBOLS.length).toBe(before - 1);
    expect(isSupported("AVAXUSD")).toBe(false);
    expect(isSupported("BTCUSD")).toBe(true);
  });

  test("a Gemini outage leaves the list untouched", async () => {
    const before = SYMBOLS.length;
    await validateSymbolsAgainstGemini(async () => {
      throw new Error("network down");
    });
    expect(SYMBOLS.length).toBe(before);
  });
});
