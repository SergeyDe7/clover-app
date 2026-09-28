import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const closeout = read("docs/technical/SECURITY_STAGE9_CLOSEOUT.md");
const runbook = read("docs/technical/SECURITY_STAGE9C_INCIDENT_RUNBOOK.md");
const adr = read("docs/technical/ADR-STAGE9C-INCIDENT-RESPONSE.md");
const context = read(".cursor/context/CLOVER_PROJECT.md");
const operations = read("docs/technical/OPERATIONS.md");
const packageJson = JSON.parse(read("server/package.json"));

assert.match(
  closeout,
  /PASS — STAGES 9A, 9B AND 9C COMPLETE; OWNER-ACCEPTED RESIDUAL RECORDED/u,
);

for (const marker of [
  "Stage 9A: PASS",
  "Stage 9B: PASS",
  "Stage 9C: PASS",
  "b9e7c099ad4b1e2077a464cb1e4210ffb8eed48e",
  "36416272278",
  "20260928nd8xLmAI",
  "clover-data-env.20260928T113432Z.tgz",
  "6dccef4c8795c85779a4599908cc30545c22a709b3a0ce4f0413594aecfcdb1d",
  "Production restore remains NOT VERIFIED",
  "private owner/fallback contact register was attested",
  "Independent security review: READY",
  "Independent QA review: READY",
  "Independent final reviewer: READY",
]) {
  assert.ok(closeout.includes(marker), `closeout marker missing: ${marker}`);
}

assert.match(closeout, /production API on `4100`/u);
assert.match(closeout, /port `14100` remained a separate TEST process/u);
assert.match(closeout, /no database migration, environment change, kill-switch transition/u);
assert.match(closeout, /Any future production restore[\s\S]*explicit owner approval/u);
assert.match(closeout, /no runtime effect/u);

assert.match(runbook, /<OWNER_PRIMARY_FROM_PRIVATE_REGISTER>/u);
assert.match(runbook, /<OWNER_FALLBACK_FROM_PRIVATE_REGISTER>/u);
assert.match(runbook, /Production backup restore is NOT VERIFIED/u);
assert.match(runbook, /MAX transport is not implemented/u);

assert.match(adr, /Status: Accepted/u);
assert.match(adr, /Accepted by owner: 2026-09-28/u);
assert.match(context, /Security Stage 9 \(закрыт 2026-09-28\)/u);
assert.match(context, /production restore — `NOT VERIFIED`, риск принят владельцем/u);
assert.doesNotMatch(operations, /monitoring is source-controlled but not installed in\s+production/iu);
assert.match(operations, /clover-monitor\.timer` state was re-verified as `active\/waiting`/u);
assert.match(operations, /SECURITY_STAGE9_CLOSEOUT\.md/u);

assert.equal(
  packageJson.scripts["test:security-stage9-closeout"],
  "node scripts/verify-security-stage9-closeout.mjs",
);
assert.match(packageJson.scripts["test:all"], /test:security-stage9-closeout/u);

for (const document of [closeout, runbook]) {
  assert.doesNotMatch(document, /(?:PASSWORD|SECRET|TOKEN|COOKIE|AUTHORIZATION)\s*[:=]/iu);
}

assert.doesNotMatch(
  closeout,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  "closeout must not contain an email address",
);
assert.doesNotMatch(
  closeout,
  /(?:phone|телефон|whatsapp|telegram)\s*[:=]\s*\+?\d/iu,
  "closeout must not contain a labelled phone or messenger value",
);

console.log("SECURITY_STAGE9_CLOSEOUT=PASS");
