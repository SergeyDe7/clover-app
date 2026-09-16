/**
 * Regression gate: mobile LK section selector must not overlap the phone control.
 *
 * Requires a running UI (Vite or production) with a logged-in client session.
 *
 * Env:
 *   CLOVER_UI_BASE   default http://127.0.0.1:5273/lk/
 *   CLOVER_API_BASE  default http://127.0.0.1:4100
 *   CLOVER_DB_PATH   default <repo>/server/data/clover.sqlite
 *   CLOVER_GATE_OUT  optional JSON report path
 *   PLAYWRIGHT_CHROMIUM  optional chrome-headless-shell path
 *
 * Exit 0 = pass, 2 = layout/regression fail, 1 = infra error.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const UI = (process.env.CLOVER_UI_BASE || "http://127.0.0.1:5273/lk/").replace(
  /\/?$/,
  "/"
);
const API = (process.env.CLOVER_API_BASE || "http://127.0.0.1:4100").replace(
  /\/$/,
  ""
);
const DB =
  process.env.CLOVER_DB_PATH ||
  path.join(root, "server/data/clover.sqlite");
const OUT = process.env.CLOVER_GATE_OUT || "";

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM,
  "/opt/clover/worktrees/fix-lk-title-unit-i18n/verify-artifacts/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
].filter(Boolean);

function resolveRequire() {
  const candidates = [
    "/opt/clover/worktrees/fix-lk-title-unit-i18n/verify-artifacts/package.json",
    path.join(root, "package.json"),
  ];
  for (const pkg of candidates) {
    try {
      if (!fs.existsSync(pkg)) continue;
      const req = createRequire(pkg);
      req.resolve("playwright-core");
      return req;
    } catch {
      /* try next */
    }
  }
  throw new Error("playwright-core not found");
}

const require = resolveRequire();
const { chromium } = require("playwright-core");

function findChrome() {
  for (const p of PW_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error("chrome-headless-shell not found; set PLAYWRIGHT_CHROMIUM");
}

function rectsOverlap(a, b) {
  return !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
}

function gapBetween(a, b) {
  // Horizontal gap for LTR/RTL: distance between boxes on the main axis.
  if (a.r <= b.l) return b.l - a.r;
  if (b.r <= a.l) return a.l - b.r;
  return -Math.min(a.r, b.r) + Math.max(a.l, b.l); // negative = overlap depth
}

async function loginToken() {
  const db = new DatabaseSync(DB, { readOnly: true });
  const row = db
    .prepare("SELECT value_json FROM app_state WHERE key=?")
    .get("clientAccessVault");
  db.close();
  if (!row?.value_json) throw new Error("clientAccessVault missing");
  const vault = JSON.parse(row.value_json);
  const entry = Object.values(vault).find(
    (v) => v?.login === "clover_test@clover.ru"
  );
  if (!entry?.password) throw new Error("clover_test account missing");
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: entry.login, password: entry.password }),
  }).then((r) => r.json());
  if (!res?.token) throw new Error("login failed");
  return res.token;
}

async function ensureAr(page) {
  await page.locator(".language-selector-trigger").click({ force: true });
  await page.waitForTimeout(250);
  const clicked = await page.evaluate(() => {
    const opt = [...document.querySelectorAll(".language-selector-option")].find(
      (el) => /arab|عر|الله/i.test(el.textContent || "")
    );
    if (!opt) return false;
    opt.click();
    return true;
  });
  if (!clicked) throw new Error("arabic language option not found");
  await page.waitForTimeout(900);
}

async function ensureRu(page) {
  const lang = page.locator(".language-selector-trigger");
  if (!(await lang.count())) return;
  const aria = (await lang.getAttribute("aria-label")) || "";
  if (/Русск/i.test(aria)) return;
  await lang.click({ force: true });
  await page.waitForTimeout(250);
  const clicked = await page.evaluate(() => {
    const opt = [...document.querySelectorAll(".language-selector-option")].find(
      (el) => /Русский/i.test(el.textContent || "")
    );
    if (!opt) return false;
    opt.click();
    return true;
  });
  if (!clicked) await page.keyboard.press("Escape");
  else await page.waitForTimeout(700);
}

