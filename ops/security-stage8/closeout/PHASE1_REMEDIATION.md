# Security Stage 8 Phase 1 remediation

## Status and boundary

`BLOCKED / PLAN ONLY / NO REMEDIATION APPLIED`.

This plan records the fail-closed production stop observed on 2026-09-25. It
does not authorize deletion, unlink, chmod, chown, sudo configuration, PREPARE,
APPLY, PROMOTE, restart, database access, or 1C access. Each production mutation
below requires separate explicit owner approval after the exact target is
re-read.

## Confirmed facts

- Live source remained at
  `fdbd39152dcaf049da974ae329412001a472114f`; tracked status was clean.
- Target inspected: `595101cf369a02a0e1c1c83e442875fa19714cee`.
- Linux fixture: `SECURITY_STAGE8_PACKAGE_A_LINUX_FIXTURE_PASS`.
- Failed inventory SHA-256:
  `de353f37eea428437d635df604742c60a54fc9b7c590245b9d084048478ab9a6`.
- PREPARE, APPLY, and PROMOTE were not run. API/UI PIDs, restart counts, health,
  UI tag, and live index/JS checksums were unchanged after the stop.

## Blockers

1. The first closeout procedure placed its target worktree under the inventory
   root. The target contains tracked `.env.production`, so the inventory
   correctly emitted `NOT_ALLOWLISTED`.
2. The registered historical recovery worktree contains the symlink
   `/opt/clover/deployments/staging/ui-403-recovery-20260918T233508Z/worktree/.env.production`
   to `/opt/clover/clover-app/.env.production`; the hardener correctly emitted
   `SYMLINK_REFUSED`.
3. `/opt/clover/deployments/pr81-20260906T144723Z` and
   `/opt/clover/deployments/pr80-20260906T142643Z` are mode `0700`, owned by
   `root:root`. User `clover` cannot complete discovery. Noninteractive sudo
   and root SSH were unavailable.

## Corrected source checkout

Future target source must be a mode-`0700`, `clover:clover` worktree below the
already existing `/opt/clover/worktrees`, never below
`/opt/clover/deployments`:

```bash
SOURCE_ROOT=/opt/clover/worktrees
S8_SOURCE="${SOURCE_ROOT}/security-stage8-closeout-${TARGET_SHA}"
test "$(realpath -e -- "${SOURCE_ROOT}")" = /opt/clover/worktrees
test ! -e "${S8_SOURCE}"
git -C /opt/clover/clover-app worktree add --detach "${S8_SOURCE}" "${TARGET_SHA}"
test "$(stat -c '%a' -- "${S8_SOURCE}")" = 700
test "$(stat -c '%U:%G' -- "${S8_SOURCE}")" = clover:clover
```

## Separately approved production remediation

Before any command, repeat lstat/readlink/worktree identity checks and stop on
drift.

1. Remove only the failed Stage 8 source worktree using Git's exact registered
   worktree removal, then prove its path is absent. Do not use recursive shell
   deletion and do not prune unrelated worktrees.
2. For the historical UI recovery link, require an lstat symlink and the exact
   expected link target. After separate deletion approval, unlink that one link
   only. Do not follow it and do not remove the containing recovery worktree.
3. Use a one-time interactive privileged operator for metadata inventory. Do
   not grant persistent passwordless sudo and do not loosen directory modes to
   make discovery pass. Root must execute only a root-owned target-pinned bundle
   with every Git blob verified; never execute from the `clover`-writable source
   worktree. Run the gate as `clover` from that same root-owned bundle.
4. If the privileged run reveals any new sensitive path, stop and amend the
   exact allowlist through a reviewed PR. Never suppress `NOT_ALLOWLISTED`,
   `NOT_VERIFIED`, `ALLOWLIST_MISSING`, or `SYMLINK_REFUSED`.
5. `getfacl` was confirmed absent. ACL closure remains blocked until a separate
   owner-approved installation of the distribution ACL tooling (or an equally
   reviewed root-owned tool). Do not install a package as part of this plan.

The following guarded commands are documentation only until the owner approves
these exact production mutations:

```bash
set -euo pipefail
FAILED_SOURCE=/opt/clover/deployments/staging/security-stage8-source-595101cf369a02a0e1c1c83e442875fa19714cee
test "$(realpath -e -- "${FAILED_SOURCE}")" = "${FAILED_SOURCE}"
test "$(git -C "${FAILED_SOURCE}" rev-parse HEAD)" = 595101cf369a02a0e1c1c83e442875fa19714cee
test -z "$(git -C "${FAILED_SOURCE}" status --porcelain=v1 --untracked-files=no)"
git -C /opt/clover/clover-app worktree list --porcelain \
  | grep -Fx "worktree ${FAILED_SOURCE}"
git -C /opt/clover/clover-app worktree remove "${FAILED_SOURCE}"
test ! -e "${FAILED_SOURCE}"

RECOVERY_WT=/opt/clover/deployments/staging/ui-403-recovery-20260918T233508Z/worktree
RECOVERY_LINK="${RECOVERY_WT}/.env.production"
git -C /opt/clover/clover-app worktree list --porcelain \
  | grep -Fx "worktree ${RECOVERY_WT}"
test "$(git -C "${RECOVERY_WT}" rev-parse HEAD)" = b3f31a3fc68303655c9ddda5c81488c3c834ce04
test "$(git -C "${RECOVERY_WT}" status --porcelain=v1 --untracked-files=no)" = \
  $' T .env.production\n M vite.config.js'
test "$(sha256sum "${RECOVERY_WT}/vite.config.js" | cut -d" " -f1)" = \
  989ebf819ba38e29e4478df8478b01d3b0b963d87f6ae48097ba0035de12a0fa
test -L "${RECOVERY_LINK}"
test "$(readlink -- "${RECOVERY_LINK}")" = /opt/clover/clover-app/.env.production
unlink -- "${RECOVERY_LINK}"
test ! -e "${RECOVERY_LINK}" && test ! -L "${RECOVERY_LINK}"
test "$(git -C "${RECOVERY_WT}" status --porcelain=v1 --untracked-files=no)" = \
  $' D .env.production\n M vite.config.js'
```

After those separately approved actions, the interactive privileged operator
must build the immutable operator bundle without executing repository code:

```bash
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
REPO=/opt/clover/clover-app
BASE=/var/lib/clover-security-stage8
TARGET_ROOT="${BASE}/${TARGET_SHA}"
BUNDLE="${TARGET_ROOT}/operator"
EVIDENCE_DIR="${TARGET_ROOT}/evidence"
test "${TARGET_SHA}" = "595101cf369a02a0e1c1c83e442875fa19714cee"
test "$(realpath -e -- "${REPO}")" = "${REPO}"
test "$(stat -c '%U' -- "${REPO}")" = clover
test "${TARGET_SHA}" = "$(/usr/bin/git --no-replace-objects \
  -c safe.directory="${REPO}" -C "${REPO}" rev-parse "${TARGET_SHA}^{commit}")"
test "$(realpath -e -- /var/lib)" = /var/lib
test "$(stat -c '%U:%G:%a' -- /var/lib)" = root:root:755
test "$(id -gn clover)" = clover

# Reject both resolving and dangling links before the first privileged write.
test ! -L "${BASE}"
if test -e "${BASE}"; then
  test -d "${BASE}"
  test "$(realpath -e -- "${BASE}")" = "${BASE}"
  test "$(stat -c '%U:%G:%a' -- "${BASE}")" = root:clover:750
else
  install -d -o root -g clover -m 0750 -- "${BASE}"
fi
test ! -L "${BASE}"
test "$(realpath -e -- "${BASE}")" = "${BASE}"
test "$(stat -c '%U:%G:%a' -- "${BASE}")" = root:clover:750

test ! -L "${TARGET_ROOT}"
if test -e "${TARGET_ROOT}"; then
  test -d "${TARGET_ROOT}"
  test "$(realpath -e -- "${TARGET_ROOT}")" = "${TARGET_ROOT}"
  test "$(stat -c '%U:%G:%a' -- "${TARGET_ROOT}")" = root:clover:750
else
  install -d -o root -g clover -m 0750 -- "${TARGET_ROOT}"
fi
test ! -L "${TARGET_ROOT}"
test "$(realpath -e -- "${TARGET_ROOT}")" = "${TARGET_ROOT}"
test "$(stat -c '%U:%G:%a' -- "${TARGET_ROOT}")" = root:clover:750

test ! -e "${BUNDLE}" && test ! -L "${BUNDLE}"
test ! -e "${EVIDENCE_DIR}" && test ! -L "${EVIDENCE_DIR}"
install -d -o root -g clover -m 0750 -- \
  "${BUNDLE}/scripts/linux" \
  "${BUNDLE}/server/scripts" \
  "${BUNDLE}/ops/security-stage8/package-a" \
  "${EVIDENCE_DIR}"

install_blob() {
  repo_path="$1"
  mode="$2"
  destination="${BUNDLE}/${repo_path}"
  expected="$(/usr/bin/git --no-replace-objects \
    -c safe.directory="${REPO}" -C "${REPO}" \
    rev-parse "${TARGET_SHA}:${repo_path}")"
  /usr/bin/git --no-replace-objects \
    -c safe.directory="${REPO}" -C "${REPO}" \
    show "${TARGET_SHA}:${repo_path}" >"${destination}.tmp"
  test "$(/usr/bin/git --no-replace-objects \
    -c safe.directory="${REPO}" -C "${REPO}" \
    hash-object "${destination}.tmp")" = "${expected}"
  chown root:clover "${destination}.tmp"
  chmod "${mode}" "${destination}.tmp"
  mv "${destination}.tmp" "${destination}"
  test "$(/usr/bin/git --no-replace-objects \
    -c safe.directory="${REPO}" -C "${REPO}" \
    hash-object "${destination}")" = "${expected}"
}

install_blob scripts/linux/harden-deployment-artifacts.sh 0550
install_blob scripts/linux/security_stage8_artifact_modes.py 0550
install_blob server/scripts/securityStage8InventoryGate.mjs 0550
install_blob ops/security-stage8/package-a/deployment-sensitive-files.allowlist 0440
test "$(stat -c '%U:%G:%a' -- "${BUNDLE}")" = root:clover:750
test "$(stat -c '%U:%G:%a' -- "${EVIDENCE_DIR}")" = root:clover:750
test "$(stat -c '%U:%G:%a' -- "${BASE}")" = root:clover:750
test "$(stat -c '%U:%G:%a' -- "${TARGET_ROOT}")" = root:clover:750
```

