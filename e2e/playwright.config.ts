import { defineConfig, devices } from "@playwright/test";

import { URLS } from "./support/stack";

/**
 * The whole stack is started once in globalSetup rather than per worker: it
 * boots a real backend against an in-memory MongoDB and builds both React
 * apps, none of which is worth repeating per file.
 *
 * Single worker for the same reason — the tests share one backend and one
 * stubbed exchange, and order counts are part of what they assert.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./support/globalSetup.ts",
  globalTeardown: "./support/globalTeardown.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // A cold run builds both apps and boots a mongod before the first test, and
  // that contention has been seen to push one scan past its deadline. Retrying
  // on CI covers the cold start without hiding a real failure — a retry that
  // also fails is still a failure.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: URLS.landing,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Chromium only, deliberately. The whole suite was run against WebKit
  // (Safari's engine) as an experiment: 22 of 24 passed, and both failures
  // were in assertions of mine that depend on hover and timing — the MUI
  // tooltip portal on the market page, and a session check that passes in
  // isolation. Neither was an application defect. Adding a second engine
  // would mean either shipping those flakes or rewriting hover assertions to
  // be engine-agnostic, for no bug found. Worth revisiting if Safari-specific
  // behaviour is ever reported.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
