# Security Stage 8 Phase 1 remediation

## Status and boundary

`PHASE 1 REMEDIATION COMPLETED / PREPARE NOT RUN / APPLY NOT RUN`.

This record includes the fail-closed production stop observed on 2026-09-25 and
the separately approved remediation completed on 2026-09-26. It does not
authorize PREPARE, APPLY, PROMOTE, restart, database access, or 1C access.

## Confirmed facts

- Live source remained at
  `fdbd39152dcaf049da974ae329412001a472114f`; tracked status was clean.
- Target inspected: `595101cf369a02a0e1c1c83e442875fa19714cee`.
- Linux fixture: `SECURITY_STAGE8_PACKAGE_A_LINUX_FIXTURE_PASS`.
- Failed inventory SHA-256:
  `de353f37eea428437d635df604742c60a54fc9b7c590245b9d084048478ab9a6`.
- PREPARE, APPLY, and PROMOTE were not run. API/UI PIDs, restart counts, health,
  UI tag, and live index/JS checksums were unchanged after the stop.
- Retry target `2566b67039ad654c0d365518ab26f27a528b100c` came from the
  GitHub PR #178 merge result. The Linux fixture passed, the privileged
  inventory gate passed 17 of 17 allowlisted objects, and the physical ACL
  report contained no extended or default ACL entries.
- Reviewed pre-apply inventory SHA-256:
  `cb1e7abb66b8a7c0e9f87efd3faf0cc4ae18c7fd9dd674d935d5fe45ec6e6952`.
- Reviewed physical ACL report SHA-256:
  `1496516c800e0fb54f31fc14676a096c4a2408e496d93fd260e8df1a52d08f14`.

## Historical blockers

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
   make discovery pass. Git export must run only as unprivileged `clover`.
   Root must never invoke Git against the `clover`-owned repository; it may only
   import regular files and accept them after comparing independently reviewed
   SHA-256 values. Run the gate as `clover` from the resulting root-owned bundle.
4. If the privileged run reveals any new sensitive path, stop and amend the
   exact allowlist through a reviewed PR. Never suppress `NOT_ALLOWLISTED`,
   `NOT_VERIFIED`, `ALLOWLIST_MISSING`, or `SYMLINK_REFUSED`.
5. `getfacl` was confirmed absent during the first attempt. Its separately
   approved installation completed before the successful ACL evidence capture.

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

After merge, obtain `APPROVED_TARGET_SHA` from the GitHub PR merge result on the
trusted operator workstation, record its source, and require the exact
40-character lowercase commit ID. Do not derive it from a production branch or
mutable production ref. The failed target `595101c...` is incident evidence,
not the retry target.

As unprivileged user `clover`, verify that the approved target is a descendant
of the observed live SHA and export only the four reviewed operator files. Git
configuration or a promisor helper can at worst run with `clover` privileges;
root never reads `.git` or invokes Git. `GIT_NO_LAZY_FETCH=1` makes missing
objects fail closed. The four literal SHA-256 values below are independent of
Git object IDs and were reviewed from the exact Git blobs in PR #178:

