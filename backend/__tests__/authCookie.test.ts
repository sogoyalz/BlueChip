/**
 * The cookie attributes are a deployment decision that silently breaks all
 * authentication when it is wrong — the browser just stops sending the cookie
 * and every request 401s. These tests pin the resolution rules.
 *
 * AuthController resolves sameSite at module load, so each case needs a fresh
 * module registry with the environment already set.
 */
describe("auth cookie sameSite resolution", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL };
    process.env.TOKEN_KEY = "test-only-key-that-is-definitely-long-enough-32";
  });

  afterAll(() => {
    process.env = ORIGINAL;
  });

  const load = () => require("../controllers/AuthController");

  test("defaults to lax when nothing is configured", () => {
    delete process.env.COOKIE_SAMESITE;
    expect(() => load()).not.toThrow();
  });

  test("accepts none in production, where Secure is set", () => {
    process.env.NODE_ENV = "production";
    process.env.COOKIE_SAMESITE = "none";
    expect(() => load()).not.toThrow();
  });

  test("refuses none outside production, because Secure would be absent", () => {
    process.env.NODE_ENV = "development";
    process.env.COOKIE_SAMESITE = "none";
    expect(() => load()).toThrow(/requires NODE_ENV=production/);
  });

  test("refuses a value that is not a SameSite mode", () => {
    process.env.COOKIE_SAMESITE = "yes-please";
    expect(() => load()).toThrow(/must be one of lax, none, strict/);
  });

  test("is case- and whitespace-insensitive", () => {
    process.env.NODE_ENV = "production";
    process.env.COOKIE_SAMESITE = "  NONE  ";
    expect(() => load()).not.toThrow();
  });
});
