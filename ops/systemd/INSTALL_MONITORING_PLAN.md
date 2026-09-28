# Clover monitor installation plan (not executable)

This is a reviewed command plan, not an installer. Do not execute it without a
fresh backup and explicit owner approval. Replace `<STATUS_SOURCE>`,
`<HMAC_KEY_SOURCE>`, `<API_ENV_SOURCE>` and `<API_ENV_TARGET>` with
root-readable files; never paste the key into a shell history or report. Record
whether the `clover-monitor` user and group existed before installation so
rollback can preserve pre-existing accounts.

## Preflight and install

```text
getent group clover-monitor || groupadd --system clover-monitor
id clover-monitor || useradd --system --gid clover-monitor --home-dir /nonexistent --shell /usr/sbin/nologin clover-monitor
install -d -o root -g clover-monitor -m 0750 /etc/clover
install -o root -g clover-monitor -m 0640 <STATUS_SOURCE> /etc/clover/monitor-status.env
install -o root -g clover-monitor -m 0640 <HMAC_KEY_SOURCE> /etc/clover/monitor-status.hmac
install -d -o root -g root -m 0755 /usr/lib/clover-monitor/server/scripts
install -d -o root -g root -m 0755 /usr/lib/clover-monitor/server/src/monitoring
install -o root -g root -m 0644 server/package.json /usr/lib/clover-monitor/server/package.json
install -o root -g root -m 0644 server/scripts/clover-monitor.mjs /usr/lib/clover-monitor/server/scripts/clover-monitor.mjs
install -o root -g root -m 0644 server/src/runtimeKillSwitches.js /usr/lib/clover-monitor/server/src/runtimeKillSwitches.js
install -o root -g root -m 0644 server/src/monitoring/*.js /usr/lib/clover-monitor/server/src/monitoring/
install -o root -g root -m 0644 ops/tmpfiles.d/clover-monitor-evidence.conf /usr/lib/tmpfiles.d/clover-monitor-evidence.conf
install -o root -g root -m 0644 ops/systemd/clover-monitor-snapshot.service /etc/systemd/system/clover-monitor-snapshot.service
install -o root -g root -m 0644 ops/systemd/clover-monitor.service /etc/systemd/system/clover-monitor.service
install -o root -g root -m 0644 ops/systemd/clover-monitor.timer /etc/systemd/system/clover-monitor.timer
systemd-tmpfiles --create /usr/lib/tmpfiles.d/clover-monitor-evidence.conf
systemctl daemon-reload
```

The API must receive the exact same HMAC key as
`CLOVER_MONITOR_STATUS_HMAC_KEY` through its existing protected environment
mechanism. `<API_ENV_SOURCE>` must be a prepared complete API environment file,
owned by `root:clover` with mode `0640`, whose HMAC value matches
`<HMAC_KEY_SOURCE>`. Back up `<API_ENV_TARGET>` first. Activating this file and
restarting the API require a separate deployment approval:

```text
install -o root -g clover -m 0640 <API_ENV_SOURCE> <API_ENV_TARGET>
systemctl restart clover-api.service
systemctl is-active clover-api.service
```

Only after the approved API restart is healthy, run the producer and monitor
once. Inspect `Result=success` and `ExecMainStatus=0`; do not enable the timer
for any other result:

```text
systemctl start clover-monitor-snapshot.service
systemctl start clover-monitor.service
systemctl show clover-monitor-snapshot.service clover-monitor.service --property=Result --property=ExecMainStatus
systemctl enable --now clover-monitor.timer
```

Stop instead of enabling the timer if either one-shot result is not exactly
successful. Verify the timer only after enablement; a failed activation requires
the rollback below.

Before copying, save every existing target file and the complete existing
`/usr/lib/clover-monitor` tree to a root-only backup directory. Verify that the
runtime contains only `package.json`, `scripts/clover-monitor.mjs`,
`src/runtimeKillSwitches.js` and the source-controlled `src/monitoring/*.js`
closed dependency set. Reject symlinks and unexpected files.
Verify exact owners/modes, that `clover-monitor` is not a member of `clover`, and
that it cannot open SQLite or backup paths.

## Rollback

```text
systemctl disable --now clover-monitor.timer
systemctl stop clover-monitor.service clover-monitor-snapshot.service
# Restore the saved API environment and restart clover-api.service only under
# separate deployment approval.
# Restore every saved target file and the complete runtime tree; remove only
# targets that did not exist before.
systemctl daemon-reload
systemctl reset-failed clover-monitor.service clover-monitor-snapshot.service
setfacl -R -x u:clover-monitor /var/lib/clover-monitor-evidence
find /var/lib/clover-monitor-evidence -xdev -type d -exec setfacl -x d:u:clover-monitor '{}' +
```

Do not delete the evidence/state directories during rollback; retain them for
incident evidence until the owner authorizes archival or removal. Verify with
`getfacl -R /var/lib/clover-monitor-evidence` that neither access nor default
ACL entries name `clover-monitor`.

If installation created the service account, preserve its state before removing
it: recursively change `/var/lib/clover-monitor` to `root:root`, set directories
to `0700` and files to `0600`, then run `userdel clover-monitor` and
`groupdel clover-monitor`. If either account existed before installation, leave
it unchanged. A clean Linux install-to-rollback fixture must capture `getfacl`
before install, after install and after rollback and prove the final ACL/account
state matches the preflight record.
