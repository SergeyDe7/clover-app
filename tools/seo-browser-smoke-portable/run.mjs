#!/usr/bin/env node
/**
 * Portable CDP smoke. Requires CLOVER_BROWSER_CHROME. Loopback only.
 * Never uses production SQLite, cookies, or secrets.
 */
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome, defaultProfileDir } from "./cdp-chrome.mjs";
import {
  renderPublicRouteHtml,
  resolvePublicRouteRequest,
} from "../../src/shared/sitemap/publicRouteHtml.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const phase = process.argv.includes("--candidate") ? "candidate" : "simple";
const chromePath = String(process.env.CLOVER_BROWSER_CHROME || "").trim();
const reportFile =
  process.env.CLOVER_SEO_SMOKE_REPORT ||
  path.join(here, "work", "seo-browser-smoke-report.json");

if (!chromePath || !existsSync(chromePath)) {
  const payload = {
    SEO_PORTABLE_SMOKE: "BLOCKED",
    reason: "CLOVER_BROWSER_CHROME missing; do not use production Linux chrome-headless-shell",
    reportPath: reportFile,
  };
  writeReport(payload);
  console.error(JSON.stringify(payload));
  process.exit(2);
}

function writeReport(payload) {
  mkdirSync(path.dirname(reportFile), { recursive: true });
  const body = { ...payload, reportPath: reportFile, phase, at: new Date().toISOString() };
  writeFileSync(reportFile, JSON.stringify(body, null, 2));
  console.log(JSON.stringify({ SEO_SMOKE_REPORT: reportFile }));
}

function stopChrome(chrome) {
  try {
    chrome?.session?.close();
  } catch {
    // ignore
  }
  try {
    if (chrome?.child && chrome.child.exitCode == null) chrome.child.kill();
  } catch {
    // ignore
  }
}

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

function staticHtmlServer(filePath) {
  return createHttpServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(filePath));
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".map": "application/json",
};

function loadManifest(dist) {
  const manifestPath = path.join(dist, "public-route-manifest.json");
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function spaDistServer(dist) {
  const root = path.resolve(dist);
  const manifest = loadManifest(root);
  const indexHtml = readFileSync(path.join(root, "index.html"), "utf8");
  return createHttpServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.includes("\0")) {
      res.writeHead(400);
      res.end();
      return;
    }
    const candidate = path.resolve(root, `.${rel}`);
    if (!candidate.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (existsSync(candidate)) {
      const st = statSync(candidate);
      if (st.isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
        res.end(readFileSync(candidate));
        return;
      }
      if (st.isDirectory() && existsSync(path.join(candidate, "index.html")) && rel !== "/") {
        const file = path.join(candidate, "index.html");
        res.writeHead(200, { "content-type": MIME[".html"] });
        res.end(readFileSync(file));
        return;
      }
    }
    if (manifest?.infrastructureEnabled === true) {
      const resolution = resolvePublicRouteRequest(manifest, req.url || "/");
      if (resolution.action === "redirect") {
        res.writeHead(resolution.status, { Location: resolution.location });
        res.end();
        return;
      }
      if (resolution.action === "error") {
        res.writeHead(resolution.status, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      if (resolution.action === "render") {
        const html = renderPublicRouteHtml(indexHtml, resolution.record, {
          indexable: resolution.indexable,
        });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });
}

function parseHead(html) {
  const lang = html.match(/<html[^>]*lang="([^"]+)"/i)?.[1] || "";
  const dir = html.match(/<html[^>]*dir="([^"]+)"/i)?.[1] || "";
  const canonicalTags = [
    ...html.matchAll(/<link\s+[^>]*rel="canonical"[^>]*href="([^"]+)"/gi),
  ];
  const hreflang = [
    ...html.matchAll(
      /<link\s+[^>]*rel="alternate"[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/gi
    ),
  ].map((m) => ({ hreflang: m[1], href: m[2] }));
  return {
    lang,
    dir,
    canonical: canonicalTags[0]?.[1] || "",
    canonicalCount: canonicalTags.length,
    hreflang,
  };
}

function assertSeoHead(lang, name, urlPath, initial) {
  const origin = "https://clover-spb.ru";
  const expectCanonical = `${origin}${urlPath}`;
  if (initial.canonicalCount !== 1) {
    throw new Error(`${lang} ${name} canonical count ${initial.canonicalCount}`);
  }
  if (initial.canonical !== expectCanonical) {
    throw new Error(`${lang} ${name} canonical ${initial.canonical}`);
  }
  const ruPath =
    name === "home" ? "/ru/" : name === "catalog" ? "/ru/catalog" : "/ru/product/SMOKE-001";
  const xd = initial.hreflang.find((item) => item.hreflang === "x-default");
  if (xd?.href !== `${origin}${ruPath}`) {
    throw new Error(`${lang} ${name} x-default ${xd?.href}`);
  }
  const langs = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];
  for (const code of langs) {
    const hreflang = code === "zh" ? "zh-CN" : code;
    const alt = initial.hreflang.find((item) => item.hreflang === hreflang);
    const expectHref =
      name === "home"
        ? `${origin}/${code}/`
        : name === "catalog"
          ? `${origin}/${code}/catalog`
          : `${origin}/${code}/product/SMOKE-001`;
    if (!alt || alt.href !== expectHref) {
      throw new Error(`${lang} ${name} missing reciprocal ${hreflang} -> ${expectHref}`);
    }
  }
  if (lang === "zh") {
    if (initial.lang !== "zh-CN") throw new Error(`zh ${name} html lang ${initial.lang}`);
    if (urlPath.includes("/zh-CN")) throw new Error(`zh ${name} used /zh-CN/ path`);
  }
  if (lang === "ar" && initial.dir !== "rtl") {
    throw new Error(`ar ${name} dir ${initial.dir}`);
  }
}

