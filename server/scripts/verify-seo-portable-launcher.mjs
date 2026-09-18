#!/usr/bin/env node
/**
 * Targeted contract check for the Windows portable SEO smoke launcher.
 * Does not launch Chrome or build a candidate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ps1 = readFileSync(
  path.join(root, "tools/seo-browser-smoke-portable/Run-SeoBrowserSmoke.ps1"),
  "utf8"
).replace(/\r\n/g, "\n");

assert.match(ps1, /function Invoke-LoggedNode/);
assert.match(ps1, /\$output = & node @ArgumentList/);
assert.match(ps1, /Write-Host \(\(\$output \| ForEach-Object/);
assert.match(
  ps1,
  /\$env:CLOVER_SEO_DIST = \[System\.IO\.Path\]::GetFullPath\(\$dist\)/
);

const start = ps1.indexOf("function Prepare-CandidateDist");
assert.notEqual(start, -1);
const after = ps1.slice(start);
const end = after.indexOf("\n}\n");
assert.notEqual(end, -1);
const body = after.slice(0, end);
assert.doesNotMatch(body, /& node /);
assert.match(body, /Invoke-LoggedNode -ArgumentList @\(\$vite, "build", "--outDir", \$dist, "--emptyOutDir"\)/);
assert.match(ps1, /Do not use `npm run build -- --outDir`/);
assert.doesNotMatch(ps1, /^\s*npm run build/m);
assert.match(ps1, /From the repo root run: npm ci/);
assert.doesNotMatch(ps1, /\$args\s*=/);
console.log("SEO_PORTABLE_LAUNCHER_PS51_STDOUT:PASS");
