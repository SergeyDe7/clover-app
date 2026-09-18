#!/usr/bin/env node
/**
 * Prove off-live sitemap/build reads SQLite without catalog-sync writes.
 * Isolated temp DB only. Does not touch /opt/clover/clover-app data.
 * Runtime initializeLocalizationCatalog() on clover-api is left intact.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
assert.notEqual(path.resolve(root), path.resolve("/opt/clover/clover-app"));

const FORBIDDEN = /from\s+["'][^"']*\/(db|localizationStore)\.js["']/;
const SOURCE_FILES = [
  "server/scripts/generate-sitemap.mjs",
  "server/scripts/assert-locale-route-release.mjs",
  "server/src/readLocaleRoutesFlagFile.js",
  "src/shared/i18n/localeRoutesBuildFlag.js",
  "vite.config.js",
  "src/shared/sitemap/localizedSitemap.js",
  "src/shared/sitemap/sitemapContract.js",
  "src/shared/sitemap/publicRouteHtml.js",
];

for (const rel of SOURCE_FILES) {
  const text = readFileSync(path.join(root, rel), "utf8");
  assert.equal(FORBIDDEN.test(text), false, `${rel} must not import db.js/localizationStore.js`);
}
console.log("SOURCE_GRAPH_NO_DB_INIT:PASS");

const temp = mkdtempSync(path.join(tmpdir(), "clover-seo-build-ro-"));
const dbPath = path.join(temp, "fixture.sqlite");
const outDir = path.join(temp, "dist");
mkdirSync(outDir, { recursive: true });
process.on("exit", () => rmSync(temp, { recursive: true, force: true }));

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
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    "products",
    JSON.stringify([
      {
        id: "p1",
        code: "SMOKE-001",
        oneCId: "onec-1",
        name: "Fixture dish soap",
        category: "Fixture category",
        subcategory: "",
        showOnStorefront: true,
      },
    ])
  );
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    "oneCProducts",
    JSON.stringify([{ id: "onec-1", name: "Fixture dish soap" }])
  );
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    "settings",
    JSON.stringify({ storefrontShowOnlyLinked: true, storefrontInfoPages: [] })
  );
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    "localizationSettings",
    JSON.stringify({
      enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh", "ar"],
      catalogVersion: 28,
    })
  );
  db.close();
}

function fingerprint(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => row.name);
    const loc = JSON.parse(
      db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("localizationSettings")
        .value_json
    );
    return {
      sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
      catalogVersion: loc.catalogVersion,
      enabledLanguages: loc.enabledLanguages,
      tables,
    };
  } finally {
    db.close();
  }
}

seedDb();
const before = fingerprint(dbPath);

const generate = spawnSync(
  process.execPath,
  [path.join(root, "server/scripts/generate-sitemap.mjs")],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HOME: temp,
      DB_PATH: dbPath,
      SITEMAP_OUT: path.join(outDir, "sitemap.xml"),
      PUBLIC_ROUTE_MANIFEST_OUT: path.join(outDir, "public-route-manifest.json"),
      CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
    },
  }
);
assert.equal(generate.status, 0, generate.stderr || generate.stdout);
const afterGenerate = fingerprint(dbPath);
assert.deepEqual(afterGenerate, before, "generate-sitemap mutated isolated DB");
console.log("GENERATE_SITEMAP_DB_UNCHANGED:PASS");

const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
if (existsSync(viteBin)) {
  const vite = spawnSync(
    process.execPath,
    [viteBin, "build", "--outDir", outDir, "--emptyOutDir"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        HOME: temp,
        NODE_ENV: "production",
        DB_PATH: dbPath,
        SITEMAP_OUT: path.join(outDir, "sitemap.xml"),
        CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
        VITE_STORE_HOSTS: "127.0.0.1,localhost",
      },
    }
  );
  assert.equal(vite.status, 0, vite.stderr || vite.stdout);
  const sitemapAgain = spawnSync(
    process.execPath,
    [path.join(root, "server/scripts/generate-sitemap.mjs")],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        HOME: temp,
        DB_PATH: dbPath,
        SITEMAP_OUT: path.join(outDir, "sitemap.xml"),
        PUBLIC_ROUTE_MANIFEST_OUT: path.join(outDir, "public-route-manifest.json"),
        CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
      },
    }
  );
  assert.equal(sitemapAgain.status, 0, sitemapAgain.stderr || sitemapAgain.stdout);
  const afterBuild = fingerprint(dbPath);
  assert.deepEqual(afterBuild, before, "vite build + generate-sitemap mutated isolated DB");
  console.log("VITE_BUILD_PLUS_SITEMAP_DB_UNCHANGED:PASS");
} else {
  console.log("VITE_BUILD_PLUS_SITEMAP_DB_UNCHANGED:SKIP no node_modules/vite");
}

console.log(
  JSON.stringify({
    SEO_BUILD_READONLY: "PASS",
    catalogVersion: before.catalogVersion,
    sha256: before.sha256,
  })
);
