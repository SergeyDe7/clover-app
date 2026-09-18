#!/usr/bin/env node
/**
 * Isolated Vite preview checks for locale HTML, 404, and settled DOM.
 * Build output stays in os.tmpdir(). Does not write production dist.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
assert.notEqual(path.resolve(root), path.resolve("/opt/clover/clover-app"));

const temp = mkdtempSync(path.join(tmpdir(), "clover-seo-locale-html-"));
const dbPath = path.join(temp, "fixture.sqlite");
const outDir = path.join(temp, "dist");
const chrome = String(process.env.CLOVER_BROWSER_CHROME || "").trim();

process.on("exit", () => rmSync(temp, { recursive: true, force: true }));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function seedDb() {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    CREATE TABLE translation_entries (
      id TEXT PRIMARY KEY, namespace TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, field_key TEXT NOT NULL, source_ru TEXT NOT NULL,
      source_hash TEXT NOT NULL, critical INTEGER NOT NULL
    );
    CREATE TABLE translation_values (
      entry_id TEXT NOT NULL, language_code TEXT NOT NULL, value TEXT NOT NULL,
      state TEXT NOT NULL, source_hash TEXT NOT NULL
    );
    CREATE TABLE product_translations (
      product_id TEXT NOT NULL, language_code TEXT NOT NULL, field_key TEXT NOT NULL,
      auto_value TEXT NOT NULL, auto_source_hash TEXT NOT NULL,
      manual_value TEXT NOT NULL, manual_source_hash TEXT NOT NULL
    );
  `);
  const product = {
    id: "p1",
    code: "НФ-00003681",
    oneCId: "onec-1",
    name: "Жидкое мыло Синергетик миндальное молочко 500 мл",
    category: "Химия",
    subcategory: "",
    showOnStorefront: true,
  };
  const insert = db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)");
  insert.run("products", JSON.stringify([product]));
  insert.run("oneCProducts", JSON.stringify([{ id: "onec-1", name: product.name }]));
  insert.run(
    "settings",
    JSON.stringify({ storefrontShowOnlyLinked: true, storefrontInfoPages: [] })
  );
  insert.run(
    "localizationSettings",
    JSON.stringify({
      enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh", "ar"],
      catalogVersion: 28,
    })
  );
  db.close();
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return result;
}

function parseHead(html) {
  const lang = html.match(/<html[^>]*lang="([^"]+)"/i)?.[1] || "";
  const dir = html.match(/<html[^>]*dir="([^"]+)"/i)?.[1] || "";
  const canonical = html.match(/<link\s+[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1] || "";
  const robots = html.match(/<meta\s+[^>]*name="robots"[^>]*content="([^"]+)"/i)?.[1] || "";
  const hreflang = [...html.matchAll(/<link\s+[^>]*rel="alternate"[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/gi)]
    .map((m) => ({ hreflang: m[1], href: m[2] }));
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] || "";
  return { lang, dir, canonical, robots, hreflang, title };
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "manual" });
  const body = await res.text();
  return { status: res.status, body, location: res.headers.get("location") };
}

seedDb();
function readCatalogVersion() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return JSON.parse(
      db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("localizationSettings")
        .value_json
    ).catalogVersion;
  } finally {
    db.close();
  }
}
const catalogBefore = readCatalogVersion();
const env = {
  PATH: process.env.PATH || "/usr/bin:/bin",
  HOME: temp,
  NODE_ENV: "production",
  CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
  DB_PATH: dbPath,
  SITEMAP_OUT: path.join(outDir, "sitemap.xml"),
};
const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
run(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir"], env);
run(process.execPath, [path.join(root, "server/scripts/generate-sitemap.mjs")], env);
run(
  process.execPath,
  [
    path.join(root, "server/scripts/assert-locale-route-release.mjs"),
    "--dist",
    outDir,
    "--db",
    dbPath,
    "--expect",
    "enabled",
  ],
  env
);
assert.equal(readCatalogVersion(), catalogBefore, "isolated build must not bump catalogVersion");

const port = await freePort();
const preview = spawn(
  process.execPath,
  [viteBin, "preview", "--outDir", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, env, stdio: "pipe" }
);
await new Promise((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      reject(new Error("preview start timeout"));
    }
  }, 15000);
  const onData = (chunk) => {
    const text = String(chunk);
    if (!settled && (text.includes("Local:") || text.includes("127.0.0.1") || text.includes(String(port)))) {
      settled = true;
      clearTimeout(timer);
      resolve();
    }
  };
  preview.stdout.on("data", onData);
  preview.stderr.on("data", onData);
  preview.on("error", (error) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
  preview.on("exit", (code) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      reject(new Error(`preview exited ${code}`));
    }
  });
});
await new Promise((r) => setTimeout(r, 300));

try {
  const langs = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];
  const productPath = `/product/${encodeURIComponent("НФ-00003681")}`;
  for (const lang of langs) {
    for (const [name, pathName] of [
      ["home", `/${lang}/`],
      ["catalog", `/${lang}/catalog`],
      ["product", `/${lang}${productPath}`],
    ]) {
      const page = await fetchText(`http://127.0.0.1:${port}${pathName}`);
      assert.equal(page.status, 200, `${lang} ${name} ${page.status}`);
      const head = parseHead(page.body);
      assert.equal(head.lang, lang === "zh" ? "zh-CN" : lang, `${lang} ${name} lang`);
      assert.equal(head.dir, lang === "ar" ? "rtl" : "ltr", `${lang} ${name} dir`);
      assert.equal(head.canonical, `https://clover-spb.ru${pathName}`);
      assert.equal(head.robots, "index,follow");
      const keys = head.hreflang.map((item) => item.hreflang).sort();
      assert.deepEqual(
        keys,
        ["ar", "en", "ky", "ru", "tg", "uz", "x-default", "zh-CN"].sort()
      );
      const zh = head.hreflang.find((item) => item.hreflang === "zh-CN");
      assert.match(zh.href, /\/zh\//);
      const xd = head.hreflang.find((item) => item.hreflang === "x-default");
      assert.match(xd.href, /\/ru\//);
    }
  }

  const legacy = await fetchText(`http://127.0.0.1:${port}/catalog`);
  assert.equal(legacy.status, 200);
  const legacyHead = parseHead(legacy.body);
  assert.equal(legacyHead.canonical, "https://clover-spb.ru/ru/catalog");
  assert.equal(legacyHead.lang, "ru");

  const xml = readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  assert.ok(locs.length > 0, "sitemap empty");
  const seen = new Set();
  for (const loc of locs) {
    assert.equal(seen.has(loc), false, `duplicate ${loc}`);
    seen.add(loc);
    const url = new URL(loc);
    assert.equal(url.hostname, "clover-spb.ru", loc);
    assert.match(url.pathname, /^\/(ru|en|uz|ky|tg|zh|ar)(\/|$)/);
    assert.equal(url.pathname.startsWith("/zh-CN"), false, loc);
    assert.doesNotMatch(url.pathname, /^\/(api|uploads|assets|storefront|lk|cart)\b/);
  }
  assert.equal(seen.has("https://clover-spb.ru/"), false);
  for (const lang of langs) {
    assert.equal(
      seen.has(`https://clover-spb.ru/${lang}/`) || seen.has(`https://clover-spb.ru/${lang}`),
      true,
      `sitemap missing ${lang} home`
    );
  }
  const sitemapSamples = [
    "https://clover-spb.ru/ru/",
    "https://clover-spb.ru/en/catalog",
    `https://clover-spb.ru/zh/product/${encodeURIComponent("НФ-00003681")}`,
    "https://clover-spb.ru/ar/",
  ];
  for (const loc of sitemapSamples) {
    assert.equal(seen.has(loc), true, `sitemap missing sample ${loc}`);
    const page = await fetchText(`http://127.0.0.1:${port}${new URL(loc).pathname}`);
    assert.equal(page.status, 200, loc);
    assert.equal(parseHead(page.body).canonical, loc, loc);
  }

  const unknown = await fetchText(`http://127.0.0.1:${port}/this-path-does-not-exist-seo-probe-9f3a`);
  assert.equal(unknown.status, 404);
  const fr = await fetchText(`http://127.0.0.1:${port}/fr/`);
  assert.equal(fr.status, 404);
  const zhCN = await fetchText(`http://127.0.0.1:${port}/zh-CN/`);
  assert.equal(zhCN.status, 404);
  const prefixedCart = await fetchText(`http://127.0.0.1:${port}/en/cart`);
  assert.equal(prefixedCart.status, 404);
  const cart = await fetchText(`http://127.0.0.1:${port}/cart`);
  assert.equal(cart.status, 200);
  assert.match(parseHead(cart.body).robots, /noindex/);

  const asset = readFileSync(path.join(outDir, "index.html"), "utf8").match(
    /src="(\/assets\/index-[^"]+\.js)"/
  )[1];
  const assetRes = await fetchText(`http://127.0.0.1:${port}${asset}`);
  assert.equal(assetRes.status, 200);

  let settled = "NOT VERIFIED";
  if (existsSync(chrome)) {
    const dump = spawnSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--dump-dom",
        `http://127.0.0.1:${port}/ar/`,
      ],
      { encoding: "utf8", timeout: 20000, env: { ...process.env, HOME: temp } }
    );
    if (dump.status === 0 && dump.stdout.includes("<html")) {
      const head = parseHead(dump.stdout);
      assert.equal(head.lang, "ar");
      assert.equal(head.dir, "rtl");
      assert.equal(head.canonical, "https://clover-spb.ru/ar/");
      settled = "PASS";
    } else {
      settled = `NOT VERIFIED (${dump.status}: ${(dump.stderr || "").slice(0, 180)})`;
    }
  }
  writeFileSync(
    path.join(temp, "preview-summary.json"),
    JSON.stringify({ settledDom: settled, port }, null, 2)
  );
  console.log(JSON.stringify({ SEO_LOCALE_HTML_PREVIEW: "PASS", settledDom: settled }));
} finally {
  preview.kill("SIGTERM");
}
