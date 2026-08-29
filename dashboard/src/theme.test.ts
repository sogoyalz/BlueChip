/**
 * theme.ts says it mirrors the CSS tokens in index.css and that the two must
 * be kept in sync. Nothing enforced that, and they had already drifted: the
 * theme still carried --ink-3 as #6c6c74, the exact value removed from the
 * stylesheet for measuring 3.80:1 against a 4.5:1 requirement. Any MUI
 * component reaching for text.disabled would have rendered at the contrast we
 * had specifically rejected.
 *
 * This reads both files and compares them, so the promise in that comment is
 * checked rather than trusted.
 */
import fs from "fs";
import path from "path";

const read = (f: string) =>
  fs.readFileSync(path.join(__dirname, f), "utf8");

const cssTokens = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of read("index.css").matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
    out[m[1]] = m[2].trim().split(/\s+/)[0].toLowerCase();
  }
  return out;
};

/** Every `"#hex", // --token` pair the theme claims to mirror. */
const themeClaims = (): Array<[string, string]> =>
  [...read("theme.ts").matchAll(/"(#[0-9a-fA-F]{3,8})",\s*\/\/\s*(--[a-z0-9-]+)/g)].map(
    (m) => [m[2], m[1].toLowerCase()]
  );

describe("the MUI theme mirrors the CSS tokens", () => {
  test("finds the pairs to compare at all", () => {
    // Guards the regexes themselves: if either stops matching, the assertions
    // below would pass vacuously.
    expect(themeClaims().length).toBeGreaterThan(5);
    expect(Object.keys(cssTokens()).length).toBeGreaterThan(10);
  });

  test("every token the theme names exists in index.css", () => {
    const tokens = cssTokens();
    for (const [name] of themeClaims()) {
      expect(Object.keys(tokens)).toContain(name);
    }
  });

  test("and carries the same value", () => {
    const tokens = cssTokens();
    const drifted = themeClaims()
      .filter(([name, value]) => tokens[name] !== value)
      .map(([name, value]) => `${name}: theme has ${value}, css has ${tokens[name]}`);
    expect(drifted).toEqual([]);
  });
});
