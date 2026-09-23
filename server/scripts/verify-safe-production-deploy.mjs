/**
 * Safe production deploy sandbox verifier.
 * NEVER mutates real /opt/clover/clover-app or live systemd units.
 *
 * Scenarios: build failure, success, health-failure rollback, rollback failure,
 * dirty source, invalid target, concurrent lock, build-tag mismatch,
 * no-live-build, no-unsafe-process-kill.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { parseCurlHeaders } from "./seoPostCutoverProbe.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workRoot = path.resolve(__dirname, "../..");
const SCRIPT = path.join(workRoot, "scripts/linux/restart-api-ui.sh");
const RECOVERY_SCRIPT = path.join(workRoot, "scripts/linux/recover-seo-post-success.sh");
const PRODUCTION_ROOT = "/opt/clover/clover-app";

assert.ok(existsSync(SCRIPT), "restart-api-ui.sh missing");
assert.ok(existsSync(RECOVERY_SCRIPT), "recover-seo-post-success.sh missing");
assert.notEqual(path.resolve(SCRIPT).startsWith(PRODUCTION_ROOT), true);
assert.deepEqual(
  parseCurlHeaders("HTTP/1.1 100 Continue\r\n\r\nHTTP/2 301\r\nLocation: /ru/catalog/example\r\n\r\n"),
  { status: 301, headers: new Map([["location", "/ru/catalog/example"]]) },
  "SEO probe must inspect the final HTTP response and exact Location"
);

const scriptSrc = readFileSync(SCRIPT, "utf8");
assert.equal(/\bpkill\b/i.test(scriptSrc), false, "no pkill");
assert.equal(/\bnohup\b/i.test(scriptSrc), false, "no nohup");
assert.equal(/(^|[^a-zA-Z_])kill\s+-9\b/m.test(scriptSrc), false, "no kill -9");
assert.equal(/systemctl/i.test(scriptSrc), true, "systemd-only restart path present");
assert.ok(scriptSrc.includes("TARGET_SHA"), "requires target SHA");
assert.ok(scriptSrc.includes("rollback"), "must implement rollback");
assert.ok(
  !/^\s*cd "\$ROOT"\s*$[\s\S]*?^\s*npm run build/m.test(scriptSrc) ||
    scriptSrc.includes("BUILD_WT"),
  "must not build directly in live ROOT"
);
assert.ok(scriptSrc.includes("BUILD_WT") || scriptSrc.includes("worktree"), "off-live build worktree");
assert.ok(scriptSrc.includes("STAGED_DIST") || scriptSrc.includes("staged"), "staged dist");
assert.ok(
  scriptSrc.includes("CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED"),
  "isolated build must receive locale-route flag"
);
assert.ok(
  scriptSrc.includes("--require-flag"),
  "deploy must require an explicit locale-route flag"
);
assert.ok(
  scriptSrc.includes("--locale-env-file"),
  "deploy must pass a locale-only env path, not Node --env-file"
);
assert.equal(
  /\s--env-file\b/.test(scriptSrc),
  false,
  "Node --env-file would load the full dotenv into process.env"
);
assert.ok(
  scriptSrc.includes("--fail-if-disabled-with-foreign-languages"),
  "deploy must treat foreign DB languages as inconsistency when disabled"
);
assert.equal(
  /node "\$\{ASSERT_JS\}"[\s\S]*?--flag-value/.test(scriptSrc),
  false,
  "print-expect must not take an awk/process.env fallback as --flag-value"
);
assert.equal(
  /^\s*source\s+/m.test(scriptSrc),
  false,
  "deploy must not source dotenv"
);
assert.ok(
  scriptSrc.includes("assert-locale-route-release.mjs") ||
    scriptSrc.includes("locale-route artifacts rejected"),
  "pre-cutover locale-route guard must exist"
);
assert.equal(
  /\$\{NPM_BIN\}"\s+run build -- --outDir/.test(scriptSrc),
  false,
  "must not pass --outDir through npm run build"
);
// Committed normal default for readiness window must be 60 (sandbox may still override via env).
assert.match(
  scriptSrc,
  /CLOVER_DEPLOY_HEALTH_ATTEMPTS:-\s*60\b/,
  "default CLOVER_DEPLOY_HEALTH_ATTEMPTS must be 60"
);
assert.equal(
  /CLOVER_DEPLOY_HEALTH_ATTEMPTS:-\s*30\b/.test(scriptSrc),
  false,
  "default CLOVER_DEPLOY_HEALTH_ATTEMPTS must not remain 30"
);
assert.match(scriptSrc, /uiAssetProbe\.mjs/, "deploy must copy/run the asset probe");
assert.match(scriptSrc, /READY_CONSECUTIVE:-\s*2\b/, "two consecutive ready passes required");
assert.match(scriptSrc, /check_http_assets/, "HTML/API 200 is not enough without asset HTTP");
assert.match(scriptSrc, /check-namespace/, "staged dist must prove release namespace consistency");
assert.match(
  scriptSrc,
  /--expected-locale-stamp/,
  "namespace check must receive locale stamp from deploy config, not from HTML"
);
assert.match(scriptSrc, /prepare/, "deploy script must support prepare");
assert.match(scriptSrc, /promote/, "deploy script must support promote");
assert.equal(/SKIP_BUILD=/.test(scriptSrc), false, "must not add a hidden SKIP_BUILD switch");
assert.match(scriptSrc, /preparedDist\.mjs/, "prepare/promote must inventory via preparedDist.mjs");
assert.match(scriptSrc, /verify-files/, "promote must re-hash the trusted staging tree before cutover");
assert.match(scriptSrc, /assert-metrika-release\.mjs/, "prepare/promote must gate Metrika bake");
assert.match(scriptSrc, /production-ui-build\.flags/, "prepare must read the explicit Metrika target file");
assert.match(scriptSrc, /--expected-metrika/, "manifest must record expected Metrika bake");
assert.match(scriptSrc, /unset VITE_YANDEX_METRIKA_TEST_MODE/, "production bake must drop TEST_MODE");
assert.equal(/set\s+-a/.test(scriptSrc), false, "must not export a full dotenv into the frontend build");
assert.equal(
  /(^|[;&]|\n)\s*source\s+["']?(\$\{?ROOT\}?\/)?server\/\.env/m.test(scriptSrc),
  false,
  "must not source server/.env into the frontend build"
);
assert.equal(
  /nginx\s+-s\s+reload|systemctl\s+reload\s+nginx/i.test(scriptSrc),
  false,
  "must not force nginx reload when config did not change"
);
assert.equal(
  /chmod\s+.*\bdist\b/.test(scriptSrc),
  false,
  "must not weaken or rewrite live dist permissions"
);
assert.equal(
  /wait_for_nginx_worker|while\s+.*nginx.*worker/i.test(scriptSrc),
  false,
  "must not wait for previous nginx workers to drain"
);
assert.equal(
  /\s-k\b|--insecure/.test(scriptSrc),
  false,
  "deploy must not disable TLS verification"
);
const launcherSrc = readFileSync(path.join(workRoot, "scripts/linux/run-target-deploy.sh"), "utf8");
assert.match(launcherSrc, /assert-metrika-release\.mjs/, "launcher must extract the Metrika bake helper");
assert.match(launcherSrc, /FIRST_DEPLOY_LAUNCHER/, "first-deploy launcher must extract the target script");
assert.match(launcherSrc, /CLOVER_DEPLOY_ROOT/, "launcher ROOT comes from env, not this file");
assert.equal(/git reset/i.test(launcherSrc), false, "launcher must not reset live source");
assert.equal(/BASH_SOURCE/.test(launcherSrc), false, "launcher must not infer ROOT from its path");
assert.match(launcherSrc, /extract dir must not be inside live ROOT/);
assert.match(launcherSrc, /prepare/, "launcher must support prepare");
assert.match(launcherSrc, /promote/, "launcher must support promote");
assert.match(launcherSrc, /preparedDist\.mjs/, "launcher must extract preparedDist.mjs from target SHA");
assert.match(launcherSrc, /extract_file "server\/scripts\/seoPostCutoverProbe\.mjs"/, "launcher must extract the target-pinned SEO gate");
assert.match(scriptSrc, /check_seo_routes "promoted" \|\| rollback_release/, "SEO gate must run before Deploy OK with rollback armed");
assert.doesNotMatch(scriptSrc, /SEO_POST_GATE/, "SEO gate must not have an opt-out flag");
assert.equal(/SKIP_BUILD=/.test(launcherSrc), false, "launcher must not add SKIP_BUILD");
assert.equal(
  /grep\s+-oE/.test(launcherSrc),
  false,
  "launcher must not extract targetSha with grep"
);
assert.equal(
  /JSON\.parse/.test(launcherSrc),
  false,
  "launcher must not parse manifest to choose the bootstrap SHA"
);
assert.match(
  launcherSrc,
  /promote <dir> <sha>|explicit expected target SHA/,
  "launcher promote must take an explicit expected SHA"
);
assert.match(launcherSrc, /PINNED_SHA/, "launcher must pin one SHA for extract and cutover");
assert.match(
  launcherSrc,
  /inspect-sha/,
  "launcher must verify manifest with the helper extracted from the pinned SHA"
);
assert.equal(
  /TARGET_SHA="\$\(node/.test(scriptSrc),
  false,
  "deploy script must not replace the pinned SHA by re-reading inspect-sha"
);
assert.match(
  scriptSrc,
  /promote <dir> <sha>|promote <prepared-artifact-dir> <exact-target-commit-sha>/,
  "promote must accept an explicit expected SHA"
);
const probeSrc = readFileSync(path.join(workRoot, "server/scripts/uiAssetProbe.mjs"), "utf8");
assert.match(probeSrc, /TLS verification must stay enabled/);
assert.equal(
  /extraArgs\.push\(\s*["'](?:-k|--insecure)["']/.test(probeSrc),
  false,
  "asset probe must not pass -k/--insecure to curl"
);
assert.equal(
  /command === "check-http"[\s\S]*inspectReleaseNamespace/.test(probeSrc),
  false,
  "HTTP/MIME rollback gate must not require a new release namespace"
);
console.log("STATIC_CONTRACT:PASS");
const SEO_ONLY = process.argv.includes("--seo-only");
const RECOVERY_ONLY = process.argv.includes("--recovery-only");

const GIT_USR_BIN = "C:\\Program Files\\Git\\usr\\bin";

function resolveBash() {
  if (process.env.CLOVER_DEPLOY_TEST_BASH) return process.env.CLOVER_DEPLOY_TEST_BASH;
  const candidates = [
    path.join(GIT_USR_BIN, "bash.exe"),
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "bash",
  ];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ["-c", "echo ok"], { encoding: "utf8" });
    if (result.status === 0) return cmd;
  }
  return "";
}

const BASH_BIN = resolveBash();
assert.ok(BASH_BIN, "bash is required for deploy sandbox (Git Bash on Windows)");

function sh(cmd, opts = {}) {
  return spawnSync(BASH_BIN, ["-lc", cmd], {
    encoding: "utf8",
    ...opts,
  });
}

function bashPath(value) {
  if (process.platform !== "win32") return value;
  return String(value).replace(/^([A-Za-z]):[\\/]/u, (_match, drive) => `/${drive.toLowerCase()}/`).replaceAll("\\", "/");
}

function nativePath(value) {
  if (process.platform !== "win32") return value;
  return String(value).replace(/^\/([a-zA-Z])\//u, (_match, drive) => `${drive.toUpperCase()}:/`);
}

function writeExec(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function writeCompleteUiDist(dir, { tag, jsPath, localeStamp = "disabled" }) {
  const releaseId = String(tag || "ui-NEW").replace(/^ui-/, "");
  const jsName = path.posix.basename(jsPath || "/assets/index-NEW.js");
  const chunkName = jsName.includes("OLD") ? "vendor-OLD.js" : "vendor-NEW.js";
  const js = `/assets/${releaseId}/${jsName}`;
  const css = js.replace(/\.js$/, ".css");
  const chunk = `/assets/${releaseId}/${chunkName}`;
  const fontCss = `/fonts/${releaseId}/manrope.css`;
  const fontFile = `/fonts/${releaseId}/manrope-latin-700-normal.woff2`;
  mkdirSync(path.join(dir, "assets", releaseId), { recursive: true });
  mkdirSync(path.join(dir, "fonts", releaseId), { recursive: true });
  writeFileSync(
    path.join(dir, "index.html"),
    `<meta name="clover-ui-build" content="${tag}"><meta name="clover-public-locale-routes" content="${localeStamp}"><link rel="modulepreload" href="${chunk}"><link rel="stylesheet" href="${css}"><link rel="preload" href="${fontFile}" as="font"><link rel="stylesheet" href="${fontCss}"><script src="${js}"></script>`
  );
  writeFileSync(path.join(dir, js.slice(1)), "export default 1;\n");
  writeFileSync(path.join(dir, chunk.slice(1)), "export const vendor = 1;\n");
  writeFileSync(
    path.join(dir, css.slice(1)),
    `body{color:#111}@font-face{src:url("${fontFile}")}`
  );
  writeFileSync(path.join(dir, fontCss.slice(1)), `@font-face{src:url("${fontFile}")}`);
  writeFileSync(path.join(dir, fontFile.slice(1)), "w2");
  writeFileSync(
    path.join(dir, "sw.js"),
    `const CACHE_NAME = "clover-shell-${tag}";\n`
  );
  writeFileSync(path.join(dir, "sitemap.xml"), "<urlset></urlset>");
}

function initSandbox(label) {
  const root = mkdtempSync(path.join(tmpdir(), `clover-deploy-${label}-`));
  const live = path.join(root, "live");
  const staging = path.join(root, "staging");
  const lkg = path.join(root, "lkg");
  const bin = path.join(root, "bin");
  const state = path.join(root, "state");
  mkdirSync(live, { recursive: true });
  mkdirSync(staging, { recursive: true });
  mkdirSync(lkg, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  mkdirSync(path.join(live, "server/data"), { recursive: true });
  mkdirSync(path.join(live, "server/src"), { recursive: true });
  mkdirSync(path.join(live, "dist"), { recursive: true });
  mkdirSync(path.join(live, "node_modules"), { recursive: true });
  mkdirSync(path.join(live, "server/node_modules"), { recursive: true });
  writeFileSync(path.join(live, "server/data/clover.sqlite"), "");
  writeCompleteUiDist(path.join(live, "dist"), {
    tag: "ui-OLD",
    jsPath: "/assets/index-OLD.js",
  });
  writeFileSync(path.join(live, "package.json"), JSON.stringify({ scripts: { build: "node ./fake-build.js" } }));
  writeFileSync(path.join(live, "server/src/server.js"), "console.log('api-old')\n");
  mkdirSync(path.join(live, "server"), { recursive: true });
  writeFileSync(path.join(live, ".gitignore"), "server/.env\nserver/data/clover.sqlite\n");
  writeFileSync(
    path.join(live, "server/.env"),
    "CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=0\n"
  );
  mkdirSync(path.join(live, "scripts/linux"), { recursive: true });
  mkdirSync(path.join(live, "server/scripts"), { recursive: true });
  writeFileSync(
    path.join(live, "scripts/linux/restart-api-ui.sh"),
    execFileSync("git", ["-C", workRoot, "show", "b3f31a3fc68303655c9ddda5c81488c3c834ce04:scripts/linux/restart-api-ui.sh"], {
      encoding: "utf8",
    })
  );

  // Fake git repo with two commits.
  execFileSync("git", ["init"], { cwd: live });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: live });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: live });
  execFileSync("git", ["add", "-A"], { cwd: live });
  execFileSync("git", ["commit", "-m", "old"], { cwd: live });
  const oldSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: live, encoding: "utf8" }).trim();

  // Match production: the UI dist is runtime output, not source tracked by
  // the new release. The old fixture commit remains available for rollback.
  writeFileSync(path.join(live, ".gitignore"), "server/.env\nserver/data/clover.sqlite\ndist/\n");
  execFileSync("git", ["rm", "--cached", "-r", "dist"], { cwd: live });

  writeFileSync(path.join(live, "server/src/server.js"), "console.log('api-new')\n");
  writeFileSync(path.join(live, "marker-new.txt"), "new\n");
  // Keep package.json build script.
  writeFileSync(
    path.join(live, "fake-build.js"),
    `
const fs = require('fs');
const path = require('path');
const out = path.join(process.cwd(), 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
const tag = process.env.FAKE_BUILD_TAG || 'ui-NEW';
const releaseId = String(tag).replace(/^ui-/, '');
const jsName = require('path').posix.basename(process.env.FAKE_BUILD_JS || '/assets/index-NEW.js');
const chunkName = require('path').posix.basename(process.env.FAKE_BUILD_CHUNK || '/assets/vendor-NEW.js');
const flat = process.env.FAKE_BUILD_FLAT === '1';
const js = flat ? '/assets/' + jsName : '/assets/' + releaseId + '/' + jsName;
const css = process.env.FAKE_BUILD_CSS || js.replace(/\\.js$/, '.css');
const chunk = flat ? '/assets/' + chunkName : '/assets/' + releaseId + '/' + chunkName;
const omit = new Set(String(process.env.FAKE_BUILD_OMIT || '').split(',').filter(Boolean));
const forcedLocale = process.env.FAKE_LOCALE_ARTIFACTS || '';
const localeEnabled = forcedLocale === 'enabled' || (forcedLocale !== 'disabled' && process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED === '1');
const localeStamp = localeEnabled ? 'enabled' : 'disabled';
const fontCss = flat ? '/fonts/manrope.css' : '/fonts/' + releaseId + '/manrope.css';
const fontFile = flat ? '/fonts/manrope-latin-700-normal.woff2' : '/fonts/' + releaseId + '/manrope-latin-700-normal.woff2';
let html = '<meta name="clover-ui-build" content="' + tag + '"><meta name="clover-public-locale-routes" content="' + localeStamp + '">';
html += '<link rel="modulepreload" href="' + chunk + '">';
html += '<link rel="stylesheet" href="' + css + '">';
html += '<link rel="preload" href="' + fontFile + '" as="font">';
html += '<link rel="stylesheet" href="' + fontCss + '">';
html += '<script src="' + js + '"></script>';
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'sw.js'), 'const CACHE_NAME = "clover-shell-' + tag + '";\\n');
if (!omit.has('js')) { fs.mkdirSync(path.dirname(path.join(out, js.replace(/^\\//, ''))), { recursive: true }); fs.writeFileSync(path.join(out, js.replace(/^\\//, '')), 'export default 1;\\n'); }
if (!omit.has('chunk')) { fs.mkdirSync(path.dirname(path.join(out, chunk.replace(/^\\//, ''))), { recursive: true }); fs.writeFileSync(path.join(out, chunk.replace(/^\\//, '')), 'export const vendor = 1;\\n'); }
if (!omit.has('css')) { fs.mkdirSync(path.dirname(path.join(out, css.replace(/^\\//, ''))), { recursive: true }); fs.writeFileSync(path.join(out, css.replace(/^\\//, '')), 'body{color:#111}@font-face{src:url("' + fontFile + '")}'); }
if (!omit.has('font')) {
  fs.mkdirSync(path.dirname(path.join(out, fontCss.replace(/^\\//, ''))), { recursive: true });
  fs.writeFileSync(path.join(out, fontCss.replace(/^\\//, '')), '@font-face{src:url("' + fontFile + '")}');
  fs.writeFileSync(path.join(out, fontFile.replace(/^\\//, '')), 'w2');
}
if (localeEnabled) {
  fs.writeFileSync(path.join(out, 'public-route-manifest.json'), JSON.stringify({
    version: 1,
    infrastructureEnabled: true,
    enabledLanguages: ['ru','en'],
    routes: {
      '/ru/': { pathname: '/ru/', locale: 'ru', direction: 'ltr', canonical: 'https://clover-spb.ru/ru/', alternates: [{hreflang:'ru',href:'https://clover-spb.ru/ru/'},{hreflang:'en',href:'https://clover-spb.ru/en/'},{hreflang:'x-default',href:'https://clover-spb.ru/ru/'}] },
      '/ru/catalog': { pathname: '/ru/catalog', locale: 'ru', direction: 'ltr', canonical: 'https://clover-spb.ru/ru/catalog', alternates: [] },
      '/en/': { pathname: '/en/', locale: 'en', direction: 'ltr', canonical: 'https://clover-spb.ru/en/', alternates: [] },
      '/en/catalog': { pathname: '/en/catalog', locale: 'en', direction: 'ltr', canonical: 'https://clover-spb.ru/en/catalog', alternates: [] }
    }
  }));
  fs.writeFileSync(path.join(out, 'sitemap.xml'), '<urlset><url><loc>https://clover-spb.ru/ru/</loc></url><url><loc>https://clover-spb.ru/en/</loc></url></urlset>');
} else {
  fs.writeFileSync(path.join(out, 'public-route-manifest.json'), JSON.stringify({ version:1, infrastructureEnabled:false, enabledLanguages:['ru'], routes:{} }));
  fs.writeFileSync(path.join(out, 'sitemap.xml'), '<urlset><url><loc>https://example.test/</loc></url></urlset>');
}
if (process.env.FAKE_BUILD_FAIL === '1') {
  console.error('fake build fail');
  process.exit(1);
}
`
  );
  cpSync(SCRIPT, path.join(live, "scripts/linux/restart-api-ui.sh"));
  // The one-release gate is keyed to the real pre-SEO production SHA. In this
  // isolated Git fixture, pin it to the fixture's own old commit instead.
  const fixtureDeployPath = path.join(live, "scripts/linux/restart-api-ui.sh");
  assert.match(readFileSync(fixtureDeployPath, "utf8"), /SEO_BASELINE_SHA="21259c768b3dbf2de17da9a0b676f571380c6a1b"/u);
  assert.match(readFileSync(fixtureDeployPath, "utf8"), /SEO_FEATURE_SHA="a952974bd5126d4000ed6d0fda1d696bfca49b36"/u);
  writeFileSync(
    fixtureDeployPath,
    readFileSync(fixtureDeployPath, "utf8").replace(
      /SEO_BASELINE_SHA="21259c768b3dbf2de17da9a0b676f571380c6a1b"/u,
      `SEO_BASELINE_SHA="${oldSha}"`
    ).replace(
      /SEO_FEATURE_SHA="a952974bd5126d4000ed6d0fda1d696bfca49b36"/u,
      `SEO_FEATURE_SHA="${oldSha}"`
    )
  );
  const runtimeDir = path.join(staging, "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  const runtimeScript = path.join(runtimeDir, "restart-api-ui.runtime.sh");
  cpSync(fixtureDeployPath, runtimeScript);
  for (const helper of ["uiAssetProbe.mjs", "releaseNamespace.js", "preparedDist.mjs", "assert-metrika-release.mjs", "seoPostCutoverProbe.mjs"]) {
    cpSync(path.join(workRoot, "server/scripts", helper), path.join(runtimeDir, helper));
  }
  cpSync(
    path.join(workRoot, "server/scripts/uiAssetProbe.mjs"),
    path.join(live, "server/scripts/uiAssetProbe.mjs")
  );
  cpSync(
    path.join(workRoot, "server/scripts/releaseNamespace.js"),
    path.join(live, "server/scripts/releaseNamespace.js")
  );
  cpSync(
    path.join(workRoot, "scripts/linux/run-target-deploy.sh"),
    path.join(live, "scripts/linux/run-target-deploy.sh")
  );
  cpSync(
    path.join(workRoot, "server/scripts/preparedDist.mjs"),
    path.join(live, "server/scripts/preparedDist.mjs")
  );
  cpSync(
    path.join(workRoot, "server/scripts/assert-metrika-release.mjs"),
    path.join(live, "server/scripts/assert-metrika-release.mjs")
  );
  cpSync(
    path.join(workRoot, "server/scripts/seoPostCutoverProbe.mjs"),
    path.join(live, "server/scripts/seoPostCutoverProbe.mjs")
  );
  writeFileSync(
    path.join(live, "scripts/linux/production-ui-build.flags"),
    "# sandbox / TEST default OFF\nVITE_YANDEX_METRIKA_ENABLED=0\n"
  );
  execFileSync("git", ["add", "-A"], { cwd: live });
  execFileSync("git", ["commit", "-m", "new"], { cwd: live });
  const newSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: live, encoding: "utf8" }).trim();
  execFileSync("git", ["reset", "--hard", oldSha], { cwd: live });

  // reset --hard restores the old fixture's tracked UI; the new release
  // removes dist from Git, matching production's runtime-only dist.

  writeFileSync(path.join(state, "health"), "ok\n");
  writeFileSync(path.join(state, "tag"), "match\n");
  writeFileSync(path.join(state, "units"), "loaded\n");
  writeFileSync(path.join(state, "restart_count"), "0\n");
  writeFileSync(path.join(state, "build_count"), "0\n");
  writeFileSync(path.join(state, "api.pid"), "41001\n");
  writeFileSync(path.join(state, "ui.pid"), "52731\n");

  writeExec(
    path.join(bin, "systemctl"),
    `#!/usr/bin/env bash
set -euo pipefail
STATE="${state}"
if [[ "\${1:-}" == "show" ]]; then
  if grep -q fail-load "\$STATE/units" 2>/dev/null; then echo LoadState=not-found; exit 0; fi
  echo LoadState=loaded; exit 0
fi
if [[ "\${1:-}" == "is-active" ]]; then
  if grep -q inactive "\$STATE/units" 2>/dev/null; then exit 1; fi
  exit 0
fi
exit 0
`
  );
  writeExec(
    path.join(bin, "sudo-systemctl"),
    `#!/usr/bin/env bash
set -euo pipefail
STATE="${state}"
# emulate: sudo -n /bin/systemctl restart api ui
n=\$(cat "\$STATE/restart_count")
echo \$((n+1)) > "\$STATE/restart_count"
echo \$((41001+n+1)) > "\$STATE/api.pid"
echo \$((52731+n+1)) > "\$STATE/ui.pid"
if grep -q fail-restart "\$STATE/units" 2>/dev/null; then echo restart-failed >&2; exit 1; fi
exit 0
`
  );
  writeExec(
    path.join(bin, "flock"),
    `#!/usr/bin/env bash
set -euo pipefail
nonblock=0
while [[ \$# -gt 0 ]]; do
  case "\$1" in
    -n) nonblock=1; shift ;;
    -x|-s|-u|-o) shift ;;
    *) shift ;;
  esac
done
lock="\${CLOVER_DEPLOY_LOCK:-}"
[[ -n "\$lock" ]] || exit 1
held="\${lock}.held"
if ! mkdir "\$held" 2>/dev/null; then
  if [[ "\$nonblock" -eq 1 ]]; then exit 1; fi
  exit 1
fi
exit 0
`
  );
  writeExec(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
STATE="${state}"
OUT=""
DUMP=""
WRITE_FMT=""
URL=""
METHOD="GET"
args=("\$@")
i=0
while [[ \$i -lt \${#args[@]} ]]; do
  a="\${args[\$i]}"
  case "\$a" in
    -o|--output) i=\$((i+1)); OUT="\${args[\$i]}" ;;
    -D|--dump-header) i=\$((i+1)); DUMP="\${args[\$i]}" ;;
    -w|--write-out) i=\$((i+1)); WRITE_FMT="\${args[\$i]}" ;;
    -H|--header|--resolve|--max-time|-m|--cacert|--capath|--connect-timeout|--noproxy) i=\$((i+1)) ;;
    --head) METHOD="HEAD" ;;
    -s|-S|-f|-sS|-fsS|-sSf|--http1.1|--silent|--show-error|--path-as-is|--globoff) ;;
    -k|--insecure)
      echo "curl: TLS verification must stay enabled" >&2
      exit 2
      ;;
    http*|https*) URL="\$a" ;;
    *) URL="\$a" ;;
  esac
  i=\$((i+1))
done
[[ -n "\$URL" ]] || { echo "curl: no URL" >&2; exit 2; }

path_of() {
  local u="\$1" rest p
  rest="\${u#http://}"
  rest="\${rest#https://}"
  if [[ "\$rest" == */* ]]; then
    p="/\${rest#*/}"
  else
    p="/"
  fi
  printf '%s' "\${p%%\\?*}"
}
REQ_PATH="\$(path_of "\$URL")"

