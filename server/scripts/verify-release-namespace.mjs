/**
 * Release namespace: unique asset URLs per build, graph consistency,
 * and optional isolated-profile RED→GREEN against cached 403+immutable.
 * Never talks to production.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import {
  assertValidReleaseId,
  createReleaseId,
  extractBuildTag,
  pathReleaseId,
} from "./releaseNamespace.js";
import { collectBuildAssets, inspectReleaseNamespace } from "./uiAssetProbe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
assert.notEqual(path.resolve(root), path.resolve("/opt/clover/clover-app"));

{
  assert.throws(() => assertValidReleaseId("r403u20260918T233508Z"), /recovery suffix/);
  const a = createReleaseId({
    env: {},
    now: () => Date.parse("2026-09-19T00:00:00Z"),
    bytes: () => Buffer.from("aaaaaa"),
  });
  const b = createReleaseId({
    env: {},
    now: () => Date.parse("2026-09-19T00:00:00Z"),
    bytes: () => Buffer.from("bbbbbb"),
  });
  assert.notEqual(a, b);
  console.log("RELEASE_ID_UNIQUE_PER_BUILD:PASS");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function buildIsolated(releaseId, outDir) {
  mkdirSync(outDir, { recursive: true });
  const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
  const result = spawnSync(
    process.execPath,
    [viteBin, "build", "--outDir", outDir, "--emptyOutDir"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOVER_UI_RELEASE_ID: releaseId,
        CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "0",
      },
    }
  );
  assert.equal(result.status, 0, `vite build ${releaseId} failed:\n${result.stderr}\n${result.stdout}`);
  const html = readFileSync(path.join(outDir, "index.html"), "utf8");
  const sw = readFileSync(path.join(outDir, "sw.js"), "utf8");
  const ns = inspectReleaseNamespace({ html, distDir: outDir, swSource: sw });
  assert.equal(ns.ok, true, ns.failures.join("\n"));
  assert.equal(ns.releaseId, releaseId);
  assert.equal(extractBuildTag(html), `ui-${releaseId}`);
  const assets = collectBuildAssets({ html, distDir: outDir });
  assert.ok(assets.every((item) => pathReleaseId(item) === releaseId));
  assert.match(html, new RegExp(`/fonts/${releaseId}/manrope\\.css`));
  return { html, assets, ns };
}

const alphaDir = mkdtempSync(path.join(tmpdir(), "clover-ns-alpha-"));
const betaDir = mkdtempSync(path.join(tmpdir(), "clover-ns-beta-"));
const alpha = buildIsolated("alpha111", alphaDir);
const beta = buildIsolated("beta2222", betaDir);
{
  const alphaSet = new Set(alpha.assets);
  for (const assetPath of beta.assets) {
    assert.equal(alphaSet.has(assetPath), false, `URL reused across releases: ${assetPath}`);
  }
  assert.doesNotMatch(beta.html, /index-B2GFFiD2|r403u/);
  console.log("ISOLATED_BUILDS_DISJOINT_URLS:PASS");
}

function findBrowser() {
  const candidates = [
    process.env.CLOVER_BROWSER_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((item) => existsSync(item)) || "";
}

function mimeFor(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function startFixture({ port, state, poisonPaths }) {
  const server = createServer((req, res) => {
    const distDir = state.distDir;
    const poisonHtml = state.poisonHtml;
    const urlPath = decodeURIComponent(String(req.url || "/").split("?")[0]);
    if (poisonPaths.has(urlPath)) {
      res.writeHead(403, {
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.end("<html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1></body></html>");
      return;
    }
    if (poisonHtml && (urlPath === "/" || urlPath === "/index.html")) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(poisonHtml);
      return;
    }
    let relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    if (["lk", "contacts", "cart"].includes(relative) || relative === "lk/" || relative === "contacts/" || relative === "cart/") {
      relative = "index.html";
    }
    const filePath = path.resolve(distDir, relative);
    if (!filePath.startsWith(path.resolve(distDir))) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("bad path");
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      res.writeHead(200, {
        "Content-Type": mimeFor(filePath),
        "Cache-Control":
          urlPath.startsWith("/assets/") || urlPath.startsWith("/fonts/")
            ? "public, max-age=31536000, immutable"
            : "no-store",
      });
      res.end(readFileSync(filePath));
      return;
    }
    if (!urlPath.startsWith("/assets/") && !urlPath.startsWith("/fonts/")) {
      const indexPath = path.join(distDir, "index.html");
      if (existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(readFileSync(indexPath));
        return;
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    res.end("missing");
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function dumpDom(browser, profileDir, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        `--user-data-dir=${profileDir}`,
        "--virtual-time-budget=20000",
        "--timeout=25000",
        "--dump-dom",
        url,
      ],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`dump-dom timeout for ${url}\n${stderr}`));
    }, 40000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    child.on("error", reject);
  });
}

function pageMounted(dom) {
  if (/login-lock|type=["']password["']/.test(dom)) return true;
  const inner = (String(dom).match(/<div id="root">([\s\S]*?)<\/div>/i) || [])[1] || "";
  return /<[a-z][\s\S]{20,}/i.test(inner);
}

const oldPoisonHtml = `<!doctype html><html><head>
<meta name="clover-ui-build" content="ui-20260919-B2GFFiD2">
<link rel="stylesheet" href="/assets/index-Dzoa3_yS.css">
<script type="module" src="/assets/index-B2GFFiD2.js"></script>
</head><body><div id="root"></div></body></html>`;
const poisonPaths = new Set([
  "/assets/index-B2GFFiD2.js",
  "/assets/vendor-OpK5Lzvc.js",
  "/assets/vendor-react-B3gA3iTC.js",
  "/assets/index-Dzoa3_yS.css",
  "/assets/publicLocaleRouting-C2dcrZ3b.js",
]);

const browser = findBrowser();
let browserResult = "BLOCKED";
if (!browser) {
  console.log("RELEASE_NAMESPACE_BROWSER_RED_GREEN:BLOCKED no isolated browser binary");
} else {
  const port = await freePort();
  const profileDir = mkdtempSync(path.join(tmpdir(), "clover-ns-profile-"));
  const cleanProfile = mkdtempSync(path.join(tmpdir(), "clover-ns-clean-"));
  const state = { poisonHtml: oldPoisonHtml, distDir: betaDir };
  const server = await startFixture({
    port,
    state,
    poisonPaths,
  });
  try {
    const origin = `http://127.0.0.1:${port}`;
    const red = await dumpDom(browser, profileDir, `${origin}/`);
    const redDom = red.stdout;
    assert.equal(pageMounted(redDom), false, `poisoned profile must not mount UI: ${red.stderr}`);
    assert.match(redDom, /id="root"/);
    state.poisonHtml = "";
    state.distDir = betaDir;
    const greenHome = (await dumpDom(browser, profileDir, `${origin}/`)).stdout;
    const greenLk = (await dumpDom(browser, profileDir, `${origin}/lk`)).stdout;
    const greenContacts = (await dumpDom(browser, profileDir, `${origin}/contacts`)).stdout;
    const greenCart = (await dumpDom(browser, profileDir, `${origin}/cart`)).stdout;
    const mounted = {
      home: pageMounted(greenHome),
      lk: pageMounted(greenLk),
      contacts: pageMounted(greenContacts),
      cart: pageMounted(greenCart),
    };
    if (!mounted.home || !mounted.lk || !mounted.contacts || !mounted.cart) {
      throw new Error(`cached-403 profile did not mount namespaced UI: ${JSON.stringify(mounted)}`);
    }
    assert.match(greenHome, /\/assets\/beta2222\//);
    assert.doesNotMatch(beta.html, /\/assets\/index-B2GFFiD2\.js/);
    const cleanHome = (await dumpDom(browser, cleanProfile, `${origin}/`)).stdout;
    assert.equal(pageMounted(cleanHome), true, "clean profile must mount UI");
    browserResult = "PASS";
    console.log("RELEASE_NAMESPACE_BROWSER_RED_GREEN:PASS");
    console.log("RELEASE_NAMESPACE_BROWSER_CLEAN:PASS");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(cleanProfile, { recursive: true, force: true });
  }
}

rmSync(alphaDir, { recursive: true, force: true });
rmSync(betaDir, { recursive: true, force: true });

if (browserResult === "BLOCKED") {
  console.log("verify-release-namespace: PARTIAL (browser BLOCKED)");
  process.exit(2);
}
console.log("verify-release-namespace: PASS");