The root shell then creates atomic root-owned evidence. The gate runs as
unprivileged `clover` from the root-owned bundle, and the evidence checksum is
verified again after the gate:

```bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
INVENTORY="${EVIDENCE_DIR}/inventory-pre.txt"
/usr/bin/bash "${BUNDLE}/scripts/linux/harden-deployment-artifacts.sh" --dry-run \
  >"${INVENTORY}.tmp"
chown root:clover "${INVENTORY}.tmp"
chmod 0440 "${INVENTORY}.tmp"
mv "${INVENTORY}.tmp" "${INVENTORY}"
sha256sum "${INVENTORY}" >"${INVENTORY}.sha256.tmp"
chown root:clover "${INVENTORY}.sha256.tmp"
chmod 0440 "${INVENTORY}.sha256.tmp"
mv "${INVENTORY}.sha256.tmp" "${INVENTORY}.sha256"
/usr/bin/sudo -u clover -- /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/node \
  "${BUNDLE}/server/scripts/securityStage8InventoryGate.mjs" --phase pre \
  --inventory "${INVENTORY}" \
  --allowlist "${BUNDLE}/ops/security-stage8/package-a/deployment-sensitive-files.allowlist" \
  >"${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp"
chown root:clover "${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp"
chmod 0440 "${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp"
mv "${EVIDENCE_DIR}/inventory-pre-gate.txt.tmp" \
  "${EVIDENCE_DIR}/inventory-pre-gate.txt"
sha256sum --check "${INVENTORY}.sha256"
```

After the separately approved ACL tool is available, capture physical ACL and
lstat metadata into another atomic root-owned artifact; never follow links:

```bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
command -v getfacl >/dev/null
ACL_REPORT="${EVIDENCE_DIR}/acl-pre.txt"
while IFS= read -r relative; do
  test -z "${relative}" && continue
  case "${relative}" in \#*) continue ;; esac
  stat -c 'LSTAT|%F|%a|%U:%G|%n' -- "/opt/clover/deployments/${relative}"
  getfacl --physical --absolute-names -- "/opt/clover/deployments/${relative}"
done < "${BUNDLE}/ops/security-stage8/package-a/deployment-sensitive-files.allowlist" \
  >"${ACL_REPORT}.tmp"
chown root:clover "${ACL_REPORT}.tmp"
chmod 0440 "${ACL_REPORT}.tmp"
mv "${ACL_REPORT}.tmp" "${ACL_REPORT}"
sha256sum "${ACL_REPORT}" >"${ACL_REPORT}.sha256.tmp"
chown root:clover "${ACL_REPORT}.sha256.tmp"
chmod 0440 "${ACL_REPORT}.sha256.tmp"
mv "${ACL_REPORT}.sha256.tmp" "${ACL_REPORT}.sha256"
```

Only a clean privileged inventory and ACL review permit off-live PREPARE. APPLY
and PROMOTE remain a later, separate approval boundary.

## Rollback of remediation actions

The failed Stage 8 worktree and launcher are reproducible from the exact Git
SHA; their removal does not alter live source or data. The historical symlink
must not be recreated as rollback because it is itself a forbidden inventory
condition. No permission rollback to broader modes is allowed. If identity or
scope differs, stop and leave production unchanged.