mime_of() {
  case "\$1" in
    *.js) printf 'text/javascript' ;;
    *.css) printf 'text/css' ;;
    *.woff2) printf 'font/woff2' ;;
    *.woff) printf 'font/woff' ;;
    *) printf 'text/plain' ;;
  esac
}

write_resp() {
  local code="\$1" ctype="\$2" body="\$3" location="\${4:-}"
  if [[ -n "\$DUMP" && "\$DUMP" != "-" ]]; then
    printf 'HTTP/1.1 %s OK\\r\\nContent-Type: %s\\r\\n' "\$code" "\$ctype" > "\$DUMP"
    if [[ -n "\$location" ]]; then printf 'Location: %s\\r\\n' "\$location" >> "\$DUMP"; fi
    printf '\\r\\n' >> "\$DUMP"
  fi
  if [[ -n "\$OUT" && "\$OUT" != "-" ]]; then
    printf '%s' "\$body" > "\$OUT"
  else
    printf '%s' "\$body"
  fi
  if [[ -n "\$WRITE_FMT" ]]; then
    printf '%s' "\${WRITE_FMT//%{http_code\}/\$code}"
  fi
}

if [[ "\$URL" == *"/api/health"* ]]; then
  if grep -q fail-api "\$STATE/health" 2>/dev/null; then exit 1; fi
  write_resp 200 "application/json" '{"ok":true}'
  exit 0
