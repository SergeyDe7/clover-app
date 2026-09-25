# Security Stage 8 — release closeout

## Status

**PASS — PRODUCTION APPLY, PROMOTE, POST-AUDIT, AND EXTERNAL SMOKE COMPLETE.**

This document is the operator plan and evidence contract for closing Security
Stage 8. It must not be changed to `PASS` until the production apply, deploy,
post-apply permission audit, health checks, and external smoke have all produced
recorded evidence.

Candidate source before this closeout preparation:
`f2d8083a9314adcac48ebbb64a52aeccf1abc98a` (`main`, PR #176 merge).
This SHA was a baseline, not the production deployment target. The deployed
target is the exact PR #179 merge commit
`a573e749641607a855c127e7a138966165a8050f`; it contains the closeout gate and
was addressed by immutable SHA throughout PREPARE and PROMOTE. A branch name
such as `main` was not used as the deployment target.

## Confirmed GitHub evidence (2026-09-25)

- Package A merged in PR #172 (`fdbd39152dcaf049da974ae329412001a472114f`).
- Package B merged in PR #173 (`b416bc5f1473ac40ecbad8a67aaa268c70cc4792`).
- Package C merged in PR #175 (`eccbe445cad5091b7e1601f9b72e17dc72e6d3b7`).
- Ruleset `23989349` (`S8-B main protection`) is active for `main`, has no
  bypass actor, blocks deletion and force-push, requires a pull request and
  resolved review threads, and requires strict `frontend` and `server` checks
  from GitHub Actions App `15368`.
- GitHub Actions is enabled and `sha_pinning_required=true`.
- Dependabot security updates are enabled and not paused; the open Dependabot
  alert count and open Dependabot PR count were both zero.
- Secret scanning and push protection are enabled.
- Post-merge S8-B CI for `main@f2d8083` completed successfully for both jobs.
- Closeout PR #177 merged as
  `595101cf369a02a0e1c1c83e442875fa19714cee`; both post-merge S8-B jobs passed.

These are sanitized control-plane facts. Tokens, environment values, database
contents, PII, and raw vulnerable-file contents must never be copied into the
closeout evidence.

## Observed production Phase 1 stop (2026-09-25)

The production baseline was re-read as user `clover` on host `clover`. The live
checkout remained at `fdbd39152dcaf049da974ae329412001a472114f`, with no
tracked drift; API and UI remained active with zero restarts and healthy HTTP
responses. The Linux Stage 8A fixture passed, including `openat`, `fchmod`,
`flock`, traversal, symlink, and idempotency cases.

The production inventory gate then stopped before PREPARE. Its sanitized
evidence SHA-256 is
`de353f37eea428437d635df604742c60a54fc9b7c590245b9d084048478ab9a6`.
The confirmed blockers and the separately approved remediation procedure are in
`ops/security-stage8/closeout/PHASE1_REMEDIATION.md`. Stage 8A `--apply`,
PREPARE, PROMOTE, service restart, database operation, and 1C operation were not
run.

## Production Phase 1 remediation result (2026-09-26)

PR #178 merged as `2566b67039ad654c0d365518ab26f27a528b100c` and both
required post-merge checks passed. The failed source worktree was removed by
Git's exact registered-worktree operation, and only the confirmed historical
`.env.production` symlink was unlinked. The protected target worktree passed
the complete Linux Stage 8A fixture.

The root-owned operator bundle independently matched all four pinned SHA-256
values. The pre-apply inventory gate passed all 17 allowlisted objects with
inventory SHA-256
`cb1e7abb66b8a7c0e9f87efd3faf0cc4ae18c7fd9dd674d935d5fe45ec6e6952`.
The physical ACL report covered the same 17 objects, contained no extended or
default ACL entry, and has SHA-256
`1496516c800e0fb54f31fc14676a096c4a2408e496d93fd260e8df1a52d08f14`.
The live checkout remained at
`fdbd39152dcaf049da974ae329412001a472114f`; tracked status, service PIDs,
restart counters, and HTTP health remained unchanged. PREPARE, APPLY, and
PROMOTE were not run.

## Production completion result (2026-09-26)

PR #179 merged as `a573e749641607a855c127e7a138966165a8050f` and both
required checks passed. The four privileged operator files from the pinned
`2566b67039ad654c0d365518ab26f27a528b100c` bundle had the same Git object IDs
as the deployed target. The immutable prepared artifact was created at
`/opt/clover/deployments/staging/prepared-a573e749641607a855c127e7a138966165a8050f`.
Its 83-file manifest has SHA-256
`e20fe30c7beaea6996f70f62a0fada436e6c3785909115264fdc3e1f1efe5728`;
its verified contract fields are `expectedLocaleStamp=enabled` and
`expectedMetrikaEnabled=on`.

Immediately before mutation, the previous UI was copied to the mode-`0700`
last-known-good directory
`/opt/clover/deployments/lkg/security-stage8-20260925T212649Z-fdbd39152dcaf049da974ae329412001a472114f`.
Its 82-file manifest has SHA-256
`8d40177ab7be68b51b541a68fb8b755df2dce4e3b9cb05fe359f02e03a92157c`.

The approved hardening apply passed. The post-apply inventory has SHA-256
`cb1e7abb66b8a7c0e9f87efd3faf0cc4ae18c7fd9dd674d935d5fe45ec6e6952`;
all 17 allowlisted regular files are mode `0600`. The physical ACL report has
SHA-256 `1496516c800e0fb54f31fc14676a096c4a2408e496d93fd260e8df1a52d08f14`
and contains no extended or default ACL entry.

PROMOTE deployed the exact target with UI release `ui-20260925I49u0uCM` and
bundle `/assets/20260925I49u0uCM/index-B8UmCG9p.js`. The tracked production tree
was clean. API, origin UI, and nginx returned HTTP 200; service restart counters
remained zero. Asset/MIME, prepared-manifest verification, sitemap, and SEO-004
origin/nginx probes passed. The sitemap contained 5,299 URLs and has SHA-256
`7f58b6a72bd5825b58c1df0d07fe79ca18251e78d3099c17f5c1800e560dc0ec`.

External browser smoke passed at desktop `1280x720` and mobile `390x844`.
The expected Russian category H1 and products rendered, the mobile page had no
horizontal overflow, and the browser produced no warning or error console
entries. Application rollback remained available and was not used. Permission
rollback is intentionally forbidden. No residual item remains unverified.

Do not infer any of these values from an older closeout. Record them again in
the result file derived from
`ops/security-stage8/closeout/result-template.json`.

## Phase 1 — read-only baseline and off-live PREPARE

Run only from the confirmed production host and keep TEST/production separate.
Stop before any write when the active service paths do not resolve to
`/opt/clover/clover-app`.

1. Record `hostname`, UTC time, service `FragmentPath`, `User`, `ExecStart`,
   `MainPID`, `NRestarts`, `ActiveState`, and `SubState` for `clover-api` and
   `clover-ui`; record `/proc/<pid>/cwd`, `/proc/<pid>/exe`, and listeners on
   ports `4100` and `5273`.
2. Record live `HEAD`, tracked status, API health, origin UI response, nginx
   HTTPS response, UI release tag, main JS bundle, and their checksums. Do not
   read or copy `.env`, SQLite, WAL, SHM, archive, or backup contents.
3. Record `TARGET_SHA` from the merged closeout PR returned by GitHub on the
   trusted operator workstation; never derive it from a production branch or
   mutable production ref. Fetch that exact object without resetting the live
   checkout. As unprivileged `clover`, verify it is a fast-forward descendant
   of the observed live SHA. Create a protected,
   detached target checkout and bootstrap the launcher from the same Git object:

   ```bash
   umask 077
   ROOT=/opt/clover/clover-app
   SOURCE_ROOT=/opt/clover/worktrees
   STAGING=/opt/clover/deployments/staging
   S8_SOURCE="${SOURCE_ROOT}/security-stage8-closeout-${TARGET_SHA}"
   DELIVERED="${STAGING}/delivered-deploy-${TARGET_SHA}"
   test "$(realpath -e -- "${SOURCE_ROOT}")" = /opt/clover/worktrees
   test ! -e "${S8_SOURCE}"
   git -C "${ROOT}" worktree add --detach "${S8_SOURCE}" "${TARGET_SHA}"
   test "$(git -C "${S8_SOURCE}" rev-parse HEAD)" = "${TARGET_SHA}"
   test -z "$(git -C "${S8_SOURCE}" status --porcelain=v1 --untracked-files=no)"
   test "$(stat -c '%a' -- "${S8_SOURCE}")" = 700
   test "$(stat -c '%U:%G' -- "${S8_SOURCE}")" = clover:clover
   install -d -m 700 "${DELIVERED}"
   git -C "${ROOT}" show "${TARGET_SHA}:scripts/linux/run-target-deploy.sh" \
     >"${DELIVERED}/run-target-deploy.sh.tmp"
   test "$(git -C "${ROOT}" rev-parse "${TARGET_SHA}:scripts/linux/run-target-deploy.sh")" \
     = "$(git -C "${ROOT}" hash-object "${DELIVERED}/run-target-deploy.sh.tmp")"
   chmod 700 "${DELIVERED}/run-target-deploy.sh.tmp"
   mv "${DELIVERED}/run-target-deploy.sh.tmp" "${DELIVERED}/run-target-deploy.sh"
   ```

4. From `${S8_SOURCE}`, run the complete Linux fixture:

   ```bash
   bash scripts/linux/verify-security-stage8-package-a.sh
   ```

5. Before retrying inventory, complete every separately approved action in
   `PHASE1_REMEDIATION.md`. A privileged metadata operator is required because
   the unprivileged production identity cannot traverse two historical roots.
   Unprivileged `clover` must first export the four operator files for the
   externally approved merge SHA. The privileged operator then imports them
   into a root-owned bundle only after all copied bytes match the four literal,
   independently reviewed SHA-256 values in `PHASE1_REMEDIATION.md`. Root must
   never invoke Git or read `.git`. Never execute privileged code from
   `${S8_SOURCE}`. The
   inventory and gate receipts are root-owned, group-restricted to `clover`,
   and atomically published evidence:

   ```bash
   # Run only inside the separately approved interactive root shell.
   set -euo pipefail
   umask 077
   export PATH=/usr/sbin:/usr/bin:/sbin:/bin
   ROOT_BUNDLE="/var/lib/clover-security-stage8/${TARGET_SHA}/operator"
   EVIDENCE_DIR="/var/lib/clover-security-stage8/${TARGET_SHA}/evidence"
   INVENTORY="${EVIDENCE_DIR}/inventory-pre.txt"
   test "$(stat -c '%U:%G:%a' -- "${ROOT_BUNDLE}")" = root:clover:750
   test "$(stat -c '%U:%G:%a' -- "${EVIDENCE_DIR}")" = root:clover:750
   /usr/bin/bash "${ROOT_BUNDLE}/scripts/linux/harden-deployment-artifacts.sh" --dry-run \
     >"${INVENTORY}.tmp"
   chown root:clover "${INVENTORY}.tmp"
   chmod 0440 "${INVENTORY}.tmp"
   mv "${INVENTORY}.tmp" "${INVENTORY}"
   sha256sum "${INVENTORY}" >"${INVENTORY}.sha256.tmp"
   chown root:clover "${INVENTORY}.sha256.tmp"
   chmod 0440 "${INVENTORY}.sha256.tmp"
   mv "${INVENTORY}.sha256.tmp" "${INVENTORY}.sha256"
   /usr/bin/sudo -u clover -- /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/node \
     "${ROOT_BUNDLE}/server/scripts/securityStage8InventoryGate.mjs" --phase pre \
     --inventory "${INVENTORY}" \
     --allowlist "${ROOT_BUNDLE}/ops/security-stage8/package-a/deployment-sensitive-files.allowlist" \
     >"${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp"
   chown root:clover "${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp"
   chmod 0440 "${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp"
   mv "${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp" \
     "${EVIDENCE_DIR}/inventory-pre-gate.txt"
   sha256sum --check "${INVENTORY}.sha256"
   sha256sum "${EVIDENCE_DIR}/inventory-pre-gate.txt"
   ```

   Exit code zero from the hardener is not sufficient. The inventory gate fails
   closed on every `NOT_ALLOWLISTED`, `NOT_VERIFIED`, `ALLOWLIST_MISSING`, or
   `SYMLINK_REFUSED` row, missing allowlisted path, or duplicate classification.
   Review every row and effective ACL separately; POSIX mode output does not
   prove ACL isolation.
6. Run the target-pinned deployment prerequisite dry-run and then build the
   immutable off-live artifact:

   ```bash
   CLOVER_DEPLOY_ROOT=/opt/clover/clover-app CLOVER_DEPLOY_DRY_RUN=1 \
     bash /opt/clover/deployments/staging/delivered-deploy-${TARGET_SHA}/run-target-deploy.sh "${TARGET_SHA}"
   CLOVER_DEPLOY_ROOT=/opt/clover/clover-app \
     bash /opt/clover/deployments/staging/delivered-deploy-${TARGET_SHA}/run-target-deploy.sh prepare "${TARGET_SHA}"
   ```

7. Record the prepared directory, manifest SHA-256, release ID, locale flag,
   Metrika expectation, and rollback baseline SHA/tag/bundle. PREPARE must leave
   live source, live `dist`, and both services unchanged.

Phase 1 may create a protected staging artifact, but it must not chmod the
historical targets, switch the live checkout or UI, or restart services.

## Approval boundary

Stop after Phase 1 and request separate explicit approval for both production
file-mode hardening and live PROMOTE. Approval to prepare is not approval to
apply, deploy, restart services, change databases, or touch 1C.

## Phase 2 — approved APPLY and PROMOTE

1. Re-read the production identity, exact live SHA/status, services, health,
   prepared manifest SHA-256, and deploy lock immediately before mutation.
   Create a timestamped, mode-`0700` copy of the current UI before PROMOTE and
   record file hashes without copying any `.env`, SQLite, WAL, or SHM file:

   ```bash
   UTC="$(date -u +%Y%m%dT%H%M%SZ)"
   PREV_SHA="$(git -C /opt/clover/clover-app rev-parse HEAD)"
   BACKUP="/opt/clover/deployments/lkg/security-stage8-${UTC}-${PREV_SHA}"
   install -d -m 700 "${BACKUP}"
   cp -a -- /opt/clover/clover-app/dist "${BACKUP}/pre-dist"
   if find -P "${BACKUP}/pre-dist" \
     \( -name '.env*' -o -name '*.sqlite*' -o -name '*.db*' \) -print -quit \
     | grep -q .; then
     echo 'ERROR: sensitive filename in UI backup' >&2
     exit 1
   fi
   find -P "${BACKUP}/pre-dist" -type f -print0 | sort -z \
     | xargs -0 sha256sum >"${BACKUP}/FILES.sha256"
   chmod 600 "${BACKUP}/FILES.sha256"
   ```

2. Re-run the Stage 8A dry-run from `${ROOT_BUNDLE}` with the same privileged
   metadata operator and require its sanitized
   output SHA-256 to equal the reviewed Phase 1 inventory checksum. Under the
   shared deployment lock, run from that exact target-pinned root-owned bundle:

   ```bash
   /usr/bin/bash "${ROOT_BUNDLE}/scripts/linux/harden-deployment-artifacts.sh" --apply
   ```

3. Repeat the metadata inventory into a new post-apply file, gate that exact
   file as phase `post`, and record its SHA-256 separately:

   ```bash
   POST_INVENTORY="${EVIDENCE_DIR}/inventory-post.txt"
   /usr/bin/bash "${ROOT_BUNDLE}/scripts/linux/harden-deployment-artifacts.sh" --dry-run \
     >"${POST_INVENTORY}.tmp"
   chown root:clover "${POST_INVENTORY}.tmp"
   chmod 0440 "${POST_INVENTORY}.tmp"
   mv "${POST_INVENTORY}.tmp" "${POST_INVENTORY}"
   /usr/bin/sudo -u clover -- /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/node \
     "${ROOT_BUNDLE}/server/scripts/securityStage8InventoryGate.mjs" --phase post \
     --inventory "${POST_INVENTORY}" \
     --allowlist "${ROOT_BUNDLE}/ops/security-stage8/package-a/deployment-sensitive-files.allowlist" \
     >"${EVIDENCE_DIR}/inventory-post-gate.txt.tmp"
   chown root:clover "${EVIDENCE_DIR}/inventory-post-gate.txt.tmp"
   chmod 0440 "${EVIDENCE_DIR}/inventory-post-gate.txt.tmp"
   mv "${EVIDENCE_DIR}/inventory-post-gate.txt.tmp" \
     "${EVIDENCE_DIR}/inventory-post-gate.txt"
   sha256sum "${POST_INVENTORY}"
   sha256sum "${EVIDENCE_DIR}/inventory-post-gate.txt"
   ```

   The post gate requires every allowlisted regular file to report mode `0600`.
   Effective ACL review must separately show no unrelated access. Preserve any
   successfully hardened `0600` modes if a later target fails.
4. The hardener releases the shared lock before PROMOTE; this is not one atomic
   lock transaction. Re-read identity, live SHA/status, services, health,
   post-apply inventory, prepared manifest checksum, and lock state again.
   Only after Stage 8A passes without drift, promote the prepared artifact:

   ```bash
   CLOVER_DEPLOY_ROOT=/opt/clover/clover-app \
     bash /opt/clover/deployments/staging/delivered-deploy-${TARGET_SHA}/run-target-deploy.sh \
       promote "${PREPARED_PATH}" "${TARGET_SHA}"
   ```

5. Verify exact live SHA, clean tracked status, API/UI service state and restart
   counts, API health, origin and nginx assets/MIME, live tag/bundle, sitemap,
   the three SEO-004 category routes, and desktop/mobile external browser smoke.
   No real order or 1C action is part of this closeout.

## Stop conditions

Stop without PROMOTE when any of the following is observed:

- repository, target SHA, active process path, unit path, or environment differs;
- tracked production drift or a non-fast-forward target;
- deploy lock contention;
- Stage 8A fixture failure, unexpected inventory row, missing target, symlink,
  Python identity mismatch, owner mismatch, or unresolved ACL access;
- prepared manifest/checksum/locale/Metrika mismatch;
- backup/LKG evidence is missing;
- health, asset, MIME, sitemap, or browser smoke is not clean.

## Completion rule

Change this document to `PASS` only after the sanitized result contains the
exact target and previous SHA, timestamps, manifest/checksums, Stage 8A
dry-run/apply/post-apply summaries, Linux fixture result, service and health
evidence, external smoke result, and residual `NOT VERIFIED` items. Deployment
rollback and the intentionally forbidden permission rollback are documented in
`ops/security-stage8/closeout/ROLLBACK.md`.
The human-readable receipt must be saved as
`ops/security-stage8/closeout/INSTALL_RESULT.txt`; the JSON template is the
machine-readable companion, not a replacement for that receipt.
