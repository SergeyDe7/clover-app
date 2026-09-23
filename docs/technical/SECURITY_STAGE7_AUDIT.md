# Security Stage 7 — audit and minimal hardening

## Contract and trusted base

Security Stage 7 is **Security Audit + Minimal Security Hardening**. It is not
I18N Stage 7. The original task material is dated 2026-09-13 and has SHA-256
`e47acbeb7e8b451948f46b21b2cfbbb2c23d955227d89f27e747bb0d9545fe3e`.
The historical base named in that material is superseded by the verified current
`origin/main` and production application identity:
`d3233ca01683d0f3c4ad121f027e03bd882ddf17`.

`CLOVER_WORKING_CONTRACT.md` is absent. The binding repository instructions are
`AGENTS.md`, `.cursor/context/CLOVER_PROJECT.md`,
`.cursor/agents/security.md`, and the applicable `.cursor/rules`.

## Threat model

Actors in scope are anonymous storefront visitors, authenticated clients,
managers, administrators, the 1C service account, mail/push providers, an
attacker controlling uploaded/imported content or public request fields, an
attacker with a compromised browser/session, and an attacker holding a leaked
credential or API key.

Protected assets are credentials and reset/verification tokens, customer and
order data, role/permission boundaries, the order-to-1C queue and ACK state,
backup/restore data, public assets, notification destinations, and production
configuration.

The material trust boundaries are browser to nginx/API, public routes to private
role routes, Clover to 1C, Clover to SMTP/push providers, uploaded/imported bytes
to parsers, database and backup files to restore code, and source/lockfiles to
the release artifact.

The highest-risk flows remain authentication issuance, RBAC/IDOR, public order
creation, manager uploads/imports, backup restore, outbound 1C/image requests,
queue claim/ACK, and release promotion. This candidate does not change the 1C
protocol, polling, claim, ACK, order idempotency, TEST/production separation,
database schema, systemd, firewall, or the 1C extension.

## Evidence-backed findings and disposition

Severity counts before the candidate: CRITICAL 0, HIGH 4, MEDIUM 0, LOW 1.
After the candidate: verified exploitable CRITICAL/HIGH 0; fixed HIGH 2; HIGH
upstream advisories with bounded or unreachable audited paths 2; fixed LOW 1.
The two residual package advisories remain explicitly visible in `npm audit`.

### SEC7-001 — compatible vulnerable dependencies

- Severity/status: HIGH / FIXED.
- Affected component: root build toolchain and server WebAuthn, ZIP restore,
  multipart upload, image processing, query parsing, and mail dependencies.
- Actor/preconditions: an attacker must reach the affected parser/handler, or a
  developer must process attacker-influenced build input for dev-only packages.
- Reachable path: `package-lock.json`, `server/package-lock.json`, authenticated
  manager upload/restore routes, public query parsing, and WebAuthn handlers.
- Impact/exploitability: published advisories included denial of service,
  allocation, and parser defects. Exposure varied by route, but compatible
  patched releases existed and leaving them installed was unnecessary.
- Evidence: initial root and server `npm audit --json` each reported six
  findings; lockfile inspection confirmed the affected installed versions.
- Current mitigations: existing authentication, MIME/size gates, RBAC, and
  bounded request handlers reduced reachability but did not replace patches.
- Remediation: exact same-major updates for build dependencies,
  `@simplewebauthn/server`, `adm-zip`, `multer`, `sharp`, `qs`, and
  Nodemailer 7.x. No automatic `npm audit fix` or broad update was used.
- Verification: `npm ls`, post-change `npm audit --json`, Stage 3/4/5/6/7
  security suites, V18, build, and runtime integration checks.

### SEC7-002 — SheetJS advisory without an npm-compatible fix

- Severity/status: HIGH advisory / RISK REDUCED, UPSTREAM FIX UNAVAILABLE IN npm.
- Affected component: browser-side manager matrix import in
  `src/shared/matrixExcelImport.js`.
