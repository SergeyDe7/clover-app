# Cloverspb SEO Domain Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely make `cloverspb.ru` and `www.cloverspb.ru` serve one-hop, evidence-based permanent redirects to final public `https://clover-spb.ru/...` targets without routing the legacy domain into Clover runtime.

**Architecture:** A reviewed CSV is frozen into a production-only decision set. Node.js validation and generation tools compile it into nginx `map` includes consumed by a separate HTTP/HTTPS old-domain vhost; unknown and excluded paths never fall through to React/API. SSL is prepared before DNS cutover, every gate is evidence-backed, and rollback changes only old-domain DNS/nginx.

**Tech Stack:** Node.js 22 ESM, built-in `node:test`/`assert`, CSV text, nginx 1.26.3 `map`/server blocks, dehydrated 0.7.2, PowerShell/SSH/curl for controlled operations, Google Search Console and Яндекс Вебмастер for migration monitoring.

**Spec:** `docs/superpowers/specs/2026-09-06-cloverspb-seo-domain-migration-design.md`

## Global Constraints

- No DNS, nginx, SSL, deploy, service, DB, 1C, order, storefront or LK mutation without the gate-specific explicit user approval.
- Production must be clean `main` at the exact approved merge commit before any server file is staged.
- The old domain is redirect-only: no `proxy_pass`, no React/UI/API fallback, no `/lk` target.
- Compile only finalized `301`, `404` and `410` decisions; `REVIEW` is never auto-promoted.
- Every 301 target must be `https://clover-spb.ru`, direct 200, non-redirecting and public.
- HTTP/HTTPS and apex/www must redirect directly to the final non-www HTTPS target in one hop.
- The existing `clover-spb.ru` vhost, certificate, `192.168.155.15:4100` 1C endpoint, UI `:5273`, DB and 1C remain unchanged.
- Preserve `.cursor/rules/015-visible-secret-input.mdc` uncommitted/unpushed with SHA-256 `265FABB1F076F6A3375A88F5FD9A90FCBFECE00AE28D36F14E48E7DF37F2BFD1`.
- On any unexplained dirty file, checksum drift, failed `nginx -t`, missing certificate, failed health check or ambiguous DNS control: STOP without repair-by-guessing.

---

### Task 1: Freeze reviewed production decisions (GATE A1)

**Files:**

- Create: `docs/seo-migration/cloverspb-production-map.csv`
- Create: `docs/seo-migration/cloverspb-review-decisions.csv`
- Create: `docs/seo-migration/cloverspb-review-decisions.md`
- Create: `scripts/seo/verify-cloverspb-freeze.mjs`
- Create: `scripts/seo/verify-cloverspb-freeze.test.mjs`
- Read: `docs/seo-migration/cloverspb-redirect-map.csv`
- Read: `docs/seo-migration/cloverspb-unmatched.csv`
- Test: `scripts/seo/verify-cloverspb-freeze.test.mjs`

**Interfaces:**

- Consumes: 910-row discovery map with `old_path,target_url,confidence,reason,action`.
- Produces: immutable production input containing only approved `301|404|410`, a machine-readable disposition and human evidence for every excluded `REVIEW` row and every discovery `410` recommendation, plus `validateFreeze({discovery, production, decisions}): Finding[]`.

- [ ] **Step 1: Record external evidence before changing confidence**

Export top legacy landing pages and inbound links from Google Search Console, Яндекс Вебмастер, MegaGroup analytics and available access logs into `cloverspb-review-decisions.md`. If access is unavailable, write `NOT_AVAILABLE` with date and owner; do not infer traffic. Create `cloverspb-review-decisions.csv` with columns `old_path,source_action,disposition,approved_target_url,evidence,reviewer,reviewed_at` for all 590 `REVIEW` rows and all 34 discovery `410` recommendations.

- [ ] **Step 2: Create the conservative production input**

Copy the current 285 `301` and the one already-observed old `404` into `cloverspb-production-map.csv`. Do not copy any of the 34 discovery `410` recommendations merely because no replacement was found. Add a `410` only when the corresponding decision row is `PROMOTE_410` and its evidence proves intentional permanent removal; add a REVIEW candidate as `301` only after `PROMOTE_301` plus target revalidation. Keep the same 13 columns as the discovery map.

- [ ] **Step 3: Account for excluded rows**

In the decisions CSV and evidence document, assign one explicit disposition to all 624 rows requiring judgment:

```text
EXCLUDE_DEFAULT_404  technical /prev or /next alias with no proven landing value
KEEP_REVIEW          product identity or pagination needs business/search evidence
PROMOTE_301          only after exact evidence and revalidation
PROMOTE_410          content intentionally removed with no relevant destination
```

- [ ] **Step 4: Write failing freeze-integrity tests**

Fixtures must make the verifier RED for each of these independent mutations:

- 624 decision rows with only 623 unique `old_path`;
- one missing or one extra decision path;
- `source_action` different from discovery;
- unknown/incompatible disposition;
- promotion without evidence/reviewer/timestamp;
- a REVIEW path inserted into production as 301 without `PROMOTE_301` and matching `approved_target_url`;
- one of the original 285 301 rows removed or its target changed;
- a 410 without matching `PROMOTE_410`;
- the observed old 404 removed or changed.

