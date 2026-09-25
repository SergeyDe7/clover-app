import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8").replaceAll("\r\n", "\n");

const config = read(".github/dependabot.yml");
const workflow = read(".github/workflows/security-stage8.yml");
const docs = read("docs/technical/SECURITY_STAGE8_PACKAGE_C.md");
const serverPackage = JSON.parse(read("server/package.json"));

assert.match(config, /^version: 2$/mu);
assert.equal([...config.matchAll(/package-ecosystem:/gu)].length, 1);
assert.match(config, /package-ecosystem: "npm"[\s\S]*?directories:\n      - "\/"\n      - "\/server"/u);
assert.doesNotMatch(config, /package-ecosystem: "github-actions"/u);
assert.equal([...config.matchAll(/open-pull-requests-limit: 0/gu)].length, 1);
assert.equal([...config.matchAll(/interval: "weekly"/gu)].length, 1);
assert.equal([...config.matchAll(/timezone: "Europe\/Moscow"/gu)].length, 1);
assert.doesNotMatch(config, /groups:|applies-to:|patterns:/u);
assert.doesNotMatch(config, /target-branch:/u);
assert.doesNotMatch(config, /registries:|secrets\.|token:/u);
assert.doesNotMatch(config, /assignees:|reviewers:/u);

assert.match(workflow, /^  pull_request:$/mu);
assert.match(workflow, /^    name: frontend$/mu);
assert.match(workflow, /^    name: server$/mu);
assert.doesNotMatch(workflow, /pull_request_target/u);

assert.match(docs, /Dependabot alerts: DISABLED/u);
assert.match(docs, /Dependabot security updates: DISABLED/u);
assert.match(docs, /GitHub-side alert count: NOT VERIFIED/u);
assert.match(docs, /SHA-pinned GitHub Actions: NOT COVERED/u);
assert.match(docs, /keep Dependabot alerts enabled/iu);
assert.match(docs, /does not auto-merge/iu);
assert.equal(serverPackage.scripts["test:security-stage8-package-c"], "node scripts/verify-security-stage8-package-c.mjs");
assert.match(serverPackage.scripts["test:all"], /npm run test:security-stage8-package-c/u);

console.log("SECURITY_STAGE8_PACKAGE_C_VERIFY_PASS");
