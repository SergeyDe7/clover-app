# Stage 5 A–C promotion and rollback contract

This file is an operator contract, not permission to run it. Promote one
package at a time. Never run A, B, and C in parallel. `ARTIFACT`, `RECOVERY`,
and `EXPECTED_SHA` must be explicit absolute values recorded in the change
ticket. The recovery directory must be outside the live repository.

Before every package:

```bash
sudo install -d -m 0700 "$RECOVERY"
git -C /opt/clover/clover-app cat-file -e "$EXPECTED_SHA^{commit}"
git -C /opt/clover/clover-app show \
  "$EXPECTED_SHA:server/scripts/securityStage5Artifact.mjs" \
  | sudo tee "$RECOVERY/securityStage5Artifact-$EXPECTED_SHA.mjs" >/dev/null
sudo chmod 0500 "$RECOVERY/securityStage5Artifact-$EXPECTED_SHA.mjs"
sudo node "$RECOVERY/securityStage5Artifact-$EXPECTED_SHA.mjs" verify \
  --artifact "$ARTIFACT" --expected-sha "$EXPECTED_SHA" \
  --source-root /opt/clover/clover-app
```

For every destination file, save the previous file with `cp --preserve=all`. If
the destination does not exist, create a same-name `.absent` marker in
`RECOVERY`. Rollback restores the saved file, or removes only that exact
destination when its `.absent` marker exists. Never use a wildcard.

Destination directories for Packages A–C are:

- `/etc/systemd/system/clover-api.service.d`
- `/etc/systemd/system/clover-ui.service.d`
- `/etc/ssh/sshd_config.d`
- `/etc/nginx/snippets`

Do not run `install -d -m 0755` on those paths. GNU `install -d -m MODE`
changes the mode of an existing directory. Production already has
`/etc/systemd/system/clover-api.service.d` as `root:root` mode `0700`. Existing
directory owner, group, and mode must stay unchanged. If a path exists and is
not a directory, fail before installing files. Create a missing directory with
mode `0755` only, record `$RECOVERY/<key>.dir-created` only after a successful
create, and on rollback `rmdir` that exact directory after file restore. If
`rmdir` fails because the directory is not empty, stop, keep the marker, and do
not delete leftover entries. Directory recovery keys are unique per package and
path; Packages A and C must not share a marker for
`/etc/systemd/system/clover-ui.service.d`. Never chmod, chown, use a wildcard,
or recursively remove these directories. Helpers must `exit 1` on error and
must not rely on the caller's `set -e`.

Use these helpers with an explicit destination and a recovery key that is unique
across every package. They record a SHA-256 for every existing pre-state file
and distinguish an absent file from an empty file:

```bash
backup_exact() {
  destination="$1"
  key="$2"
  if sudo test -e "$destination"; then
    sudo cp --preserve=all -- "$destination" "$RECOVERY/$key"
    sudo sha256sum "$RECOVERY/$key" | sudo tee "$RECOVERY/$key.sha256" >/dev/null
  else
    sudo touch "$RECOVERY/$key.absent"
  fi
}

restore_exact() {
  destination="$1"
  key="$2"
  if sudo test -e "$RECOVERY/$key.absent"; then
    sudo rm -f -- "$destination"
  else
    (cd "$RECOVERY" && sudo sha256sum -c "$key.sha256")
    sudo cp --preserve=all -- "$RECOVERY/$key" "$destination"
  fi
}

ensure_destination_dir() {
  destination="$1"
  key="$2"
  mode="$3"
  marker="$RECOVERY/$key.dir-created"
  if [ "$mode" != "0755" ]; then
    echo "FAIL: directory create mode must be 0755, got $mode" >&2
    exit 1
  fi
  if sudo test -e "$marker"; then
    echo "FAIL: recovery marker already exists for $key" >&2
    exit 1
  fi
  if sudo test -L "$destination"; then
    echo "FAIL: $destination exists and is a symlink" >&2
    exit 1
  fi
  if sudo test -e "$destination"; then
    if sudo test -d "$destination"; then
      return 0
    fi
    echo "FAIL: $destination exists and is not a directory" >&2
    exit 1
  fi
  if ! sudo install -d -m "$mode" -- "$destination"; then
    echo "FAIL: could not create directory $destination" >&2
    exit 1
  fi
  if ! sudo touch -- "$marker"; then
    echo "FAIL: could not write directory marker $marker" >&2
    sudo rmdir -- "$destination"
    exit 1
  fi
  if ! sudo test -e "$marker"; then
    echo "FAIL: directory marker missing after create $marker" >&2
    sudo rmdir -- "$destination"
    exit 1
  fi
}

rollback_created_dir() {
  destination="$1"
  key="$2"
  marker="$RECOVERY/$key.dir-created"
  if ! sudo test -e "$marker"; then
    return 0
  fi
  if ! sudo rmdir -- "$destination"; then
    echo "FAIL: $destination is not empty or not a directory; leftover entries were not deleted; marker kept" >&2
    exit 1
  fi
  if ! sudo rm -f -- "$marker"; then
    echo "FAIL: could not remove directory marker $marker after rmdir" >&2
    exit 1
  fi
}
```

