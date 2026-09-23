# SEO legacy-category post-cutover gate

This is a one-release safety gate for the PR #159 redirects, not Security Stage 7 or an I18N stage. It does not change 1C, DB, firewall, systemd units, or old listeners.

## Release identities

- Exact pre-SEO production source: `21259c768b3dbf2de17da9a0b676f571380c6a1b`.
- PR #159 feature merge: `a952974bd5126d4000ed6d0fda1d696bfca49b36`.
- The earlier prepared artifact for `a3a158c7914d82ae3d2b8abea55788126adf0124` **does not contain this gate**. Never PROMOTE it as the gated release. Make a new committed target and run PREPARE again; record its exact manifest SHA-256 and release ID.

## Contract

For a cutover from the exact pre-SEO SHA, the target-pinned launcher extracts `seoPostCutoverProbe.mjs` alongside the deploy script. The deploy script requires the probe before cutover. While holding its existing deploy lock and rollback handler, it checks both UI origin and local nginx HTTPS: GET/HEAD 301 and exact `Location` for both obsolete categories, GET query preservation, both destinations 200 `text/html`, and the legacy product 200 with Russian canonical. A failed check invokes the existing source/UI rollback, restarts API/UI, and rechecks health/assets plus the old-route 404/product baseline. A failed rollback is reported as CRITICAL, not PASS. `Deploy OK` is emitted only after these checks pass.

The source guard refuses a missing baseline/feature Git object, a target that omits the PR #159 feature merge, or a pre-SEO production HEAD other than the exact SHA above. A later production HEAD containing the PR #159 merge is treated as SEO-enabled, so a future unrelated rollback does not incorrectly require old 404s.

## Operator gates

1. Before PREPARE, verify `origin/main`, exact target SHA, diff, package locks, and production source/UI identity. No source drift, TEST/production switching, or database restore.
2. PREPARE with the target-pinned launcher and new commit; verify all prepared files and the manifest SHA-256. Re-run isolated SEO and deploy-sandbox tests. Keep the dedicated pre-SEO UI backup until the release is closed.
3. Obtain separate owner consent for PROMOTE. Immediately before cutover, repeat exact source, manifest checksum, prepared inventory, LKG inventory, and service checks. Use the launcher from the same target SHA; do not call an older live deploy script.
4. After `Deploy OK`, perform external browser smoke and inspect API/UI/nginx health and restarts. Internal HTTP checks are necessary but do not prove external browser success. A 301 may remain cached by clients even after a server rollback; report that residual explicitly.

## External-browser failure after `Deploy OK`

Treat a failed external browser smoke as a release **FAIL**, not a deferred observation. The automatic rollback transaction has already ended, so the operator must not call the fast-forward-only launcher with the old SHA. A separate owner-approved recovery operation is required; until it is rehearsed/approved, PROMOTE remains blocked.

The verified recovery inputs on 2026-09-23 were:

- Source SHA `21259c768b3dbf2de17da9a0b676f571380c6a1b` still present in the production Git object database.
- Dedicated UI backup `/opt/clover/deployments/lkg/seo-before-a3a158c7914d82ae3d2b8abea55788126adf0124` checked against `/opt/clover/deployments/staging/prepared-21259c768b3dbf2de17da9a0b676f571380c6a1b/manifest.json`: 81 files, release `20260923HjDT6xzD`; manifest SHA-256 `f0db034cff474006b832af812d68042298265e5820fff0a9a8245e200b0afdb2`.

The manual recovery route must acquire the same `/opt/clover/deployments/deploy.lock`, reverify the old manifest and backup, require the live source to equal the newly promoted exact target SHA with no tracked drift, and preserve the failed UI tree before restoring source `21259c7…` and copying the dedicated backup into live `dist`. It must restart only `clover-api` and `clover-ui`, then verify API/UI/nginx health, assets, old UI tag, both old category URLs as 404, and the legacy product 200/RU canonical. Do not restore the database or `.env`; doing so risks losing real orders. If any recovery check fails, stop and report CRITICAL with the preserved failed UI tree. An external browser repeat is required because cached 301s may survive server recovery.

No push, PR, merge, or production PROMOTE is authorized by this document.
