#!/usr/bin/env node
// Browser-level smoke for the shell + route explorer: real Chromium drives the
// explore → route search → map flow and asserts each step rendered. Runs against
// the compose stack in CI (BASE_URL=http://localhost:5170, auth off) and against
// a local ingress stack with DEMO_LOGIN=1 (signs in as demo-ada).
//
//   npm i && npx playwright install --with-deps chromium
//   BASE_URL=http://localhost:5170 node smoke.mjs
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5170";
const DEMO_LOGIN = process.env.DEMO_LOGIN === "1";
const STEP_TIMEOUT = 30_000;

const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(STEP_TIMEOUT);

const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

let failed = false;
async function step(name, body) {
  try {
    await body();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${name}: ${error}`);
  }
}

await step("shell loads", async () => {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  if (DEMO_LOGIN && page.url().includes("id.")) {
    await page.click('button:has-text("demo-ada")');
    await page.click('button[type="submit"], button:has-text("Sign in")');
    await page.waitForURL(`${BASE_URL}/**`);
  }
  await page.waitForSelector(".shell-nav");
});

await step("route explorer mounts", async () => {
  await page.click('button:has-text("Route Explorer")');
  await page.waitForSelector("h1:has-text('Route Explorer')");
});

await step("explore lists Arlanda's destinations", async () => {
  await page.fill('input[type="search"]', "arlanda");
  await page.click('li button:has-text("ARN")');
  await page.waitForSelector("table tbody tr");
});

await step("route search finds ARN → HND with comparison chips", async () => {
  await page.click('nav button:has-text("Route search")');
  const inputs = page.locator('input[type="search"]:visible');
  await inputs.nth(0).fill("arlanda");
  await page.click('li button:has-text("ARN"):visible');
  await inputs.nth(1).fill("haneda");
  await page.click('li button:has-text("HND"):visible');
  await page.click('button:has-text("Find route")');
  await page.waitForSelector("h2:has-text('Itinerary')");
  await page.waitForSelector("table tbody tr:visible");
});

await step("map renders with a live status line", async () => {
  await page.click('nav button:has-text("Map")');
  await page.waitForSelector("canvas:visible");
  await page.waitForFunction(() => {
    const status = document.querySelectorAll("p");
    return [...status].some((el) => /airports|Itinerary/i.test(el.textContent ?? ""));
  });
});

await browser.close();

if (pageErrors.length > 0) {
  console.error(`✗ ${pageErrors.length} uncaught page error(s):`);
  for (const error of pageErrors) console.error(`  ${error}`);
  failed = true;
}
if (failed) process.exit(1);
console.log("ui smoke passed");