fi

if grep -q fail-ui "\$STATE/health" 2>/dev/null; then exit 1; fi
if [[ -f "\${CURL_LIVE_DIST%/dist}/marker-third.txt" && "\$REQ_PATH" == "/" ]] && grep -q fail-third-ui "\$STATE/health" 2>/dev/null; then exit 1; fi

if [[ "\$REQ_PATH" == "/catalog/odnorazovaya-posuda/dlya-sushi-i-lapshi" || "\$REQ_PATH" == "/catalog/himiya-chistyashchie-sredstva/dlya-okon" ]]; then
  if [[ ! -f "\${CURL_LIVE_DIST%/dist}/marker-new.txt" ]] || grep -q fail-seo-redirect "\$STATE/health" 2>/dev/null || { [[ "\$URL" == *":18080"* ]] && grep -q fail-nginx-seo-redirect "\$STATE/health" 2>/dev/null; }; then
    write_resp 404 "text/html" "not found"
    exit 0
  fi
  if [[ "\$METHOD" == "HEAD" ]] && grep -q fail-seo-head "\$STATE/health" 2>/dev/null; then
    write_resp 200 "text/html" "not redirecting on HEAD"
    exit 0
  fi
  if [[ "\$REQ_PATH" == "/catalog/odnorazovaya-posuda/dlya-sushi-i-lapshi" ]]; then
    dest="/ru/catalog/%D0%9E%D0%B4%D0%BD%D0%BE%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%BF%D0%BE%D1%81%D1%83%D0%B4%D0%B0/%D0%94%D0%BB%D1%8F%20%D1%81%D1%83%D1%88%D0%B8%20%D0%B8%20%D0%BB%D0%B0%D0%BF%D1%88%D0%B8"
  else
    dest="/ru/catalog/%D0%A5%D0%B8%D0%BC%D0%B8%D1%8F%2C%20%D1%87%D0%B8%D1%81%D1%82%D1%8F%D1%89%D0%B8%D0%B5%20%D1%81%D1%80%D0%B5%D0%B4%D1%81%D1%82%D0%B2%D0%B0/%D0%94%D0%BB%D1%8F%20%D0%BE%D0%BA%D0%BE%D0%BD"
  fi
  if [[ "\$URL" == *"?"* ]] && ! grep -q fail-seo-query "\$STATE/health" 2>/dev/null; then dest="\$dest?\${URL#*\\?}"; fi
  write_resp 301 "text/html" "" "\$dest"
  exit 0
