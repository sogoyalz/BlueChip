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

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
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
  test("the landing page and login form have no violations", async ({ page }) => {
    await page.goto("/login");
    const { violations } = await scan(page);
    expect(describeViolations(violations)).toBe("");
  });

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