Run `node --test scripts/seo/verify-cloverspb-freeze.test.mjs`; expected RED because the verifier does not exist.

- [ ] **Step 5: Implement exact-set freeze validation**

Parse all three CSV files with the strict parser. Require unique discovery, production and decision `old_path`. Define the required decision set as the exact set of discovery rows whose action is `REVIEW|410`; require equality, not only count `624`. For each decision require identical `source_action`, disposition in `EXCLUDE_DEFAULT_404|KEEP_REVIEW|PROMOTE_301|PROMOTE_410`, and a compatible contract:

- `PROMOTE_301`: non-empty evidence/reviewer/reviewed_at and `approved_target_url`;
- `PROMOTE_410`: non-empty evidence/reviewer/reviewed_at and empty target;
- non-promotions: empty approved target;
- discovery 410 starts as `KEEP_REVIEW` and cannot enter production without `PROMOTE_410`.

Build the exact expected production sets:

```text
expected 301 = all original discovery 301 tuples (old_path + target_url) UNION all PROMOTE_301 tuples (old_path + approved_target_url)
expected 410 = all and only PROMOTE_410 old_path values
expected 404 = all and only observed discovery 404 old_path values
```

Compare each expected set with production in both directions and reject any missing, extra or changed tuple. Then run the normal target/schema validator over the resulting production rows.

- [ ] **Step 6: Run positive and negative freeze checks**

Run:

```bash
node --test scripts/seo/verify-cloverspb-freeze.test.mjs
node scripts/seo/verify-cloverspb-freeze.mjs --discovery docs/seo-migration/cloverspb-redirect-map.csv --production docs/seo-migration/cloverspb-production-map.csv --decisions docs/seo-migration/cloverspb-review-decisions.csv
```

Expected: PASS; production input has 286 rows before evidence-backed promotions, including zero `410`.

- [ ] **Step 7: Review the diff and commit**

Run `git diff --check` and confirm only the five declared Task 1 files changed. Commit:

```bash
git add docs/seo-migration/cloverspb-production-map.csv docs/seo-migration/cloverspb-review-decisions.csv docs/seo-migration/cloverspb-review-decisions.md scripts/seo/verify-cloverspb-freeze.mjs scripts/seo/verify-cloverspb-freeze.test.mjs
git commit -m "docs(seo): freeze cloverspb redirect decisions"
```

---

### Task 2: Build the CSV parser and invariant validator (GATE A2/B1)

**Files:**

- Create: `scripts/seo/cloverspb-redirect-map.mjs`
- Create: `scripts/seo/cloverspb-redirect-map.test.mjs`
- Test: `scripts/seo/cloverspb-redirect-map.test.mjs`

**Interfaces:**

- Consumes: UTF-8 CSV text.
- Produces: `parseRedirectCsv(text): RedirectRow[]`, `validateProductionRows(rows): Finding[]`, `normalizedLegacyKey(oldUrl): string`.
- `RedirectRow` fields exactly match the 13 production-map columns; `Finding` is `{code, severity, row, message}`.

- [ ] **Step 1: Write failing parser and invariant tests**

Cover quoted commas/quotes, UTF-8 names, duplicate normalized old paths, invalid actions, non-HTTPS targets, wrong host, `/lk`/`/api`/auth targets, localhost/private IP, target on old domain and blank target for 301. Add collision cases for http/https, apex/www, trailing slash, dot segments, upper/lower percent escapes and encoded unreserved characters; add distinct cases proving meaningful query strings are not collapsed into a path-only key.

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseRedirectCsv, validateProductionRows } from "./cloverspb-redirect-map.mjs";

