/**
 * Behavioral regression: bell open → re-press closes (no close→reopen via click retarget).
 * Isolated harness + Playwright; does not touch production DB/session.
 *
 * Usage (from repo root):
 *   node server/scripts/verify-manager-bell-toggle.mjs
 */
import { createRequire } from "node:module";
import { createServer } from "vite";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const { chromium, devices } = require("/opt/clover/.npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const CHROME = "/opt/clover/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";
const OUT = "/tmp/clover-bell-toggle-verify.json";

const harnessRoot = path.join(root, "server/scripts/fixtures/manager-bell-toggle-harness");
assert.ok(fs.existsSync(path.join(harnessRoot, "vite.config.js")), "harness missing");

function record(report, width, name, pass, detail = "") {
  const bucket = report.widths[width] || (report.widths[width] = { pass: [], fail: [] });
  (pass ? bucket.pass : bucket.fail).push({ name, detail });
  (pass ? report.ok : report.defects).push({ width, name, detail });
}

async function panelCount(page) {
  return page.locator(".manager-bell-panel--portal").count();
}

async function backdropCount(page) {
  return page.locator(".manager-bell-backdrop").count();
}

async function hitTrigger(page) {
  return page.evaluate(() => {
    const btn = document.querySelector(".manager-bell-trigger");
    const r = btn.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const el = document.elementFromPoint(x, y);
    return {
      x,
      y,
      isTrigger: !!el?.closest?.(".manager-bell-trigger"),
      isBackdrop: !!el?.closest?.(".manager-bell-backdrop"),
      className: String(el?.className || ""),
    };
  });
}

async function pressTrigger(page, { touch }) {
  const box = await page.locator(".manager-bell-trigger").boundingBox();
  assert.ok(box, "trigger box missing");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.waitForTimeout(150);
}

async function ensureOpen(page, touch) {
  if ((await panelCount(page)) === 1) return;
  await pressTrigger(page, { touch });
  if ((await panelCount(page)) === 1) return;
  await page.locator(".manager-bell-trigger").click({ force: true });
  await page.waitForTimeout(200);
  if ((await panelCount(page)) === 1) return;
  const dump = await page.evaluate(() => ({
    state: document.querySelector("[data-testid=open-state]")?.textContent,
    expanded: document.querySelector(".manager-bell-trigger")?.getAttribute("aria-expanded"),
    panel: !!document.querySelector(".manager-bell-panel--portal"),
    log: document.querySelector("[data-testid=event-log]")?.textContent?.split("\n").slice(-12),
  }));
  throw new Error(`ensureOpen failed: ${JSON.stringify(dump)}`);
}

async function ensureClosed(page, touch) {
  if ((await panelCount(page)) === 0) return;
  await pressTrigger(page, { touch });
  await page.waitForTimeout(150);
  if ((await panelCount(page)) > 0) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
  assert.equal(await panelCount(page), 0, "failed to close bell");
}

async function runWidth(browser, url, width, { touch }) {
  const context = await browser.newContext(
    touch
      ? { ...devices["Pixel 5"], hasTouch: true, viewport: { width, height: 800 } }
      : { viewport: { width, height: 800 }, hasTouch: false }
  );
  const page = await context.newPage();
  const report = { widths: {}, ok: [], defects: [] };

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".manager-bell-trigger");

  await pressTrigger(page, { touch });
  await page.waitForSelector(".manager-bell-panel--portal", { timeout: 5000 });
  const hitOpen = await hitTrigger(page);
  record(report, width, "trigger_hittable_while_open", hitOpen.isTrigger && !hitOpen.isBackdrop, JSON.stringify(hitOpen));

  await pressTrigger(page, { touch });
  const after2 = { panel: await panelCount(page), back: await backdropCount(page) };
  record(report, width, "second_press_closes", after2.panel === 0 && after2.back === 0, JSON.stringify(after2));

  await pressTrigger(page, { touch });
  record(report, width, "third_press_opens", (await panelCount(page)) === 1);

  let cyclesOk = true;
  for (let i = 0; i < 3; i += 1) {
    await pressTrigger(page, { touch });
    if ((await panelCount(page)) !== 0) cyclesOk = false;
    await pressTrigger(page, { touch });
    if ((await panelCount(page)) !== 1) cyclesOk = false;
  }
  record(report, width, "repeat_cycles", cyclesOk);

  await ensureOpen(page, touch);
  // Outside: below the panel (panel can cover mid-screen on mobile).
  const outsideY = await page.evaluate(() => {
    const panel = document.querySelector(".manager-bell-panel--portal");
    const r = panel?.getBoundingClientRect();
    return Math.min(window.innerHeight - 24, (r ? r.bottom : 200) + 40);
  });
  if (touch) await page.touchscreen.tap(24, outsideY);
  else await page.mouse.click(24, outsideY);
  await page.waitForTimeout(150);
  record(report, width, "outside_closes_clean", (await panelCount(page)) === 0 && (await backdropCount(page)) === 0, `y=${outsideY}`);

  await ensureOpen(page, touch);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  record(report, width, "escape_closes", (await panelCount(page)) === 0 && (await backdropCount(page)) === 0);

  const focused = await page.evaluate(
    () => document.activeElement?.classList?.contains("manager-bell-trigger") === true
  );
  record(report, width, "focus_returns", focused);

  await ensureClosed(page, touch);
  await page.locator(".manager-bell-trigger").focus();
  await page.locator(".manager-bell-trigger").press("Enter");
  await page.waitForTimeout(120);
  const afterEnter = await panelCount(page);
  await page.locator(".manager-bell-trigger").press("Space");
  await page.waitForTimeout(120);
  const afterSpace = await panelCount(page);
  record(report, width, "enter_space_toggle", afterEnter === 1 && afterSpace === 0, `enter=${afterEnter} space=${afterSpace}`);

  await ensureOpen(page, touch);
  const lang = page.locator(".app-header-language-selector button, .language-selector button").first();
  if ((await lang.count()) > 0) {
    const lb = await lang.boundingBox();
    if (touch) await page.touchscreen.tap(lb.x + lb.width / 2, lb.y + lb.height / 2);
    else await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.waitForTimeout(150);
    record(report, width, "language_closes_bell", (await panelCount(page)) === 0);
  } else {
    record(report, width, "language_closes_bell", false, "missing language trigger");
  }

  await ensureOpen(page, touch);
  await page.evaluate(() => window.__openModal());
  await page.waitForSelector("[data-testid=harness-modal]", { timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const modalGone = (await page.locator("[data-testid=harness-modal]").count()) === 0;
  const bellStill = (await panelCount(page)) === 1;
  record(report, width, "escape_modal_first", modalGone && bellStill, `modalGone=${modalGone} bell=${bellStill}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  record(report, width, "escape_bell_second", (await panelCount(page)) === 0 && (await backdropCount(page)) === 0);

  // Fresh page for close→reopen proof with event log
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".manager-bell-trigger");
  await pressTrigger(page, { touch });
  await page.waitForSelector(".manager-bell-panel--portal");
  await pressTrigger(page, { touch });
  await page.waitForTimeout(150);
  const log = await page.locator("[data-testid=event-log]").textContent();
  const reopenBug = /toggle:true->false[\s\S]*toggle:false->true/.test(log);
  record(
    report,
    width,
    "no_close_reopen_on_second_press",
    reopenBug === false && (await panelCount(page)) === 0,
    log
  );

  await page.screenshot({ path: `/tmp/clover-bell-toggle-${width}.png` });
  await context.close();
  return report;
}

const server = await createServer({
  configFile: path.join(harnessRoot, "vite.config.js"),
  root: harnessRoot,
});
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true, executablePath: CHROME });

const merged = { widths: {}, ok: [], defects: [] };
try {
  for (const [width, touch] of [
    [390, true],
    [1280, false],
  ]) {
    console.log("width", width, "touch", touch);
    const part = await runWidth(browser, url, width, { touch });
    Object.assign(merged.widths, part.widths);
    merged.ok.push(...part.ok);
    merged.defects.push(...part.defects);
  }
} finally {
  await browser.close();
  await server.close();
}

merged.summary = {
  defects: merged.defects.length,
  ok: merged.ok.length,
  verdict: merged.defects.length === 0 ? "PASS" : "FAIL",
};
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log(JSON.stringify(merged.summary, null, 2));
console.log("wrote", OUT);
if (merged.defects.length) {
  for (const d of merged.defects) console.log("FAIL", d.width, d.name, d.detail);
  process.exitCode = 2;
}