function sessionLog(session) {
  return {
    console: session.console.slice(0, 50),
    pageerror: session.pageErrors.slice(0, 50),
    requestfailed: session.requestFailed.slice(0, 50),
  };
}

async function simplePhase() {
  const port = await freePort();
  const file = path.join(here, "fixtures/simple.html");
  const server = staticHtmlServer(file);
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const profileDir = defaultProfileDir("clover-seo-simple");
  const dbgPort = await freePort();
  let chrome;
  try {
    chrome = await launchChrome({
      executablePath: chromePath,
      port: dbgPort,
      profileDir,
    });
    await chrome.session.goto(`http://127.0.0.1:${port}/`, 12000);
    await new Promise((r) => setTimeout(r, 400));
    const parsed = await chrome.session.evaluate(
      "({text: document.getElementById('root')?.textContent, js: document.documentElement.dataset.js})"
    );
    if (parsed.text !== "js-ok" || parsed.js !== "1") {
      throw new Error(`simple probe failed: ${JSON.stringify(parsed)}`);
    }
    const payload = {
      SIMPLE_JS_PROBE: "PASS",
      chromePath,
      ...sessionLog(chrome.session),
    };
    writeReport(payload);
    console.log(JSON.stringify({ SIMPLE_JS_PROBE: "PASS", chromePath }));
  } finally {
    stopChrome(chrome);
    server.close();
  }
}

async function candidatePhase() {
  const dist = process.env.CLOVER_SEO_DIST || path.join(here, "work", "dist");
  if (!existsSync(path.join(dist, "index.html"))) {
    throw new Error(`candidate dist missing: ${dist}`);
  }
  const port = await freePort();
  const server = spaDistServer(dist);
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const langs = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];
  const product = "/product/SMOKE-001";
  const profileDir = defaultProfileDir("clover-seo-candidate");
  const dbgPort = await freePort();
  let chrome;
  const pages = [];
  try {
    chrome = await launchChrome({
      executablePath: chromePath,
      port: dbgPort,
      profileDir,
    });
    for (const lang of langs) {
      for (const [name, urlPath] of [
        ["home", `/${lang}/`],
        ["catalog", `/${lang}/catalog`],
        ["product", `/${lang}${product}`],
      ]) {
        const url = `http://127.0.0.1:${port}${urlPath}`;
        const htmlRes = await fetch(url, { redirect: "manual" });
        const html = await htmlRes.text();
        if (htmlRes.status !== 200) {
          throw new Error(`${lang} ${name} HTTP ${htmlRes.status}`);
        }
        const initial = parseHead(html);
        assertSeoHead(lang, name, urlPath, initial);
        await chrome.session.goto(url, 15000);
        await new Promise((r) => setTimeout(r, 800));
        const dom = await chrome.session.evaluate(`({
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          ready: document.readyState,
          canonical: document.querySelector('link[rel="canonical"]')?.href || "",
          hreflangCount: document.querySelectorAll('link[rel="alternate"][hreflang]').length
        })`);
        const expectLang = lang === "zh" ? "zh-CN" : lang;
        const expectDir = lang === "ar" ? "rtl" : "ltr";
        if (dom.lang !== expectLang || (dom.dir || "ltr") !== expectDir) {
          throw new Error(`${lang} ${name} settled ${JSON.stringify(dom)}`);
        }
        if (dom.canonical !== `https://clover-spb.ru${urlPath}`) {
          throw new Error(`${lang} ${name} settled canonical ${dom.canonical}`);
        }
        if (dom.hreflangCount < 8) {
          throw new Error(`${lang} ${name} settled hreflang count ${dom.hreflangCount}`);
        }
        pages.push({ lang, name, status: htmlRes.status, settled: dom });
      }
    }
    const unknown = await fetch(
      `http://127.0.0.1:${port}/this-path-does-not-exist-seo-probe-9f3a`
    );
    if (unknown.status !== 404) throw new Error(`unknown status ${unknown.status}`);
    const payload = {
      CANDIDATE_BROWSER_SMOKE: "PASS",
      pages: pages.length,
      chromePath,
      dist,
      ...sessionLog(chrome.session),
    };
    writeReport(payload);
    console.log(JSON.stringify({ CANDIDATE_BROWSER_SMOKE: "PASS", pages: pages.length, dist }));
  } finally {
    stopChrome(chrome);
    server.close();
  }
}

const run = phase === "candidate" ? candidatePhase : simplePhase;
run().catch((error) => {
  const payload = { SEO_PORTABLE_SMOKE: "FAIL", error: error.message, chromePath };
  try {
    writeReport(payload);
  } catch {
    // ignore report IO
  }
  console.error(JSON.stringify(payload));
  process.exit(1);
});