## Package A — systemd and retention dry-run

Use only the source-controlled operator
`ops/security-stage5/scripts/promote-package-a.sh` from the accepted artifact.
It requires a real TTY, one interactive `sudo -v`, then one root shell. Do not
run `/opt/clover/deployments/staging/package-a-promote-retry.sh`.

The operator extracts the verifier with
`git -C /opt/clover/clover-app show "$EXPECTED_SHA:server/scripts/securityStage5Artifact.mjs"`
into the new recovery directory. A pre-placed `.verifier-*.mjs` is forbidden.

Exact destinations:

- `/etc/systemd/system/clover-api.service.d/20-hardening.conf`
- `/etc/systemd/system/clover-ui.service.d/20-hardening.conf`
- `/etc/systemd/system/clover-audit-retention.timer`

`/etc/systemd/system/clover-api.service.d/10-umask.conf` is **not** a
destination. Record owner/group/mode/size and SHA-256 as evidence only. Never
install, chmod, chown, delete, or restore it. After promote and after rollback
the evidence SHA must be unchanged. Restoring a file the operator did not
change is forbidden.

Backup calls:

```bash
backup_exact /etc/systemd/system/clover-api.service.d/20-hardening.conf api-20-hardening.conf
backup_exact /etc/systemd/system/clover-ui.service.d/20-hardening.conf ui-20-hardening.conf
backup_exact /etc/systemd/system/clover-audit-retention.timer audit-retention.timer
```

Capture before install:

```bash
systemctl show clover-api.service clover-ui.service \
  -p Id -p ActiveState -p MainPID -p NRestarts -p ExecStart -p WorkingDirectory
systemctl show clover-audit-retention.timer \
  -p ActiveState -p UnitFileState -p NextElapseUSecRealtime -p FragmentPath
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:4100/api/health
```

Capture API `releaseId`/`version` and the live UI tag/html SHA from pre-state.
After API→health then UI→health, those identities must be unchanged. Package A
must not change the UI build.

Timer backup and hashes must be complete before the first change. The first
change is `systemctl stop clover-audit-retention.timer`. Apply and dry-run
units must stay inactive. Install the three destinations only after that stop.
The installed timer `Unit=` must be `clover-audit-retention-dry-run.service`.
Never start `clover-audit-retention-apply.service`.

After exact-file backups, stop the timer, ensure destination directories
without changing existing metadata, then install:

