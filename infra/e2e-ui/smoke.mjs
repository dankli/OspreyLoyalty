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

await step("member portal dashboard shows balance, tier and benefits", async () => {
  await page.click('.shell-nav button:has-text("Member portal")');
  await page.waitForSelector(".balance");
  await page.waitForSelector("ul.benefits li");
});

await step("activating a benefit mints a code", async () => {
  // Idempotent per run only in effect (a fresh key each click), but the panel flips to
  // "Show code" afterwards, so re-runs exercise both branches.
  const activate = page.locator("ul.benefits button", { hasText: /^(Activate)$/ }).first();
  const showCode = page.locator("ul.benefits button", { hasText: /Show code/ }).first();
  if (await activate.isVisible().catch(() => false)) {
    await activate.click();
  } else {
    await showCode.click();
  }
  await page.waitForSelector(".benefit-code-card .benefit-code");
  const code = await page.textContent(".benefit-code-card .benefit-code");
  if (!/^[A-Z2-9]{8}$/.test((code ?? "").trim())) throw new Error(`unexpected code: ${code}`);
  await page.click('.benefit-code-card button:has-text("Close")');
});

await step("transactions filter narrows server-side", async () => {
  await page.click('nav a:has-text("Transactions")');
  await page.waitForSelector("table.transactions tbody tr");
  await page.selectOption("#tx-filter", "earn");
  await page.waitForFunction(() => {
    const badges = [...document.querySelectorAll("table.transactions .type-badge")];
    return badges.length > 0 && badges.every((el) => el.classList.contains("type-earn"));
  });
});

await step("rewards page lists the managed catalog", async () => {
  await page.click('nav a:has-text("Rewards")');
  await page.waitForFunction(() => /Lounge day pass/i.test(document.body.textContent ?? ""));
});

await step("admin portal mounts its five panels", async () => {
  await page.click('.shell-nav button:has-text("Admin portal")');
  for (const heading of ["Member lookup", "Partner earn rates", "Campaigns", "Rewards", "Audit log"]) {
    await page.waitForSelector(`h2:has-text("${heading}")`);
  }
});

await step("admin quick-pick lookup renders a profile and the audit trail answers", async () => {
  await page.selectOption('select[aria-label="Quick pick member"]', { index: 1 });
  await page.waitForSelector("table:visible");
  // the audit panel either lists entries or says it is empty — both prove the reader answers
  await page.waitForFunction(() => {
    const body = document.body.textContent ?? "";
    return /Audit log/.test(body) && (/adjust_points|set_osprey|erase_member/.test(body) || /No audit entries yet/.test(body));
  });
});

await step("shell language switch relabels chrome and propagates to the portal", async () => {
  // The remote keeps its router state across remounts, so anchor on the nav (present on
  // every member-portal page) rather than any specific page's content.
  await page.click('.shell-nav button:has-text("Member portal")');
  await page.waitForSelector('nav a:has-text("Transactions")');
  await page.selectOption("select.shell-lang", "sv");
  await page.waitForSelector('.shell-nav button:has-text("Medlemsportal")');
  await page.waitForSelector('nav a:has-text("Transaktioner")'); // the mounted remote followed live
  await page.selectOption("select.shell-lang", "en");
  await page.waitForSelector('.shell-nav button:has-text("Member portal")');
});

await browser.close();

if (pageErrors.length > 0) {
  console.error(`✗ ${pageErrors.length} uncaught page error(s):`);
  for (const error of pageErrors) console.error(`  ${error}`);
  failed = true;
}
if (failed) process.exit(1);
console.log("ui smoke passed");
