import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { URLS } from "../support/stack";

/**
 * Automated WCAG scanning of every signed-in surface.
 *
 * This is not a substitute for driving the app with a real screen reader —
 * axe cannot tell you whether a description makes sense, only whether one
 * exists. It does catch the whole class of defect this project had before:
 * missing landmarks, unlabelled controls, contrast below AA, tables without
 * header association.
 */

const unique = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function signIn(page: Page) {
  await page.goto("/signup");
  await page.fill('input[name="email"]', `a11y-${unique()}@example.com`);
  await page.fill('input[name="username"]', `a11y${unique()}`);
  await page.fill('input[name="password"]', "e2e-password-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${URLS.dashboard}/**`, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

// best-practice is included deliberately alongside the WCAG tags. The rules
// that catch a page with no <h1>, or headings that skip a level, live only in
// that tag — filtering it out is how the market page kept an <h2> as its own
// heading while every other route used <h1>, with the scan reporting clean.
const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();

/**
 * Readable failure output — axe's raw JSON is unusable in a test report. For
 * contrast failures it also prints the measured ratio and the two colours,
 * which is what you need to pick the replacement.
 */
const describeViolations = (
  violations: Awaited<ReturnType<typeof scan>>["violations"],
) =>
  violations
    .map((v) => {
      const nodes = v.nodes.map((n) => {
        const data = n.any?.[0]?.data as
          | { contrastRatio?: number; fgColor?: string; bgColor?: string; expectedContrastRatio?: string }
          | undefined;
        const detail = data?.contrastRatio
          ? ` — ${data.contrastRatio}:1 (${data.fgColor} on ${data.bgColor}, needs ${data.expectedContrastRatio})`
          : "";
        return `      ${n.target.join(" ")}${detail}`;
      });
      return `${v.id} (${v.impact}): ${v.help}\n${nodes.join("\n")}`;
    })
    .join("\n");

test.describe("accessibility", () => {
  // Every public route, not one of them. This used to scan /login alone and
  // report "the landing page" clean — six of the other seven routes had no
  // <main> at all, and /pricing used brand red as text at 3.73:1.
  for (const route of ["/", "/about", "/product", "/pricing", "/support", "/login", "/signup", "/nope"]) {
    test(`the landing route ${route} has no violations`, async ({ page }) => {
      await page.goto(route);
      const { violations } = await scan(page);
      expect(describeViolations(violations)).toBe("");
    });
  }

  test("the signed-in dashboard has no violations", async ({ page }) => {
    await signIn(page);
    const { violations } = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  for (const route of ["orders", "holdings", "funds"]) {
    test(`the ${route} page has no violations`, async ({ page }) => {
      await signIn(page);
      await page.getByRole("link", { name: new RegExp(route, "i") }).click();
      await expect(page).toHaveURL(new RegExp(route));
      const { violations } = await scan(page);
      expect(describeViolations(violations)).toBe("");
    });
  }

  test("the market page has no violations", async ({ page }) => {
    // The richest route in the app — candlestick chart, depth panel, timeframe
    // tabs — and the one the watchlist's Chart button lands on. It was not
    // covered until an h2-as-page-heading slipped through here.
    await signIn(page);

    const chart = page.getByRole("button", { name: /BTC chart/i });
    await expect(chart).toBeVisible({ timeout: 20_000 });
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await chart.click();

    await expect(page).toHaveURL(/\/market\/BTCUSD/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Park the pointer somewhere neutral first. Navigating by clicking leaves
    // the mouse on the trigger, so MUI keeps its tooltip mounted in a
    // body-level portal — outside every landmark, which the region rule then
    // reports. That is a transient hover affordance, not page content, and
    // scanning around it measures the page a reader actually gets.
    await page.mouse.move(0, 0);
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);

    const { violations } = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

  // Every scan above runs at the desktop viewport. The app's worst defect ever
  // found was mobile-only — the trade actions rendered on hover, which a tap
  // never fires — so the narrow viewport deserves its own pass rather than an
  // assumption that it behaves the same.
  test.describe("at a phone viewport", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("the dashboard has no violations", async ({ page }) => {
      await signIn(page);
      const { violations } = await scan(page);
      expect(describeViolations(violations)).toBe("");
    });

    test("the landing page has no violations", async ({ page }) => {
      await page.goto("/");
      const { violations } = await scan(page);
      expect(describeViolations(violations)).toBe("");
    });

    test("nothing overflows the viewport horizontally", async ({ page }) => {
      // A page wider than the screen means side-scrolling to read it, which is
      // WCAG 1.4.10 reflow and is invisible at desktop width.
      await signIn(page);
      const overflow = await page.evaluate(() => ({
        docWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(overflow.docWidth).toBeLessThanOrEqual(overflow.viewport + 1);
    });

    test("the trade actions are reachable without hovering", async ({ page }) => {
      // The original critical bug, pinned at the viewport it broke on.
      await signIn(page);
      await expect(page.getByRole("button", { name: /^Buy BTC$/ })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: /^Sell BTC$/ })).toBeVisible();
    });
  });

  test("the order ticket has no violations while open", async ({ page }) => {
    await signIn(page);

    const buy = page.getByRole("button", { name: /^Buy BTC$/ });
    await expect(buy).toBeVisible({ timeout: 20_000 });
    const box = (await buy.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await buy.click();

    await expect(page.getByRole("dialog", { name: /buy btcusd/i })).toBeVisible();
    const { violations } = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });
});