function measureInPage() {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      l: Math.round(r.left),
      t: Math.round(r.top),
      r: Math.round(r.right),
      b: Math.round(r.bottom),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  const trigger = document.querySelector(".client-section-menu-trigger");
  const phone = document.querySelector(".manager-contact-trigger");
  const logo = document.querySelector(".app-header-logo-button");
  const logout = document.querySelector(".header-logout");
  const language = document.querySelector(".language-selector-trigger");
  const menu = document.querySelector(".client-section-menu");
  const panel = document.querySelector(".client-section-menu-panel");
  const actions = document.querySelector(".app-header-actions");
  const header = document.querySelector(".app-header");
  const cluster = trigger?.querySelector(".client-section-menu-cluster");
  const icon = trigger?.querySelector(".client-section-menu-icon");
  const caret = trigger?.querySelector(".client-section-menu-caret");
  const inActions = !!(actions && menu && actions.contains(menu));
  const beforePhone = (() => {
    if (!inActions || !phone || !menu || !actions) return false;
    const kids = [...actions.children];
    const mi = kids.indexOf(menu);
    const phoneRoot = kids.find((k) => k.contains && k.contains(phone));
    const pi2 = phoneRoot ? kids.indexOf(phoneRoot) : -1;
    return mi >= 0 && pi2 >= 0 && mi < pi2;
  })();
  return {
    dir: document.documentElement.getAttribute("dir") || "ltr",
    lang: document.documentElement.getAttribute("lang"),
    aria: trigger?.getAttribute("aria-label") || null,
    inActions,
    beforePhone,
    trigger: box(trigger),
    phone: box(phone),
    logo: box(logo),
    logout: box(logout),
    language: box(language),
    menu: box(menu),
    panel: box(panel),
    header: box(header),
    clusterGap: cluster ? getComputedStyle(cluster).gap : null,
    iconW: icon ? Math.round(icon.getBoundingClientRect().width) : null,
    caretW: caret ? Math.round(caret.getBoundingClientRect().width) : null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    viewportW: window.innerWidth,
  };
}

function evaluateLayout(m, { expectCompact = false } = {}) {
  const defects = [];
  if (!m.trigger || !m.phone || !m.logo || !m.logout || !m.language) {
    defects.push("missing-header-controls");
    return { ok: false, defects, gapPhone: null };
  }
  if (!m.inActions) defects.push("menu-not-in-actions");
  if (!m.beforePhone) defects.push("menu-not-before-phone");
  if (rectsOverlap(m.trigger, m.phone)) defects.push("selector-phone-overlap");
  const gapPhone = gapBetween(m.trigger, m.phone);
  if (!(gapPhone >= 4)) defects.push(`gapPhone<4(${gapPhone})`);
  if (m.scrollWidth > m.clientWidth + 1) defects.push("horizontal-scroll");
  for (const [name, r] of [
    ["logo", m.logo],
    ["trigger", m.trigger],
    ["phone", m.phone],
    ["language", m.language],
    ["logout", m.logout],
  ]) {
    if (r.l < -1 || r.r > m.viewportW + 1) defects.push(`${name}-outside-viewport`);
  }
  if (m.header && (m.header.r > m.viewportW + 1 || m.header.l < -1)) {
    defects.push("header-outside-viewport");
  }
  const minH = 44;
  if (m.trigger.h < minH) defects.push(`touch-height<${minH}`);
  if (expectCompact) {
    if (!(m.trigger.w >= 54 && m.trigger.w <= 58)) {
      defects.push(`compact-width-expected-56(got ${m.trigger.w})`);
    }
  } else if (m.viewportW >= 360) {
    if (!(m.trigger.w >= 62 && m.trigger.w <= 68)) {
      defects.push(`width-expected-64(got ${m.trigger.w})`);
    }
  }
  if (m.clusterGap && m.clusterGap !== "6px") defects.push(`cluster-gap(${m.clusterGap})`);
  if (m.iconW != null && m.iconW !== 20) defects.push(`iconW(${m.iconW})`);
  if (m.caretW != null && (m.caretW < 10 || m.caretW > 12)) {
    defects.push(`caretW(${m.caretW})`);
  }
  if (m.panel) {
    if (m.panel.l < -1 || m.panel.r > m.viewportW + 1) {
      defects.push("panel-outside-viewport-x");
    }
    if (m.panel.t < -1 || m.panel.b > windowInnerFallback(m) + 1) {
      // height checked loosely via page viewport in caller
    }
  }
  return { ok: defects.length === 0, defects, gapPhone };
}