fi
if [[ "\$REQ_PATH" == /ru/catalog/* ]]; then
  if [[ -f "\${CURL_LIVE_DIST%/dist}/marker-new.txt" ]] && grep -q fail-seo-destination "\$STATE/health" 2>/dev/null; then
    write_resp 404 "text/html" "missing destination"
    exit 0
  fi
  write_resp 200 "text/html" "<html>category</html>"
  exit 0
fi
if [[ "\$REQ_PATH" == "/product/%D0%9D%D0%A4-00002829" ]]; then
  if [[ -f "\${CURL_LIVE_DIST%/dist}/marker-new.txt" ]] && grep -q fail-seo-product-canonical "\$STATE/health" 2>/dev/null; then
    write_resp 200 "text/html" '<html><link rel="canonical" href="https://clover-spb.ru/en/product/wrong" /></html>'
    exit 0
  fi
  write_resp 200 "text/html" '<html><link rel="canonical" href="https://clover-spb.ru/ru/product/%D0%9D%D0%A4-00002829" /></html>'
  exit 0
fi

if grep -q timeout-assets "\$STATE/health" 2>/dev/null && [[ "\$REQ_PATH" == /assets/* || "\$REQ_PATH" == /fonts/* ]]; then
  echo "curl: timeout" >&2
  exit 28
fi

if grep -q mismatch "\$STATE/tag" 2>/dev/null && [[ "\$REQ_PATH" == "/" || "\$REQ_PATH" == "/index.html" ]]; then
  write_resp 200 "text/html" '<meta name="clover-ui-build" content="ui-WRONG"><script src="/assets/index-WRONG.js"></script>'
  exit 0
fi

if [[ "\$REQ_PATH" == /assets/* || "\$REQ_PATH" == /fonts/* ]]; then
  if grep -q fail-js-403 "\$STATE/health" 2>/dev/null && [[ "\$REQ_PATH" == *.js ]]; then
    write_resp 403 "text/plain" "forbidden"
    exit 0
  fi
  if [[ "\$URL" == *":18080"* ]] && grep -q fail-nginx-js-403 "\$STATE/health" 2>/dev/null && [[ "\$REQ_PATH" == *.js ]]; then
    write_resp 403 "text/plain" "nginx-forbidden"
    exit 0
  fi
  if [[ "\$URL" != *":18080"* ]] && grep -q fail-origin-js-403 "\$STATE/health" 2>/dev/null && [[ "\$REQ_PATH" == *.js ]]; then
    write_resp 403 "text/plain" "origin-forbidden"
    exit 0
  fi
  if [[ -f "\$STATE/js-fail-remaining" && "\$REQ_PATH" == *.js ]]; then
    left="\$(cat "\$STATE/js-fail-remaining" 2>/dev/null || echo 0)"
    if [[ "\${left:-0}" -gt 0 ]]; then
      echo \$((left-1)) > "\$STATE/js-fail-remaining"
      write_resp 403 "text/plain" "transient"
      exit 0
    fi
  fi
  if grep -q asset-html "\$STATE/health" 2>/dev/null; then
    write_resp 200 "text/html" '<!doctype html><html><body>shell</body></html>'
    exit 0
  fi
  FILE="\${CURL_LIVE_DIST}\${REQ_PATH}"
  if [[ -f "\$FILE" ]]; then
    write_resp 200 "\$(mime_of "\$REQ_PATH")" "\$(cat "\$FILE")"
    exit 0
  fi
  write_resp 404 "text/plain" "missing"
  exit 0
fi

LIVE_HTML=""
if [[ -n "\${CURL_LIVE_DIST:-}" && -f "\${CURL_LIVE_DIST}/index.html" ]]; then
  LIVE_HTML="\$(cat "\${CURL_LIVE_DIST}/index.html")"
fi
if [[ -n "\$LIVE_HTML" ]]; then
  write_resp 200 "text/html" "\$LIVE_HTML"
  exit 0
fi
write_resp 200 "text/html" '<meta name="clover-ui-build" content="ui-NEW"><script src="/assets/index-NEW.js"></script>'
`
  );
  writeExec(
    path.join(bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
# Only support "run build"
if [[ "\${1:-}" == "run" && "\${2:-}" == "build" ]]; then
  n=\$(cat "${state}/build_count")
  echo \$((n+1)) > "${state}/build_count"
  if [[ "\${FAKE_BUILD_FAIL:-0}" == "1" ]]; then
    echo "fake npm build fail" >&2
    exit 1
  fi
  node ./fake-build.js
  exit \$?
fi
echo "unsupported npm args: $*" >&2
exit 2
`
  );

  const pathSep = process.platform === "win32" ? ";" : ":";
  const pathPrefix = existsSync(GIT_USR_BIN) ? `${bin}${pathSep}${GIT_USR_BIN}` : bin;
  const env = {
    ...process.env,
    PATH: `${pathPrefix}${pathSep}${process.env.PATH}`,
    CLOVER_DEPLOY_ROOT: bashPath(live),
    CLOVER_DEPLOY_STAGING: bashPath(staging),
    CLOVER_DEPLOY_LKG: bashPath(lkg),
    CLOVER_DEPLOY_LOCK: bashPath(path.join(root, "deploy.lock")),
    CLOVER_DEPLOY_GIT: "git",
    CLOVER_DEPLOY_NPM: bashPath(path.join(bin, "npm")),
    CLOVER_DEPLOY_SYSTEMCTL: bashPath(path.join(bin, "systemctl")),
    CLOVER_DEPLOY_SUDO_SYSTEMCTL: bashPath(path.join(bin, "sudo-systemctl")),
    CLOVER_DEPLOY_CURL: bashPath(path.join(bin, "curl")),
    CLOVER_DEPLOY_SEO_GATE_JS: bashPath(path.join(runtimeDir, "seoPostCutoverProbe.mjs")),
    CLOVER_DEPLOY_HEALTH_API: "http://127.0.0.1:4100/api/health",
    CLOVER_DEPLOY_HEALTH_UI: "http://127.0.0.1:5273/",
    CLOVER_DEPLOY_ORIGIN_BASE: "http://127.0.0.1:5273",
    CLOVER_DEPLOY_NGINX_UI: "http://127.0.0.1:18080",
    CLOVER_DEPLOY_NGINX_RESOLVE: "",
    CLOVER_DEPLOY_CANONICAL_HOST: "clover-spb.ru",
    CLOVER_DEPLOY_HEALTH_ATTEMPTS: "8",
    CLOVER_DEPLOY_DB_PATH: bashPath(path.join(live, "server/data/clover.sqlite")),
    CLOVER_DEPLOY_API_UNIT: "clover-api.service",
    CLOVER_DEPLOY_UI_UNIT: "clover-ui.service",
    CLOVER_DEPLOY_FSDEV_LIVE: "1001",
    CLOVER_DEPLOY_FSDEV_STAGING: "1001",
    CLOVER_DEPLOY_FSDEV_LKG: "1001",
    CURL_LIVE_DIST: bashPath(path.join(live, "dist")),
    CLOVER_PROBE_BASH: BASH_BIN,
  };

  return { root, live, staging, lkg, bin, state, oldSha, newSha, env, runtimeScript };
}

function releaseSandboxLock(box, result) {
  const text = `${result?.stderr || ""}\n${result?.stdout || ""}`;
  if (/another deployment holds/.test(text)) return;
  rmSync(path.join(box.root, "deploy.lock.held"), { recursive: true, force: true });
}

function runDeploy(box, targetSha, extraEnv = {}) {
  const result = spawnSync(BASH_BIN, [box.runtimeScript, targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
  releaseSandboxLock(box, result);
  return result;
}

function runFirstDeploy(box, targetSha, extraEnv = {}) {
  const bootstrapDir = path.join(box.staging, `bootstrap-launcher-${targetSha}`);
  mkdirSync(bootstrapDir, { recursive: true });
  const launcherPath = path.join(bootstrapDir, "run-target-deploy.sh");
  writeFileSync(
    launcherPath,
    execFileSync("git", ["-C", box.live, "show", `${targetSha}:scripts/linux/run-target-deploy.sh`], {
      encoding: "utf8",
    })
  );
  const result = spawnSync(BASH_BIN, [launcherPath, targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
  releaseSandboxLock(box, result);
  return result;
}

function runLiveScript(box, scriptPath, targetSha, extraEnv = {}) {
  const result = spawnSync(BASH_BIN, [scriptPath, targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
  releaseSandboxLock(box, result);
  return result;
}

function liveSha(box) {
  return execFileSync("git", ["-C", box.live, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function liveTag(box) {
  const html = readFileSync(path.join(box.live, "dist/index.html"), "utf8");
  const m = html.match(/content="([^"]+)"/);
  return m ? m[1] : "";
}

function runPrepare(box, targetSha, extraEnv = {}) {
  const result = spawnSync(BASH_BIN, [box.runtimeScript, "prepare", targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
  releaseSandboxLock(box, result);
  return result;
}

function runPromote(box, preparedPath, extraEnv = {}) {
  const targetSha = extraEnv.CLOVER_DEPLOY_TARGET_SHA || box.newSha;
  const result = spawnSync(BASH_BIN, [box.runtimeScript, "promote", preparedPath, targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
  releaseSandboxLock(box, result);
  return result;
}

function writeLauncher(box, targetSha) {
  const bootstrapDir = path.join(box.staging, `bootstrap-launcher-${targetSha}`);
  mkdirSync(bootstrapDir, { recursive: true });
  const launcherPath = path.join(bootstrapDir, "run-target-deploy.sh");
  writeFileSync(
    launcherPath,
    execFileSync("git", ["-C", box.live, "show", `${targetSha}:scripts/linux/run-target-deploy.sh`], {
      encoding: "utf8",
    })
  );
  return launcherPath;
}

function runFirstPrepare(box, targetSha, extraEnv = {}) {
  const launcherPath = writeLauncher(box, targetSha);
  const result = spawnSync(BASH_BIN, [launcherPath, "prepare", targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
  releaseSandboxLock(box, result);
  return result;
}

function runFirstPromote(box, preparedPath, targetSha, extraEnv = {}) {
  const launcherPath = writeLauncher(box, targetSha);
  const result = spawnSync(BASH_BIN, [launcherPath, "promote", preparedPath, targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
  releaseSandboxLock(box, result);
  return result;
}

function writeDuplicateTargetShaManifest(manifestPath, firstSha, secondSha) {
  const original = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rest = { ...original };
  delete rest.targetSha;
  const body = JSON.stringify(rest, null, 2).replace(/^\{\n/, "").replace(/\n\}\s*$/, "");
  writeFileSync(
    manifestPath,
    `{\n  "targetSha": "${firstSha}",\n  "targetSha": "${secondSha}",\n${body}\n}\n`
  );
}

function preparedDirFor(box, sha) {
  return path.join(box.staging, `prepared-${sha}`);
}

function buildCount(box) {
  return readFileSync(path.join(box.state, "build_count"), "utf8").trim();
}

function livePids(box) {
  return {
    api: readFileSync(path.join(box.state, "api.pid"), "utf8").trim(),
    ui: readFileSync(path.join(box.state, "ui.pid"), "utf8").trim(),
  };
}

function writeRecoveryR403uDist(dir) {
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  mkdirSync(path.join(dir, "fonts"), { recursive: true });
  writeFileSync(
    path.join(dir, "index.html"),
    `<meta name="clover-ui-build" content="ui-20260918r403u"><meta name="clover-public-locale-routes" content="disabled"><link rel="stylesheet" href="/assets/index-B2GFFiD2.css"><link rel="stylesheet" href="/fonts/manrope.css"><script src="/assets/index-B2GFFiD2.js"></script>`
  );
  writeFileSync(path.join(dir, "assets/index-B2GFFiD2.js"), "export default 1;\n");
  writeFileSync(path.join(dir, "assets/index-B2GFFiD2.css"), "body{color:#111}");
  writeFileSync(
    path.join(dir, "fonts/manrope.css"),
    '@font-face{src:url("/fonts/manrope-latin-700-normal.woff2")}'
  );
  writeFileSync(path.join(dir, "fonts/manrope-latin-700-normal.woff2"), "w2");
  writeFileSync(path.join(dir, "sw.js"), 'const CACHE_NAME = "clover-shell-ui-20260918r403u";\n');
  writeFileSync(path.join(dir, "sitemap.xml"), "<urlset></urlset>");
}

function probeHttp(box, html) {
  return spawnSync(
    process.execPath,
    [
      path.join(workRoot, "server/scripts/uiAssetProbe.mjs"),
      "check-http",
      "--html",
      html,
      "--dist",
      path.join(box.live, "dist"),
      "--origin",
      box.env.CLOVER_DEPLOY_ORIGIN_BASE,
      "--nginx",
      box.env.CLOVER_DEPLOY_NGINX_UI,
      "--curl",
      box.env.CLOVER_DEPLOY_CURL,
    ],
    { encoding: "utf8", env: box.env }
  );
}

function probeNamespace(box, html, expectedLocale = "disabled") {
  const htmlFile = path.join(box.root, "ns-check.html");
  writeFileSync(htmlFile, html);
  return spawnSync(
    process.execPath,
    [
      path.join(workRoot, "server/scripts/uiAssetProbe.mjs"),
      "check-namespace",
      "--html-file",
      htmlFile,
      "--dist",
      path.join(box.live, "dist"),
      "--expected-locale-stamp",
      expectedLocale,
    ],
    { encoding: "utf8", env: box.env }
  );
}

// --- A. BUILD FAILURE ---
if (!SEO_ONLY && !RECOVERY_ONLY) {
{
  const box = initSandbox("buildfail");
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const res = runDeploy(box, box.newSha, { FAKE_BUILD_FAIL: "1" });
  assert.notEqual(res.status, 0, "build failure must non-zero");
  assert.equal(liveSha(box), before, "source unchanged on build failure");
  assert.equal(liveTag(box), beforeTag, "dist unchanged on build failure");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  console.log("A_BUILD_FAILURE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- B. SUCCESS ---
{
  const box = initSandbox("success");
  const res = runDeploy(box, box.newSha);
  assert.equal(res.status, 0, `success deploy failed: ${res.stderr}\n${res.stdout}`);
  assert.equal(liveSha(box), box.newSha);
  assert.equal(liveTag(box), "ui-NEW");
  assert.ok(Number(readFileSync(path.join(box.state, "restart_count"), "utf8").trim()) >= 1);
  assert.match(res.stdout, /Deploy OK/);
  console.log("B_SUCCESS:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- C. HEALTH FAILURE AFTER CUTOVER -> rollback ---
{
  const box = initSandbox("healthfail");
  writeFileSync(path.join(box.state, "health"), "fail-api\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0, "health failure must fail deploy");
  assert.equal(liveSha(box), box.oldSha, "source rolled back");
  assert.equal(liveTag(box), "ui-OLD", "dist rolled back");
  assert.doesNotMatch(res.stdout + res.stderr, /^Deploy OK\.$/m);
  console.log("C_HEALTH_FAILURE_ROLLBACK:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- D. ROLLBACK FAILURE (LKG missing after cutover start) ---
{
  const box = initSandbox("rollbackfail");
  // Make health fail and destroy LKG mid-flight by pointing LKG to unwritable/missing after build:
  // Simpler: fail restart during rollback by clearing LKG dist via wrapper.
  // Force health fail and remove LKG after successful staged build by using a npm that deletes LKG.
  writeExec(
    path.join(box.bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "run" && "\${2:-}" == "build" ]]; then
  node ./fake-build.js
  rm -rf "${box.lkg}/dist"
  exit 0
fi
exit 2
`
  );
  writeFileSync(path.join(box.state, "health"), "fail-api\n");
  const res = runDeploy(box, box.newSha);
  assert.equal(res.status, 3, "rollback failure must be CRITICAL exit 3");
  assert.match(res.stderr, /CRITICAL/);
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("D_ROLLBACK_FAILURE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- E. DIRTY TRACKED SOURCE ---
{
  const box = initSandbox("dirty");
  writeFileSync(path.join(box.live, "server/src/server.js"), "console.log('dirty')\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /local modifications|tracked source/i);
  assert.equal(liveSha(box), box.oldSha);
  console.log("E_DIRTY_SOURCE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- F1. NONEXISTENT TARGET ---
{
  const box = initSandbox("f1-missing");
  const beforeTag = liveTag(box);
  const res = runDeploy(box, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.notEqual(res.status, 0);
  assert.equal(liveSha(box), box.oldSha, "source unchanged");
  assert.equal(liveTag(box), beforeTag, "dist unchanged");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("F1_NONEXISTENT_TARGET:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- F2. EXISTING NON-FAST-FORWARD (older ancestor of live HEAD) ---
{
  const box = initSandbox("f2-nonff");
  // Live HEAD = newer; target = older ancestor (exists but not a forward descendant).
  execFileSync("git", ["-C", box.live, "reset", "--hard", box.newSha]);
  writeCompleteUiDist(path.join(box.live, "dist"), {
    tag: "ui-NEW",
    jsPath: "/assets/index-NEW.js",
  });
  const before = liveSha(box);
  assert.equal(before, box.newSha);
  const beforeTag = liveTag(box);
  // Prove target exists as a commit object.
  execFileSync("git", ["-C", box.live, "cat-file", "-e", `${box.oldSha}^{commit}`]);
  const res = runDeploy(box, box.oldSha);
  assert.notEqual(res.status, 0, "non-FF target must be refused");
  assert.match(
    res.stderr,
    /not a fast-forward descendant|fast-forward descendant of current production/i,
    `expected ancestry refusal, got: ${res.stderr}`
  );
  assert.equal(liveSha(box), before, "source unchanged on non-FF refusal");
  assert.equal(liveTag(box), beforeTag, "dist unchanged on non-FF refusal");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("F2_EXISTING_NON_FF_TARGET:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- F3. MISSING PINNED SEO BASELINE OBJECT ---
{
  const box = initSandbox("missing-seo-baseline-object");
  const testScript = path.join(box.staging, "runtime", "missing-baseline.sh");
  writeFileSync(
    testScript,
    readFileSync(box.runtimeScript, "utf8").replace(
      `SEO_BASELINE_SHA="${box.oldSha}"`,
      `SEO_BASELINE_SHA="${"f".repeat(40)}"`
    )
  );
  const result = runLiveScript(box, testScript, box.newSha);
  assert.notEqual(result.status, 0, "missing SEO baseline object must fail closed");
  assert.match(result.stderr, /SEO baseline object .* missing; refusing cutover/u);
  assert.doesNotMatch(result.stdout, /Cutover: switching source/u);
  assert.equal(liveSha(box), box.oldSha);
  assert.equal(liveTag(box), "ui-OLD");
  console.log("F3_MISSING_SEO_BASELINE_OBJECT_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- G. CONCURRENT DEPLOY ---
{
  const box = initSandbox("lock2");
  const lock = path.join(box.root, "deploy.lock");
  const flockBin = path.join(box.bin, "flock").replace(/\\/g, "/");
  const lockPosix = String(lock).replace(/\\/g, "/");
  const { spawn } = await import("node:child_process");
  const child = spawn(
    BASH_BIN,
    ["-c", `exec 9>"${lockPosix}"; "${flockBin}" -n 9 || exit 9; sleep 5`],
    {
      detached: true,
      stdio: "ignore",
      env: box.env,
    }
  );
  child.unref();
  const held = `${lock}.held`;
  const started = Date.now();
  while (!existsSync(held) && Date.now() - started < 2000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(existsSync(held), true, "concurrent holder must take the lock");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /another deployment|lock/i);
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
  console.log("G_CONCURRENT_DEPLOY:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- H. BUILD TAG MISMATCH ---
{
  const box = initSandbox("tagmismatch");
  writeFileSync(path.join(box.state, "tag"), "mismatch\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0);
  assert.equal(liveSha(box), box.oldSha, "tag mismatch rolls back source");
  assert.equal(liveTag(box), "ui-OLD", "tag mismatch rolls back dist");
  console.log("H_BUILD_TAG_MISMATCH:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- I. NO LIVE BUILD ---
{
  const box = initSandbox("nolivebuild");
  // Instrument npm to flag if cwd is live ROOT
  writeExec(
    path.join(box.bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
pwd > "${box.state}/npm-cwd"
if [[ "\$(pwd)" == "${box.live}" ]]; then
  echo "BUILT_IN_LIVE_ROOT" >&2
  exit 9
fi
if [[ "\${1:-}" == "run" && "\${2:-}" == "build" ]]; then
  node ./fake-build.js
  exit \$?
fi
exit 2
`
  );
  const res = runDeploy(box, box.newSha);
  assert.equal(res.status, 0, res.stderr);
  const cwd = readFileSync(path.join(box.state, "npm-cwd"), "utf8").trim();
  assert.notEqual(cwd, box.live);
  assert.ok(cwd.includes("src-"), `build cwd should be worktree, got ${cwd}`);
  console.log("I_NO_LIVE_BUILD:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- J. already covered statically; also ensure short SHA rejected ---
{
  const box = initSandbox("shortsha");
  const res = runDeploy(box, box.newSha.slice(0, 12));
  assert.notEqual(res.status, 0);
  console.log("J_NO_UNSAFE_PROCESS_AND_SHORT_SHA:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- K. SAME-DEVICE filesystem (injectable overrides equal) ---
{
  const box = initSandbox("fs-same");
  const res = runDeploy(box, box.newSha, {
    CLOVER_DEPLOY_FSDEV_LIVE: "1001",
    CLOVER_DEPLOY_FSDEV_STAGING: "1001",
    CLOVER_DEPLOY_FSDEV_LKG: "1001",
  });
  assert.equal(res.status, 0, `same-device deploy failed: ${res.stderr}\n${res.stdout}`);
  assert.match(res.stdout, /Deploy OK/);
  assert.equal(liveSha(box), box.newSha);
  console.log("K_SAME_DEVICE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- L. CROSS-DEVICE filesystem refused before build/cutover ---
{
  const box = initSandbox("fs-cross");
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const res = runDeploy(box, box.newSha, {
    CLOVER_DEPLOY_FSDEV_LIVE: "1001",
    CLOVER_DEPLOY_FSDEV_STAGING: "2002",
    CLOVER_DEPLOY_FSDEV_LKG: "1001",
  });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /cross-filesystem deploy staging is unsafe/i);
  assert.equal(liveSha(box), before, "source unchanged on cross-fs refusal");
  assert.equal(liveTag(box), beforeTag, "dist unchanged on cross-fs refusal");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("L_CROSS_DEVICE_REFUSAL:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- M. EXPECTED ENABLED + DISABLED ARTIFACTS REFUSED BEFORE CUTOVER ---
{
  const box = initSandbox("locale-guard-reject");
  mkdirSync(path.join(box.live, "server"), { recursive: true });
  writeFileSync(path.join(box.live, "server/.env"), "CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1\n");
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const res = runDeploy(box, box.newSha, { FAKE_LOCALE_ARTIFACTS: "disabled" });
  assert.notEqual(res.status, 0, "disabled locale artifacts must fail deploy");
  assert.match(
    `${res.stderr}\n${res.stdout}`,
    /locale-route|refusing cutover|artifacts rejected|does not match expected enabled|release namespace mismatch/i
  );
  assert.equal(liveSha(box), before, "source unchanged when locale guard rejects");
  assert.equal(liveTag(box), beforeTag, "dist unchanged when locale guard rejects");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("M_LOCALE_GUARD_REJECTS_DISABLED:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- N. EXPECTED ENABLED + ENABLED ARTIFACTS ALLOW CUTOVER ---
{
  const box = initSandbox("locale-guard-accept");
  mkdirSync(path.join(box.live, "server"), { recursive: true });
  writeFileSync(path.join(box.live, "server/.env"), "CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1\n");
  const res = runDeploy(box, box.newSha);
  assert.equal(res.status, 0, `enabled locale deploy failed: ${res.stderr}\n${res.stdout}`);
  assert.equal(liveSha(box), box.newSha);
  assert.match(res.stdout, /Deploy OK/);
  console.log("N_LOCALE_GUARD_ACCEPTS_ENABLED:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- O. MISSING REQUIRED FLAG STOPS BEFORE CUTOVER ---
{
  const box = initSandbox("locale-flag-missing");
  rmSync(path.join(box.live, "server/.env"), { force: true });
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0, "missing locale flag must fail deploy");
  assert.match(
    `${res.stderr}\n${res.stdout}`,
    /required locale-route flag|flag file missing|refusing cutover/i
  );
  assert.equal(liveSha(box), before, "source unchanged when required flag is missing");
  assert.equal(liveTag(box), beforeTag, "dist unchanged when required flag is missing");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("O_REQUIRED_LOCALE_FLAG_MISSING:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- P. EXPLICIT DISABLED IS KEPT (NOT ENABLED FROM ENV LEAK) ---
{
  const box = initSandbox("locale-flag-disabled");
  const res = runDeploy(box, box.newSha, { CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1" });
  assert.equal(res.status, 0, `intentional disabled deploy failed: ${res.stderr}\n${res.stdout}`);
  assert.equal(liveSha(box), box.newSha);
  const html = readFileSync(path.join(box.live, "dist/index.html"), "utf8");
  assert.match(html, /content="disabled"/);
  assert.doesNotMatch(html, /content="enabled"/);
  console.log("P_EXPLICIT_DISABLED_KEPT:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- Q. ENV FILE WITHOUT THE REQUIRED KEY STOPS BEFORE CUTOVER ---
{
  const box = initSandbox("locale-flag-key-absent");
  writeFileSync(path.join(box.live, "server/.env"), "OTHER_SECRET=do-not-enable\n");
  const before = liveSha(box);
  const res = runDeploy(box, box.newSha, { CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1" });
  assert.notEqual(res.status, 0, "missing key must fail even if process.env has 1");
  assert.match(
    `${res.stderr}\n${res.stdout}`,
    /required CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED missing|required locale-route flag/i
  );
  assert.equal(liveSha(box), before);
  assert.equal(`${res.stderr}\n${res.stdout}`.includes("do-not-enable"), false);
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("Q_REQUIRED_LOCALE_FLAG_KEY_ABSENT:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- R. HTML/API 200 + JS 403 → deploy gate FAIL + rollback ---
{
  const box = initSandbox("js403");
  writeFileSync(path.join(box.state, "health"), "fail-js-403\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0, "JS 403 must fail deploy");
  assert.equal(liveSha(box), box.oldSha, "JS 403 rolls back source");
  assert.equal(liveTag(box), "ui-OLD", "JS 403 rolls back dist");
  assert.match(`${res.stderr}\n${res.stdout}`, /assets did not become ready|HTTP 403|forbidden/i);
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("R_HTML_OK_JS_403_FAIL:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- S. asset 200 text/html → FAIL ---
{
  const box = initSandbox("assethtml");
  writeFileSync(path.join(box.state, "health"), "asset-html\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0, "HTML-bodied asset must fail deploy");
  assert.equal(liveSha(box), box.oldSha);
  assert.equal(liveTag(box), "ui-OLD");
  assert.match(`${res.stderr}\n${res.stdout}`, /HTML|assets did not become ready/i);
  console.log("S_ASSET_HTML_FAIL:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- T. missing CSS / chunk / font → FAIL before cutover ---
{
  for (const omit of ["css", "chunk", "font"]) {
    const box = initSandbox(`omit-${omit}`);
    const before = liveSha(box);
    const beforeTag = liveTag(box);
    const res = runDeploy(box, box.newSha, { FAKE_BUILD_OMIT: omit });
    assert.notEqual(res.status, 0, `missing ${omit} must fail`);
    assert.equal(liveSha(box), before, `source unchanged when ${omit} missing`);
    assert.equal(liveTag(box), beforeTag, `dist unchanged when ${omit} missing`);
    assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
    rmSync(box.root, { recursive: true, force: true });
  }
  console.log("T_MISSING_CSS_CHUNK_FONT_FAIL:PASS");
}

// --- U. first JS 403, then stable 200 → PASS ---
{
  const box = initSandbox("transient403");
  writeFileSync(path.join(box.state, "js-fail-remaining"), "1\n");
  const res = runDeploy(box, box.newSha, { CLOVER_DEPLOY_HEALTH_ATTEMPTS: "8" });
  assert.equal(res.status, 0, `transient 403 should pass: ${res.stderr}\n${res.stdout}`);
  assert.equal(liveSha(box), box.newSha);
  assert.match(res.stdout, /Deploy OK/);
  console.log("U_TRANSIENT_FIRST_403_PASS:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- V. permanent timeout → bounded FAIL + rollback ---
{
  const box = initSandbox("timeout");
  writeFileSync(path.join(box.state, "health"), "timeout-assets\n");
  const res = runDeploy(box, box.newSha, { CLOVER_DEPLOY_HEALTH_ATTEMPTS: "2" });
  assert.notEqual(res.status, 0, "asset timeout must fail");
  assert.equal(liveSha(box), box.oldSha, "timeout rolls back source");
  assert.equal(liveTag(box), "ui-OLD", "timeout rolls back dist");
  console.log("V_PERMANENT_TIMEOUT_ROLLBACK:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- W. origin 200 + nginx 403 → FAIL ---
{
  const box = initSandbox("origin-ok-nginx-403");
  writeFileSync(path.join(box.state, "health"), "fail-nginx-js-403\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0, "nginx 403 must fail even if origin is 200");
  assert.match(`${res.stderr}\n${res.stdout}`, /nginx .*403|nginx-forbidden/i);
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("W_ORIGIN_200_NGINX_403_FAIL:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- X. origin 403 + nginx 200 → FAIL ---
{
  const box = initSandbox("origin-403-nginx-ok");
  writeFileSync(path.join(box.state, "health"), "fail-origin-js-403\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0, "origin 403 must fail even if nginx is 200");
  assert.match(`${res.stderr}\n${res.stdout}`, /origin .*403|origin-forbidden/i);
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("X_ORIGIN_403_NGINX_200_FAIL:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- Y. first deploy: extract launcher from target SHA before live reset ---
{
  const box = initSandbox("first-deploy-old-misses-gate");
  const liveOld = path.join(box.live, "scripts/linux/restart-api-ui.sh");
  writeFileSync(path.join(box.state, "health"), "fail-js-403\n");
  const oldRun = runLiveScript(box, liveOld, box.newSha, { FAKE_BUILD_FLAT: "1" });
  assert.equal(oldRun.status, 0, `old live script must miss JS 403: ${oldRun.stderr}\n${oldRun.stdout}`);
  assert.match(oldRun.stdout, /Deploy OK/);
  console.log("Y1_OLD_LIVE_SCRIPT_MISSES_ASSET_GATE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("first-deploy-launcher-gate");
  assert.equal(
    readFileSync(path.join(box.live, "scripts/linux/restart-api-ui.sh"), "utf8").includes("check_http_assets"),
    false,
    "live tree still has the historical script"
  );
  writeFileSync(path.join(box.state, "health"), "fail-js-403\n");
  const launched = runFirstDeploy(box, box.newSha);
  assert.match(launched.stdout + launched.stderr, /FIRST_DEPLOY_LAUNCHER: invoked=/);
  assert.match(launched.stdout + launched.stderr, /FIRST_DEPLOY_LAUNCHER: root=/);
  assert.notEqual(launched.status, 0, `launcher must use new asset gate: ${launched.stderr}\n${launched.stdout}`);
  assert.match(`${launched.stderr}\n${launched.stdout}`, /HTTP 403|assets did not become ready/i);
  assert.doesNotMatch(launched.stdout, /Deploy OK/);
  assert.equal(liveSha(box), box.oldSha, "first-deploy rollback keeps previous SHA");
  assert.equal(liveTag(box), "ui-OLD");
  const delivered = path.join(box.staging, `delivered-deploy-${box.newSha}`, "restart-api-ui.sh");
  assert.equal(existsSync(delivered), true, "target script extracted beside live ROOT");
  assert.notEqual(path.resolve(path.dirname(delivered)), path.resolve(box.live));
  assert.match(readFileSync(delivered, "utf8"), /check_http_assets/);
  console.log("Y2_FIRST_DEPLOY_LAUNCHER_USES_NEW_GATE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("first-deploy-launcher-success");
  const launched = runFirstDeploy(box, box.newSha);
  assert.equal(launched.status, 0, `first-deploy success failed: ${launched.stderr}\n${launched.stdout}`);
  assert.match(launched.stdout, /FIRST_DEPLOY_LAUNCHER/);
  assert.match(launched.stdout, /Deploy OK/);
  assert.equal(liveSha(box), box.newSha);
  console.log("Y3_FIRST_DEPLOY_LAUNCHER_BOTH_200_PASS:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("first-deploy-extract-inside-root");
  const launched = runFirstDeploy(box, box.newSha, {
    CLOVER_DEPLOY_STAGING: bashPath(path.join(box.live, "inside-live-staging")),
  });
  assert.notEqual(launched.status, 0, "extract inside ROOT must fail");
  assert.match(`${launched.stderr}\n${launched.stdout}`, /extract dir must not be inside live ROOT/);
  assert.equal(liveSha(box), box.oldSha, "refused extract must not switch live source");
  console.log("Y4_EXTRACT_NOT_INSIDE_ROOT:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("new-script-flat-build");
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const res = runDeploy(box, box.newSha, { FAKE_BUILD_FLAT: "1" });
  assert.notEqual(res.status, 0, "NEW script + flat build must fail before cutover");
  assert.match(
    `${res.stderr}\n${res.stdout}`,
    /release namespace|outside release namespace|check-namespace|missing referenced/i
  );
  assert.doesNotMatch(`${res.stdout}\n${res.stderr}`, /Cutover: switching source/);
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  assert.equal(liveSha(box), before, "flat build must not switch live source");
  assert.equal(liveTag(box), beforeTag, "flat build must not replace live dist");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  console.log("Y5_NEW_SCRIPT_FLAT_BUILD_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("prepare-leaves-live");
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const beforePids = livePids(box);
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, `prepare failed: ${prepared.stderr}\n${prepared.stdout}`);
  assert.match(prepared.stdout, /PREPARED_OK:/);
  assert.match(prepared.stdout, /PREPARE OK/);
  assert.equal(liveSha(box), before, "prepare must not reset live SHA");
  assert.equal(liveTag(box), beforeTag, "prepare must not replace live dist");
  assert.equal(livePids(box).api, beforePids.api);
  assert.equal(livePids(box).ui, beforePids.ui);
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  const dest = preparedDirFor(box, box.newSha);
  assert.equal(existsSync(path.join(dest, "manifest.json")), true, "prepared artifact must remain");
  assert.equal(existsSync(path.join(dest, "dist/index.html")), true);
  const manifest = JSON.parse(readFileSync(path.join(dest, "manifest.json"), "utf8"));
  assert.equal(manifest.targetSha, box.newSha);
  assert.equal(manifest.expectedLocaleStamp, "disabled");
  assert.ok(manifest.releaseId);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  console.log("Z1_PREPARE_LEAVES_LIVE_AND_KEEPS_ARTIFACT:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("promote-no-rebuild");
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, `prepare failed: ${prepared.stderr}\n${prepared.stdout}`);
  const dest = preparedDirFor(box, box.newSha);
  const manifest = JSON.parse(readFileSync(path.join(dest, "manifest.json"), "utf8"));
  const buildsAfterPrepare = buildCount(box);
  assert.notEqual(buildsAfterPrepare, "0");
  const promoted = runPromote(box, dest);
  assert.equal(promoted.status, 0, `promote failed: ${promoted.stderr}\n${promoted.stdout}`);
  assert.equal(buildCount(box), buildsAfterPrepare, "promote must not call npm build");
  assert.equal(liveSha(box), box.newSha);
  assert.equal(liveTag(box), manifest.buildTag);
  assert.match(readFileSync(path.join(box.live, "dist/index.html"), "utf8"), new RegExp(manifest.releaseId));
  console.log("Z2_PROMOTE_SAME_RELEASE_NO_REBUILD:PASS");
  rmSync(box.root, { recursive: true, force: true });
}
}

// --- F4. TARGET WITHOUT THE SEO FEATURE MERGE ---
{
  const box = initSandbox("target-without-seo-feature");
  const testScript = path.join(box.staging, "runtime", "missing-feature-in-target.sh");
  writeFileSync(
    testScript,
    readFileSync(box.runtimeScript, "utf8").replace(
      `SEO_FEATURE_SHA="${box.oldSha}"`,
      `SEO_FEATURE_SHA="${box.newSha}"`
    )
  );
  const result = runLiveScript(box, testScript, box.oldSha);
  assert.notEqual(result.status, 0, "target without the SEO feature must fail before cutover");
  assert.match(result.stderr, /target does not contain SEO feature commit .* refusing cutover/u);
  assert.doesNotMatch(result.stdout, /Cutover: switching source/u);
  assert.equal(liveSha(box), box.oldSha);
  assert.equal(liveTag(box), "ui-OLD");
  console.log("F4_TARGET_WITHOUT_SEO_FEATURE_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

if (!RECOVERY_ONLY) {
{
  const box = initSandbox("seo-post-gate-pass");
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const promoted = runFirstPromote(box, preparedDirFor(box, box.newSha), box.newSha);
  assert.equal(promoted.status, 0, `SEO-gated promote failed: ${promoted.stderr}\n${promoted.stdout}`);
  assert.match(promoted.stdout, /SEO_POST_CUTOVER_PROMOTED:PASS/);
  assert.equal(liveSha(box), box.newSha);
  assert.equal(liveTag(box).startsWith("ui-NEW"), true);
  console.log("Z2A_SEO_GATE_PASS_BEFORE_DEPLOY_OK:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("seo-post-gate-rollback");
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  writeFileSync(path.join(box.state, "health"), "fail-seo-redirect\n");
  const promoted = runFirstPromote(box, preparedDirFor(box, box.newSha), box.newSha);
  assert.notEqual(promoted.status, 0, "bad live SEO route must fail promote");
  assert.match(`${promoted.stderr}\n${promoted.stdout}`, /post-cutover SEO route check failed/);
  assert.match(promoted.stdout, /SEO_POST_CUTOVER_ROLLED-BACK:PASS/);
  assert.doesNotMatch(promoted.stdout, /Deploy OK\./);
  assert.equal(liveSha(box), box.oldSha, "SEO gate must restore old source");
  assert.equal(liveTag(box), "ui-OLD", "SEO gate must restore old UI");
  console.log("Z2B_SEO_GATE_FAILURE_ROLLS_BACK_SOURCE_AND_UI:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

for (const [label, injected, expected] of [
  ["nginx", "fail-nginx-seo-redirect", /nginx GET .*status 404/u],
  ["head", "fail-seo-head", /HEAD .*status 200/u],
  ["query", "fail-seo-query", /GET query .*Location/u],
  ["destination", "fail-seo-destination", /destination .*status 404/u],
  ["canonical", "fail-seo-product-canonical", /product: RU canonical missing/u],
]) {
  const box = initSandbox(`seo-post-${label}`);
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  writeFileSync(path.join(box.state, "health"), `${injected}\n`);
  const promoted = runFirstPromote(box, preparedDirFor(box, box.newSha), box.newSha);
  const output = `${promoted.stderr}\n${promoted.stdout}`;
  assert.notEqual(promoted.status, 0, `${label} failure must fail promote`);
  assert.match(output, expected, `${label} failure must be observed at its own HTTP gate`);
  assert.match(output, /SEO_POST_CUTOVER_ROLLED-BACK:PASS/);
  assert.doesNotMatch(output, /Deploy OK\./);
  assert.equal(liveSha(box), box.oldSha, `${label}: source must roll back`);
  assert.equal(liveTag(box), "ui-OLD", `${label}: UI must roll back`);
  console.log(`Z2C_SEO_${label.toUpperCase()}_FAILURE_ROLLS_BACK:PASS`);
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("seo-future-rollback");
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const first = runFirstPromote(box, preparedDirFor(box, box.newSha), box.newSha);
  assert.equal(first.status, 0, `initial SEO release failed: ${first.stderr}\n${first.stdout}`);
  const seoTag = liveTag(box);
  writeFileSync(path.join(box.live, "marker-third.txt"), "future\n");
  execFileSync("git", ["-C", box.live, "add", "marker-third.txt"]);
  execFileSync("git", ["-C", box.live, "commit", "-m", "future release"]);
  const futureSha = execFileSync("git", ["-C", box.live, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  execFileSync("git", ["-C", box.live, "reset", "--hard", box.newSha]);
  writeFileSync(path.join(box.state, "health"), "fail-third-ui\n");
  const result = runLiveScript(box, path.join(box.live, "scripts/linux/restart-api-ui.sh"), futureSha);
  const output = `${result.stderr}\n${result.stdout}`;
  assert.notEqual(result.status, 0, "future UI failure must fail deploy");
  assert.match(output, /Rollback restored previous release/u);
  assert.doesNotMatch(output, /rollback SEO routes did not return to baseline|SEO_POST_CUTOVER_ROLLED-BACK/u);
  assert.equal(liveSha(box), box.newSha, "future rollback must retain the SEO release source");
  assert.equal(liveTag(box), seoTag, "future rollback must retain the SEO release UI");
  console.log("Z2D_FUTURE_ROLLBACK_TO_SEO_BASELINE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}
}

// --- Z2E. Explicit recovery after Deploy OK preserves the failed UI tree. ---
{
  const box = initSandbox("seo-post-success-recovery");
  const backup = path.join(box.lkg, "seo-before-feature");
  cpSync(path.join(box.live, "dist"), backup, { recursive: true });
  const oldPrepared = path.join(box.staging, `prepared-${box.oldSha}`);
  mkdirSync(oldPrepared, { recursive: true });
  const oldManifest = path.join(oldPrepared, "manifest.json");
  const prepHelper = path.join(box.staging, "runtime", "preparedDist.mjs");
  const oldWrite = spawnSync(process.execPath, [prepHelper, "write", "--dist", path.join(box.live, "dist"),
    "--out", oldManifest, "--target-sha", box.oldSha, "--release-id", "OLD",
    "--expected-locale", "disabled", "--expected-metrika", "off", "--build-tag", "ui-OLD"],
  { encoding: "utf8" });
  assert.equal(oldWrite.status, 0, oldWrite.stderr);
  const oldManifestSha = createHash("sha256").update(readFileSync(oldManifest)).digest("hex");
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const promoted = runFirstPromote(box, preparedDirFor(box, box.newSha), box.newSha);
  assert.equal(promoted.status, 0, promoted.stderr);
  const newManifestSha = createHash("sha256")
    .update(readFileSync(path.join(preparedDirFor(box, box.newSha), "manifest.json"))).digest("hex");
  const scriptPath = path.join(box.staging, "runtime", "recover-seo-post-success.sh");
  let recoverySource = readFileSync(RECOVERY_SCRIPT, "utf8");
  const replacements = [
    ['BASE_SHA="21259c768b3dbf2de17da9a0b676f571380c6a1b"', `BASE_SHA="${box.oldSha}"`],
    ['FEATURE_SHA="a952974bd5126d4000ed6d0fda1d696bfca49b36"', `FEATURE_SHA="${box.oldSha}"`],
    ['BACKUP="/opt/clover/deployments/lkg/seo-before-a3a158c7914d82ae3d2b8abea55788126adf0124"', `BACKUP="${bashPath(backup)}"`],
    ['OLD_MANIFEST="/opt/clover/deployments/staging/prepared-21259c768b3dbf2de17da9a0b676f571380c6a1b/manifest.json"', `OLD_MANIFEST="${bashPath(oldManifest)}"`],
    ['OLD_MANIFEST_SHA="f0db034cff474006b832af812d68042298265e5820fff0a9a8245e200b0afdb2"', `OLD_MANIFEST_SHA="${oldManifestSha}"`],
    ['--expected-release-id "20260923HjDT6xzD"', '--expected-release-id "OLD"'],
    ['"ui-20260923HjDT6xzD"', '"ui-OLD"'],
  ];
  for (const [oldText, newText] of replacements) {
    assert.ok(recoverySource.includes(oldText), `recovery fixture replacement missing: ${oldText}`);
    recoverySource = recoverySource.replace(oldText, newText);
  }
  writeFileSync(scriptPath, recoverySource);
  const runRecovery = (mode, checksum = newManifestSha, extraEnv = {}) => {
    const result = spawnSync(BASH_BIN, [scriptPath, "--target", box.newSha,
      "--manifest-sha256", checksum, mode], {
      encoding: "utf8",
      env: { ...box.env, CLOVER_SEO_RECOVERY_FIXTURE: "1", ...extraEnv },
    });
    releaseSandboxLock(box, result);
    return result;
  };
  assert.ok(existsSync(path.join(box.staging, `seo-cutover-${box.newSha}.receipt`)));
  const wrongLock = runRecovery("--check", newManifestSha, {
    CLOVER_DEPLOY_LOCK: bashPath(path.join(box.root, "wrong.lock")),
  });
  assert.notEqual(wrongLock.status, 0, "wrong deploy lock must fail before recovery");
  assert.match(wrongLock.stderr, /fixture staging\/lock mismatch/u);
  const wrongHost = runRecovery("--check", newManifestSha, {
    CLOVER_DEPLOY_CANONICAL_HOST: "other.example",
  });
  assert.notEqual(wrongHost.status, 0, "wrong canonical host must fail before recovery");
  assert.match(wrongHost.stderr, /canonical host override refused/u);
  const wrongChecksum = runRecovery("--check", "0".repeat(64));
  assert.notEqual(wrongChecksum.status, 0, "wrong target manifest must be refused");
  const receiptPath = path.join(box.staging, `seo-cutover-${box.newSha}.receipt`);
  const receiptSource = readFileSync(receiptPath, "utf8");
  writeFileSync(receiptPath, receiptSource.replace(newManifestSha, "0".repeat(64)));
  const wrongReceipt = runRecovery("--check");
  assert.notEqual(wrongReceipt.status, 0, "wrong receipt must fail before recovery");
  assert.match(wrongReceipt.stderr, /receipt identity mismatch/u);
  writeFileSync(receiptPath, receiptSource);
  const liveIndex = path.join(box.live, "dist/index.html");
  const liveIndexSource = readFileSync(liveIndex, "utf8");
  writeFileSync(liveIndex, `${liveIndexSource}\n<!-- damaged target -->\n`);
  const damagedTarget = runRecovery("--check");
  assert.equal(damagedTarget.status, 0, `damaged target dist must not block baseline recovery: ${damagedTarget.stderr}\n${damagedTarget.stdout}`);
  assert.match(damagedTarget.stderr, /damaged live target dist will be quarantined/u);
  writeFileSync(liveIndex, liveIndexSource);
  assert.equal(liveSha(box), box.newSha);
  const checked = runRecovery("--check");
  assert.equal(checked.status, 0, `recovery preflight failed: ${checked.stderr}\n${checked.stdout}`);
  assert.equal(liveSha(box), box.newSha, "--check must not switch source");
  const beforeTag = liveTag(box);
  const gitLocator = process.platform === "win32" ? "where.exe" : "which";
  const gitExe = bashPath(execFileSync(gitLocator, ["git"], { encoding: "utf8" }).trim().split(/\r?\n/u)[0]);
  const failResetGit = path.join(box.bin, "git-fail-reset");
  writeExec(failResetGit, `#!/usr/bin/env bash\nif [[ "$*" == *"reset --hard ${box.oldSha}"* ]]; then exit 42; fi\nexec "${gitExe}" "$@"\n`);
  const resetFailure = runRecovery("--apply", newManifestSha, {
    CLOVER_DEPLOY_GIT: bashPath(failResetGit),
  });
  assert.equal(resetFailure.status, 3, `reset failure must be CRITICAL: ${resetFailure.stderr}`);
  assert.match(resetFailure.stderr, /failed UI restored to live path/u);
  assert.equal(liveSha(box), box.newSha, "failed reset must leave source at target");
  assert.equal(liveTag(box), beforeTag, "failed reset must return UI to live path");
  writeFileSync(path.join(box.state, "tag"), "mismatch\n");
  const staleHtml = runRecovery("--apply");
  assert.equal(staleHtml.status, 3, `stale live HTML must be CRITICAL: ${staleHtml.stderr}`);
  assert.match(staleHtml.stderr, /origin serves wrong UI tag\/bundle/u);
  const staleFailedPath = nativePath(staleHtml.stderr.match(/failed-ui=([^\s]+)/u)?.[1]);
  assert.ok(staleFailedPath && existsSync(path.join(staleFailedPath, "index.html")));
  assert.equal(liveSha(box), box.oldSha);
  execFileSync("git", ["-C", box.live, "reset", "--hard", box.newSha]);
  rmSync(path.join(box.live, "dist"), { recursive: true, force: true });
  cpSync(staleFailedPath, path.join(box.live, "dist"), { recursive: true });
  writeFileSync(path.join(box.state, "tag"), "match\n");
  const recovered = runRecovery("--apply");
  assert.equal(recovered.status, 0, `post-success recovery failed: ${recovered.stderr}\n${recovered.stdout}`);
  assert.match(recovered.stdout, /SEO_POST_SUCCESS_RECOVERY_OK/u);
  assert.equal(liveSha(box), box.oldSha);
  assert.equal(liveTag(box), "ui-OLD");
  const failedPath = nativePath(recovered.stdout.match(/failed-ui=([^\s]+)/u)?.[1]);
  assert.ok(failedPath && existsSync(path.join(failedPath, "index.html")));
  assert.match(readFileSync(path.join(failedPath, "index.html"), "utf8"), new RegExp(beforeTag));
  console.log("Z2E_POST_SUCCESS_RECOVERY_PRESERVES_FAILED_UI:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

if (!SEO_ONLY && !RECOVERY_ONLY) {
{
  const box = initSandbox("promote-changed-file");
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const dest = preparedDirFor(box, box.newSha);
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  writeFileSync(path.join(dest, "dist/index.html"), `${readFileSync(path.join(dest, "dist/index.html"), "utf8")}\n`);
  const promoted = runPromote(box, dest);
  assert.notEqual(promoted.status, 0, "changed file must fail before cutover");
  assert.match(`${promoted.stderr}\n${promoted.stdout}`, /changed prepared file|prepared dist mismatch/i);
  assert.doesNotMatch(`${promoted.stdout}\n${promoted.stderr}`, /Cutover: switching source/);
  assert.equal(liveSha(box), before);
  assert.equal(liveTag(box), beforeTag);
  console.log("Z3_CHANGED_FILE_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("promote-extra-file");
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const dest = preparedDirFor(box, box.newSha);
  const before = liveSha(box);
  writeFileSync(path.join(dest, "dist/extra.txt"), "nope\n");
  const promoted = runPromote(box, dest);
  assert.notEqual(promoted.status, 0, "extra file must fail before cutover");
  assert.match(`${promoted.stderr}\n${promoted.stdout}`, /extra prepared file/i);
  assert.equal(liveSha(box), before);
  console.log("Z4_EXTRA_FILE_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("promote-missing-file");
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const dest = preparedDirFor(box, box.newSha);
  const before = liveSha(box);
  rmSync(path.join(dest, "dist/sitemap.xml"));
  const promoted = runPromote(box, dest);
  assert.notEqual(promoted.status, 0, "missing file must fail before cutover");
  assert.match(`${promoted.stderr}\n${promoted.stdout}`, /missing prepared file/i);
  assert.equal(liveSha(box), before);
  console.log("Z5_MISSING_FILE_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("promote-wrong-sha-locale");
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const dest = preparedDirFor(box, box.newSha);
  const before = liveSha(box);
  const manifestPath = path.join(dest, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, targetSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, null, 2)}\n`
  );
  const wrongSha = runPromote(box, dest);
  assert.notEqual(wrongSha.status, 0, "wrong SHA must fail before cutover");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, expectedLocaleStamp: "enabled" }, null, 2)}\n`
  );
  const wrongLocale = runPromote(box, dest);
  assert.notEqual(wrongLocale.status, 0, "wrong locale must fail before cutover");
  assert.equal(liveSha(box), before);
  console.log("Z6_WRONG_SHA_OR_LOCALE_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("promote-traversal-symlink");
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const dest = preparedDirFor(box, box.newSha);
  const before = liveSha(box);
  const manifestPath = path.join(dest, "manifest.json");
  const original = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        ...original,
        files: [...original.files, { path: "../escape.js", sha256: "0".repeat(64), size: 1 }],
      },
      null,
      2
    )}\n`
  );
  const traversal = runPromote(box, dest);
  assert.notEqual(traversal.status, 0, "path traversal must fail before cutover");
  writeFileSync(manifestPath, `${JSON.stringify(original, null, 2)}\n`);
  const linkPath = path.join(dest, "dist", "link.js");
  let symlinkAvailable = true;
  try {
    symlinkSync(path.join(dest, "dist/index.html"), linkPath);
  } catch (error) {
    if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
    symlinkAvailable = false;
  }
  if (symlinkAvailable) {
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          ...original,
          files: [...original.files, { path: "link.js", sha256: "1".repeat(64), size: 1 }],
        },
        null,
        2
      )}\n`
    );
    const symlinkRes = runPromote(box, dest);
    assert.notEqual(symlinkRes.status, 0, "symlink must fail before cutover");
  } else {
    console.log("Z7_SYMLINK_WINDOWS_EPERM:NOT_VERIFIED");
  }
  assert.equal(liveSha(box), before);
  console.log("Z7_TRAVERSAL_FAILS_BEFORE_CUTOVER:PASS");
  if (symlinkAvailable) console.log("Z7_SYMLINK_FAILS_BEFORE_CUTOVER:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("promote-baseline-drift");
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, prepared.stderr);
  const dest = preparedDirFor(box, box.newSha);
  const beforeTag = liveTag(box);
  writeFileSync(path.join(box.live, "server/src/server.js"), "console.log('drift')\n");
  const promoted = runPromote(box, dest);
  assert.notEqual(promoted.status, 0, "dirty live baseline must fail");
  assert.match(`${promoted.stderr}\n${promoted.stdout}`, /local modifications|drifted/i);
  assert.equal(liveTag(box), beforeTag);
  assert.doesNotMatch(`${promoted.stdout}\n${promoted.stderr}`, /Cutover: switching source/);
  console.log("Z8_BASELINE_DRIFT_FAILS:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("promote-rollback-r403u");
  writeRecoveryR403uDist(path.join(box.live, "dist"));
  execFileSync("git", ["-C", box.live, "add", "-u", "--", "dist"]);
  const tracked = execFileSync("git", ["-C", box.live, "diff", "--name-only", "--cached"], {
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (tracked.length) {
    execFileSync("git", ["-C", box.live, "restore", "--staged", "--worktree", "--source=HEAD", "--", ...tracked]);
  }
  writeRecoveryR403uDist(path.join(box.live, "dist"));
  const modified = execFileSync("git", ["-C", box.live, "ls-files", "-m", "--", "dist"], {
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (modified.length) {
    execFileSync("git", ["-C", box.live, "update-index", "--skip-worktree", "--", ...modified]);
  }
  const prepared = runPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, `prepare failed: ${prepared.stderr}\n${prepared.stdout}`);
  writeFileSync(path.join(box.state, "health"), "fail-js-403\n");
  const dest = preparedDirFor(box, box.newSha);
  const promoted = runPromote(box, dest);
  assert.notEqual(promoted.status, 0, "post-cutover health failure must roll back");
  assert.equal(liveSha(box), box.oldSha, "rollback must restore previous SHA");
  const liveHtml = readFileSync(path.join(box.live, "dist/index.html"), "utf8");
  assert.match(liveHtml, /ui-20260918r403u/);
  assert.match(liveHtml, /index-B2GFFiD2\.js/);
  writeFileSync(path.join(box.state, "health"), "ok\n");
  const http = probeHttp(box, liveHtml);
  assert.equal(http.status, 0, `r403u HTTP/MIME gate must PASS: ${http.stderr}\n${http.stdout}`);
  const ns = probeNamespace(box, liveHtml);
  assert.notEqual(ns.status, 0, "legacy r403u must not satisfy the new namespace gate");
  console.log("Z9_POST_CUTOVER_ROLLBACK_R403U_HTTP:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("launcher-duplicate-targetsha");
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, `prepare failed: ${prepared.stderr}\n${prepared.stdout}`);
  const dest = preparedDirFor(box, box.newSha);
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const buildsAfterPrepare = buildCount(box);
  writeDuplicateTargetShaManifest(path.join(dest, "manifest.json"), box.oldSha, box.newSha);
  const promoted = runFirstPromote(box, dest, box.newSha);
  assert.notEqual(promoted.status, 0, "duplicate targetSha must fail before cutover");
  assert.match(
    `${promoted.stderr}\n${promoted.stdout}`,
    /duplicate targetSha|ambiguous prepared manifest/i
  );
  assert.doesNotMatch(`${promoted.stdout}\n${promoted.stderr}`, /Cutover: switching source/);
  assert.equal(liveSha(box), before);
  assert.equal(liveTag(box), beforeTag);
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  assert.equal(buildCount(box), buildsAfterPrepare, "refused launcher promote must not rebuild");
  console.log("Z10_LAUNCHER_DUPLICATE_TARGETSHA_FAILS:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("launcher-sha-mismatch");
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, `prepare failed: ${prepared.stderr}\n${prepared.stdout}`);
  const dest = preparedDirFor(box, box.newSha);
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const manifestPath = path.join(dest, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, targetSha: box.oldSha }, null, 2)}\n`
  );
  const promoted = runFirstPromote(box, dest, box.newSha);
  assert.notEqual(promoted.status, 0, "explicit SHA mismatch must fail before cutover");
  assert.match(
    `${promoted.stderr}\n${promoted.stdout}`,
    /does not match pinned|does not match expected/i
  );
  assert.doesNotMatch(`${promoted.stdout}\n${promoted.stderr}`, /Cutover: switching source/);
  assert.equal(liveSha(box), before);
  assert.equal(liveTag(box), beforeTag);
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  console.log("Z11_LAUNCHER_EXPLICIT_SHA_MISMATCH_FAILS:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

{
  const box = initSandbox("launcher-promote-same-dist");
  const prepared = runFirstPrepare(box, box.newSha);
  assert.equal(prepared.status, 0, `prepare failed: ${prepared.stderr}\n${prepared.stdout}`);
  const dest = preparedDirFor(box, box.newSha);
  const manifest = JSON.parse(readFileSync(path.join(dest, "manifest.json"), "utf8"));
  const buildsAfterPrepare = buildCount(box);
  assert.notEqual(buildsAfterPrepare, "0");
  const promoted = runFirstPromote(box, dest, box.newSha);
  assert.equal(promoted.status, 0, `launcher promote failed: ${promoted.stderr}\n${promoted.stdout}`);
  assert.match(promoted.stdout, new RegExp(`FIRST_DEPLOY_LAUNCHER: pinned_sha=${box.newSha}`));
  assert.equal(buildCount(box), buildsAfterPrepare, "launcher promote must not call npm build");
  assert.equal(liveSha(box), box.newSha);
  assert.equal(liveTag(box), manifest.buildTag);
  assert.match(readFileSync(path.join(box.live, "dist/index.html"), "utf8"), new RegExp(manifest.releaseId));
  const delivered = path.join(box.staging, `delivered-deploy-${box.newSha}`);
  assert.equal(existsSync(path.join(delivered, "restart-api-ui.sh")), true);
  assert.equal(existsSync(path.join(delivered, "preparedDist.mjs")), true);
  assert.equal(existsSync(path.join(delivered, "uiAssetProbe.mjs")), true);
  assert.equal(existsSync(path.join(delivered, "releaseNamespace.js")), true);
  assert.match(readFileSync(path.join(delivered, "restart-api-ui.sh"), "utf8"), /PINNED_SHA/);
  assert.match(readFileSync(path.join(delivered, "preparedDist.mjs"), "utf8"), /assertUniqueTargetShaKey/);
  console.log("Z12_LAUNCHER_PROMOTE_SAME_DIST_ONE_SHA:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

}
console.log(RECOVERY_ONLY ? "SEO_POST_SUCCESS_RECOVERY_VERIFY_PASS" : SEO_ONLY ? "SEO_POST_CUTOVER_DEPLOY_VERIFY_PASS" : "SAFE_PRODUCTION_DEPLOY_VERIFY_PASS");