```bash
sudo systemctl stop clover-audit-retention.timer
ensure_destination_dir /etc/systemd/system/clover-api.service.d a-dir-clover-api.service.d 0755
ensure_destination_dir /etc/systemd/system/clover-ui.service.d a-dir-clover-ui.service.d 0755
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-a/systemd/clover-api.service.d/20-hardening.conf" \
  /etc/systemd/system/clover-api.service.d/20-hardening.conf
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-a/systemd/clover-ui.service.d/20-hardening.conf" \
  /etc/systemd/system/clover-ui.service.d/20-hardening.conf
sudo install -m 0644 \
  "$ARTIFACT/ops/systemd/clover-audit-retention.timer" \
  /etc/systemd/system/clover-audit-retention.timer
sudo systemd-analyze verify \
  /etc/systemd/system/clover-api.service \
  /etc/systemd/system/clover-ui.service \
  /etc/systemd/system/clover-audit-retention.timer
sudo systemctl daemon-reload
sudo systemctl restart clover-api.service
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:4100/api/health
sudo systemctl restart clover-ui.service
curl -fsS -o /dev/null --connect-timeout 2 --max-time 5 http://127.0.0.1:5273/
sudo systemctl start clover-audit-retention.timer
systemctl show clover-audit-retention.timer -p ActiveState -p NextElapseUSecRealtime
```

nginx is read-only: record PID and HTTPS health. Do not restart or reload
nginx. Packages B–D, orphan listeners, checkout, application, database,
uploads, backups, and 1C stay untouched.

Promote failure after the first change exits `40` when rollback completes and
`41` when rollback is incomplete. Unexpected errors before the first change
keep the original exit code and must not roll back. `INT`/`TERM` after
`CHANGED=1` must roll back.

Rollback restores or removes the three exact destinations according to their
backups/`.absent` markers, then removes only directories this package created,
then runs:

```bash
sudo systemctl stop clover-audit-retention.timer
restore_exact /etc/systemd/system/clover-api.service.d/20-hardening.conf api-20-hardening.conf
restore_exact /etc/systemd/system/clover-ui.service.d/20-hardening.conf ui-20-hardening.conf
restore_exact /etc/systemd/system/clover-audit-retention.timer audit-retention.timer
rollback_created_dir /etc/systemd/system/clover-api.service.d a-dir-clover-api.service.d
rollback_created_dir /etc/systemd/system/clover-ui.service.d a-dir-clover-ui.service.d
sudo systemctl daemon-reload
sudo systemctl restart clover-api.service
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:4100/api/health
sudo systemctl restart clover-ui.service
curl -fsS -o /dev/null --connect-timeout 2 --max-time 5 http://127.0.0.1:5273/
sudo systemctl start clover-audit-retention.timer
```

Rollback restores the exact pre-state timer, including `Unit=`. If that
pre-state targeted `clover-audit-retention-apply.service`, record residual:
apply was not started by the operator; the restored timer is the previous
host state, not the promoted dry-run target. Never restore
`10-umask.conf`.

Stopping orphan listeners and changing isolated SQLite modes are not included
in this install. They require a separate runtime plan with exact PID start time,
UID, executable, cwd, cgroup, port, inode, owner, group, and original mode.

## Package B — SSH

Exact destination:

- `/etc/ssh/sshd_config.d/50-clover-security.conf`

Backup call:

```bash
backup_exact /etc/ssh/sshd_config.d/50-clover-security.conf ssh-50-clover-security.conf
```

Keep the original SSH session and a second independently opened public-key
session alive through installation and postcheck. Record whether the exact
destination existed and back it up or create its `.absent` marker.

Before install, capture the effective values for the actual operator source IP:

```bash
sudo /usr/sbin/sshd -T -C user=clover,host=clover,addr="$OPERATOR_SOURCE_IP" \
  | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods|maxauthtries|maxsessions|logingracetime) '
```

Install and validate without closing either recovery session:

```bash
ensure_destination_dir /etc/ssh/sshd_config.d b-dir-sshd_config.d 0755
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-b/sshd/50-clover-security.conf" \
  /etc/ssh/sshd_config.d/50-clover-security.conf
sudo /usr/sbin/sshd -t
sudo /usr/sbin/sshd -T -C user=clover,host=clover,addr="$OPERATOR_SOURCE_IP" \
  | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods|maxauthtries|maxsessions|logingracetime) '
sudo systemctl reload ssh.service
```

