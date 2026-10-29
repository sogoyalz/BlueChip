import { sandboxBase, envInteger } from "../config/runtime";
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
test.each([
  "https://api.gemini.com", "https://api.gemini.com/sandbox/..",
  "https://api.sandbox.gemini.com.attacker.example", "http://api.sandbox.gemini.com",
  "https://api.sandbox.gemini.com/?sandbox", "https://user:secret@api.sandbox.gemini.com",
])("rejects a misleading sandbox URL: %s", value => {
  expect(() => sandboxBase(value)).toThrow(/sandbox/);
});
test("allows only the canonical sandbox or an explicit local test stub", () => {
  expect(sandboxBase()).toBe("https://api.sandbox.gemini.com");
  process.env.GEMINI_ALLOW_TEST_URL = "true";
  process.env.NODE_ENV = "test";
  expect(sandboxBase("http://127.0.0.1:4312/sandbox")).toBe("http://127.0.0.1:4312/sandbox");
  process.env.NODE_ENV = "production";
  expect(() => sandboxBase("http://127.0.0.1:4312/sandbox")).toThrow();
});
test("numeric configuration preserves zero and rejects invalid values", () => {
  process.env.REVIEW_NUMBER = "0";
  expect(envInteger("REVIEW_NUMBER", 3000)).toBe(0);
  for (const value of ["-1", "NaN", "1.5", "Infinity"]) {
    process.env.REVIEW_NUMBER = value;
    expect(() => envInteger("REVIEW_NUMBER", 3000)).toThrow();
  }
});
