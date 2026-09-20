import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertBakedMetrika,
  expectMetrikaFromFlags,
  parseProductionUiBuildFlags,
  viteExportValue,
} from "./assert-metrika-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const helper = path.join(root, "server/scripts/assert-metrika-release.mjs");
const flagsFile = path.join(root, "scripts/linux/production-ui-build.flags");
const deploy = readFileSync(path.join(root, "scripts/linux/restart-api-ui.sh"), "utf8");
const launcher = readFileSync(path.join(root, "scripts/linux/run-target-deploy.sh"), "utf8");
const prepared = readFileSync(path.join(root, "server/scripts/preparedDist.mjs"), "utf8");
const productionEnv = readFileSync(path.join(root, ".env.production"), "utf8");

assert.match(
  readFileSync(flagsFile, "utf8"),
  /^VITE_YANDEX_METRIKA_ENABLED=1$/m
);
assert.equal(
  expectMetrikaFromFlags(parseProductionUiBuildFlags(readFileSync(flagsFile, "utf8"))),
  "on"
);
assert.doesNotMatch(productionEnv, /VITE_YANDEX_METRIKA_ENABLED=1/);
assert.doesNotMatch(productionEnv, /VITE_YANDEX_METRIKA_TEST_MODE=1/);

assert.equal(parseProductionUiBuildFlags("VITE_YANDEX_METRIKA_ENABLED=0\n") && expectMetrikaFromFlags({ VITE_YANDEX_METRIKA_ENABLED: "0" }), "off");
assert.equal(viteExportValue("off"), "");
assert.equal(viteExportValue("on"), "1");
assert.throws(() => parseProductionUiBuildFlags("JWT_SECRET=x\n"), /must not contain|only set/);
assert.throws(() => parseProductionUiBuildFlags("VITE_YANDEX_METRIKA_TEST_MODE=1\n"), /TEST_MODE/);
assert.throws(() => parseProductionUiBuildFlags("export VITE_YANDEX_METRIKA_ENABLED=1\n"), /export/);

function fakeDist(js) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clover-metrika-dist-"));
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  writeFileSync(path.join(dir, "assets", "index.js"), js);
  return dir;
}

const onDist = fakeDist("function qt(){return{VITE_YANDEX_METRIKA_ENABLED:`1`}}");
const offDist = fakeDist("function qt(){return{VITE_PUBLIC_BASE_URL:`https://clover-spb.ru`}}");
const testDist = fakeDist(
  "function qt(){return{VITE_YANDEX_METRIKA_ENABLED:`1`,VITE_YANDEX_METRIKA_TEST_MODE:`1`}}"
);
assertBakedMetrika(onDist, "on");
assertBakedMetrika(offDist, "off");
assert.throws(() => assertBakedMetrika(offDist, "on"), /ON/);
assert.throws(() => assertBakedMetrika(onDist, "off"), /OFF/);
assert.throws(() => assertBakedMetrika(testDist, "on"), /TEST_MODE/);

function runHelper(args) {
  return spawnSync(process.execPath, [helper, ...args], { encoding: "utf8" });
}

const printed = runHelper(["--print-expect", "--flags-file", flagsFile]);
assert.equal(printed.status, 0, printed.stderr);
assert.equal(printed.stdout.trim(), "on");
const exported = runHelper(["--print-export", "--flags-file", flagsFile]);
assert.equal(exported.status, 0, exported.stderr);
assert.equal(exported.stdout.trim(), "1");
assert.equal(runHelper(["--dist", onDist, "--expect", "on"]).status, 0);
assert.notEqual(runHelper(["--dist", offDist, "--expect", "on"]).status, 0);
assert.equal(runHelper(["--dist", offDist, "--expect", "off"]).status, 0);

assert.match(deploy, /assert-metrika-release\.mjs/);
assert.match(deploy, /production-ui-build\.flags/);
assert.match(deploy, /EXPECT_METRIKA/);
assert.match(deploy, /unset VITE_YANDEX_METRIKA_TEST_MODE/);
assert.match(deploy, /unset VITE_YANDEX_METRIKA_TAG_SRC/);
assert.match(deploy, /--expected-metrika/);
assert.equal(/set\s+-a/.test(deploy), false);
assert.equal(/(^|[;&]|\n)\s*source\s+["']?(\$\{?ROOT\}?\/)?server\/\.env/m.test(deploy), false);
assert.equal(/(^|[;&]|\n)\s*source\s+.*\.env\.production/m.test(deploy), false);
assert.match(launcher, /assert-metrika-release\.mjs/);
assert.match(prepared, /expectedMetrikaEnabled/);
assert.match(prepared, /--expected-metrika/);

console.log("verify-metrika-release-flag: PASS");
