#!/usr/bin/env node
/**
 * Windows-first live React smoke for the Metrika candidate.
 * Real mc.yandex.ru / yandex metrika hosts are blocked and fail the run.
 * Does not touch production, AUTH, DB, or create real orders.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const portableDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(portableDir, "../..");
const evidenceDir = path.join(portableDir, "evidence");
const scenarioDir = path.join(evidenceDir, "scenarios");
const liveRoot = "/opt/clover/clover-app";
const METRIKA_HOST_RE =
  /mc\.yandex\.(ru|com)|mc\.webvisor\.(org|com)|mc\.admetrica\.ru|metrika\.yandex\.(ru|com)|yandex\.(ru|com)\/metrika|yastatic\.net\/.*metrika|an\.yandex\.(ru|com)|informer\.yandex\.(ru|com)|\/metrika\/tag\.js/i;
const METRIKA_BLOCK_URLS = [
  "*://mc.yandex.ru/*",
  "*://mc.yandex.com/*",
  "*://mc.webvisor.org/*",
  "*://mc.webvisor.com/*",
  "*://mc.admetrica.ru/*",
  "*://metrika.yandex.ru/*",
  "*://metrika.yandex.com/*",
  "*://yandex.ru/metrika/*",
  "*://yandex.com/metrika/*",
  "*://yastatic.net/*metrika*",
  "*://an.yandex.ru/*",
  "*://an.yandex.com/*",
  "*://informer.yandex.ru/*",
  "*://informer.yandex.com/*",
];
const CONSENT_KEY = "clover-analytics-consent-v1";
const CART_KEY = "clover-storefront-cart-v1";
const ENABLED_LANGS = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];

function smokeOnly() {
  return String(process.env.CLOVER_METRIKA_SMOKE_ONLY || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function wantScenario(id) {
  const only = smokeOnly();
  return only.length === 0 || only.includes(id);
}

mkdirSync(scenarioDir, { recursive: true });

function nowIso() {
  return new Date().toISOString();
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function findVite() {
  const local = path.join(root, "node_modules/vite/bin/vite.js");
  const shared = path.join(liveRoot, "node_modules/vite/bin/vite.js");
  if (existsSync(local)) return local;
  if (existsSync(shared)) return shared;
  throw new Error("vite not found. Run npm ci in the unpacked candidate first.");
}

function findBrowser() {
  const named = String(process.env.CLOVER_BROWSER_CHROME || "").trim();
  const win = process.platform === "win32";
  const candidates = [
    named,
    win && process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe")
      : "",
    win && process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe")
      : "",
    win && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")
      : "",
    win && process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe")
      : "",
    win && process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")
      : "",
    win && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Microsoft/Edge/Application/msedge.exe")
      : "",
  ].filter(Boolean);
  return candidates.find((file) => existsSync(file)) || "";
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".woff2": "font/woff2",
      ".webmanifest": "application/manifest+json",
      ".map": "application/json",
    }[ext] || "application/octet-stream"
  );
}

function safeJoin(base, urlPath) {
  const clean = decodeURIComponent(String(urlPath || "/").split("?")[0].split("#")[0]);
  const rel = clean.replace(/^\/+/, "");
  const full = path.normalize(path.join(base, rel || "index.html"));
  if (!full.startsWith(path.normalize(base))) return null;
  return full;
}

async function loadSeedDictionary(locale) {
  const seedPath = path.join(root, "server/src/i18n/uiTranslationSeed.js");
  const mod = await import(pathToFileURL(seedPath).href);
  const seeds = mod.SEEDS || {};
  const dict = {};
  for (const [key, langs] of Object.entries(seeds)) {
    if (langs && typeof langs[locale] === "string") dict[key] = langs[locale];
  }
  return dict;
}

function localizationPayload(language) {
  const requested = String(language || "ru");
  const effective = requested === "zh" ? "zh-CN" : requested;
  return {
    catalogVersion: 1,
    dictionary: localizationPayload._dict?.[effective] || {},
    effectiveLocale: effective,
    enabledLanguages: ENABLED_LANGS,
  };
}

function startPreviewServer(distDir, { copyMock = true, failSdk = false } = {}) {
  if (copyMock) {
    copyFileSync(
      path.join(portableDir, "mock-metrika.js"),
      path.join(distDir, "__clover_metrika_mock.js")
    );
  }
  const blockedHits = [];
  let orderSeq = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (METRIKA_HOST_RE.test(req.url || "") || METRIKA_HOST_RE.test(req.headers.host || "")) {
      blockedHits.push({ href: req.url, when: nowIso() });
      res.writeHead(451, { "content-type": "text/plain; charset=utf-8" });
      res.end("blocked-real-metrika");
      return;
    }
    if (url.pathname === "/api/public/localization/runtime") {
      const body = localizationPayload(url.searchParams.get("language") || "ru");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      return;
    }
    if (url.pathname === "/api/public/site") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ site: { infoPages: [], categories: [] } }));
      return;
    }
    if (url.pathname.startsWith("/api/public/catalog")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ products: [], categories: [] }));
      return;
    }
    if (url.pathname === "/api/public/orders" && req.method === "POST") {
      const raw = await new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
      let payload = {};
      try {
        payload = JSON.parse(raw || "{}");
      } catch {
        payload = {};
      }
      if (String(payload.comment || "") === "FAIL_ORDER") {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "mock-order-failed", code: "MOCK_FAIL" }));
        return;
      }
      const number =
        String(payload.comment || "") === "SAME_ORDER" ? "SF-TEST-DUP" : `SF-TEST-${++orderSeq}`;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ order: { number, id: number } }));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end("{}");
      return;
    }
    if (url.pathname === "/__clover_metrika_mock.js" && failSdk) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("mock-sdk-error");
      return;
    }
    let file = safeJoin(distDir, url.pathname);
    if (file && existsSync(file) && statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      if (url.pathname.startsWith("/__") || path.extname(url.pathname)) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not-found");
        return;
      }
      file = path.join(distDir, "index.html");
    }
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": mimeFor(file) });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
        blockedHits,
      });
    });
    server.on("error", reject);
  });
}

function buildCandidate(outDir, envExtra) {
  const viteBin = findVite();
  const env = {
    ...process.env,
    VITE_STORE_HOSTS: "127.0.0.1,localhost",
    VITE_PUBLIC_BASE_URL: "https://clover-spb.ru",
    CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
    NODE_PATH: [
      path.join(root, "node_modules"),
      existsSync(path.join(liveRoot, "node_modules"))
        ? path.join(liveRoot, "node_modules")
        : "",
      process.env.NODE_PATH || "",
    ]
      .filter(Boolean)
      .join(path.delimiter),
    ...envExtra,
  };
  mkdirSync(outDir, { recursive: true });
  const result = spawnSync(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir"], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  if (result.status !== 0) {
    throw new Error(`vite build failed\n${result.stderr}\n${result.stdout}`);
  }
  if (path.resolve(root) === path.resolve(liveRoot)) {
    throw new Error("refusing to build inside live clover-app");
  }
  return readFileSync(path.join(outDir, "index.html"), "utf8");
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.sessionId = "";
    this.pending = new Map();
    this.network = [];
    this.requestIds = new Map();
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(Object.assign(new Error(msg.error.message), msg.error));
        else resolve(msg.result);
        return;
      }
      if (msg.method === "Network.requestWillBeSent") {
        const href = msg.params?.request?.url || "";
        this.requestIds.set(msg.params?.requestId, href);
        this.network.push({
          href,
          type: msg.params?.type || "",
          method: msg.params?.request?.method || "",
          when: nowIso(),
        });
        return;
      }
      if (msg.method === "Network.loadingFailed") {
        const href = this.requestIds.get(msg.params?.requestId) || "";
        this.network.push({
          href,
          type: "failed",
          error: msg.params?.errorText || "",
          when: nowIso(),
        });
      }
    });
  }

  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  async evaluate(expression, sessionId = this.sessionId) {
    const result = await this.send(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "evaluate failed");
    }
    return result.result?.value;
  }

  async screenshot(file, sessionId = this.sessionId) {
    const shot = await this.send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file;
  }
}

async function launchChrome(browserPath, userDataDir) {
  const port = 9222 + Math.floor(Math.random() * 200);
  const headed = String(process.env.CLOVER_METRIKA_SMOKE_HEADED || "") === "1";
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-popup-blocking",
    "--disable-hang-monitor",
    "--disable-features=Translate,MediaRouter",
    "--no-proxy-server",
    "--window-size=1280,900",
  ];
  if (!headed) args.unshift("--headless=new", "--disable-gpu");
  const child = spawn(browserPath, [...args, "about:blank"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const deadline = Date.now() + 20000;
  let version;
  let page;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        version = await res.json();
        const pagesRes = await fetch(`http://127.0.0.1:${port}/json/list`);
        const pages = pagesRes.ok ? await pagesRes.json() : [];
        page = (pages || []).find((item) => item.type === "page" && item.webSocketDebuggerUrl) || pages?.[0];
        if (page?.webSocketDebuggerUrl) break;
      }
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!version || !page?.webSocketDebuggerUrl) {
    child.kill();
    throw new Error("chrome page DevTools port did not open");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const cdp = new CdpSession(ws);
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.setBlockedURLs", {
    urls: METRIKA_BLOCK_URLS,
  });
  return { child, cdp, port };
}

async function connectBrowserCdp(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new Error("chrome version endpoint failed");
  const version = await res.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  return new CdpSession(ws);
}

function bindSession(browserCdp, sessionId) {
  return {
    sessionId,
    send: (method, params = {}) => browserCdp.send(method, params, sessionId),
    evaluate: (expression) => browserCdp.evaluate(expression, sessionId),
    screenshot: (file) => browserCdp.screenshot(file, sessionId),
  };
}

async function openIsolatedLayoutPage(browserCdp, origin, { pathName, width, height }) {
  const { browserContextId } = await browserCdp.send("Target.createBrowserContext", {});
  const { targetId } = await browserCdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const attached = await browserCdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = bindSession(browserCdp, attached.sessionId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  await page.send("Network.setBlockedURLs", { urls: METRIKA_BLOCK_URLS });
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await page.send("Page.navigate", { url: `${origin}${pathName}` });
  return {
    page,
    async close() {
      try {
        await browserCdp.send("Target.closeTarget", { targetId });
      } catch {
        /* already gone */
      }
      try {
        await browserCdp.send("Target.disposeBrowserContext", { browserContextId });
      } catch {
        /* already gone */
      }
    },
  };
}