- Actor/preconditions: a manager or an attacker controlling that manager's
  selected local workbook must supply a crafted Excel/CSV file.
- Reachable path: manager Excel chooser → `parseMatrixExcelFile` → `XLSX.read`
  → first-sheet conversion. It is not an anonymous server upload.
- Impact/exploitability: published prototype-pollution and ReDoS advisories can
  affect the manager browser. A small sparse workbook can also declare a huge
  range and consume the UI thread during conversion.
- Evidence: `npm audit` reports `xlsx@0.18.5` with `fixAvailable: false`;
  a synthetic sparse workbook reproduced the oversized-range condition.
- Current mitigations: authenticated manager UI and user-selected local file.
- Remediation: reject above 5 MiB before and after allocation; preflight the
  sheet range before conversion; cap rows, columns, cells, and final data rows.
  A library replacement or non-npm source is outside this minimal candidate.
- Verification: Stage 7 tests oversized bytes, recognized-header and headerless
  row overflow, a sparse `A1:XFD1048576` workbook, and a valid CSV.

### SEC7-003 — Nodemailer aggregate advisory

- Severity/status: HIGH advisory / RISK REDUCED, FULL FIX REQUIRES MAJOR 10.
- Affected component: `server/src/mailer.js` and reconciliation PDF mail.
- Actor/preconditions: an attacker controls a recipient-like value or message
  option reaching Nodemailer's address/content resolution.
- Reachable path: auth and notification schemas → `sendCloverMail`; manager
  reconciliation route → server-owned uploaded PDF → mail attachment.
- Impact/exploitability: the advisory aggregate includes address-parser DoS and
  file/URL content resolution. Before this candidate, recipient parsing was
  delegated and the PDF used a path attachment. Clover does not expose
  `raw`, `list`, `envelope.size`, OAuth token fetch, or arbitrary content
  options.
- Evidence: post-patch `npm audit` still requires a semver-major Nodemailer 10
  change; independent review reproduced that disabling file access would reject
  Clover's former legitimate path attachment.
- Current mitigations: email schemas cap individual user addresses at 200
  characters; mail configuration is environment-owned.
- Remediation: latest 7.x; at most 20 validated bare mailbox recipients;
  attachments limited to five bounded in-memory buffers with safe metadata;
  server-owned reconciliation PDF read before the mail boundary; file and URL
  access disabled for Nodemailer.
- Verification: Stage 7 recipient/CRLF/nested-comment tests, attachment
  path/control-character rejection, source assertion for the Buffer caller, V18,
  runtime integration, and manager notification suites.

### SEC7-004 — HTML injection in account mail

- Severity/status: LOW / FIXED.
- Affected component: verification and reconciliation email HTML templates.
- Actor/preconditions: a client submits or stores a crafted company name and
  then receives a verification or manager-triggered reconciliation email.
- Reachable path: registration/profile company name → mail template → SMTP HTML.
- Impact/exploitability: HTML markup could render inside that client's mail;
  this is self-directed and not raw HTML in Clover UI, so privilege impact is
  low.
- Evidence: direct interpolation was present in both templates.
- Current mitigations: schema length limits and mail delivery to the same client.
- Remediation: escape company name, period text, and generated verification URL
  for HTML while preserving plain-text content.
- Verification: Stage 7 malicious markup assertions for both templates.

### SEC7-005 — credentials in tracked release environment file

- Severity/status: HIGH / FIXED IN CURRENT TREE; HISTORY RESIDUAL.
- Affected component: tracked `releases/dc-prep-ac44dcf/server.env.for-dc` and
  repository history.
- Actor/preconditions: anyone able to read the repository/current release file
  or a historical clone.
- Reachable path: Git checkout/history → non-placeholder JWT secret, 1C password,
  and 1C API key in the release environment template.
- Impact/exploitability: credential disclosure. Current production comparison
  proves all three installed values differ and the current JWT secret meets the
  length policy; acceptance of historical values by every external system is
  not tested because live 1C/auth calls are prohibited.
