import { test, expect, Page } from "@playwright/test";

import { URLS } from "../support/stack";

/**
 * Guards against the worst defect this project has had.
 *
 * MarketDetail consumes the price context, so it re-renders on every SSE
 * frame. It used to pass `candles.slice(-120)` — a fresh array each render —
 * so Chart.js saw a changed dataset and repainted the entire candlestick
 * chart, measured at 4,524 canvas operations a minute while completely idle.
 *
 * The fix was memoising the slice and the dataset, hoisting the static options
 * to module scope, and wrapping the component in React.memo. Every one of
 * those is invisible: delete any of them and the app still looks and behaves
 * correctly, it just burns a phone battery. Nothing but a measurement catches
 * that, so here is the measurement.
 */
const unique = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function signInAndOpenMarket(page: Page) {
  await page.goto("/signup");
  await page.fill('input[name="email"]', `perf-${unique()}@example.com`);
  await page.fill('input[name="username"]', `perf${unique()}`);
  await page.fill('input[name="password"]', "e2e-password-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${URLS.dashboard}/**`, { timeout: 30_000 });

  await page.goto(`${URLS.dashboard}/market/BTCUSD`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll("canvas").length > 0, {
    timeout: 20_000,
  });
  // Let the entry animation finish. Counting from the moment a canvas exists
  // measures Chart.js drawing itself in for the first time — legitimate work
  // that has nothing to do with whether the page repaints while idle. The
  // first version of this test did exactly that and reported ~880 draws on
  // code that is in fact completely quiet.
  await page.waitForTimeout(2_000);
}

/** Count canvas draw calls by wrapping the 2D context. */
async function countRepaints(page: Page, ms: number): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { __paints: number };
    w.__paints = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.beginPath;
    proto.beginPath = function (...args: []) {
      w.__paints += 1;
      return original.apply(this, args);
    };
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => (window as unknown as { __paints: number }).__paints);
}

test("the candlestick chart does not repaint while idle", async ({ page }) => {
  await signInAndOpenMarket(page);

  // Long enough for several SSE frames: the stream broadcasts every 2s, and
  // it is precisely those frames that used to trigger a full repaint.
  const paints = await countRepaints(page, 8_000);

  // Zero is the honest expectation once the entry animation is done: nothing
  // on this page animates by itself. The allowance is only so a future
  // deliberate flourish does not fail the build; the regression this guards
  // produced hundreds in this window.
  expect(paints).toBeLessThan(20);
});

test("a real timeframe change still repaints — the memo must not freeze the chart", async ({
  page,
}) => {
  // The opposite failure: memoising too aggressively would leave the chart
  // showing stale candles forever, which no idle measurement would reveal.
  await signInAndOpenMarket(page);

  await page.evaluate(() => {
    const w = window as unknown as { __paints: number };
    w.__paints = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.beginPath;
    proto.beginPath = function (...args: []) {
      w.__paints += 1;
      return original.apply(this, args);
    };
  });

  await page.getByRole("tab", { name: "1D" }).click();
  await expect(page.getByRole("tab", { name: "1D" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.waitForTimeout(1_500);

  const paints = await page.evaluate(
    () => (window as unknown as { __paints: number }).__paints,
  );
  expect(paints).toBeGreaterThan(0);
});