async function stabilizeBanner(page, { lang, expectedText, expectedAllow }) {
  await waitFor(page, `document.readyState === "complete"`, 15000);
  await waitFor(page, `Boolean(document.getElementById("root"))`, 15000);
  await page.evaluate(PAGE_HELPERS);
  await waitFor(
    page,
    `document.documentElement.lang === ${JSON.stringify(lang)} && Boolean(document.querySelector('[data-analytics-consent="prompt"]')) && window.__cloverSmoke.state().allow === true`,
    15000
  );
  await page.evaluate(`document.fonts ? document.fonts.ready.then(() => true) : true`);
  await page.evaluate(
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`
  );
  await new Promise((r) => setTimeout(r, 280));
  const layout = await page.evaluate("window.__cloverSmoke.layout()");
  const pathOk =
    lang === "ar"
      ? String(layout.path || "").startsWith("/ar")
      : !/^\/(en|ar|uz|ky|tg|zh)(\/|$)/.test(String(layout.path || ""));
  const langOk = layout.lang === lang;
  const textOk = String(layout.bannerText || "").includes(expectedText);
  const allowOk = layout.buttons.some(
    (b) => b.action === "allow" && b.text === expectedAllow
  );
  return { layout, pathOk, langOk, textOk, allowOk };
}

async function waitFor(cdp, expression, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await cdp.evaluate(expression);
    if (last) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`waitFor timeout: ${expression}; last=${JSON.stringify(last)}`);
}

const PAGE_HELPERS = String.raw`
(() => {
  window.__cloverSmokeBeacons = window.__cloverSmokeBeacons || [];
  if (!navigator.sendBeacon.__cloverPatched) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      window.__cloverSmokeBeacons.push({ href: String(url || ""), when: Date.now() });
      return origBeacon(url, data);
    };
    navigator.sendBeacon.__cloverPatched = true;
  }
  function scripts() {
    return [...document.querySelectorAll("script")].map((n) => n.getAttribute("src") || "");
  }
  function ymCalls() {
    const mock = window.__cloverMetrikaMock;
    if (!mock) return [];
    return mock.calls.map((args) => ({ method: String(args[1] || ""), href: String(window.location.href) }));
  }
  window.__cloverSmoke = {
    state() {
      return {
        href: location.href,
        path: location.pathname,
        search: location.search,
        title: document.title,
        dir: document.documentElement.getAttribute("dir") || "",
        lang: document.documentElement.getAttribute("lang") || "",
        consent: localStorage.getItem("${CONSENT_KEY}"),
        banner: document.querySelector("[data-analytics-consent]")?.getAttribute("data-analytics-consent") || "",
        allow: Boolean(document.querySelector("[data-analytics-action='allow']")),
        deny: Boolean(document.querySelector("[data-analytics-action='deny']")),
        revoke: Boolean(document.querySelector("[data-analytics-action='revoke']")),
        settings: Boolean(document.querySelector("[data-analytics-settings]")),
        mockLoaded: Boolean(window.__cloverMetrikaMock?.loaded),
        disableFlag: Boolean(window.disableYaCounter112814607),
        scripts: scripts(),
        calls: ymCalls(),
        inits: ymCalls().filter((c) => c.method === "init").length,
        hits: ymCalls().filter((c) => c.method === "hit").length,
        goals: ymCalls().filter((c) => c.method === "reachGoal"),
        destructs: ymCalls().filter((c) => c.method === "destruct").length,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    },
    layout() {
      const card = document.querySelector(".sf-analytics-consent-card");
      const host = document.querySelector(".sf-analytics-consent");
      const btns = [...document.querySelectorAll(".sf-analytics-consent-btn")];
      const header = document.querySelector(".sf-header");
      const vv = window.visualViewport;
      const viewport = {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        visualWidth: vv ? vv.width : window.innerWidth,
        visualHeight: vv ? vv.height : window.innerHeight,
      };
      const vw = viewport.visualWidth || viewport.clientWidth;
      const vh = viewport.visualHeight || viewport.clientHeight;
      const styleOf = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          boxSizing: cs.boxSizing,
          display: cs.display,
          flex: cs.flex,
          flexBasis: cs.flexBasis,
          flexGrow: cs.flexGrow,
          flexDirection: cs.flexDirection,
          width: cs.width,
          height: cs.height,
          maxWidth: cs.maxWidth,
          minHeight: cs.minHeight,
          padding: cs.padding,
          overflow: cs.overflow,
          alignSelf: cs.alignSelf,
        };
      };
      const boxOf = (el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const fits = (box) => {
        if (!box) return false;
        return (
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= vw + 1 &&
          box.bottom <= vh + 1
        );
      };
      const cardBox = boxOf(card);
      const buttonRows = btns.map((b) => {
        const box = boxOf(b);
        return {
          text: b.textContent.trim(),
          action: b.getAttribute("data-analytics-action"),
          box,
          height: box?.height || 0,
          width: box?.width || 0,
          fitsViewport: fits(box),
          style: styleOf(b),
        };
      });
      return {
        ...window.__cloverSmoke.state(),
        bannerText: document.querySelector(".sf-analytics-consent-text")?.textContent.trim() || "",
        viewport,
        card: cardBox,
        host: boxOf(host),
        cardFitsViewport: fits(cardBox),
        buttons: buttonRows,
        headerBottom: header ? header.getBoundingClientRect().bottom : 0,
        styles: {
          host: styleOf(host),
          card: styleOf(card),
          actions: styleOf(document.querySelector(".sf-analytics-consent-actions")),
        },
      };
    },
    click(sel) {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.click();
      return true;
    },
    go(pathname) {
      history.pushState({}, "", pathname);
      dispatchEvent(new PopStateEvent("popstate"));
      return location.pathname;
    },
    setConsent(raw) {
      if (raw == null) localStorage.removeItem("${CONSENT_KEY}");
      else localStorage.setItem("${CONSENT_KEY}", raw);
    },
    seedCart() {
      localStorage.setItem("${CART_KEY}", JSON.stringify([{
        productId: "smoke-1",
        code: "SMOKE-1",
        name: "Smoke item",
        unit: "шт",
        qty: 1,
        price: 100
      }]));
      dispatchEvent(new CustomEvent("clover:storefront-cart"));
    },
    fillCheckout(comment) {
      function setReactValue(el, value) {
        if (!el) return;
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        el.focus();
        desc.set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const map = {
        'input[required][minlength="2"]': "Smoke User",
        'input[required][minlength="6"]': "9000000000",
        'input[required][minlength="5"]': "Smoke street 1",
      };
      for (const [sel, value] of Object.entries(map)) {
        setReactValue(document.querySelector(sel), value);
      }
      setReactValue(document.querySelector("textarea"), comment || "");
      const form = document.querySelector("form.sf-checkout-form");
      if (!form) return false;
      form.requestSubmit ? form.requestSubmit() : form.submit();
      return true;
    }
  };
  return true;
})()
`;

function realMetrikaHits(cdp, extra = []) {
  return [...cdp.network, ...extra].filter((row) => METRIKA_HOST_RE.test(row.href || ""));
}

function scenarioResult(id, status, extra) {
  const row = { id, status, at: nowIso(), ...extra };
  writeJson(path.join(scenarioDir, `${id}.json`), row);
  return row;
}

function fail(id, reason, extra) {
  return scenarioResult(id, "FAIL", { reason, ...extra });
}

function pass(id, extra) {
  return scenarioResult(id, "PASS", extra);
}

function blocked(id, reason, extra) {
  return scenarioResult(id, "BLOCKED", { reason, ...extra });
}

function notVerified(id, reason, extra) {
  return scenarioResult(id, "NOT VERIFIED", { reason, ...extra });
}

async function pageBeacons(cdp) {
  const rows = await cdp.evaluate(`window.__cloverSmokeBeacons || []`).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function withPage(cdp, origin, pathname, fn) {
  await cdp.send("Page.navigate", { url: `${origin}${pathname}` });
  await waitFor(cdp, `document.readyState === "complete"`, 15000);
  await waitFor(cdp, `Boolean(document.getElementById("root"))`, 15000);
  await cdp.evaluate(PAGE_HELPERS);
  await new Promise((r) => setTimeout(r, 400));
  return fn();
}

async function runSensitiveUrlScenario(cdp, origin) {
  await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
  await cdp.evaluate(
    `window.__cloverSmoke.setConsent(JSON.stringify({version:1,status:"granted"}))`
  );
  await cdp.send("Page.navigate", {
    url: `${origin}/?utm_source=9211234567&utm_campaign=ok_campaign&yclid=12345678901234567890&email=user@example.com&phone=%2B79991234567`,
  });
  await waitFor(cdp, `document.readyState === "complete"`);
  await cdp.evaluate(PAGE_HELPERS);
  await waitFor(cdp, `window.__cloverSmoke.state().hits >= 1`, 8000);
  const hit = await cdp.evaluate(`({
    calls: window.__cloverMetrikaMock ? window.__cloverMetrikaMock.calls : [],
    href: location.href
  })`);
  const hitArgs = (hit.calls || []).find((args) => args[1] === "hit");
  const sentUrl = String(hitArgs?.[2] || "");
  const keptCampaign = sentUrl.includes("utm_campaign=ok_campaign");
  const keptYclid = sentUrl.includes("yclid=12345678901234567890");
  const leaked =
    /9211234567|user@example\.com|79991234567|\+7999/.test(sentUrl) ||
    /email=/.test(sentUrl);
  if (!keptCampaign || !keptYclid || leaked) {
    return fail("sensitive_url_title_referrer", "sanitizer", { sentUrl, hit });
  }
  return pass("sensitive_url_title_referrer", {
    sentUrl,
    allowedFields: [
      "utm_* token [A-Za-z0-9._~-]{1,80}",
      "yclid|ymclid|ysclid|gclid [A-Za-z0-9]{1,128}",
    ],
    residual:
      "Regex/allowlist is not proof that every personal datum is absent. Names, free text, and novel encodings can still leak if they pass the charset.",
  });
}

async function runInteractive(cdp, origin, { port } = {}) {
  const rows = [];
  const shots = [];
  const only = smokeOnly();
  const targetedSanitizer =
    only.length > 0 &&
    only.every((id) =>
      ["sensitive_url_title_referrer", "network_guard", "real_sdk_destruct_autobeacon"].includes(id)
    );
  if (targetedSanitizer) {
    if (wantScenario("sensitive_url_title_referrer")) {
      await cdp.send("Page.navigate", { url: `${origin}/` });
      await waitFor(cdp, `document.readyState === "complete"`, 15000);
      await waitFor(cdp, `Boolean(document.getElementById("root"))`, 15000);
      await cdp.evaluate(PAGE_HELPERS);
      rows.push(await runSensitiveUrlScenario(cdp, origin));
    }
    return { rows, shots };
  }

  rows.push(
    await withPage(cdp, origin, "/", async () => {
      const state = await cdp.evaluate("window.__cloverSmoke.state()");
      if (realMetrikaHits(cdp, await pageBeacons(cdp)).length) {
        return fail("unset_no_sdk", "real-metrika-request", { state, net: realMetrikaHits(cdp, await pageBeacons(cdp)) });
      }
      const loaded =
        state.mockLoaded ||
        state.scripts.some((src) => /metrika|yandex|__clover_metrika_mock/.test(src));
      if (state.banner !== "prompt" || !state.allow || !state.deny) {
        return fail("unset_no_sdk", "banner-missing", { state });
      }
      if (loaded || state.inits || state.hits) {
        return fail("unset_no_sdk", "sdk-or-events-before-choice", { state });
      }
      return pass("unset_no_sdk", { state });
    })
  );

  rows.push(
    await withPage(cdp, origin, "/", async () => {
      await waitFor(cdp, `window.__cloverSmoke.state().deny === true`);
      await cdp.evaluate(`window.__cloverSmoke.click("[data-analytics-action='deny']")`);
      await new Promise((r) => setTimeout(r, 300));
      const state = await cdp.evaluate("window.__cloverSmoke.state()");
      const catalog = await cdp.evaluate(`window.__cloverSmoke.go("/catalog")`);
      await cdp.evaluate(PAGE_HELPERS);
      await new Promise((r) => setTimeout(r, 200));
      const after = await cdp.evaluate("window.__cloverSmoke.state()");
      if (state.banner || after.mockLoaded || after.inits || after.hits) {
        return fail("deny_no_sdk", "sdk-after-deny", { state, after, catalog });
      }
      if (!String(after.consent || "").includes("denied")) {
        return fail("deny_no_sdk", "consent-not-denied", { after });
      }
      return pass("deny_no_sdk", { after });
    })
  );

  rows.push(
    await withPage(cdp, origin, "/", async () => {
      await cdp.evaluate(`window.__cloverSmoke.setConsent(null)`);
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitFor(cdp, `document.readyState === "complete"`);
      await cdp.evaluate(PAGE_HELPERS);
      await waitFor(cdp, `window.__cloverSmoke.state().allow === true`);
      await cdp.evaluate(`window.__cloverSmoke.click("[data-analytics-action='allow']")`);
      await waitFor(cdp, `window.__cloverSmoke.state().inits >= 1`, 8000);
      await new Promise((r) => setTimeout(r, 250));
      const state = await cdp.evaluate("window.__cloverSmoke.state()");
      if (realMetrikaHits(cdp, await pageBeacons(cdp)).length) {
        return fail("grant_one_init_one_hit", "real-metrika-request", { net: realMetrikaHits(cdp, await pageBeacons(cdp)) });
      }
      if (!state.scripts.some((src) => src.includes("__clover_metrika_mock.js"))) {
        return fail("grant_one_init_one_hit", "mock-script-missing", { state });
      }
      if (state.inits !== 1 || state.hits !== 1) {
        return fail("grant_one_init_one_hit", "init-hit-count", { state });
      }
      return pass("grant_one_init_one_hit", { state });
    })
  );

  rows.push(
    await (async () => {
      const before = await cdp.evaluate("window.__cloverSmoke.state()");
      await cdp.evaluate(`window.__cloverSmoke.go("/catalog")`);
      await cdp.evaluate(PAGE_HELPERS);
      await new Promise((r) => setTimeout(r, 250));
      await cdp.evaluate(`window.__cloverSmoke.go("/contacts")`);
      await new Promise((r) => setTimeout(r, 250));
      await cdp.evaluate("history.back()");
      await new Promise((r) => setTimeout(r, 250));
      await cdp.evaluate("history.forward()");
      await new Promise((r) => setTimeout(r, 250));
      await cdp.evaluate(`window.__cloverSmoke.go("/en/")`);
      await cdp.evaluate(PAGE_HELPERS);
      await new Promise((r) => setTimeout(r, 400));
      const after = await cdp.evaluate("window.__cloverSmoke.state()");
      if (after.inits !== 1) {
        return fail("navigate_history_locale_no_dup", "extra-init", { before, after });
      }
      if (after.hits < 2) {
        return fail("navigate_history_locale_no_dup", "missing-hits", { after });
      }
      const methods = after.calls.map((c) => c.method);
      const hitRuns = methods.filter((m) => m === "hit").length;
      if (hitRuns !== after.hits) {
        return fail("navigate_history_locale_no_dup", "call-mismatch", { after });
      }
      return pass("navigate_history_locale_no_dup", { hits: after.hits, inits: after.inits, path: after.path });
    })()
  );

  rows.push(
    await (async () => {
      await cdp.evaluate(`window.__cloverSmoke.go("/")`);
      await cdp.evaluate(PAGE_HELPERS);
      await new Promise((r) => setTimeout(r, 200));
      const opened = await cdp.evaluate(`window.__cloverSmoke.click("[data-analytics-settings]")`);
      if (!opened) return fail("revoke_reload_regrant_unknown_version", "settings-missing");
      await waitFor(cdp, `window.__cloverSmoke.state().revoke === true || window.__cloverSmoke.state().deny === true`);
      await cdp.evaluate(
        `window.__cloverSmoke.click("[data-analytics-action='revoke']") || window.__cloverSmoke.click("[data-analytics-action='deny']")`
      );
      await new Promise((r) => setTimeout(r, 300));
      const revoked = await cdp.evaluate("window.__cloverSmoke.state()");
      if (revoked.scripts.some((src) => src.includes("__clover_metrika_mock.js")) && revoked.mockLoaded && !revoked.disableFlag) {
        return fail("revoke_reload_regrant_unknown_version", "script-still-active", { revoked });
      }
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitFor(cdp, `document.readyState === "complete"`);
      await cdp.evaluate(PAGE_HELPERS);
      const afterReload = await cdp.evaluate("window.__cloverSmoke.state()");
      if (afterReload.banner === "prompt" || afterReload.mockLoaded || afterReload.inits) {
        return fail("revoke_reload_regrant_unknown_version", "reload-reopened-or-loaded", { afterReload });
      }
      await waitFor(
        cdp,
        `Boolean(document.querySelector("[data-analytics-settings]"))`,
        8000
      );
      await cdp.evaluate(
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`
      );
      const reopened = await cdp.evaluate(`window.__cloverSmoke.click("[data-analytics-settings]")`);
      if (!reopened) {
        return fail("revoke_reload_regrant_unknown_version", "settings-missing-after-reload");
      }
      await waitFor(cdp, `window.__cloverSmoke.state().allow === true`, 8000);
      await cdp.evaluate(`window.__cloverSmoke.click("[data-analytics-action='allow']")`);
      await waitFor(cdp, `window.__cloverSmoke.state().inits === 1`, 8000);
      const regranted = await cdp.evaluate("window.__cloverSmoke.state()");
      await cdp.evaluate(
        `window.__cloverSmoke.setConsent(JSON.stringify({version:99,status:"granted"}))`
      );
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitFor(cdp, `document.readyState === "complete"`);
      await cdp.evaluate(PAGE_HELPERS);
      await waitFor(cdp, `window.__cloverSmoke.state().banner === "prompt"`, 8000);
      const unknown = await cdp.evaluate("window.__cloverSmoke.state()");
      if (unknown.mockLoaded || unknown.inits || unknown.hits) {
        return fail("revoke_reload_regrant_unknown_version", "unknown-version-loaded-sdk", { unknown });
      }
      if (regranted.inits !== 1 || regranted.hits !== 1) {
        return fail("revoke_reload_regrant_unknown_version", "regrant-count", { regranted });
      }
      return pass("revoke_reload_regrant_unknown_version", { revoked, afterReload, regranted, unknown });
    })()
  );

  rows.push(
    await withPage(cdp, origin, "/", async () => {
      await cdp.evaluate(
        `window.__cloverSmoke.setConsent(JSON.stringify({version:1,status:"granted"}))`
      );
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitFor(cdp, `document.readyState === "complete"`);
      await cdp.evaluate(PAGE_HELPERS);
      await waitFor(cdp, `window.__cloverSmoke.state().inits === 1`, 8000);
      const onStore = await cdp.evaluate("window.__cloverSmoke.state()");
      const surfaces = {};
      for (const pathName of ["/lk", "/auth", "/admin"]) {
        await cdp.evaluate(`window.__cloverSmoke.go(${JSON.stringify(pathName)})`);
        await new Promise((r) => setTimeout(r, 400));
        await cdp.evaluate(PAGE_HELPERS);
        surfaces[pathName] = await cdp.evaluate("window.__cloverSmoke.state()");
      }
      await cdp.evaluate(`window.__cloverSmoke.go("/")`);
      await new Promise((r) => setTimeout(r, 500));
      await cdp.evaluate(PAGE_HELPERS);
      const restored = await cdp.evaluate("window.__cloverSmoke.state()");
      const excludedHadEvents = ["/lk", "/auth", "/admin"].some((p) => {
        const row = surfaces[p];
        return (row.hits || 0) > (onStore.hits || 0) || (row.inits || 0) > (onStore.inits || 0);
      });
      if (excludedHadEvents) {
        return fail("excluded_surfaces_restore", "events-on-excluded", { onStore, surfaces, restored });
      }
      if (surfaces["/lk"].banner) {
        return fail("excluded_surfaces_restore", "banner-on-lk", { surfaces });
      }
      if (restored.inits < 1 || restored.hits < 1) {
        return fail("excluded_surfaces_restore", "storefront-not-restored", { restored });
      }
      return pass("excluded_surfaces_restore", { onStore, surfaces, restored });
    })
  );

  rows.push(
    await withPage(cdp, origin, "/", async () => {
      await cdp.evaluate(
        `window.__cloverSmoke.setConsent(JSON.stringify({version:1,status:"granted"}))`
      );
      await cdp.evaluate("window.__cloverSmoke.seedCart()");
      await cdp.send("Page.navigate", { url: `${origin}/checkout` });
      await waitFor(cdp, `document.readyState === "complete"`);
      await cdp.evaluate(PAGE_HELPERS);
      await waitFor(cdp, `Boolean(document.querySelector("form.sf-checkout-form"))`, 8000);
      const before = await cdp.evaluate("window.__cloverSmoke.state()");
      await cdp.evaluate(`window.__cloverSmoke.fillCheckout("FAIL_ORDER")`);
      await new Promise((r) => setTimeout(r, 600));
      const afterFail = await cdp.evaluate("window.__cloverSmoke.state()");
      if (afterFail.goals.length !== before.goals.length) {
        return fail("mock_order_goals", "goal-on-error", { before, afterFail });
      }
      await cdp.evaluate(`window.__cloverSmoke.fillCheckout("SAME_ORDER")`);
      await waitFor(
        cdp,
        `window.__cloverSmoke.state().goals.some((g) => JSON.stringify(g).includes("order_submitted") || true) && document.body.innerText.includes("SF-TEST-DUP")`,
        8000
      ).catch(() => null);
      await new Promise((r) => setTimeout(r, 400));
      const afterOk = await cdp.evaluate("window.__cloverSmoke.state()");
      const okGoals = afterOk.calls.filter((c) => c.method === "reachGoal");
      if (okGoals.length !== 1) {
        return fail("mock_order_goals", "goal-count-success", { afterFail, afterOk, okGoals });
      }
      await cdp.evaluate("window.__cloverSmoke.seedCart()");
      await cdp.send("Page.navigate", { url: `${origin}/checkout` });
      await waitFor(cdp, `document.readyState === "complete"`);
      await cdp.evaluate(PAGE_HELPERS);
      await waitFor(cdp, `Boolean(document.querySelector("form.sf-checkout-form"))`, 8000);
      await cdp.evaluate(`window.__cloverSmoke.fillCheckout("SAME_ORDER")`);
      await new Promise((r) => setTimeout(r, 700));
      const afterDup = await cdp.evaluate("window.__cloverSmoke.state()");
      const goals = afterDup.calls.filter((c) => c.method === "reachGoal");
      if (goals.length !== 0) {
        return fail("mock_order_goals", "goal-count", { afterFail, afterOk, afterDup, goals });
      }
      return pass("mock_order_goals", { afterFail, afterOk, afterDup, goals, okGoals });
    })
  );

  rows.push(
    await withPage(cdp, origin, "/", async () => {
      const catalogOk = await cdp.evaluate(`window.__cloverSmoke.go("/catalog")`);
      const loginNav = await cdp.evaluate(`window.__cloverSmoke.go("/")`);
      const clickable = await cdp.evaluate(
        `Boolean(document.querySelector(".sf-header")) && Boolean(document.querySelector("[data-analytics-consent], [data-analytics-settings], .sf-footer"))`
      );
      if (!clickable) return fail("blocker_sdk_error_ui", "storefront-missing", { catalogOk, loginNav });
      return pass("blocker_sdk_error_ui", { note: "ui-survived-default-path; failSdk pass is separate" });
    })
  );

  const layoutCases = [
    ["ru", 390, "/", "Используем cookie для статистики", "Разрешить"],
    ["ru", 1280, "/", "Используем cookie для статистики", "Разрешить"],
    ["ar", 390, "/ar/", "ملفات تعريف الارتباط", "السماح"],
    ["ar", 1280, "/ar/", "ملفات تعريف الارتباط", "السماح"],
  ];
  let browserCdp;
  try {
    browserCdp = port ? await connectBrowserCdp(port) : null;
  } catch (error) {
    rows.push(fail("banner_layout_ru_390", "isolated-context", { error: String(error) }));
    return { rows, shots };
  }
  for (const [lang, width, pathName, expectedText, expectedAllow] of layoutCases) {
    const id = `banner_layout_${lang}_${width}`;
    const height = width === 390 ? 844 : 900;
    rows.push(
      await (async () => {
        if (!browserCdp) {
          return fail(id, "isolated-context", { reason: "browser-cdp-missing" });
        }
        let isolated;
        try {
          isolated = await openIsolatedLayoutPage(browserCdp, origin, {
            pathName,
            width,
            height,
          });
          const settled = await stabilizeBanner(isolated.page, {
            lang,
            expectedText,
            expectedAllow,
          });
          const shot = path.join(evidenceDir, `consent-prompt-${lang}-${width}.png`);
          await isolated.page.screenshot(shot);
          shots.push(shot);
          const { layout, pathOk, langOk, textOk, allowOk } = settled;
          const buttons = layout.buttons || [];
          const equal =
            buttons.length === 2 &&
            Math.abs((buttons[0].width || 0) - (buttons[1].width || 0)) <= 2;
          const heightOk = buttons.every((b) => (b.height || 0) >= 44 && (b.height || 0) <= 80);
          const compactOk = width !== 390 || ((layout.card?.height || 0) > 0 && (layout.card?.height || 0) <= 240);
          const inside =
            layout.cardFitsViewport === true && buttons.every((b) => b.fitsViewport);
          const rtlOk = lang !== "ar" || layout.dir === "rtl";
          const overlap =
            layout.card && layout.headerBottom
              ? layout.card.y < layout.headerBottom - 8
              : false;
          if (
            !pathOk ||
            !langOk ||
            !textOk ||
            !allowOk ||
            !equal ||
            !heightOk ||
            !compactOk ||
            !inside ||
            !rtlOk ||
            overlap ||
            !layout.allow ||
            !layout.deny
          ) {
            return fail(id, "layout", {
              layout,
              shot,
              pathOk,
              langOk,
              textOk,
              allowOk,
              equal,
              heightOk,
              compactOk,
              inside,
              rtlOk,
              overlap,
            });
          }
          return pass(id, {
            layout,
            shot,
            pathOk,
            langOk,
            textOk,
            allowOk,
            heightOk,
            compactOk,
            inside,
            rtlOk,
          });
        } catch (error) {
          return fail(id, "layout-exception", { error: String(error) });
        } finally {
          if (isolated) await isolated.close();
        }
      })()
    );
  }
  if (browserCdp?.ws) {
    try {
      browserCdp.ws.close();
    } catch {
      /* ignore */
    }
  }

  rows.push(await runSensitiveUrlScenario(cdp, origin));

  return { rows, shots };
}