- Evidence: `git ls-files` and a value-free key/length scan confirmed three
  non-placeholder values in the current tracked file; Git history contains the
  same material. No value or reusable digest is recorded in this document.
- Current mitigations: the observed production values differ from the tracked
  historical values.
- Remediation: replace the three current tracked values with explicit
  server-side placeholders. Text diff is disabled for that exact historical
  release file so review artifacts do not repeat deleted credentials. No history
  rewrite or production secret change.
- Verification: tracked-tree secret scan, exact diff review, and value-free
  production comparison. Cross-system revocation of all historical values
  remains NOT VERIFIED.

## Audited controls with no new verified defect

- Auth/session/reset/email verification: bounded schemas, token issuance,
  revocation, enumeration-safe responses, and rate-limit suites inspected.
- Roles/RBAC/IDOR and access vault: existing role, ownership, manager permission,
  and access-vault verifiers inspected and exercised.
- Input/injection/XSS/URLs: Zod request boundaries, safe logging, URL policies,
  and absence of runtime `dangerouslySetInnerHTML` inspected.
- Uploads/SSRF: authenticated upload placement, file-size/MIME gates, bounded
  outbound response handling, DNS pinning, and redirect denial inspected.
- CORS/CSRF/cookies/headers/cache/PWA: Stage 6 controls retained; production
  headers and rendered public routes were already proven by the installed
  Stage 6 evidence.
- Resource exhaustion: body limits, auth rate limits, HTTP bounds, enrichment
  queue gates, and local Excel limits inspected.
- 1C/replay/idempotency: code and synthetic tests inspected only; no live 1C
  request and no protocol change.
- Backups/audit/errors: traversal defenses, private cache, audit ownership,
  redaction, retention, and local restore-path behavior inspected.
- Client storage/public exposure/supply chain: service-worker/API cache
  separation, tracked env files, Git history, lockfiles, lifecycle scripts, and
  advisory output inspected.

## Local verification

Passing candidate checks:

- `npm --prefix server run check`;
- `npm --prefix server run test:v18`;
- `npm --prefix server run test:runtime`;
- manager notifications, manager tabs, and order-trash suites;
- Security Stage 3 packages 1/2/3;
- Security Stage 4 packages A/B and package C from an LF validation checkout;
- Security Stage 5 package D;
- Security Stage 6 from an LF validation checkout;
- `npm --prefix server run test:security-stage7`;
- iPhone/PWA splash verifier;
- candidate-file ESLint;
- `npm run build`;
- `npm run sitemap:verify` against the local synthetic database.

Known baseline limitations:

- repository-wide `npm run lint` has three pre-existing errors in untouched
  files plus warnings; candidate-file ESLint is clean;
- the aggregate `test:onec` includes a stale PR-range allowlist verifier and
  is not green at current `origin/main`;
- Security Stage 5 PREPARE does not terminate under this Windows test
  environment;
- CRLF checkout bytes make source-identity suites fail in the normal Windows
  worktree; the same Stage 4C and Stage 6 candidate passes from an LF checkout.

These limitations are not hidden as PASS and are not changed by this candidate.

## Production and release boundary

Read-only identity observed on 2026-09-23:

- application HEAD `d3233ca01683d0f3c4ad121f027e03bd882ddf17`;
- UI release `ui-20260923VrBxTxx6`;
- API, UI, and nginx active with `NRestarts=0`;
- API health and UI HTTP checks passed;
- installed nginx security-header SHA-256
  `5f8db193025bb29ee8616187ca6db94f400a68984179cd1a485209ed3d974e18`.

No production mutation, fuzzing, restart, real login/reset/order/mail, or live 1C
operation was performed. Firewall state, firewall persistence after reboot, and
the root-only system journal remain outside this Stage 7 candidate and are not
verified here. Old processes/listeners were not touched.

Commit, push, PR, merge, deployment, secret rotation, database work, and 1C
changes are all **NONE** for this local preparation.
