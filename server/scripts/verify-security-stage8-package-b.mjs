import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8").replaceAll("\r\n", "\n");

const workflow = read(".github/workflows/security-stage8.yml");
const ruleset = JSON.parse(read("ops/security-stage8/package-b/main-ruleset.json"));
const docs = read("docs/technical/SECURITY_STAGE8_PACKAGE_B.md");
const serverPackage = JSON.parse(read("server/package.json"));

assert.match(workflow, /^name: S8-B CI$/mu);
assert.match(workflow, /^  pull_request:$/mu);
assert.match(workflow, /^  push:$/mu);
assert.doesNotMatch(workflow, /pull_request_target/u);
assert.match(workflow, /^permissions:\n  contents: read$/mu);
assert.doesNotMatch(workflow, /permissions:[\s\S]*\bwrite\b/u);
assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./u);
assert.doesNotMatch(workflow, /^\s*uses:\s*[^\s@]+@(?![0-9a-f]{40}(?:\s|$))/mu);
assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/u);
assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/u);
assert.match(workflow, /^  frontend:$/mu);
assert.match(workflow, /^    name: frontend$/mu);
assert.match(workflow, /^  server:$/mu);
assert.match(workflow, /^    name: server$/mu);
assert.match(workflow, /server:[\s\S]*?persist-credentials: false\n          fetch-depth: 0/u);
assert.match(workflow, /npm ci --ignore-scripts/u);
assert.match(workflow, /npm exec -- vite build/u);
assert.match(workflow, /npm run test:all/u);
assert.match(workflow, /S8A_FIXTURE_PYTHON: \/usr\/bin\/python3/u);
assert.doesNotMatch(workflow, /npm run build/u);

assert.equal(ruleset.name, "S8-B main protection");
assert.equal(ruleset.target, "branch");
assert.equal(ruleset.enforcement, "active");
assert.deepEqual(ruleset.bypass_actors, []);
assert.deepEqual(ruleset.conditions.ref_name, { exclude: [], include: ["refs/heads/main"] });
const byType = new Map(ruleset.rules.map((rule) => [rule.type, rule]));
assert.ok(byType.has("deletion"));
assert.ok(byType.has("non_fast_forward"));
const pullRequest = byType.get("pull_request").parameters;
assert.equal(pullRequest.required_approving_review_count, 0);
assert.equal(pullRequest.required_review_thread_resolution, true);
assert.equal(pullRequest.dismiss_stale_reviews_on_push, true);
const statusChecks = byType.get("required_status_checks").parameters;
assert.equal(statusChecks.strict_required_status_checks_policy, true);
assert.equal(statusChecks.do_not_enforce_on_create, false);
assert.deepEqual(statusChecks.required_status_checks.map(({ context }) => context).sort(), ["frontend", "server"]);
assert.deepEqual(statusChecks.required_status_checks.map(({ integration_id }) => integration_id), [15368, 15368]);

assert.match(docs, /one direct collaborator/iu);
assert.match(docs, /verify the observed check-run names/iu);
assert.match(docs, /GitHub Actions App ID `15368`/u);
assert.match(docs, /Rollback/iu);
assert.match(docs, /does not disable or weaken/iu);
assert.equal(serverPackage.scripts["test:security-stage8-package-b"], "node scripts/verify-security-stage8-package-b.mjs");
assert.match(serverPackage.scripts["test:all"], /npm run test:security-stage8-package-b/u);

console.log("SECURITY_STAGE8_PACKAGE_B_VERIFY_PASS");
