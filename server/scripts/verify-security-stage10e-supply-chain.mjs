import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n");
const workflow = read(".github/workflows/security-stage8.yml");
const dependabot = read(".github/dependabot.yml");

assert.match(workflow, /^permissions:\n  contents: read$/mu);
assert.doesNotMatch(workflow, /pull_request_target|\$\{\{\s*secrets\.|permissions:[\s\S]*?\bwrite\b/u);
assert.doesNotMatch(workflow, /^\s*uses:\s*[^\s@]+@(?![0-9a-f]{40}(?:\s|$))/mu);
assert.equal((workflow.match(/npm audit --package-lock-only --audit-level=high/gu) || []).length, 3);
assert.match(dependabot, /open-pull-requests-limit:\s*[1-9][0-9]*/u);

for (const file of ["package-lock.json", "server/package-lock.json"]) {
  const lock = JSON.parse(read(file));
  assert.equal(lock.lockfileVersion, 3, `${file}: lockfile v3 required`);
  for (const [name, item] of Object.entries(lock.packages || {})) {
    if (item?.resolved?.startsWith("https://registry.npmjs.org/")) {
      assert.match(item.integrity || "", /^sha512-/u, `${file}:${name}: integrity missing`);
    }
  }
}

const files = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean)
  .filter((file) => !/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|tgz|sqlite)$/iu.test(file));
const secretSignature = /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}/u;
for (const file of files) assert.doesNotMatch(read(file), secretSignature, `${file}: secret signature`);

console.log("SECURITY_STAGE10E_SUPPLY_CHAIN: PASS");