```bash
set -euo pipefail
umask 077
export PATH=/usr/bin:/bin
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_NO_LAZY_FETCH=1
REPO=/opt/clover/clover-app
: "${APPROVED_TARGET_SHA:?record the GitHub PR merge commit first}"
[[ "${APPROVED_TARGET_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'ERROR: APPROVED_TARGET_SHA must be exactly 40 lowercase hex characters' >&2
  exit 2
}
TARGET_SHA="${APPROVED_TARGET_SHA}"
test "${TARGET_SHA}" != 595101cf369a02a0e1c1c83e442875fa19714cee
test "$(realpath -e -- "${REPO}")" = "${REPO}"
test "$(stat -c '%U' -- "${REPO}")" = clover
test "${TARGET_SHA}" = "$(git --no-replace-objects -C "${REPO}" rev-parse "${TARGET_SHA}^{commit}")"
git --no-replace-objects -C "${REPO}" merge-base --is-ancestor \
  fdbd39152dcaf049da974ae329412001a472114f "${TARGET_SHA}"

EXPORT_ROOT="/opt/clover/worktrees/security-stage8-operator-export-${TARGET_SHA}"
test ! -e "${EXPORT_ROOT}" && test ! -L "${EXPORT_ROOT}"
install -d -m 0700 -- "${EXPORT_ROOT}"
EXPORT_DIRECTORIES=(
  "${EXPORT_ROOT}/scripts"
  "${EXPORT_ROOT}/scripts/linux"
  "${EXPORT_ROOT}/server"
  "${EXPORT_ROOT}/server/scripts"
  "${EXPORT_ROOT}/ops"
  "${EXPORT_ROOT}/ops/security-stage8"
  "${EXPORT_ROOT}/ops/security-stage8/package-a"
)
for directory in "${EXPORT_DIRECTORIES[@]}"; do
  test ! -e "${directory}" && test ! -L "${directory}"
  install -d -m 0700 -- "${directory}"
  test "$(stat -c '%U:%G:%a' -- "${directory}")" = clover:clover:700
done

export_blob() {
  repo_path="$1"
  expected_sha256="$2"
  destination="${EXPORT_ROOT}/${repo_path}"
  test "$(stat -c '%U:%G:%a' -- "$(dirname -- "${destination}")")" = \
    clover:clover:700
  git --no-replace-objects -C "${REPO}" show \
    "${TARGET_SHA}:${repo_path}" >"${destination}.tmp"
  test "$(sha256sum "${destination}.tmp" | cut -d' ' -f1)" = "${expected_sha256}"
  chmod 0400 "${destination}.tmp"
  mv "${destination}.tmp" "${destination}"
}

export_blob scripts/linux/harden-deployment-artifacts.sh \
  60016601d5dcb97996aa6a42b56049defd81fb9cd89008f1e77dcc480cf53cef
export_blob scripts/linux/security_stage8_artifact_modes.py \
  9f77dd3524146e60b12b52d2a996c9527b6401516141fea4a886404d6d2aa286
export_blob server/scripts/securityStage8InventoryGate.mjs \
  77331fdea55484b7f30dcdedfb27cd6f7aeb68d97443c509046985d03ec6b98c
export_blob ops/security-stage8/package-a/deployment-sensitive-files.allowlist \
  14d44f33ba2eab8efa923750a69fd4a426f6e7d6a6e2686673c64d734eb7dbb9
if find -P "${EXPORT_ROOT}" -type l -print -quit | grep -q .; then
  echo 'ERROR: symlink in unprivileged export' >&2
  exit 2
fi
```

Only after that unprivileged export succeeds may the interactive privileged
operator build the immutable bundle. This block contains no Git invocation and
does not read repository configuration or objects. A raced or substituted
source cannot be accepted unless its copied bytes match the independently
pinned SHA-256:

```bash
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
: "${TARGET_SHA:?paste the same approved GitHub merge commit}"
BASE=/var/lib/clover-security-stage8
TARGET_ROOT="${BASE}/${TARGET_SHA}"
BUNDLE="${TARGET_ROOT}/operator"
EVIDENCE_DIR="${TARGET_ROOT}/evidence"
EXPORT_ROOT="/opt/clover/worktrees/security-stage8-operator-export-${TARGET_SHA}"
[[ "${TARGET_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'ERROR: TARGET_SHA must be exactly 40 lowercase hex characters' >&2
  exit 2
}
test "${TARGET_SHA}" != 595101cf369a02a0e1c1c83e442875fa19714cee
test "$(realpath -e -- "${EXPORT_ROOT}")" = "${EXPORT_ROOT}"
test "$(stat -c '%U:%G:%a' -- "${EXPORT_ROOT}")" = clover:clover:700
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
BUNDLE_DIRECTORIES=(
  "${BUNDLE}"
  "${BUNDLE}/scripts"
  "${BUNDLE}/scripts/linux"
  "${BUNDLE}/server"
  "${BUNDLE}/server/scripts"
  "${BUNDLE}/ops"
  "${BUNDLE}/ops/security-stage8"
  "${BUNDLE}/ops/security-stage8/package-a"
  "${EVIDENCE_DIR}"
)
for directory in "${BUNDLE_DIRECTORIES[@]}"; do
  test ! -e "${directory}" && test ! -L "${directory}"
  install -d -o root -g clover -m 0750 -- "${directory}"
  test "$(stat -c '%U:%G:%a' -- "${directory}")" = root:clover:750
done

# Paste this reviewed bootstrap from the trusted PR view, never from a file in
# the production checkout. Isolated system Python ignores PYTHONPATH and local
# modules. Every path component is opened relative to a pinned directory fd.
/usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/python3 -I - \
  "${EXPORT_ROOT}" "${BUNDLE}" <<'PY'
import grp
import hashlib
import os
import pwd
import stat
import sys

source_root, destination_root = sys.argv[1:3]
if len(sys.argv) == 3:
    clover_uid = pwd.getpwnam("clover").pw_uid
    clover_gid = grp.getgrnam("clover").gr_gid
    destination_uid = 0
elif len(sys.argv) == 6:  # Linux fixture only; production command passes no IDs.
    clover_uid = int(sys.argv[3])
    clover_gid = int(sys.argv[4])
    destination_uid = int(sys.argv[5])
else:
    raise RuntimeError("unexpected importer arguments")
manifest = (
    ("scripts/linux/harden-deployment-artifacts.sh", 6591,
     "60016601d5dcb97996aa6a42b56049defd81fb9cd89008f1e77dcc480cf53cef", 0o550),
    ("scripts/linux/security_stage8_artifact_modes.py", 4924,
     "9f77dd3524146e60b12b52d2a996c9527b6401516141fea4a886404d6d2aa286", 0o550),
    ("server/scripts/securityStage8InventoryGate.mjs", 4398,
     "77331fdea55484b7f30dcdedfb27cd6f7aeb68d97443c509046985d03ec6b98c", 0o550),
    ("ops/security-stage8/package-a/deployment-sensitive-files.allowlist", 1270,
     "14d44f33ba2eab8efa923750a69fd4a426f6e7d6a6e2686673c64d734eb7dbb9", 0o440),
)
directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC

def require_directory(fd, uid, gid, mode):
    details = os.fstat(fd)
    if not stat.S_ISDIR(details.st_mode):
        raise RuntimeError("non-directory component")
    if (details.st_uid, details.st_gid, stat.S_IMODE(details.st_mode)) != (uid, gid, mode):
        raise RuntimeError("directory ownership or mode mismatch")

def descend(root_fd, components, uid, gid, mode):
    current = os.dup(root_fd)
    try:
        for component in components:
            following = os.open(component, directory_flags, dir_fd=current)
            require_directory(following, uid, gid, mode)
            os.close(current)
            current = following
        return current
    except BaseException:
        os.close(current)
        raise

source_root_fd = os.open(source_root, directory_flags)
destination_root_fd = os.open(destination_root, directory_flags)
require_directory(source_root_fd, clover_uid, clover_gid, 0o700)
require_directory(destination_root_fd, destination_uid, clover_gid, 0o750)

try:
    for relative_path, expected_size, expected_sha256, destination_mode in manifest:
        components = relative_path.split("/")
        source_parent_fd = descend(source_root_fd, components[:-1], clover_uid, clover_gid, 0o700)
        destination_parent_fd = descend(
            destination_root_fd, components[:-1], destination_uid, clover_gid, 0o750
        )
        source_fd = destination_fd = None
        temporary_name = components[-1] + ".tmp"
        try:
            source_fd = os.open(
                components[-1],
                os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=source_parent_fd,
            )
            source_details = os.fstat(source_fd)
            if not stat.S_ISREG(source_details.st_mode):
                raise RuntimeError("source is not a regular file")
            if (source_details.st_uid, source_details.st_gid,
                    stat.S_IMODE(source_details.st_mode), source_details.st_size) != (
                    clover_uid, clover_gid, 0o400, expected_size):
                raise RuntimeError("source ownership, mode, or size mismatch")
            destination_fd = os.open(
                temporary_name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                0,
                dir_fd=destination_parent_fd,
            )
            digest = hashlib.sha256()
            remaining = expected_size
            while remaining:
                chunk = os.read(source_fd, min(65536, remaining))
                if not chunk:
                    raise RuntimeError("source ended before expected size")
                digest.update(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(destination_fd, view)
                    view = view[written:]
                remaining -= len(chunk)
            if os.read(source_fd, 1):
                raise RuntimeError("source exceeds expected size")
            if digest.hexdigest() != expected_sha256:
                raise RuntimeError("independent SHA-256 mismatch")
            os.fsync(destination_fd)
            os.fchown(destination_fd, destination_uid, clover_gid)
            os.fchmod(destination_fd, destination_mode)
            os.close(destination_fd)
            destination_fd = None
            os.rename(
                temporary_name,
                components[-1],
                src_dir_fd=destination_parent_fd,
                dst_dir_fd=destination_parent_fd,
            )
        except BaseException:
            if destination_fd is not None:
                os.close(destination_fd)
            try:
                os.unlink(temporary_name, dir_fd=destination_parent_fd)
            except FileNotFoundError:
                pass
            raise
        finally:
            if source_fd is not None:
                os.close(source_fd)
            os.close(source_parent_fd)
            os.close(destination_parent_fd)
finally:
    os.close(source_root_fd)
    os.close(destination_root_fd)
PY
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
