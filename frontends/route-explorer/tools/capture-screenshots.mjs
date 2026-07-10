#!/usr/bin/env node
// Captures the Route Explorer screenshots used in the docs against a running
// local Kubernetes stack (https://app.osprey.localtest.me, auth on).
//
//   npm i --no-save playwright && npx playwright install chromium
//   node tools/capture-screenshots.mjs
//
// Output: docs/images/route-explorer/{explore,route-search,map}.png
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../../docs/images/route-explorer");
mkdirSync(outDir, { recursive: true });

const APP = "https://app.osprey.localtest.me";

const browser = await chromium.launch();
const page = await browser.newPage({
  ignoreHTTPSErrors: true, // mkcert cert is not in the bundled chromium's store
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1, // keeps the committed PNGs sub-megabyte; plenty for README width
});

await page.goto(APP, { waitUntil: "networkidle" });

// The shell redirects to the identity service; its login page has demo quick-fill buttons.
if (page.url().includes("id.osprey")) {
  await page.click('button:has-text("demo-ada")');
  await page.click('button[type="submit"], button:has-text("Sign in")');
  await page.waitForURL(`${APP}/**`, { timeout: 15_000 });
}

await page.click('button:has-text("Route Explorer")');
await page.waitForSelector("h1:has-text('Route Explorer')");

// ── Explore: Arlanda's destinations ─────────────────────────────────────────
await page.fill('input[type="search"]', "arlanda");
await page.click('li button:has-text("ARN")');
await page.waitForSelector("table tbody tr");
await page.waitForTimeout(400); // let the rise animation settle
await page.screenshot({ path: join(outDir, "explore.png") });

// ── Route search: ARN → HND with the inline map ─────────────────────────────
// Visited tabs stay mounted (hidden) — scope every lookup to visible elements.
await page.click('nav button:has-text("Route search")');
const inputs = page.locator('input[type="search"]:visible');
await inputs.nth(0).fill("arlanda");
await page.click('li button:has-text("ARN"):visible');
await inputs.nth(1).fill("haneda");
await page.click('li button:has-text("HND"):visible');
await page.click('button:has-text("Find route")');
await page.waitForSelector("h2:has-text('Itinerary')");
await page.waitForSelector("canvas");
await page.waitForTimeout(1500); // wasm island boots + draws the path
await page.screenshot({ path: join(outDir, "route-search.png") });

// ── Map: zoomed into Europe with city labels ────────────────────────────────
await page.click('nav button:has-text("Map")');
await page.waitForSelector("canvas:visible");
await page.waitForTimeout(1200);
const canvas = page.locator("canvas:visible").last();
const box = await canvas.boundingBox();
if (box) {
  // Europe sits slightly right of centre, upper half, on the equirectangular world.
  const x = box.x + box.width * 0.545;
  const y = box.y + box.height * 0.24;
  await page.mouse.move(x, y);
  for (let i = 0; i < 9; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(120);
  }
}
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "map.png") });

await browser.close();
console.log(`screenshots written to ${outDir}`);
