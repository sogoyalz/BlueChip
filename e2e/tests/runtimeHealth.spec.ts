import { test, expect, Page } from "@playwright/test";

import { URLS } from "../support/stack";

/**
 * A broad, cheap net under every route: nothing may log an error, throw, fail a
 * request, or answer 4xx/5xx during an ordinary visit.
 *
 * The other specs assert particular behaviours. This one asserts the absence of
 * noise, which is where a regression usually shows up first — a component that
 * still renders but warns, a request that quietly 404s, a promise nobody
 * awaited. None of that fails a targeted test.
 */
const unique = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      problems.push(`console.error @ ${page.url()}\n      ${m.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (e) => {
    problems.push(`uncaught @ ${page.url()}\n      ${e.message.slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => {
    // Navigating away tears down whatever is still open, and the SSE stream is
    // held open by design — so it is "cancelled" on every route change. That is
    // the feature working, not a failure. Chromium and WebKit report it
    // differently, which is how this surfaced.
    const reason = r.failure()?.errorText ?? "";
    const cancelled = /cancel|abort/i.test(reason);
    if (r.resourceType() === "eventsource" || cancelled) return;
    problems.push(`request failed ${r.url().slice(0, 100)}\n      ${reason}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`);
  });
  return problems;
}

test("every public route loads without errors or failed requests", async ({ page }) => {
  const problems = watch(page);
  for (const route of ["/", "/about", "/product", "/pricing", "/support", "/login", "/signup", "/nope"]) {
    await page.goto(route);
    await page.waitForTimeout(300);
  }
  expect([...new Set(problems)].join("\n")).toBe("");
});

test("every signed-in route loads without errors or failed requests", async ({ page }) => {
  const problems = watch(page);

  await page.goto("/signup");
  await page.fill('input[name="email"]', `rt-${unique()}@example.com`);
  await page.fill('input[name="username"]', `rt${unique()}`);
  await page.fill('input[name="password"]', "e2e-password-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${URLS.dashboard}/**`, { timeout: 30_000 });

  for (const path of ["/", "/orders", "/holdings", "/funds", "/market/BTCUSD"]) {
    await page.goto(`${URLS.dashboard}${path}`);
    // Long enough for the polls and the SSE stream to have run at least once.
    await page.waitForTimeout(1200);
  }
  expect([...new Set(problems)].join("\n")).toBe("");
});