Open a third independent public-key SSH session after reload. Expected effective
values are root/password/keyboard-interactive disabled and
`authenticationmethods publickey`.

On any failure, restore the exact previous file or remove only
`/etc/ssh/sshd_config.d/50-clover-security.conf` when its `.absent` marker was
recorded, then `rmdir` `/etc/ssh/sshd_config.d` only when this package created
it:

```bash
restore_exact /etc/ssh/sshd_config.d/50-clover-security.conf ssh-50-clover-security.conf
rollback_created_dir /etc/ssh/sshd_config.d b-dir-sshd_config.d
```

From an already-open recovery session run `sshd -t`, reload
`ssh.service`, and prove another new public-key session.

## Package C — nginx and UI loopback

Exact destinations:

- `/etc/systemd/system/clover-ui.service.d/30-loopback.conf`
- `/etc/nginx/snippets/clover-security-headers.conf`
- `/etc/nginx/sites-enabled/clover-spb.ru`

Backup calls:

```bash
backup_exact /etc/systemd/system/clover-ui.service.d/30-loopback.conf ui-30-loopback.conf
backup_exact /etc/nginx/snippets/clover-security-headers.conf nginx-security-headers.conf
backup_exact /etc/nginx/sites-enabled/clover-spb.ru nginx-clover-spb.ru.conf
```

Back up or mark absent for all three destinations. Capture UI PID/NRestarts,
`ss -lntp`, HTTPS health, root HTML, and one hashed UI asset before install.

Install and validate in this order:

```bash
ensure_destination_dir /etc/systemd/system/clover-ui.service.d c-dir-clover-ui.service.d 0755
ensure_destination_dir /etc/nginx/snippets c-dir-nginx-snippets 0755
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-c/systemd/clover-ui.service.d/30-loopback.conf" \
  /etc/systemd/system/clover-ui.service.d/30-loopback.conf
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-c/nginx/clover-security-headers.conf" \
  /etc/nginx/snippets/clover-security-headers.conf
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-c/nginx/clover-spb.ru.conf" \
  /etc/nginx/sites-enabled/clover-spb.ru
sudo /usr/sbin/nginx -t
sudo systemctl daemon-reload
sudo systemctl restart clover-ui.service
curl -fsS -o /dev/null --connect-timeout 2 --max-time 5 http://127.0.0.1:5273/
sudo systemctl reload nginx.service
curl -fsS --connect-timeout 3 --max-time 10 https://clover-spb.ru/api/health
```

Postcheck requires `127.0.0.1:5273` with no `0.0.0.0:5273`, HTTPS root and
health, security headers on root/assets/uploads, a non-cached synthetic 404,
HTTP/2 negotiation, exact UI tag, and external desktop/mobile smoke.

On any failure, restore/remove all three exact destinations from the recorded
pre-state, run `nginx -t`, `systemctl daemon-reload`, restart UI, reload nginx,
then repeat local health and external smoke. API bind `:4100`, 1C settings, and
firewall are never changed by Package C.

Exact rollback starts with:

```bash
restore_exact /etc/systemd/system/clover-ui.service.d/30-loopback.conf ui-30-loopback.conf
restore_exact /etc/nginx/snippets/clover-security-headers.conf nginx-security-headers.conf
restore_exact /etc/nginx/sites-enabled/clover-spb.ru nginx-clover-spb.ru.conf
rollback_created_dir /etc/systemd/system/clover-ui.service.d c-dir-clover-ui.service.d
rollback_created_dir /etc/nginx/snippets c-dir-nginx-snippets
sudo /usr/sbin/nginx -t
sudo systemctl daemon-reload
sudo systemctl restart clover-ui.service
sudo systemctl reload nginx.service
curl -fsS --connect-timeout 3 --max-time 10 https://clover-spb.ru/api/health
```
