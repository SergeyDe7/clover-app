# Security Stage 5 host hardening — PREPARE

This directory is a source-controlled PREPARE input. It does not install,
reload, restart, stop, chmod, chown, enable, disable, or contact 1C.

Audit baseline:

- production SHA: `1fdd7e6ac715f55e407d71a225e5a6037eb9d2e8`
- public TCP connect accepted on `22/80/443/4100/5273/4117/4118/5293`
- effective nftables ruleset: empty
- effective SSH: `PermitRootLogin yes`, `PasswordAuthentication yes`
- 1C source IP: not verified

## Package A — host hygiene and systemd

Prepared artifacts (not promotion-ready until runtime gates pass):

- API/UI systemd sandbox drop-ins;
- `UMask=0077` for both services;
- the retention timer points to the dry-run service, never the apply service.

Promotion must first capture a runtime plan for listeners `5293`, `4117`, and
`4118`: PID, process start time, UID, executable, cwd, cgroup, and port. A
process may receive `SIGTERM` only if all fields still match immediately before
the signal and it is not a member of `clover-api.service`, `clover-ui.service`,
`nginx.service`, or `ssh.service`. No `pkill`, wildcard kill, or `SIGKILL` is
allowed. The live API/UI PIDs and health are rollback gates.

The world-readable isolated SQLite copies are not part of the live database.
Their exact paths and inode metadata must be captured before a future
permission change. The live database, uploads, backups, and 1C data are outside
this operation.

## Package B — SSH

The drop-in disables root and password authentication and requires public-key
authentication. Promotion requires all of these gates:

1. keep the original and second independent `clover` public-key sessions open;
2. record whether the exact drop-in destination existed and back it up;
3. run `/usr/sbin/sshd -t` before reload;
4. compare `/usr/sbin/sshd -T -C` with the expected effective values;
5. after reload, prove a third new public-key session;
6. restore the saved file, or remove only the exact new file when the recorded
   pre-state was absent, from an already-open recovery session.

No firewall change belongs to this package.

## Package C — nginx and UI loopback

The UI service binds `127.0.0.1:5273`. nginx proxies UI and API through
loopback, enables HTTP/2, restores security-header inheritance in locations
that define cache headers, and adds explicit body/time bounds. The API process
continues to bind its current address because working 1C uses direct port
`4100`.

Package C is atomic: install the UI drop-in and both nginx files, run
`/usr/sbin/nginx -t`, then restart UI and reload nginx. Roll back all three
files together if HTTPS `/`, HTTPS `/api/health`, UI assets, or the UI listener
gate fails.

Exact destinations, pre-state backups, install order, rollback commands, and
post-rollback checks are defined in `PROMOTE_ROLLBACK.md`. That contract is
included in the hashed PREPARE artifact.

The only source-controlled Package A operator is
`ops/security-stage5/scripts/promote-package-a.sh`. It is hashed into the
PREPARE artifact. Production launches it only as the completed TTY command
`sudo /bin/bash -c '<fixed bootstrap>' --` with literal `--target`,
`--expected-manifest`, and `--artifact` arguments. The bootstrap writes a
root-owned operator copy, compares `git hash-object --no-filters` to the
exact `$TARGET` blob, then runs `/bin/bash <root-owned-operator>`. Do not
pipe `git show` into `bash -s`.
The rejected production file
`/opt/clover/deployments/staging/package-a-promote-retry.sh` SHA-256
`ba0a3c3e57d2bd01c94046dab81aded4e10c2df1566038b02a19be6c498a4f50` must never
be executed.

## Package D — perimeter (BLOCKED)

No firewall or API-bind artifact is included. Package D remains blocked until
the working 1C source IP and route are proven without changing polling,
claim/ACK, credentials, retries, idempotency, or TEST/VLAVKA isolation.

## Exact PREPARE artifact

Run from a clean checkout of the exact target commit. The output directory must
be outside the repository and must not already contain files.

```bash
node server/scripts/securityStage5Artifact.mjs prepare \
  --target-sha <40-character-target-sha> \
  --output /opt/clover/deployments/staging/security-stage5-<target-sha>

node server/scripts/securityStage5Artifact.mjs verify \
  --artifact /opt/clover/deployments/staging/security-stage5-<target-sha> \
  --expected-sha <40-character-target-sha> \
  --source-root /opt/clover/clover-app
```

PREPARE copies exact bytes and records SHA-256 for every file. A later PROMOTE
must verify the same manifest and hashes and must not rebuild or regenerate the
artifact. PREPARE is not permission to promote.

## Rollback gates

- loss of the current or new SSH session;
- `nginx -t` or `sshd -t` failure;
- API/UI systemd unit not active or unexpected restart count;
- HTTPS root, health, UI namespace/assets, or mobile/desktop smoke failure;
- unexpected listener or changed 1C route;
- artifact SHA or file hash mismatch.

Package D has no rollback because it has no executable artifact yet.
