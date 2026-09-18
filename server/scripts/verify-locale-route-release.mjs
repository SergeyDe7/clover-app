#!/usr/bin/env node
/**
 * Reproduce the post-Stage-9 locale-route deploy regression and prove the guard.
 * Isolated temp DB only. Does not write /opt/clover/clover-app/dist.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
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
const productionRoot = "/opt/clover/clover-app";
assert.equal(path.resolve(root) === path.resolve(productionRoot), false);

const temp = mkdtempSync(path.join(tmpdir(), "clover-locale-route-release-"));
const dbPath = path.join(temp, "fixture.sqlite");
const disabledDir = path.join(temp, "disabled-dist");
const enabledDir = path.join(temp, "enabled-dist");
mkdirSync(disabledDir, { recursive: true });
mkdirSync(enabledDir, { recursive: true });

process.on("exit", () => rmSync(temp, { recursive: true, force: true }));

function seedDb() {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
    CREATE TABLE translation_entries (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      source_ru TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      critical INTEGER NOT NULL
    );
    CREATE TABLE translation_values (
      entry_id TEXT NOT NULL,
      language_code TEXT NOT NULL,
      value TEXT NOT NULL,
      state TEXT NOT NULL,
      source_hash TEXT NOT NULL
    );
    CREATE TABLE product_translations (
      product_id TEXT NOT NULL,
      language_code TEXT NOT NULL,
      field_key TEXT NOT NULL,
      auto_value TEXT NOT NULL,
      auto_source_hash TEXT NOT NULL,
      manual_value TEXT NOT NULL,
      manual_source_hash TEXT NOT NULL
    );
  `);
  const product = {
    id: "p1",
    code: "НФ-00003681",
    oneCId: "onec-1",
    name: "Жидкое мыло",
    category: "Химия",
    subcategory: "",
    showOnStorefront: true,
  };
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    "products",
    JSON.stringify([product])
  );
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    "oneCProducts",
    JSON.stringify([{ id: "onec-1", name: "Жидкое мыло" }])
  );
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    "settings",
    JSON.stringify({
      storefrontShowOnlyLinked: true,
      storefrontInfoPages: [],
    })
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

function runGenerate(outDir, extraEnv = {}) {
  const result = spawnSync(
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
        ...extraEnv,
      },
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split("\n").pop());
}

function runAssert(dist, expect, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      path.join(root, "server/scripts/assert-locale-route-release.mjs"),
      "--dist",
      dist,
      "--db",
      dbPath,
      "--expect",
      expect,
      ...extraArgs,
    ],
    { cwd: root, encoding: "utf8" }
  );
}

function runPrintExpect(extraArgs, extraEnv = {}) {
  return spawnSync(
    process.execPath,
    ["--", path.join(root, "server/scripts/assert-locale-route-release.mjs"), "--print-expect", ...extraArgs],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        HOME: temp,
        ...extraEnv,
      },
    }
  );
}

function readCatalogVersion(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get("localizationSettings");
    return JSON.parse(row.value_json).catalogVersion;
  } finally {
    db.close();
  }
}

seedDb();
const catalogBefore = readCatalogVersion(dbPath);
assert.equal(catalogBefore, 28);

// 1) Reproduce production regression: foreign languages in DB, flag absent.
const withoutFlag = runGenerate(disabledDir, {
  CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "",
});
assert.equal(withoutFlag.localizedRoutes, false);
assert.deepEqual(withoutFlag.enabledLanguages, ["ru"]);
const disabledManifest = JSON.parse(
  readFileSync(path.join(disabledDir, "public-route-manifest.json"), "utf8")
);
assert.equal(disabledManifest.infrastructureEnabled, false);
assert.deepEqual(disabledManifest.routes, {});
assert.match(readFileSync(path.join(disabledDir, "sitemap.xml"), "utf8"), /https:\/\/clover-spb\.ru\/</);
assert.doesNotMatch(
  readFileSync(path.join(disabledDir, "sitemap.xml"), "utf8"),
  /https:\/\/clover-spb\.ru\/en\//
);
console.log("REPRO_FLAG_ABSENT_IGNORES_DB_LANGUAGES:PASS");

writeFileSync(
  path.join(disabledDir, "index.html"),
  '<meta name="clover-public-locale-routes" content="disabled" />\n<title>t</title>'
);
const reject = runAssert(disabledDir, "enabled");
assert.notEqual(reject.status, 0, "guard must reject disabled artifacts when enabled is expected");
assert.match(reject.stderr, /FAIL/);
console.log("GUARD_REJECTS_DISABLED_WHEN_EXPECTED_ENABLED:PASS");

const acceptDisabled = runAssert(disabledDir, "disabled");
assert.equal(acceptDisabled.status, 0, acceptDisabled.stderr);
console.log("GUARD_ALLOWS_DISABLED_WHEN_EXPECTED_DISABLED:PASS");

// 2) Flag present: localized artifacts from the same DB.
const withFlag = runGenerate(enabledDir, {
  CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
});
assert.equal(withFlag.localizedRoutes, true);
assert.deepEqual(withFlag.enabledLanguages, [
  "ru",
  "en",
  "uz",
  "ky",
  "tg",
  "zh",
  "ar",
]);
const enabledManifest = JSON.parse(
  readFileSync(path.join(enabledDir, "public-route-manifest.json"), "utf8")
);
assert.equal(enabledManifest.infrastructureEnabled, true);
assert.ok(enabledManifest.routes["/ru/"]);
assert.ok(enabledManifest.routes["/en/catalog"]);
assert.equal(
  Object.keys(enabledManifest.routes).some((key) => key.startsWith("/zh/product/")),
  true,
  `zh product route missing in ${Object.keys(enabledManifest.routes).filter((k) => k.includes("product")).join(",")}`
);
assert.equal(enabledManifest.routes["/ar/"].direction, "rtl");
assert.equal(
  enabledManifest.routes["/zh/"].alternates.find((item) => item.hreflang === "zh-CN").href,
  "https://clover-spb.ru/zh/"
);
assert.equal(Object.hasOwn(enabledManifest.routes, "/zh-CN/"), false);
const enabledXml = readFileSync(path.join(enabledDir, "sitemap.xml"), "utf8");
assert.match(enabledXml, /https:\/\/clover-spb\.ru\/ru\//);
assert.match(enabledXml, /https:\/\/clover-spb\.ru\/en\//);
assert.match(enabledXml, /https:\/\/clover-spb\.ru\/zh\//);
assert.doesNotMatch(enabledXml, /https:\/\/clover-spb\.ru\/zh-CN/);
assert.doesNotMatch(enabledXml, /<loc>https:\/\/clover-spb\.ru\/<\/loc>/);
console.log("GENERATE_WITH_FLAG_LOCALIZES:PASS");

writeFileSync(
  path.join(enabledDir, "index.html"),
  '<meta name="clover-public-locale-routes" content="enabled" />\n<title>t</title>'
);
const acceptEnabled = runAssert(enabledDir, "enabled");
assert.equal(acceptEnabled.status, 0, acceptEnabled.stderr + acceptEnabled.stdout);
console.log("GUARD_ACCEPTS_ENABLED:PASS");

const printExpect = runPrintExpect(["--db", dbPath, "--flag-value", ""]);
assert.equal(printExpect.status, 0, printExpect.stderr);
assert.equal(printExpect.stdout.trim(), "disabled");
console.log("PRINT_EXPECT_FOREIGN_LANGUAGES:PASS");

const printExpectInconsistent = runPrintExpect([
  "--db",
  dbPath,
  "--flag-value",
  "",
  "--fail-if-disabled-with-foreign-languages",
]);
assert.notEqual(printExpectInconsistent.status, 0);
assert.match(
  printExpectInconsistent.stderr,
  /foreign languages|refusing cutover/i
);
console.log("PRINT_EXPECT_FOREIGN_LANGUAGES_INCONSISTENT:PASS");

const printExpectAllowed = runPrintExpect(
  ["--db", dbPath, "--flag-value", "0", "--fail-if-disabled-with-foreign-languages"],
  { CLOVER_DEPLOY_ALLOW_DISABLED_LOCALE_ROUTES: "1" }
);
assert.equal(printExpectAllowed.status, 0, printExpectAllowed.stderr);
assert.equal(printExpectAllowed.stdout.trim(), "disabled");
console.log("PRINT_EXPECT_FOREIGN_LANGUAGES_ALLOW_DISABLED:PASS");

const printExpectEnabled = runPrintExpect(["--db", dbPath, "--flag-value", "1"]);
assert.equal(printExpectEnabled.status, 0, printExpectEnabled.stderr);
assert.equal(printExpectEnabled.stdout.trim(), "enabled");
console.log("PRINT_EXPECT_EXPLICIT_ENABLED:PASS");

const printDisabled = runPrintExpect([
  "--db",
  path.join(temp, "missing.sqlite"),
  "--flag-value",
  "",
]);
assert.equal(printDisabled.status, 0, printDisabled.stderr);
assert.equal(printDisabled.stdout.trim(), "disabled");
console.log("PRINT_EXPECT_NO_FLAG_NO_FOREIGN:PASS");

const missingEnv = path.join(temp, "missing.env");
const requireMissing = runPrintExpect([
  "--db",
  dbPath,
  "--require-flag",
  "--locale-env-file",
  missingEnv,
]);
assert.notEqual(requireMissing.status, 0);
assert.match(requireMissing.stderr, /env-file not found|required/i);
console.log("PRINT_EXPECT_REQUIRE_FLAG_MISSING_FILE:PASS");

const envNoKey = path.join(temp, "nokey.env");
writeFileSync(envNoKey, "OTHER_SECRET=do-not-leak\n");
const requireNoKey = runPrintExpect(
  ["--db", dbPath, "--require-flag", "--locale-env-file", envNoKey],
  { CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1" }
);
assert.notEqual(requireNoKey.status, 0, "process.env must not mask a missing env-file key");
assert.match(requireNoKey.stderr, /missing/i);
assert.equal(requireNoKey.stdout.includes("do-not-leak"), false);
assert.equal(requireNoKey.stderr.includes("do-not-leak"), false);
console.log("PRINT_EXPECT_REQUIRE_FLAG_NOT_MASKED_BY_PROCESS_ENV:PASS");

const envExport = path.join(temp, "export.env");
writeFileSync(envExport, 'export CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED="1"\nSECRET=nope\n');
const printExport = runPrintExpect(["--db", dbPath, "--require-flag", "--locale-env-file", envExport]);
assert.equal(printExport.status, 0, printExport.stderr);
assert.equal(printExport.stdout.trim(), "enabled");
assert.equal(printExport.stdout.includes("nope"), false);
console.log("PRINT_EXPECT_EXPORT_KEY_ENABLED:PASS");

const envDisabled = path.join(temp, "disabled.env");
writeFileSync(envDisabled, "CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=0\n");
const printEnvDisabled = runPrintExpect([
  "--db",
  dbPath,
  "--require-flag",
  "--locale-env-file",
  envDisabled,
]);
assert.equal(printEnvDisabled.status, 0, printEnvDisabled.stderr);
assert.equal(printEnvDisabled.stdout.trim(), "disabled");
console.log("PRINT_EXPECT_EXPLICIT_DISABLED_KEEPS_DISABLED:PASS");

assert.equal(readCatalogVersion(dbPath), catalogBefore, "generate-sitemap must not bump catalogVersion");
console.log("GENERATE_SITEMAP_READONLY_CATALOG:PASS");

assert.equal(existsSync(path.join(productionRoot, "dist", "index.html")), true);
console.log("LOCALE_ROUTE_RELEASE_VERIFY_PASS");