test("rejects a private 301 target", () => {
  const rows = [{
    old_url: "https://cloverspb.ru/a",
    old_path: "/a",
    action: "301",
    target_url: "http://192.168.155.15:4100/api/one-c",
  }];
  assert.ok(validateProductionRows(rows).some((item) => item.code === "INVALID_TARGET"));
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test scripts/seo/cloverspb-redirect-map.test.mjs`
Expected: FAIL because the module/exports do not exist.

- [ ] **Step 3: Implement the minimal parser**

Implement a state-machine CSV parser rather than `split(',')`, preserving embedded commas and doubled quotes. Build a comparison-only collision key that normalizes scheme/host case, www, dot segments, one trailing slash, uppercase percent escapes and percent-encoded unreserved characters. Do not decode reserved `/`, `?`, `#` or collapse query strings. Retain the exact approved original path/query variant for generation.

- [ ] **Step 4: Implement invariant validation**

For `301`, parse `target_url` with `new URL()` and require:

```js
target.protocol === "https:"
target.hostname === "clover-spb.ru"
!/^\/(?:lk|api|auth|login)(?:\/|$)/i.test(target.pathname)
!/^(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i.test(target.hostname)
```

Require unique normalized collision keys and `action` in `301|404|410`. Reject every query-bearing `old_path` unless the decision log has an explicit `PROMOTE_301|PROMOTE_410` row for that exact query. Never strip a query and fall through to the no-query path decision.

- [ ] **Step 5: Run focused tests**

Run: `node --test scripts/seo/cloverspb-redirect-map.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/seo/cloverspb-redirect-map.mjs scripts/seo/cloverspb-redirect-map.test.mjs
git commit -m "test(seo): validate legacy redirect map"
```

---

### Task 3: Add live target and redirect-chain verification (GATE B2)

**Files:**

- Create: `scripts/seo/verify-cloverspb-redirect-map.mjs`
- Create: `scripts/seo/verify-cloverspb-redirect-map.test.mjs`
- Modify: `package.json`
- Test: `scripts/seo/verify-cloverspb-redirect-map.test.mjs`

**Interfaces:**

- Consumes: `cloverspb-production-map.csv` and injected/global `fetch`.
- Produces: exit 0 plus JSON summary on PASS; non-zero plus findings on invalid target/status/redirect/loop.
- CLI: `node scripts/seo/verify-cloverspb-redirect-map.mjs --map <path> --delay-ms 150`.

- [ ] **Step 1: Write failing fetch tests**

Use an injected fake fetch to prove direct 200 passes and 301 target, 404 target, timeout and old-domain `Location` fail.

```js
test("marks a target redirect as a chain", async () => {
  const fakeFetch = async () => new Response(null, {
    status: 301,
    headers: { location: "https://clover-spb.ru/final" },
  });
  const findings = await validateLiveTargets(rows, { fetchImpl: fakeFetch, delayMs: 0 });
  assert.equal(findings[0].code, "TARGET_REDIRECT");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/seo/verify-cloverspb-redirect-map.test.mjs`
Expected: FAIL because `validateLiveTargets` is absent.

- [ ] **Step 3: Implement bounded read-only validation**

Deduplicate targets, send sequential GET with `redirect: "manual"`, `AbortSignal.timeout(30000)`, configured delay, and a descriptive User-Agent. Never send POST, credentials or cookies. Require exact 200 and empty `Location`.

- [ ] **Step 4: Add npm command**

Add to root `package.json`:

```json
"verify:seo-redirect-map": "node scripts/seo/verify-cloverspb-redirect-map.mjs --map docs/seo-migration/cloverspb-production-map.csv --delay-ms 150"
```

- [ ] **Step 5: Run unit and live checks**

Run:

```bash
node --test scripts/seo/verify-cloverspb-redirect-map.test.mjs
npm run verify:seo-redirect-map
```

Expected: tests PASS; live summary reports zero invalid targets, zero target redirects and zero loops.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/seo/verify-cloverspb-redirect-map.mjs scripts/seo/verify-cloverspb-redirect-map.test.mjs
git commit -m "feat(seo): verify legacy redirect targets"
```

---

### Task 4: Generate deterministic nginx maps (GATE A3/B3)

**Files:**

- Create: `scripts/seo/generate-cloverspb-nginx-map.mjs`
- Create: `scripts/seo/generate-cloverspb-nginx-map.test.mjs`
- Create: `scripts/seo/fixtures/cloverspb-production-map.sample.csv`
- Create: `scripts/seo/fixtures/cloverspb-path-redirects.expected.map`
- Create: `scripts/seo/fixtures/cloverspb-query-redirects.expected.map`
- Create: `scripts/seo/fixtures/cloverspb-path-gone.expected.map`
- Create: `scripts/seo/fixtures/cloverspb-query-gone.expected.map`
- Create: `ops/nginx/legacy-domain/cloverspb-path-redirects.map`
- Create: `ops/nginx/legacy-domain/cloverspb-query-redirects.map`
- Create: `ops/nginx/legacy-domain/cloverspb-path-gone.map`
- Create: `ops/nginx/legacy-domain/cloverspb-query-gone.map`
- Test: `scripts/seo/generate-cloverspb-nginx-map.test.mjs`

**Interfaces:**

- Consumes: validated `RedirectRow[]`.
- Produces: `renderPathRedirectMap(rows): string`, `renderQueryRedirectMap(rows): string`, `renderPathGoneMap(rows): string` and `renderQueryGoneMap(rows): string` sorted by exact approved key.
- CLI writes only the four declared map files and prints SHA-256/counts.

- [ ] **Step 1: Write failing deterministic snapshot tests**

Fixture rows must include Cyrillic target encoding, quoted CSV, a no-query 301, an explicitly approved query 301, a 410 and a 404. Tests must prove slash/percent collision detection and that an unknown query cannot hit the path redirect map. Expected path output:

```nginx
"/old-product" "https://clover-spb.ru/product/%D0%9D%D0%A4-00000070";
```

and:

```nginx
"/gone-product" 1;
```

404 rows produce no map line because unknown/default behavior is 404.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/seo/generate-cloverspb-nginx-map.test.mjs`
Expected: FAIL because renderer exports do not exist.

- [ ] **Step 3: Implement strict generation**

Call `validateProductionRows()` first and refuse any finding. Escape nginx quoted-string characters (`\\`, `"`, control characters), sort by `old_path`, append one final newline, and write through a temporary sibling file followed by atomic rename.

- [ ] **Step 4: Generate real maps**

Run:

```bash
node scripts/seo/generate-cloverspb-nginx-map.mjs --input docs/seo-migration/cloverspb-production-map.csv --path-redirects ops/nginx/legacy-domain/cloverspb-path-redirects.map --query-redirects ops/nginx/legacy-domain/cloverspb-query-redirects.map --path-gone ops/nginx/legacy-domain/cloverspb-path-gone.map --query-gone ops/nginx/legacy-domain/cloverspb-query-gone.map
```

Expected before promotions: 285 redirect entries, zero gone entries and zero REVIEW entries. Later counts may increase only from machine-validated `PROMOTE_301`/`PROMOTE_410` decisions with non-empty evidence.

- [ ] **Step 5: Run unit, generator-repeatability and diff checks**

Run generator twice and require identical SHA-256. Run `git diff --check` and `rg -n "cloverspb\.ru|/lk|/api|192\.168|localhost" ops/nginx/legacy-domain/*.map`; expected matches are only legacy input comments if comments are emitted, never targets.

- [ ] **Step 6: Commit**

```bash
git add scripts/seo/generate-cloverspb-nginx-map.mjs scripts/seo/generate-cloverspb-nginx-map.test.mjs scripts/seo/fixtures ops/nginx/legacy-domain/cloverspb-path-redirects.map ops/nginx/legacy-domain/cloverspb-query-redirects.map ops/nginx/legacy-domain/cloverspb-path-gone.map ops/nginx/legacy-domain/cloverspb-query-gone.map
git commit -m "feat(seo): generate nginx legacy redirect maps"
```

---

### Task 5: Create and structurally verify the redirect-only vhost (GATE A4/B4)

**Files:**

- Create: `ops/nginx/legacy-domain/cloverspb.ru.redirect.conf.template`
- Create: `scripts/seo/verify-cloverspb-nginx-config.mjs`
- Create: `scripts/seo/verify-cloverspb-nginx-config.test.mjs`
- Test: `scripts/seo/verify-cloverspb-nginx-config.test.mjs`

**Interfaces:**

- Consumes: four installed path/query redirect/gone map paths and separate old-domain cert paths.
- Produces: HTTP/HTTPS vhost for both old hosts; no upstream/runtime dependency.
- Structural verifier rejects `proxy_pass`, new-domain certificate paths, wildcard homepage return and missing ACME exception.

- [ ] **Step 1: Write failing structural tests**

Fixtures must prove rejection of:

```nginx
proxy_pass http://192.168.155.15:5273;
return 301 https://clover-spb.ru$request_uri;
ssl_certificate /dehydrated/certs/clover-spb.ru/fullchain.pem;
```

and acceptance only when HTTP/HTTPS blocks, both old names, ACME location, old cert paths, all four path/query map includes, explicit 301/410 and default 404 are present. A separate test must reject a config where non-empty `$args` can fall through to a path-only redirect.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/seo/verify-cloverspb-nginx-config.test.mjs`
Expected: FAIL because verifier/template are absent.

- [ ] **Step 3: Write the template**

Use separate server blocks for 80 and 443. Both use the same path/query redirect/gone variables inside `location /`; exact query decisions are evaluated first, unknown non-empty `$args` returns 404, then no-query path decisions are evaluated. Port 80 preserves `/.well-known/acme-challenge/`; port 443 uses only:

```nginx
ssl_certificate /dehydrated/certs/cloverspb.ru/fullchain.pem;
ssl_certificate_key /dehydrated/certs/cloverspb.ru/privkey.pem;
```

Use dedicated `/var/log/nginx/cloverspb-redirect.access.log` and `.error.log`. Do not include any `proxy_pass`.

- [ ] **Step 4: Implement structural verification**

Strip comments before scanning. Require exactly the intended `server_name`, listen 80/443, ACME path, all four map variables/includes, query-before-path guard and cert path; reject runtime ports `4100|5273`, wildcard redirect and new-domain private key path.

- [ ] **Step 5: Run focused tests and commit**

```bash
node --test scripts/seo/verify-cloverspb-nginx-config.test.mjs
git add ops/nginx/legacy-domain/cloverspb.ru.redirect.conf.template scripts/seo/verify-cloverspb-nginx-config.mjs scripts/seo/verify-cloverspb-nginx-config.test.mjs
git commit -m "feat(seo): define redirect-only legacy vhost"
```

---

### Task 6: Add release manifest and rollback runbook (GATE B5)

**Files:**

- Create: `docs/seo-migration/cloverspb-cutover-runbook.md`
- Create: `scripts/seo/build-cloverspb-redirect-bundle.mjs`
- Create: `scripts/seo/build-cloverspb-redirect-bundle.test.mjs`
- Test: `scripts/seo/build-cloverspb-redirect-bundle.test.mjs`

**Interfaces:**

- Consumes: template, maps, production CSV and exact git commit.
- Produces: `releases/cloverspb-seo-<short-sha>/` with files plus `SHA256SUMS` and `manifest.json`; it contains no env, keys or certificates.

- [ ] **Step 1: Write a failing bundle-content test**

Require exactly:

```text
cloverspb.ru.redirect.conf
cloverspb-path-redirects.map
cloverspb-query-redirects.map
cloverspb-path-gone.map
cloverspb-query-gone.map
cloverspb-production-map.csv
manifest.json
SHA256SUMS
```

Reject `.env`, `privkey`, `pem`, `db`, `sqlite` and any file not on the allowlist.

- [ ] **Step 2: Verify RED and implement the builder**

Run the test first; expected missing export failure. Implement deterministic copying/checksums and manifest fields `gitCommit`, `builtAt`, `redirectCount`, `goneCount`, `sourceMapSha256`.

- [ ] **Step 3: Write the runbook**

The runbook must contain exact backup, stage, validation, activation and rollback commands from Tasks 8–12, with every production/DNS operation labelled `REQUIRES EXPLICIT USER APPROVAL`.

- [ ] **Step 4: Build and inspect the bundle**

Run:

```bash
node --test scripts/seo/build-cloverspb-redirect-bundle.test.mjs
node scripts/seo/build-cloverspb-redirect-bundle.mjs
```

Expected: allowlisted files only and all checksums verify.

- [ ] **Step 5: Commit**

```bash
git add docs/seo-migration/cloverspb-cutover-runbook.md scripts/seo/build-cloverspb-redirect-bundle.mjs scripts/seo/build-cloverspb-redirect-bundle.test.mjs
git commit -m "docs(seo): add legacy cutover and rollback runbook"
```

Do not commit generated release directories unless the project release policy explicitly requires it.

---

### Task 7: Close DNS and SSL readiness blockers (GATE H prerequisite)

**Files:**

- Create: `docs/seo-migration/cloverspb-dns-control-evidence.md`
- Create: `docs/seo-migration/cloverspb-ssl-readiness.md`
- Create: `ops/acme/legacy-domain/cloverspb-domains.txt`
- Create: `ops/acme/legacy-domain/cloverspb-dehydrated-staging.conf`
- Create: `ops/acme/legacy-domain/cloverspb-dehydrated-production.conf`
- Create: `scripts/seo/verify-cloverspb-ssl-readiness.mjs`
- Create: `scripts/seo/verify-cloverspb-ssl-readiness.test.mjs`
- Test: public DNS/TLS read-only commands and the SSL verifier

**Interfaces:**

- Consumes: provider capability evidence, current full DNS zone export, dehydrated challenge method.
- Produces: one approved path: `KEEP_MEGAGROUP_NS` or `MIGRATE_NS_RUCENTER`; a provider-specific reviewed DNS hook contract; an exact staging/issuance/renewal/rollback packet; and proof of a valid separate old-domain certificate before A cutover.

- [ ] **Step 1: Prove DNS control capability**

In MegaGroup/RU-CENTER UI or provider support response, prove whether apex/www A and `_acme-challenge` TXT can be edited while `ns*.megagroup.ru` remain authoritative. Record screenshots/export identifiers, never credentials.

If A/TXT edits are available, select `KEEP_MEGAGROUP_NS`. If not, STOP; open a separately approved full-zone NS migration plan before continuing.

- [ ] **Step 2: Export and compare the entire DNS zone**

Record at least apex/www A, AAAA absence, NS, SOA, MX `mxs.oml.ru`, TXT and CAA. Do not remove MX merely because business email is unused.

- [ ] **Step 3: Write failing SSL configuration and certificate tests**

After `KEEP_MEGAGROUP_NS` is proven, test that the domains file contains exactly one SAN certificate line for `cloverspb.ru www.cloverspb.ru`; staging config uses `https://acme-staging-v02.api.letsencrypt.org/directory`; production config uses `https://acme-v02.api.letsencrypt.org/directory`; neither file contains credentials or a `clover-spb.ru` certificate path. The certificate verifier must reject a missing SAN, wrong hostname, expired/not-yet-valid certificate, unreadable full chain, permissive private-key mode, or any change in the recorded new-domain fingerprint.

Run `node --test scripts/seo/verify-cloverspb-ssl-readiness.test.mjs`; expected RED because the verifier/config files do not exist.

- [ ] **Step 4: Freeze the provider hook and exact command packet**

Preferred: issue `cloverspb.ru` + `www.cloverspb.ru` through dehydrated DNS-01 before changing A. Store provider hook credentials only in root-owned production secret storage, never repo/env output.

The reviewed provider hook must implement dehydrated `deploy_challenge` and `clean_challenge`, wait for authoritative TXT visibility on all three MegaGroup nameservers, and fail closed on timeout. Its `deploy_cert` handler must be an explicit no-op except for a redacted audit message: it must not copy certificates, edit nginx or reload/restart anything. Record the installed hook path and SHA-256 in `cloverspb-ssl-readiness.md`; do not commit the hook or credentials. The staging config must keep account/cert/work paths under `/opt/clover/acme-stage/cloverspb`; the production config may use only the separately inventoried current dehydrated account layout and `/dehydrated/certs` output. If provider/API behavior or the effective paths are not proven, leave `STATUS=STOP` and do not issue anything.

The following paths and commands are the fixed packet; replace no path ad hoc during execution:

```bash
/usr/bin/dehydrated --version
sudo sha256sum /dehydrated/certs/clover-spb.ru/fullchain.pem /dehydrated/certs/clover-spb.ru/privkey.pem
sudo install -d -o root -g root -m 0700 /opt/clover/acme-stage/cloverspb /etc/dehydrated/cloverspb
sudo install -o root -g root -m 0644 ops/acme/legacy-domain/cloverspb-domains.txt /etc/dehydrated/cloverspb/domains.txt
sudo install -o root -g root -m 0644 ops/acme/legacy-domain/cloverspb-dehydrated-staging.conf /etc/dehydrated/cloverspb/staging.conf
sudo install -o root -g root -m 0644 ops/acme/legacy-domain/cloverspb-dehydrated-production.conf /etc/dehydrated/cloverspb/production.conf
```

Before these production writes, show exact Git commit/checksums and obtain a separate explicit SSL-stage approval. Back up an existing `/dehydrated/certs/cloverspb.ru` directory, if present, to the already recorded root-only scoped backup. Never copy or alter `/dehydrated/certs/clover-spb.ru`.

- [ ] **Step 5: Exercise DNS-01 against the staging CA**

Run only after the stage approval and with the reviewed root-owned hook path `/etc/dehydrated/hooks/cloverspb-dns01.sh`:

```bash
sudo /usr/bin/dehydrated --cron --config /etc/dehydrated/cloverspb/staging.conf --domains-txt /etc/dehydrated/cloverspb/domains.txt --hook /etc/dehydrated/hooks/cloverspb-dns01.sh --challenge dns-01 --out /opt/clover/acme-stage/cloverspb
sudo /usr/bin/dehydrated --cron --force --force-validation --config /etc/dehydrated/cloverspb/staging.conf --domains-txt /etc/dehydrated/cloverspb/domains.txt --hook /etc/dehydrated/hooks/cloverspb-dns01.sh --challenge dns-01 --out /opt/clover/acme-stage/cloverspb
sudo openssl x509 -in /opt/clover/acme-stage/cloverspb/cloverspb.ru/fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
```

The second staging run is the renewal-path test: it must deploy and clean TXT again and produce both SANs. Confirm no `_acme-challenge` TXT remains. Any failure: STOP, remove only staged TXT through the reviewed hook, restore only a pre-existing old-domain certificate backup, and leave new-domain certificate/config untouched.

- [ ] **Step 6: Obtain explicit real-certificate approval and issue once**

Present staging evidence, full command, hook checksum, old-domain backup and new-domain certificate baseline. Without a separate explicit approval, STOP. Then run:

```bash
sudo /usr/bin/dehydrated --cron --config /etc/dehydrated/cloverspb/production.conf --domains-txt /etc/dehydrated/cloverspb/domains.txt --hook /etc/dehydrated/hooks/cloverspb-dns01.sh --challenge dns-01 --out /dehydrated/certs
sudo chmod 0600 /dehydrated/certs/cloverspb.ru/privkey.pem
sudo /usr/bin/dehydrated --cron --config /etc/dehydrated/cloverspb/production.conf --domains-txt /etc/dehydrated/cloverspb/domains.txt --hook /etc/dehydrated/hooks/cloverspb-dns01.sh --challenge dns-01 --out /dehydrated/certs
```

The second production run must be an idempotent not-due renewal check, not a forced reissue. On failure, restore only `/dehydrated/certs/cloverspb.ru` from the scoped backup, or remove that exact newly-created directory if no prior copy existed and rollback was explicitly authorized. Never revoke, replace or restore the new-domain certificate.

- [ ] **Step 7: Verify the installed certificate and isolation read-only**

Run:

```bash
sudo openssl x509 -in /dehydrated/certs/cloverspb.ru/fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
sudo stat -c '%a %U:%G %n' /dehydrated/certs/cloverspb.ru/privkey.pem /dehydrated/certs/cloverspb.ru/fullchain.pem
sudo sha256sum /dehydrated/certs/clover-spb.ru/fullchain.pem /dehydrated/certs/clover-spb.ru/privkey.pem
```

Run the SSL verifier against the old fullchain and the recorded before/after new-domain fingerprints. Expected: both old SANs, valid dates, private key mode 600, no residual TXT, and byte-identical current `clover-spb.ru` certificate/key.

- [ ] **Step 8: Run focused tests, review the diff and commit**

Run the unit test, verifier, public TLS read-only probe, secret scan and `git diff --check`. Commit only repo templates/verifier/tests and redacted evidence; production hook and credentials remain outside Git.

```bash
git add docs/seo-migration/cloverspb-dns-control-evidence.md docs/seo-migration/cloverspb-ssl-readiness.md ops/acme/legacy-domain scripts/seo/verify-cloverspb-ssl-readiness.mjs scripts/seo/verify-cloverspb-ssl-readiness.test.mjs
git commit -m "docs(seo): record legacy DNS and SSL readiness"
```

Never commit private keys, challenge credentials or provider session data.

---

### Task 8: Stage nginx artifacts without DNS cutover (GATE C)

**Files:**

- Install: `/etc/nginx/conf.d/cloverspb-redirect-maps.conf`
- Install: `/etc/nginx/maps/cloverspb-path-redirects.map`
- Install: `/etc/nginx/maps/cloverspb-query-redirects.map`
- Install: `/etc/nginx/maps/cloverspb-path-gone.map`
- Install: `/etc/nginx/maps/cloverspb-query-gone.map`
- Modify: `/etc/nginx/sites-available/cloverspb.ru`
- Backup: timestamped copies under `/opt/clover/backups/cloverspb-seo-<UTC>/nginx/`
- Test: checksums and ownership on production

**Interfaces:**

- Consumes: signed release bundle from the exact approved merge commit.
- Produces: staged redirect-only old-domain config; DNS remains on MegaGroup.

- [ ] **Step 1: Obtain explicit production-stage approval**

Show exact local commit, bundle SHA-256, production clean `main` HEAD and target files. Without a separate explicit “да” for GATE C, STOP.

- [ ] **Step 2: Recheck production baseline in one persistent SSH session**

```bash
git -C /opt/clover/clover-app status --short --branch
git -C /opt/clover/clover-app rev-parse HEAD
sha256sum /etc/nginx/sites-available/cloverspb.ru /etc/nginx/sites-available/clover-spb.ru /etc/nginx/sites-available/dehydrated
```

Expected: clean main at approved commit and known baseline checksums. Drift means STOP.

- [ ] **Step 3: Create a scoped backup**

Using the exact UTC directory printed before execution, copy only the old-domain vhost and relevant include/map files. Record SHA-256 and recovery commands in the runbook. Do not back up or touch private keys.

- [ ] **Step 4: Install with explicit paths and modes**

Use `sudo install -o root -g root -m 0644` for config/map files. Do not edit `clover-spb.ru`, `dehydrated`, systemd, firewall or env. Do not reload nginx yet.

- [ ] **Step 5: Verify installed bytes**

Compare release and installed SHA-256, `readlink -f` the enabled old site, scan the installed vhost for forbidden `proxy_pass|4100|5273|/api|/lk`.

Expected: exact checksums and no forbidden runtime routes.

---

### Task 9: Validate and activate staged nginx safely (GATE D/E)

**Files:**

- Test: installed nginx config and representative old-domain behavior
- Evidence: append command outputs to `docs/seo-migration/cloverspb-precutover-validation.md`

**Interfaces:**

- Consumes: staged config, valid old-domain certificate, unchanged DNS.
- Produces: PASS evidence for syntax and host-level behavior before public cutover.

- [ ] **Step 1: Run nginx syntax test**

```bash
sudo /usr/sbin/nginx -t
```

Expected: `syntax is ok` and `test is successful`. Any failure: STOP and restore only old-domain files from the scoped backup; no ad-hoc production fix.

- [ ] **Step 2: Obtain explicit reload approval**

The reload is a production mutation. Present `nginx -t` output, checksums and rollback command. Without explicit approval, STOP.

- [ ] **Step 3: Reload nginx only through the normal service command**

```bash
sudo systemctl reload nginx
```

No kill/pkill/restart of Clover API/UI.

- [ ] **Step 4: Test HTTP with Host headers**

```bash
curl -sS -D - -o /dev/null -H 'Host: cloverspb.ru' http://192.168.155.15/
curl -sS -D - -o /dev/null -H 'Host: www.cloverspb.ru' http://192.168.155.15/magazin/folder/bumazhnaya-produkciya
curl -sS -D - -o /dev/null -H 'Host: cloverspb.ru' http://192.168.155.15/definitely-unknown
```

Expected: exact 301 final target, exact category 301, unknown 404.

- [ ] **Step 5: Test HTTPS only after valid old cert is staged**

```bash
curl --resolve cloverspb.ru:443:185.233.93.129 -sS -D - -o /dev/null https://cloverspb.ru/
curl --resolve www.cloverspb.ru:443:185.233.93.129 -sS -D - -o /dev/null https://www.cloverspb.ru/magazin/product/belizna
```

Expected: certificate verifies and `Location` is the final non-www `https://clover-spb.ru/...` URL. If cert verification fails, STOP; do not use `-k` as acceptance evidence.

- [ ] **Step 6: Run representative matrix and Clover regression**

Cover homepage, info, category, subcategory, exact product, product→category fallback, 410, 404, REVIEW/default 404, www and approved query behavior. Verify `https://clover-spb.ru/`, `/lk`, API health and unauthenticated `/api/one-c` remains 401. No order and no 1C write.

---

### Task 10: Rendered SEO readiness and explicit cutover stop (GATE F)

**Files:**

- Create: `docs/seo-migration/cloverspb-rendered-seo-readiness.md`
- Modify: `docs/seo-migration/cloverspb-cutover-runbook.md`
- Test: Google URL Inspection and Яндекс server/rendered inspection

**Interfaces:**

- Consumes: representative new category/product targets and search-engine rendered output.
- Produces: PASS/STOP for unique title, H1, self-canonical and indexability.

- [ ] **Step 1: Inspect rendered representative targets**

Inspect at least homepage, catalog, one category, one subcategory and three exact products. Record rendered title/H1/canonical and compare with raw HTML.

- [ ] **Step 2: Enforce the metadata gate**

PASS only if search engines render unique page-specific metadata and canonical `https://clover-spb.ru/...`. If not, STOP and create a separate SEO-runtime issue/PR; do not edit storefront inside this migration branch.

- [ ] **Step 3: Present the cutover packet**

Provide DNS before/after, TTL state, certificate evidence, nginx checksums, complete redirect validation, regression PASS, rollback commands and named operator.

- [ ] **Step 4: STOP for explicit DNS authorization**

No DNS operation follows from approval of earlier gates. Require a separate explicit instruction identifying old apex and www records.

---

### Task 11: Execute minimal DNS cutover (GATE G/H)

**Files:**

- Evidence: `docs/seo-migration/cloverspb-dns-cutover-evidence.md`
- Test: authoritative and recursive DNS plus public TLS

**Interfaces:**

- Consumes: explicit user authorization, selected `KEEP_MEGAGROUP_NS` path, preinstalled valid old certificate.
- Produces: apex/www web records resolving to `185.233.93.129`; NS/MX unchanged.

- [ ] **Step 1: Lower TTL in advance under separate approval**

Change only old apex/www web TTL from 43200 to 300 at least 24–48 hours before cutover. Wait one previous TTL before treating caches as expired. Record authoritative before/after evidence.

- [ ] **Step 2: Re-run the full pre-cutover packet immediately before change**

Require certificate SAN PASS, `nginx -t` PASS, full map PASS, Clover regression PASS and rollback operator availability.

- [ ] **Step 3: Change only web records**

Set:

```text
cloverspb.ru A 185.233.93.129
www.cloverspb.ru A 185.233.93.129
```

Keep MegaGroup NS, MX and all non-web records unchanged. Do not add AAAA. If UI/provider cannot perform exactly this scoped change, STOP.

- [ ] **Step 4: Confirm authoritative answers**

Query all three MegaGroup nameservers for apex/www A and verify serial/TTL. Then query at least two independent recursive resolvers. Save outputs and timestamps.

- [ ] **Step 5: Confirm public HTTPS immediately**

Without `--resolve`, require valid TLS and correct one-hop redirect for both old hostnames. Failure triggers Task 13 rollback criteria immediately.

---

### Task 12: Post-cutover full validation and Clover regression (GATE I/J)

**Files:**

- Create: `docs/seo-migration/cloverspb-postcutover-report.md`
- Test: all production-map rows, four scheme/host combinations and Clover smoke matrix

**Interfaces:**

- Consumes: live public DNS and production map.
- Produces: machine-readable/full PASS report plus regression evidence.

- [ ] **Step 1: Verify four entry variants**

Check `http://cloverspb.ru`, `http://www.cloverspb.ru`, `https://cloverspb.ru`, `https://www.cloverspb.ru`. Every mapped request must have exactly one redirect to final `https://clover-spb.ru/...`.

- [ ] **Step 2: Run the full production-map validator**

For all 301 rows require expected status and exact `Location`, target 200 and no intermediate redirect. For explicit 404/410 require exact status. Unknown sample must be 404.

- [ ] **Step 3: Run Clover regression**

Verify storefront, `/lk`, auth/login, client/manager/admin reachability, catalog/product/cart/checkout, delivery zones/fees, matrices/UOM/prices, PWA assets, existing SEO pages, API health and unauthenticated `/api/one-c = 401`. Use read-only/synthetic health paths; do not create a real order or touch 1C.

- [ ] **Step 4: Compare immutable baselines**

Confirm `clover-spb.ru` vhost checksum, new-domain certificate fingerprint, API/UI process versions, DB checksum/mtime policy and 1C endpoint config are unchanged from pre-cutover evidence.

- [ ] **Step 5: Publish the report commit**

Commit docs-only evidence after secrets/IP-sensitive operational details are reviewed for repository suitability:

```bash
git add docs/seo-migration/cloverspb-postcutover-report.md
git commit -m "docs(seo): record legacy domain cutover validation"
```

---

### Task 13: SEO monitoring and scoped rollback (GATE K)

**Files:**

- Create: `docs/seo-migration/cloverspb-seo-monitoring-log.md`
- Modify: `docs/seo-migration/cloverspb-cutover-runbook.md`
- Test: scheduled read-only DNS/TLS/redirect/indexing checks

**Interfaces:**

- Consumes: cutover report, Search Console and Яндекс properties, old-domain nginx logs.
- Produces: monitoring checkpoints and a documented go/rollback decision.

- [ ] **Step 1: Submit search-engine migration actions**

After redirects are live, verify all relevant properties, use Google Change of Address, submit the current new sitemap, add both sites in Яндекс Вебмастер and submit the move. Record timestamps and property identifiers, not credentials.

- [ ] **Step 2: Monitor on the fixed schedule**

Check immediately, +15m, +1h, +6h, +24h, daily for 7 days, then weekly for 8–12 weeks. Track DNS, TLS, full-map samples, old 404/410 top paths, nginx errors, target 5xx, Search Console indexing/crawl and Яндекс pages/move status.

- [ ] **Step 3: Apply rollback thresholds**

Rollback immediately for invalid/missing old certificate, widespread 5xx, wrong-host redirects, loops/chains, clover-spb regression or unresolved DNS misrouting. Ranking fluctuation alone is monitored and is not an automatic infrastructure rollback trigger.

- [ ] **Step 4: Execute scoped rollback only when authorized**

Restore apex/www A to `185.32.58.162`, confirm authoritative/recursive propagation, disable or restore only the old-domain vhost, and leave new-domain nginx/SSL, Clover runtime, DB and 1C untouched.

- [ ] **Step 5: Keep redirects long-term after PASS**

Maintain working permanent redirects for at least one year and preferably indefinitely while the old domain is owned. Restore TTL only after stability and a separate DNS approval.

- [ ] **Step 6: Final review and commit**

Run docs secret scan, `git diff --check`, independent review and commit:

```bash
git add docs/seo-migration/cloverspb-seo-monitoring-log.md docs/seo-migration/cloverspb-cutover-runbook.md
git commit -m "docs(seo): add legacy migration monitoring"
```

---

## Execution handoff

Do not execute this plan in the current preparation run. After the design and artifacts are reviewed and merged, start a new controlled task. Recommended execution mode is subagent-driven per task with independent review between gates; every production/DNS/SSL gate still requires its own explicit user authorization.
