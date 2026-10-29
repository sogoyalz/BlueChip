import { test, expect } from "@playwright/test";

test("production cookie auth works across landing, dashboard subpaths, and proxied API over local HTTPS", async ({ page, context }, testInfo) => {
  const brokenAssets: string[] = [];
  page.on("response", response => {
    if (response.status() === 404 && ["script", "stylesheet", "image"].includes(response.request().resourceType())) brokenAssets.push(response.url());
  });
  await page.goto("/signup");
  const suffix = Date.now().toString(36);
  await page.locator('input[name="email"]').fill(`deployment-${suffix}@example.com`);
  await page.locator('input[name="username"]').fill(`deploy${suffix}`);
  await page.locator('input[name="password"]').fill("deployment-test-password");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("https://localhost:4343/app/");
  await expect(page.getByRole("link", { name: "Orders", exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(cookie => cookie.name === "token");
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  const session = await page.request.post("/backend/", { headers: { "X-Requested-With": "XMLHttpRequest" }, data: {} });
  expect((await session.json()).status).toBe(true);
  const missingApi = await page.request.get("/backend/not-a-route");
  expect(missingApi.status()).toBe(404);
  expect(await missingApi.json()).toEqual({ message: "API route not found" });
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL("https://localhost:4343/app/orders");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Orders/ })).toBeVisible();
  const logo = page.getByRole("img", { name: "BlueChip", exact: true });
  await expect(logo).toHaveAttribute("src", "/app/logo.svg");
  await page.screenshot({ path: testInfo.outputPath("https-dashboard.png"), fullPage: true });
  const logout = await page.request.post("/backend/logout", { headers: { "X-Requested-With": "XMLHttpRequest" }, data: {} });
  expect(logout.ok()).toBe(true);
  expect((await page.request.get("/backend/api/orders")).status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL("https://localhost:4343/login");
  expect(brokenAssets).toEqual([]);
});
