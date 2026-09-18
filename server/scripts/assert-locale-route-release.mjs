#!/usr/bin/env node
/**
 * Guard locale-route release artifacts before production cutover.
 * Read-only vs DB. Prints only enabled|disabled, never other dotenv keys.
 *
 * Mode comes from an explicit flag only. DB languages never enable the mode.
 * Foreign languages may fail a disabled delivery as inconsistency.
 *
 *   node -- assert-locale-route-release.mjs --print-expect --require-flag --locale-env-file FILE --db FILE
 *   node -- assert-locale-route-release.mjs --dist DIR --db FILE --expect enabled|disabled|auto
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { PUBLIC_LOCALE_ROUTES_ENV_KEY } from "../../src/shared/i18n/localeRoutesBuildFlag.js";
import { inspectLocaleRoutesFlagFromFile } from "../src/readLocaleRoutesFlagFile.js";
import { getEnabledLocales } from "../../src/shared/i18n/languageRegistry.js";
import { isForbiddenSitemapUrl } from "../../src/shared/sitemap/sitemapContract.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const out = {
    dist: "",
    db: "",
    expect: "auto",
    envFile: "",
    flagValue: "",
    hasFlagValue: false,
    printExpect: false,
    requireFlag: false,
    failIfDisabledWithForeignLanguages: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dist") out.dist = String(argv[++i] || "");
    else if (a === "--db") out.db = String(argv[++i] || "");
    else if (a === "--expect") out.expect = String(argv[++i] || "auto");
    else if (a === "--locale-env-file") out.envFile = String(argv[++i] || "");
    else if (a === "--flag-value") {
      out.hasFlagValue = true;
      out.flagValue = String(argv[++i] || "");
    } else if (a === "--print-expect") out.printExpect = true;
    else if (a === "--require-flag") out.requireFlag = true;
    else if (a === "--fail-if-disabled-with-foreign-languages") {
      out.failIfDisabledWithForeignLanguages = true;
    }
  }
  return out;
}

function readLocalizationEnabledLanguages(dbPath) {
  if (!dbPath || !existsSync(dbPath)) return ["ru"];
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get("localizationSettings");
    if (!row?.value_json) return ["ru"];
    const parsed = JSON.parse(row.value_json);
    return getEnabledLocales(parsed?.enabledLanguages);
  } catch {
    return ["ru"];
  } finally {
    try {
      db?.close?.();
    } catch {
      // ignore
    }
  }
}

function flagToMode(raw) {
  return String(raw || "").trim() === "1" ? "enabled" : "disabled";
}

function allowDisabledWithForeignLanguages() {
  return String(process.env.CLOVER_DEPLOY_ALLOW_DISABLED_LOCALE_ROUTES || "").trim() === "1";
}

function resolveExplicitMode(args) {
  if (args.hasFlagValue) {
    return { ok: true, mode: flagToMode(args.flagValue), source: "flag-value" };
  }
  if (args.envFile) {
    const parsed = inspectLocaleRoutesFlagFromFile(args.envFile);
    if (parsed.fileExists && parsed.error) {
      return { ok: false, error: parsed.error, source: "env-file" };
    }
    if (!parsed.fileExists) {
      if (args.requireFlag) {
        return { ok: false, error: parsed.error || "env-file not found", source: "env-file" };
      }
      return { ok: true, mode: "disabled", source: "env-file-missing" };
    }
    if (!parsed.keyFound) {
      if (args.requireFlag) {
        return {
          ok: false,
          error: `required ${PUBLIC_LOCALE_ROUTES_ENV_KEY} missing in ${args.envFile}`,
          source: "env-file",
        };
      }
      return { ok: true, mode: "disabled", source: "env-file-key-absent" };
    }
    return { ok: true, mode: flagToMode(parsed.value), source: "env-file" };
  }
  if (Object.prototype.hasOwnProperty.call(process.env, PUBLIC_LOCALE_ROUTES_ENV_KEY)) {
    return {
      ok: true,
      mode: flagToMode(process.env[PUBLIC_LOCALE_ROUTES_ENV_KEY]),
      source: "process-env",
    };
  }
  if (args.requireFlag) {
    return {
      ok: false,
      error: `required ${PUBLIC_LOCALE_ROUTES_ENV_KEY} is not set`,
      source: "unset",
    };
  }
  return { ok: true, mode: "disabled", source: "unset" };
}

function expectedMode(args) {
  if (args.expect === "enabled" || args.expect === "disabled") return args.expect;
  const resolved = resolveExplicitMode(args);
  if (!resolved.ok) fail(resolved.error);
  return resolved.mode;
}

function assertDisabledConsistentWithLanguages(args, mode) {
  if (mode !== "disabled" || !args.failIfDisabledWithForeignLanguages) return;
  if (allowDisabledWithForeignLanguages()) return;
  const languages = readLocalizationEnabledLanguages(args.db);
  if (languages.some((code) => code !== "ru")) {
    fail(
      `locale-route flag is explicitly disabled but DB has foreign languages (${languages.join(",")}); refusing cutover`
    );
  }
}

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xml))) locs.push(match[1].trim());
  return locs;
}

function fail(message) {
  console.error(`[locale-route-release] FAIL: ${message}`);
  process.exit(1);
}

function assertEnabledArtifacts(dist, languages) {
  const indexPath = path.join(dist, "index.html");
  const manifestPath = path.join(dist, "public-route-manifest.json");
  const sitemapPath = path.join(dist, "sitemap.xml");
  if (!existsSync(indexPath)) fail(`missing ${indexPath}`);
  if (!existsSync(manifestPath)) fail(`missing ${manifestPath}`);
  if (!existsSync(sitemapPath)) fail(`missing ${sitemapPath}`);

  const html = readFileSync(indexPath, "utf8");
  if (!/name="clover-public-locale-routes"/.test(html)) {
    fail("index.html missing clover-public-locale-routes meta");
  }
  if (!/name="clover-public-locale-routes"[\s\S]*?content="enabled"/.test(html)
    && !/content="enabled"[\s\S]*?name="clover-public-locale-routes"/.test(html)) {
    fail('index.html locale-routes stamp is not content="enabled"');
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`manifest JSON parse failed: ${error.message}`);
  }
  if (manifest?.infrastructureEnabled !== true) {
    fail("manifest.infrastructureEnabled is not true");
  }
  const routes = manifest.routes && typeof manifest.routes === "object" ? manifest.routes : {};
  if (!Object.keys(routes).length) fail("manifest.routes is empty");
  const manifestLangs = Array.isArray(manifest.enabledLanguages)
    ? manifest.enabledLanguages
    : [];
  for (const lang of languages) {
    if (!manifestLangs.includes(lang)) {
      fail(`manifest.enabledLanguages missing ${lang}`);
    }
    const home = `/${lang}/`;
    const catalog = `/${lang}/catalog`;
    if (!routes[home]) fail(`manifest missing ${home}`);
    if (!routes[catalog]) fail(`manifest missing ${catalog}`);
    if (lang === "ar" && routes[home].direction !== "rtl") {
      fail("ar home direction is not rtl");
    }
    if (lang === "zh") {
      const canonical = String(routes[home].canonical || "");
      if (canonical.includes("/zh-CN")) fail("zh canonical must use /zh/ not /zh-CN/");
      const zhHreflang = (routes[home].alternates || []).find((item) => item.hreflang === "zh-CN");
      if (!zhHreflang || !String(zhHreflang.href || "").includes("/zh/")) {
        fail("zh hreflang zh-CN must point at /zh/");
      }
    }
  }
  if (routes["/zh-CN/"] || routes["/zh-CN"]) {
    fail("manifest must not publish /zh-CN/ as a public prefix");
  }

  const xml = readFileSync(sitemapPath, "utf8");
  if (!xml.includes("<urlset")) fail("sitemap is not a urlset");
  if (xml.includes("<sitemapindex")) fail("sitemap index is not allowed");
  const locs = extractLocs(xml);
  if (!locs.length) fail("sitemap has no loc entries");
  const seen = new Set();
  for (const loc of locs) {
    if (seen.has(loc)) fail(`duplicate sitemap loc ${loc}`);
    seen.add(loc);
    if (isForbiddenSitemapUrl(loc, { allowLocalePrefixes: true })) {
      fail(`forbidden sitemap loc ${loc}`);
    }
    const url = new URL(loc);
    if (url.hostname !== "clover-spb.ru") fail(`non-canonical host ${loc}`);
    if (url.pathname === "/" || !/^\/(ru|en|uz|ky|tg|zh|ar)(\/|$)/.test(url.pathname)) {
      fail(`sitemap loc is not a canonical locale URL: ${loc}`);
    }
    if (url.pathname.startsWith("/zh-CN")) fail(`sitemap has /zh-CN/ URL: ${loc}`);
  }
  for (const lang of languages) {
    const home = `https://clover-spb.ru/${lang}/`;
    if (!seen.has(home) && !seen.has(`https://clover-spb.ru/${lang}`)) {
      fail(`sitemap missing home for ${lang}`);
    }
  }
  console.log(
    JSON.stringify({
      LOCALE_ROUTE_RELEASE: "OK",
      expect: "enabled",
      languages,
      sitemapUrls: locs.length,
      routeCount: Object.keys(routes).length,
    })
  );
}

function assertDisabledArtifacts(dist) {
  const indexPath = path.join(dist, "index.html");
  const manifestPath = path.join(dist, "public-route-manifest.json");
  const sitemapPath = path.join(dist, "sitemap.xml");
  if (!existsSync(indexPath)) fail(`missing ${indexPath}`);
  const html = readFileSync(indexPath, "utf8");
  if (/name="clover-public-locale-routes"[\s\S]*?content="enabled"/.test(html)) {
    fail("disabled expect but HTML stamp is enabled");
  }
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.infrastructureEnabled === true) {
      fail("disabled expect but manifest.infrastructureEnabled is true");
    }
  }
  if (existsSync(sitemapPath)) {
    const locs = extractLocs(readFileSync(sitemapPath, "utf8"));
    for (const loc of locs) {
      if (/https:\/\/clover-spb\.ru\/(?:ru|en|uz|ky|tg|zh|ar)(?:\/|$)/.test(loc)) {
        fail(`disabled sitemap contains locale URL ${loc}`);
      }
    }
  }
  console.log(JSON.stringify({ LOCALE_ROUTE_RELEASE: "OK", expect: "disabled" }));
}

const args = parseArgs(process.argv.slice(2));
if (args.printExpect) {
  const mode = expectedMode({ ...args, expect: "auto" });
  assertDisabledConsistentWithLanguages(args, mode);
  process.stdout.write(`${mode}\n`);
  process.exit(0);
}

const mode = expectedMode(args);
if (!args.dist) fail("--dist is required");
const dist = path.resolve(args.dist);
if (mode === "enabled") {
  const languages = readLocalizationEnabledLanguages(args.db);
  assertEnabledArtifacts(dist, languages);
} else {
  assertDisabledArtifacts(dist);
}

void projectRoot;
void PUBLIC_LOCALE_ROUTES_ENV_KEY;
void pathToFileURL;
