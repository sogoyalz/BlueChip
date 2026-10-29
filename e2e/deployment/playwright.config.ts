import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "*.spec.ts", workers: 1, timeout: 60_000,
  globalSetup: "./setup.ts", globalTeardown: "./teardown.ts",
  reporter: "list", outputDir: "../test-results/deployment",
  use: {
    baseURL: "https://localhost:4343",
    // Only this isolated localhost fixture uses Caddy's self-signed certificate.
    // Public deployment must use a trusted certificate and pass without this.
    ignoreHTTPSErrors: true, trace: "retain-on-failure", screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