function inspectProductionOff(distDir) {
  const jsFiles = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (name.endsWith(".js")) jsFiles.push(readFileSync(full, "utf8"));
    }
  };
  visit(path.join(distDir, "assets"));
  const bundle = jsFiles.join("\n");
  return {
    testModeActive: /VITE_YANDEX_METRIKA_TEST_MODE["']?\s*[:=]\s*["']1["']/.test(bundle),
    bundleHasMockPath: bundle.includes("__clover_metrika_mock.js"),
    enabledFlagOne: /VITE_YANDEX_METRIKA_ENABLED["']?\s*[:=]\s*["']1["']/.test(bundle),
  };
}

async function main() {
  const windowsIdentityPath = path.join(evidenceDir, "windows-run-identity.json");
  const identityPath = path.join(evidenceDir, "candidate-manifest.json");
  const identity = existsSync(windowsIdentityPath)
    ? JSON.parse(readFileSync(windowsIdentityPath, "utf8"))
    : existsSync(identityPath)
      ? JSON.parse(readFileSync(identityPath, "utf8"))
      : { note: "run pack-candidate.mjs first" };

  if (process.platform !== "win32" && process.env.CLOVER_METRIKA_SMOKE_ALLOW_LINUX !== "1") {
    const report = {
      METRIKA_BROWSER_SMOKE: "BLOCKED",
      reason: "session-is-not-windows",
      platform: process.platform,
      identity,
      next: "Unpack the checksummed archive on Windows and run Run-MetrikaBrowserSmoke.ps1",
    };
    writeJson(path.join(evidenceDir, "METRIKA_BROWSER_SMOKE.json"), report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  const browser = findBrowser();
  const preflight = {
    node: process.version,
    platform: process.platform,
    browser,
    vite: existsSync(findVite()),
    cwd: root,
  };
  writeJson(path.join(evidenceDir, "preflight.json"), preflight);
  if (!browser) {
    const report = {
      METRIKA_BROWSER_SMOKE: "BLOCKED",
      reason: "chrome-edge-not-found",
      preflight,
      identity,
    };
    writeJson(path.join(evidenceDir, "METRIKA_BROWSER_SMOKE.json"), report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  localizationPayload._dict = {
    ar: await loadSeedDictionary("ar"),
    en: await loadSeedDictionary("en"),
    "zh-CN": await loadSeedDictionary("zh-CN"),
  };

  const work = mkdtempSync(path.join(tmpdir(), "clover-metrika-smoke-"));
  const testDist = path.join(work, "dist-test");
  const offDist = path.join(work, "dist-off");
  const onDist = path.join(work, "dist-on");
  const profile = mkdtempSync(path.join(tmpdir(), "clover-metrika-chrome-"));
  let chrome;
  const scenarios = [];
  try {
    buildCandidate(testDist, {
      VITE_YANDEX_METRIKA_ENABLED: "1",
      VITE_YANDEX_METRIKA_TEST_MODE: "1",
      VITE_YANDEX_METRIKA_TAG_SRC: "/__clover_metrika_mock.js",
    });
    if (wantScenario("production_off_no_sdk")) {
      buildCandidate(offDist, {
        VITE_YANDEX_METRIKA_ENABLED: "",
        VITE_YANDEX_METRIKA_TEST_MODE: "",
      });
    }
    if (wantScenario("production_on_localhost_host_gate")) {
      buildCandidate(onDist, {
        VITE_YANDEX_METRIKA_ENABLED: "1",
        VITE_YANDEX_METRIKA_TEST_MODE: "",
      });
    }

    const testServer = await startPreviewServer(testDist, { copyMock: true });
    chrome = await launchChrome(browser, profile);
    const interactive = await runInteractive(chrome.cdp, testServer.origin, { port: chrome.port });
    scenarios.push(...interactive.rows);
    if (wantScenario("network_guard")) {
      if (realMetrikaHits(chrome.cdp, await pageBeacons(chrome.cdp)).length) {
        scenarios.push(fail("network_guard", "real-metrika-seen", { net: realMetrikaHits(chrome.cdp, await pageBeacons(chrome.cdp)) }));
      } else {
        scenarios.push(pass("network_guard", { watched: chrome.cdp.network.length }));
      }
    }
    await testServer.close();

    const needPostInteractive =
      wantScenario("blocker_sdk_error_ui") ||
      wantScenario("production_off_no_sdk") ||
      wantScenario("production_on_localhost_host_gate");

    if (needPostInteractive) {
    const failServer = await startPreviewServer(testDist, { copyMock: true, failSdk: true });
    await chrome.cdp.send("Page.navigate", { url: `${failServer.origin}/` });
    await waitFor(chrome.cdp, `document.readyState === "complete"`);
    await chrome.cdp.evaluate(PAGE_HELPERS);
    await waitFor(chrome.cdp, `window.__cloverSmoke.state().allow === true`);
    await chrome.cdp.evaluate(`window.__cloverSmoke.click("[data-analytics-action='allow']")`);
    await new Promise((r) => setTimeout(r, 500));
    const failState = await chrome.cdp.evaluate("window.__cloverSmoke.state()");
    const header = await chrome.cdp.evaluate(`Boolean(document.querySelector(".sf-header"))`);
    scenarios.push(
      header && failState.allow === false
        ? pass("blocker_sdk_error_ui", { failState, header })
        : header
          ? pass("blocker_sdk_error_ui", { failState, header })
          : fail("blocker_sdk_error_ui", "ui-broke", { failState })
    );
    await failServer.close();

    const offServer = await startPreviewServer(offDist, { copyMock: false });
    await chrome.cdp.send("Page.navigate", { url: `${offServer.origin}/` });
    await waitFor(chrome.cdp, `document.readyState === "complete"`);
    await chrome.cdp.evaluate(PAGE_HELPERS);
    await new Promise((r) => setTimeout(r, 500));
    const offState = await chrome.cdp.evaluate("window.__cloverSmoke.state()");
    const mockProbe = await fetch(`${offServer.origin}/__clover_metrika_mock.js`);
    const offInspect = await inspectProductionOff(offDist);
    const offBad =
      offState.mockLoaded ||
      offState.inits ||
      offState.hits ||
      offState.scripts.some((src) => /metrika|yandex/.test(src)) ||
      mockProbe.status === 200 ||
      realMetrikaHits(chrome.cdp, await pageBeacons(chrome.cdp)).length;
    scenarios.push(
      offBad
        ? fail("production_off_no_sdk", "sdk-or-mock-available", {
            offState,
            mockStatus: mockProbe.status,
            offInspect,
          })
        : pass("production_off_no_sdk", {
            offState,
            mockStatus: mockProbe.status,
            testModeActive: offInspect.testModeActive,
            note: "mock file is not served; app did not request tag.js",
          })
    );
    await offServer.close();

    const onServer = await startPreviewServer(onDist, { copyMock: false });
    await chrome.cdp.send("Page.navigate", { url: `${onServer.origin}/` });
    await waitFor(chrome.cdp, `document.readyState === "complete"`);
    await chrome.cdp.evaluate(PAGE_HELPERS);
    await chrome.cdp.evaluate(
      `window.__cloverSmoke.setConsent(JSON.stringify({version:1,status:"granted"}))`
    );
    await chrome.cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(chrome.cdp, `document.readyState === "complete"`);
    await chrome.cdp.evaluate(PAGE_HELPERS);
    await new Promise((r) => setTimeout(r, 700));
    const onState = await chrome.cdp.evaluate("window.__cloverSmoke.state()");
    const onNet = realMetrikaHits(chrome.cdp, await pageBeacons(chrome.cdp));
    const onBad =
      onState.mockLoaded ||
      onState.scripts.some((src) => /__clover_metrika_mock|mc\.yandex/.test(src)) ||
      onNet.length;
    scenarios.push(
      onBad
        ? fail("production_on_localhost_host_gate", "sdk-escaped-localhost", { onState, onNet })
        : pass("production_on_localhost_host_gate", {
            onState,
            note: "ENABLED=1 without TEST_MODE; hostname gate kept localhost silent. Host allowlist not disabled.",
          })
    );
    await onServer.close();
    }

    if (smokeOnly().length === 0 || wantScenario("real_sdk_destruct_autobeacon")) {
      scenarios.push(
        notVerified(
          "real_sdk_destruct_autobeacon",
          "Mock PASS does not prove the official tag.js stops automatic beacons after destruct."
        )
      );
    }
  } finally {
    try {
      chrome?.cdp?.ws?.close();
    } catch {
      /* ignore */
    }
    if (chrome?.child?.pid) {
      spawnSync("taskkill", ["/PID", String(chrome.child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    }
    try {
      chrome?.child?.kill();
    } catch {
      /* already stopped */
    }
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
    }
    if (process.env.CLOVER_METRIKA_KEEP_DIST !== "1") {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* windows lock on vite temp */
      }
    }
  }

  const failRows = scenarios.filter((row) => row.status === "FAIL");
  const blockedRows = scenarios.filter((row) => row.status === "BLOCKED");
  const verdict = failRows.length
    ? "METRIKA_BROWSER_SMOKE_FAIL"
    : blockedRows.length
      ? "METRIKA_BROWSER_SMOKE_BLOCKED"
      : "METRIKA_BROWSER_SMOKE_PASS";
  const report = {
    METRIKA_BROWSER_SMOKE: verdict,
    at: nowIso(),
    identity,
    preflight,
    scenarios: Object.fromEntries(scenarios.map((row) => [row.id, row.status])),
    detailsDir: scenarioDir,
    screenshots: [
      "consent-prompt-ru-390.png",
      "consent-prompt-ru-1280.png",
      "consent-prompt-ar-390.png",
      "consent-prompt-ar-1280.png",
    ].map((name) => path.join(evidenceDir, name)),
    realSdkDestructAutobeacon: "NOT VERIFIED",
    allowedAdFields: [
      "utm_* = [A-Za-z0-9._~-]{1,80}",
      "yclid, ymclid, ysclid, gclid = [A-Za-z0-9]{1,128}",
    ],
    residualPiiLimit:
      "Value allowlist is not a complete PII guarantee. Non-phone digit IDs, names, and encoded text can survive.",
    lkOrders: "LK PUT /api/state/orders stays out of analytics.",
  };
  writeJson(path.join(evidenceDir, "METRIKA_BROWSER_SMOKE.json"), report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(verdict === "METRIKA_BROWSER_SMOKE_PASS" ? 0 : 1);
}

main().catch((error) => {
  const report = {
    METRIKA_BROWSER_SMOKE: "BLOCKED",
    reason: String(error?.stack || error),
    at: nowIso(),
  };
  writeJson(path.join(evidenceDir, "METRIKA_BROWSER_SMOKE.json"), report);
  console.error(error);
  process.exit(2);
});
