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

## Package D — targeted perimeter

The refreshed read-only audit found an empty live nftables ruleset and no
`/api/one-c` requests in the nginx access log. The working 1C route therefore
must not be forced through nginx and the API must not be rebound to loopback.

During a user-authorized empty-queue pull, passive socket observation recorded
three direct connections to API `:4100` from `192.168.155.155`. No payload,
credential, order, ACK, or 1C response body was captured. This proves the
working route and places its observed source inside `192.168.155.0/24`.

Package D keeps direct API access from the server loopback and the office LAN
`192.168.155.0/24`, while dropping direct TCP `4100` from every other IPv4 or
IPv6 source. TCP `4117`, `4118`, and `5293` are dropped outside loopback even
if an abandoned test process reappears. SSH and public HTTP/HTTPS remain
unchanged because the input-chain policy stays `accept` and no rule targets
ports `22`, `80`, or `443`.

Its root-owned operator and rollback evidence live only below the dedicated
`/opt/clover-security-recovery` (`root:root 0700`) trust root. The shared
`/opt/clover/recovery` directory is not used for Package D because it is
writable by the deployment account.

Promotion is allowed only while the live ruleset is still empty, the existing
`/etc/nftables.conf` matches its audited SHA/owner/mode, the nftables service is
inactive and disabled, API/UI/nginx PIDs remain stable, and all local health
gates pass. The source-controlled operator validates the candidate with
`nft -c`, installs an exact Git/artifact snapshot, enables the existing
`nftables.service`, and automatically restores the exact pre-state on failure.
It does not call 1C or change credentials, polling, claim/ACK, retries,
idempotency, TEST/VLAVKA isolation, the database, uploads, or application code.

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

Package D rollback restores the exact previous `/etc/nftables.conf`, deletes
only the package-owned `inet clover_stage5` table, returns `nftables.service`
to disabled, and repeats API/UI/HTTPS health gates. External postchecks must prove
public `22/80/443`, blocked public `4100/4117/4118/5293`, and allowed office-LAN
`4100` before Stage 5 can close.
