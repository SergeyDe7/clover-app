#!/usr/bin/env node
/**
 * Short-timeout probe: environment JS vs baseline dist vs SEO candidate.
 * Never navigates to the public clover-spb.ru origin (hairpin).
 * Does not write /opt/clover/clover-app.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = path.join(root, ".tmp/seo-browser-js-probe.json");
const GOTO_MS = Number(process.env.CLOVER_BROWSER_GOTO_MS || 8000);
const SETTLE_MS = Number(process.env.CLOVER_BROWSER_SETTLE_MS || 2000);
const chrome = String(process.env.CLOVER_BROWSER_CHROME || "").trim();
const chromeLibs = String(process.env.CLOVER_BROWSER_CHROME_LIBS || "").trim();
const playwrightCore = String(process.env.CLOVER_PLAYWRIGHT_CORE || "").trim();

mkdirSync(path.join(root, ".tmp"), { recursive: true });

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function staticServer(dir, extraHandlers = []) {
  return createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    for (const handler of extraHandlers) {
      if (handler(req, res, url)) return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const filePath = path.resolve(dir, `.${rel}`);
    if (!filePath.startsWith(path.resolve(dir))) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!existsSync(filePath) || !rel.includes(".")) {
      const index = path.join(dir, "index.html");
      if (existsSync(index) && req.headers.accept?.includes("text/html")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(readFileSync(index));
        return;
      }
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
}

async function listen(server) {
  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return port;
}

const probeDir = mkdtempSync(path.join(tmpdir(), "clover-js-probe-"));
writeFileSync(
  path.join(probeDir, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><title>probe</title></head>
<body><div id="root">empty</div>
<script>
document.getElementById("root").textContent = "js-ok";
document.documentElement.dataset.js = "1";
</script></body></html>`
);

if (!existsSync(chrome) || !existsSync(playwrightCore)) {
  const report = {
    PROBE: "BLOCKED",
    reason: "chrome or playwright-core missing",
    chrome,
    playwrightCore,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  process.exit(2);
}

const { chromium } = await import(pathToFileURL(playwrightCore).href);
const userDataDir = mkdtempSync(path.join(tmpdir(), "clover-js-probe-profile-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: chrome,
  headless: true,
  timeout: 15000,
  env: {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: mkdtempSync(path.join(tmpdir(), "clover-js-probe-home-")),
    LD_LIBRARY_PATH: existsSync(chromeLibs) ? chromeLibs : "",
  },
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const page = context.pages()[0] || (await context.newPage());

async function runCase(name, url, { abortPublicHost = true } = {}) {
  const consoleLogs = [];
  const pageErrors = [];
  const failed = [];
  const responses = [];
  const navigations = [];
  const publicHostHits = [];
  const onConsole = (msg) => consoleLogs.push(`${msg.type()}: ${msg.text()}`);
  const onError = (error) => pageErrors.push(error.message);
  const onFail = (req) =>
    failed.push({ url: req.url(), error: req.failure()?.errorText || "" });
  const onResp = (res) => {
    const u = res.url();
    if (/\/assets\/|\/api\/|index-|probe|storefront\/|\.js($|\?)/.test(u)) {
      responses.push({ status: res.status(), url: u });
    }
  };
  const onNav = (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  };
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("requestfailed", onFail);
  page.on("response", onResp);
  page.on("framenavigated", onNav);
  const routeHandler = async (route) => {
    publicHostHits.push({
      url: route.request().url(),
      resourceType: route.request().resourceType(),
    });
    await route.abort("connectionrefused");
  };
  if (abortPublicHost) {
    await page.route(/https?:\/\/(www\.)?clover-spb\.ru\b/i, routeHandler);
  }
  const started = Date.now();
  let gotoError = "";
  try {
    await page.goto(url, { waitUntil: "commit", timeout: GOTO_MS });
  } catch (error) {
    gotoError = error.message.split("\n")[0];
  }
  await page.waitForTimeout(SETTLE_MS);
  const snapshot = await page
    .evaluate(() => ({
      url: location.href,
      title: document.title,
      htmlLang: document.documentElement.lang,
      htmlClass: document.documentElement.className,
      rootExists: Boolean(document.getElementById("root")),
      rootLen: document.getElementById("root")?.innerHTML.length || 0,
      rootText: (document.getElementById("root")?.textContent || "").slice(0, 120),
      datasetJs: document.documentElement.dataset.js || "",
      header: document.querySelectorAll(".sf-header").length,
      cloverApp: document.querySelectorAll(".clover-app").length,
      scripts: [...document.scripts].map((el) => el.src || "inline").slice(0, 8),
    }))
    .catch((error) => ({ evaluateError: error.message }));
  page.off("console", onConsole);
  page.off("pageerror", onError);
  page.off("requestfailed", onFail);
  page.off("response", onResp);
  page.off("framenavigated", onNav);
  if (abortPublicHost) await page.unroute(/https?:\/\/(www\.)?clover-spb\.ru\b/i);
  return {
    name,
    elapsedMs: Date.now() - started,
    startUrl: url,
    gotoError,
    navigations,
    publicHostHits,
    snapshot,
    consoleLogs: consoleLogs.slice(0, 20),
    pageErrors,
    failed: failed.slice(0, 20),
    responses: responses.slice(0, 30),
  };
}

const servers = [];
const cases = [];
try {
  const simplePort = await listen(staticServer(probeDir));
  servers.push(simplePort);
  cases.push(
    await runCase("simple-js", `http://127.0.0.1:${simplePort}/`, {
      abortPublicHost: false,
    })
  );

  const baselineDir = path.join(root, ".tmp/seo-browser-baseline-dist");
  mkdirSync(baselineDir, { recursive: true });
  cpSync("/opt/clover/clover-app/dist", baselineDir, { recursive: true });
  const baselinePort = await listen(staticServer(baselineDir));
  servers.push(baselinePort);
  cases.push(await runCase("baseline-served-ui", `http://127.0.0.1:${baselinePort}/`));

  const candidateDir = path.join(root, ".tmp/seo-browser-candidate/dist");
  if (existsSync(path.join(candidateDir, "index.html"))) {
    const candidatePort = await listen(staticServer(candidateDir));
    servers.push(candidatePort);
    cases.push(await runCase("candidate-static-root", `http://127.0.0.1:${candidatePort}/`));
    cases.push(
      await runCase("candidate-static-ru", `http://127.0.0.1:${candidatePort}/ru/`)
    );
  } else {
    cases.push({ name: "candidate-static-root", skipped: "candidate dist missing" });
  }
} finally {
  await context.close().catch(() => {});
}

const report = {
  PROBE: "DONE",
  gotoMs: GOTO_MS,
  settleMs: SETTLE_MS,
  chrome,
  cases,
  verdict: {
    simpleJs:
      cases.find((item) => item.name === "simple-js")?.snapshot?.datasetJs === "1",
    baselinePainted: (cases.find((item) => item.name === "baseline-served-ui")?.snapshot
      ?.rootLen || 0) > 0,
    candidatePainted: (cases.find((item) => item.name === "candidate-static-root")
      ?.snapshot?.rootLen || 0) > 0,
  },
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(0);
