/**
 * Records the README demo GIF against a locally running BlueChip:
 * sign up a fresh user, place a crossed LIMIT buy from the watchlist,
 * then watch the matching engine fill it on the Orders page.
 *
 * Prereqs: backend on :3002 and dashboard on :3001 (npm start in each).
 * Usage:   npm install && npm run record
 * Output:  ../../docs/screenshots/demo.gif
 *
 * Uses puppeteer-core with the system Chrome (no browser download) and
 * assembles the GIF in pure JS (gifenc + pngjs — no ffmpeg).
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const { PNG } = require("pngjs");

const API = "http://localhost:3002";
const DASH = "http://localhost:3001";
const OUT = path.resolve(__dirname, "../../docs/screenshots/demo.gif");
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const VIEW = { width: 1120, height: 700 };
const FRAME_DELAY_MS = 140; // playback speed in the GIF

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Fresh demo account so the flow always starts from $100k.
  const email = `gif-${Date.now()}@bluechip.dev`;
  const signup = await fetch(`${API}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo-pass-1", username: "demo" }),
  }).then((r) => r.json());
  if (!signup.token) throw new Error("signup failed: " + JSON.stringify(signup));

  const prices = await fetch(`${API}/api/prices`).then((r) => r.json());
  const btc = prices.prices.BTCUSD?.price;
  if (!btc) throw new Error("no live BTC price — is the backend feed up?");
  // Slightly above market => already crossed => the matcher fills it.
  const limitPrice = Math.round(btc * 1.005 * 100) / 100;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [`--window-size=${VIEW.width},${VIEW.height}`],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEW);

  const frames = [];
  const snap = async (n = 1, gapMs = 250) => {
    for (let i = 0; i < n; i++) {
      frames.push(Buffer.from(await page.screenshot({ type: "png" })));
      if (i < n - 1) await sleep(gapMs);
    }
  };

  console.log("→ dashboard");
  await page.goto(`${DASH}/?token=${signup.token}`, { waitUntil: "networkidle2" });
  await page.waitForSelector(".watchlist-container .list li", { timeout: 30000 });
  await sleep(1500); // let live prices land
  await snap(6, 300);

  console.log("→ open Buy modal for BTC");
  const btcRow = await page.waitForSelector(".watchlist-container .list li");
  await btcRow.hover();
  await sleep(400);
  await snap(2, 200);
  await page.waitForSelector(".actions .buy");
  await page.click(".actions .buy");
  await page.waitForSelector(".trade-modal");
  await snap(3, 250);

  console.log("→ switch to LIMIT and fill the ticket");
  const limitTab = await page.$$(".type-row .mode-tab");
  await limitTab[1].click();
  await snap(2, 200);
  await page.type("#qty", "0.05", { delay: 60 });
  await snap(2, 200);
  await page.click("#price", { clickCount: 3 });
  await page.type("#price", String(limitPrice), { delay: 40 });
  await snap(3, 250);

  console.log("→ place the order");
  await page.click(".trade-modal .btn-red");
  await sleep(600); // toast appears, modal closes
  await snap(4, 300);

  console.log("→ Orders page, wait for the matcher to fill");
  await page.click('a[href="/orders"] p, a[href="/orders"]');
  await page.waitForSelector(".order-table table tbody tr", { timeout: 15000 });
  await snap(4, 350);
  // Orders page refreshes every 10s; the matcher fills within ~2s.
  await page.waitForFunction(
    () => document.body.innerText.includes("FILLED"),
    { timeout: 30000, polling: 500 }
  );
  await snap(6, 350);

  console.log("→ Holdings finale");
  await page.click('a[href="/holdings"] p, a[href="/holdings"]');
  await sleep(1200);
  await snap(5, 350);

  await browser.close();

  console.log(`→ encoding ${frames.length} frames`);
  const gifencMod = await import("gifenc");
  const { GIFEncoder, quantize, applyPalette } = gifencMod.default ?? gifencMod;
  const gif = GIFEncoder();
  for (const buf of frames) {
    const png = PNG.sync.read(buf);
    const rgba = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length);
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, png.width, png.height, {
      palette,
      delay: FRAME_DELAY_MS,
    });
  }
  gif.finish();
  fs.writeFileSync(OUT, Buffer.from(gif.bytes()));
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`✓ wrote ${OUT} (${mb} MB, ${frames.length} frames)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