function windowInnerFallback(m) {
  return 844;
}

const report = {
  pass: true,
  ui: UI,
  checks: [],
  defects: [],
  measures: {},
};

function note(id, ok, detail) {
  report.checks.push({ id, ok, detail });
  if (!ok) {
    report.pass = false;
    report.defects.push(id);
  }
  console.log(ok ? "PASS" : "FAIL", id, JSON.stringify(detail));
}

const token = await loginToken();
const browser = await chromium.launch({
  executablePath: findChrome(),
  headless: true,
  args: ["--no-sandbox"],
});

try {
  // Desktop: text nav, no icon trigger
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(({ token }) => {
      localStorage.setItem("clover-api-token", token);
    }, { token });
    await page.goto(UI, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".header-logout", { timeout: 90000 });
    await page.waitForTimeout(600);
    const desk = await page.evaluate(() => ({
      nav: [...document.querySelectorAll(".client-nav button")].map((b) =>
        (b.textContent || "").trim()
      ),
      iconTriggers: document.querySelectorAll(
        ".client-section-menu-trigger--icon"
      ).length,
    }));
    note(
      "desktop-text-nav",
      desk.nav.some((t) => /Моя матрица|matrix/i.test(t)) &&
        desk.iconTriggers === 0,
      desk
    );
    await page.close();
  }

  for (const w of [320, 360, 390]) {
    const page = await browser.newPage({ viewport: { width: w, height: 844 } });
    await page.addInitScript(({ token }) => {
      localStorage.setItem("clover-api-token", token);
    }, { token });
    await page.goto(UI, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".header-logout", { timeout: 90000 });
    await ensureRu(page);
    await page.waitForSelector(".client-section-menu-trigger--icon", {
      timeout: 90000,
    });
    await page.waitForTimeout(300);
    let m = await page.evaluate(measureInPage);
    const expectCompact = w <= 340;
    let verdict = evaluateLayout(m, { expectCompact });
    report.measures[`ru-${w}`] = { ...m, gapPhone: verdict.gapPhone, defects: verdict.defects };
    note(`layout-ru-${w}`, verdict.ok, {
      gapPhone: verdict.gapPhone,
      inActions: m.inActions,
      beforePhone: m.beforePhone,
      trigger: m.trigger,
      phone: m.phone,
      defects: verdict.defects,
    });

    if (w === 390) {
      try {
        await page.locator(".client-section-menu-trigger--icon").click({ force: true });
        await page.waitForSelector(".client-section-menu.open", { timeout: 8000 });
        await page.waitForTimeout(220);
        m = await page.evaluate(measureInPage);
        const caret = await page.evaluate(() => {
          const c = getComputedStyle(
            document.querySelector(".client-section-menu-caret")
          ).transform;
          const p = c.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number);
          return {
            open: document
              .querySelector(".client-section-menu")
              ?.classList.contains("open"),
            approx180:
              !!p && Math.abs(p[0] + 1) < 0.05 && Math.abs(p[3] + 1) < 0.05,
            panel: (() => {
              const el = document.querySelector(".client-section-menu-panel");
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return {
                l: Math.round(r.left),
                r: Math.round(r.right),
                t: Math.round(r.top),
                b: Math.round(r.bottom),
              };
            })(),
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        });
        const panelIn =
          caret.panel &&
          caret.panel.l >= -1 &&
          caret.panel.r <= caret.vw + 1 &&
          caret.panel.t >= -1 &&
          caret.panel.b <= caret.vh + 1;
        note("caret-rotate", caret.open && caret.approx180, caret);
        note("panel-in-viewport", !!panelIn, caret);
        async function pick(re) {
          if (!(await page.locator(".client-section-menu.open").count())) {
            await page.locator(".client-section-menu-trigger--icon").click({ force: true });
            await page.waitForSelector(".client-section-menu.open", { timeout: 8000 });
            await page.waitForTimeout(150);
          }
          const clicked = await page.evaluate((pattern) => {
            const re = new RegExp(pattern, "i");
            const item = [...document.querySelectorAll(".client-section-menu-item")].find(
              (el) => re.test(el.textContent || "")
            );
            if (!item) return false;
            item.click();
            return true;
          }, re.source);
          if (!clicked) throw new Error(`menu item not found: ${re}`);
          await page.waitForTimeout(350);
        }
        await pick(/каталог|catalog/i);
        m = await page.evaluate(measureInPage);
        note(
          "tab-catalog-icon",
          m.trigger && m.inActions && /каталог/i.test(m.aria || ""),
          { aria: m.aria, inActions: m.inActions }
        );
        await pick(/сверк/i);
        m = await page.evaluate(measureInPage);
        note(
          "tab-recon-icon",
          m.trigger && /сверк/i.test(m.aria || ""),
          { aria: m.aria }
        );
        await pick(/настрой/i);
        m = await page.evaluate(measureInPage);
        note(
          "tab-settings-icon",
          m.trigger && /настрой/i.test(m.aria || ""),
          { aria: m.aria }
        );
        const addr = page.locator("button").filter({ hasText: /адрес/i }).first();
        if (await addr.count()) {
          await addr.click({ force: true });
          await page.waitForTimeout(350);
          m = await page.evaluate(measureInPage);
          note("tab-addresses-icon", !!m.trigger && m.inActions, {
            aria: m.aria,
            inActions: m.inActions,
          });
        }
        try {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(120);
          await pick(/матриц/i);
        } catch (e) {
          note("tab-matrix-return", false, { error: String(e?.message || e) });
        }
        await page.waitForTimeout(400);
        const vt = await page.evaluate(
          () => !!document.querySelector(".catalog-view-toggle")
        );
        note("view-toggle-present", vt, { vt });
      } catch (err) {
        note("menu-interactions", false, { error: String(err?.message || err) });
      }
    }
    await page.close();
  }

  // AR RTL 320
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    try {
      await page.addInitScript(({ token }) => {
        localStorage.setItem("clover-api-token", token);
      }, { token });
      await page.goto(UI, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForSelector(".header-logout", { timeout: 90000 });
      await ensureAr(page);
      await page.waitForSelector(".client-section-menu-trigger--icon", {
        timeout: 90000,
      });
      await page.waitForTimeout(400);
      const m = await page.evaluate(measureInPage);
      const verdict = evaluateLayout(m, { expectCompact: true });
      report.measures["ar-320"] = {
        ...m,
        gapPhone: verdict.gapPhone,
        defects: verdict.defects,
      };
      note("layout-ar-320", verdict.ok && m.dir === "rtl", {
        dir: m.dir,
        gapPhone: verdict.gapPhone,
        defects: verdict.defects,
        trigger: m.trigger,
        phone: m.phone,
      });
      await ensureRu(page);
    } catch (err) {
      note("layout-ar-320", false, { error: String(err?.message || err) });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  }
}

console.log(
  "GATE_PASS",
  report.pass,
  "defects",
  report.defects
);
process.exit(report.pass ? 0 : 2);
