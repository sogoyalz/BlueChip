import { test, expect, Page } from "@playwright/test";

import { URLS } from "../support/stack";

/**
 * The one path that spans all three apps: sign up on the landing site, land on
 * the dashboard as a logged-in user, place an order, and see it in the list.
 *
 * Everything here is covered somewhere by a unit or integration test. What is
 * not covered anywhere else is that the pieces line up in a real browser —
 * that the auth cookie set by the API is actually sent back from a different
 * origin, that CORS and the CSRF header agree, and that the dashboard's own
 * build knows where login lives. Those are exactly the failures that look
 * fine in every isolated test and 401 in production.
 *
 * One limitation worth stating plainly: every service here runs on 127.0.0.1,
 * so the browser treats them as SAME-site regardless of port. That models the
 * recommended deployment — all three under one registrable domain — and it
 * does NOT reproduce the cross-site case where the API and the frontends sit
 * on unrelated domains and the cookie needs COOKIE_SAMESITE=none. Reproducing
 * that needs two real domains and HTTPS, because SameSite=None requires
 * Secure. See render.yaml for both deployment options.
 */

const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function signUp(page: Page) {
  const email = `trader-${unique()}@example.com`;
  const username = `trader${unique()}`;
  const password = "e2e-password-123";

  await page.goto("/signup");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Success hands off to the dashboard, which is a different origin.
  await page.waitForURL(`${URLS.dashboard}/**`, { timeout: 30_000 });
  return { email, username, password };
}

/**
 * Move the real mouse onto a control before clicking it.
 *
 * The watchlist actions are pointer-events:none until their row is hovered —
 * a deliberate desktop refinement, and the row content sits above them until
 * then. Playwright runs its hit-target check before it moves the mouse, so it
 * sees the pre-hover state and reports the price label as intercepting. A
 * mouse move first is what a person's hand does anyway.
 */
async function hoverThenClick(page: Page, locator: ReturnType<Page["getByRole"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("control has no box to click");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await locator.click();
}

test.describe("the order journey, end to end", () => {
  test("sign up, place an order, and see it in the list", async ({ page }) => {
    await signUp(page);

    // Landed on the dashboard as a real session, not bounced back to login.
    await expect(page).toHaveURL(new RegExp(`^${URLS.dashboard}`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Prices arrive from the API, which proves the cross-origin GET works.
    await expect(page.getByRole("button", { name: /^Buy BTC$/ })).toBeVisible({
      timeout: 20_000,
    });

    await hoverThenClick(page, page.getByRole("button", { name: /^Buy BTC$/ }));

    const ticket = page.getByRole("dialog", { name: /buy btcusd/i });
    await expect(ticket).toBeVisible();

    await ticket.locator("#qty").fill("0.25");
    await ticket.getByRole("button", { name: /^buy$/i }).click();

    // The ticket closes on a fill.
    await expect(ticket).toBeHidden({ timeout: 20_000 });

    // And the order is in the list without waiting for the 10s poll —
    // placement triggers an immediate refetch.
    await page.getByRole("link", { name: /orders/i }).click();
    const orders = page.getByRole("table", { name: /your orders/i });
    await expect(orders).toBeVisible();

    // Assert against ONE row rather than "0.25 appears somewhere in the
    // table" — a loose match would pass on a price that happens to contain
    // the digits, and would not notice a BUY placed as a SELL.
    const row = orders.getByRole("row").filter({ hasText: "BTCUSD" }).first();
    await expect(row).toBeVisible({ timeout: 8_000 });
    await expect(row).toContainText(/buy/i);
    await expect(row).toContainText("0.25");
    await expect(row).toContainText(/filled/i);
  });

  test("the session survives a reload, and logout actually ends it", async ({ page }) => {
    const { username } = await signUp(page);

    // A reload re-reads the cookie from a different origin than set it. If
    // sameSite were wrong this is where it would 401 and bounce to login.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`^${URLS.dashboard}`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The profile button is named after the signed-in user, which also proves
    // the dashboard loaded this account rather than a cached one.
    await page.getByRole("button", { name: new RegExp(username, "i") }).click();
    await page.getByRole("button", { name: /log ?out/i }).click();

    await page.waitForURL(/\/login/, { timeout: 20_000 });

    // The token is revoked server-side, not just cleared locally: going back
    // to the dashboard must not restore the session.
    await page.goto(URLS.dashboard);
    await page.waitForURL(/\/login/, { timeout: 20_000 });
  });
});

test.describe("guards hold in a real browser", () => {
  test("the dashboard is not reachable without a session", async ({ page }) => {
    await page.goto(URLS.dashboard);
    await page.waitForURL(/\/login/, { timeout: 20_000 });
  });
});
