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

For every destination, save the previous file with `cp --preserve=all`. If the
destination does not exist, create a same-name `.absent` marker in `RECOVERY`.
Rollback restores the saved file, or removes only that exact destination when
its `.absent` marker exists. Never use a wildcard.

Use these helpers with an explicit destination and unique recovery key. They
record a SHA-256 for every existing pre-state file and distinguish an absent
file from an empty file:

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
```

## Package A — systemd and retention dry-run

Exact destinations:

- `/etc/systemd/system/clover-api.service.d/20-hardening.conf`
- `/etc/systemd/system/clover-ui.service.d/20-hardening.conf`
- `/etc/systemd/system/clover-audit-retention.timer`

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

After exact-file backups, install:

```bash
sudo install -d -m 0755 /etc/systemd/system/clover-api.service.d
sudo install -d -m 0755 /etc/systemd/system/clover-ui.service.d
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-a/systemd/clover-api.service.d/20-hardening.conf" \
  /etc/systemd/system/clover-api.service.d/20-hardening.conf
sudo install -m 0644 \
  "$ARTIFACT/ops/security-stage5/package-a/systemd/clover-ui.service.d/20-hardening.conf" \
  /etc/systemd/system/clover-ui.service.d/20-hardening.conf
sudo systemctl stop clover-audit-retention.timer
sudo install -m 0644 \
  "$ARTIFACT/ops/systemd/clover-audit-retention.timer" \
  /etc/systemd/system/clover-audit-retention.timer
sudo systemctl daemon-reload
sudo systemctl restart clover-api.service
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:4100/api/health
sudo systemctl restart clover-ui.service
curl -fsS -o /dev/null --connect-timeout 2 --max-time 5 http://127.0.0.1:5273/
sudo systemctl start clover-audit-retention.timer
systemctl show clover-audit-retention.timer -p ActiveState -p NextElapseUSecRealtime
```

Rollback restores or removes the three exact destinations according to their
backups/`.absent` markers, then runs:

```bash
sudo systemctl stop clover-audit-retention.timer
restore_exact /etc/systemd/system/clover-api.service.d/20-hardening.conf api-20-hardening.conf
restore_exact /etc/systemd/system/clover-ui.service.d/20-hardening.conf ui-20-hardening.conf
restore_exact /etc/systemd/system/clover-audit-retention.timer audit-retention.timer
sudo systemctl daemon-reload
sudo systemctl restart clover-api.service
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:4100/api/health
sudo systemctl restart clover-ui.service
curl -fsS -o /dev/null --connect-timeout 2 --max-time 5 http://127.0.0.1:5273/
sudo systemctl start clover-audit-retention.timer
```

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
sudo install -d -m 0755 /etc/ssh/sshd_config.d
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
recorded:

```bash
restore_exact /etc/ssh/sshd_config.d/50-clover-security.conf ssh-50-clover-security.conf
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
sudo install -d -m 0755 /etc/systemd/system/clover-ui.service.d
sudo install -d -m 0755 /etc/nginx/snippets
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
sudo /usr/sbin/nginx -t
sudo systemctl daemon-reload
sudo systemctl restart clover-ui.service
sudo systemctl reload nginx.service
curl -fsS --connect-timeout 3 --max-time 10 https://clover-spb.ru/api/health
```
