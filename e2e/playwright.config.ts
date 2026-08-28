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
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: URLS.landing,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
