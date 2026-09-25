# Security Stage 8 closeout rollback

## Application release

`run-target-deploy.sh promote` delegates to the target-pinned deploy engine.
If cutover health, asset, bundle, or SEO gates fail, that engine restores the
previous source SHA and the single last-known-good UI `dist`, restarts the API
and UI services, and re-runs health checks.

Before PROMOTE, record the previous SHA, UI tag, main JS bundle, LKG path, exact
prepared directory, and manifest SHA-256. A manual recovery must use those
recorded values; never select a rollback artifact by newest filename.

## Stage 8A file modes

There is deliberately no rollback to `0644`, `0777`, or another previously
exposed mode. Restoring those modes would recreate the vulnerability.

If `--apply` partially succeeds or a service-access regression follows:

1. Stop before PROMOTE when it has not started.
2. Keep every already-hardened sensitive file at `0600`.
3. Record the exact failed relative path, owner/group/mode, ACL summary, and
   service identity without reading file contents.
4. Correct ownership or the service configuration only through a separate,
   approved change; then rerun the idempotent Stage 8A apply.

Do not delete artifacts, loosen permissions, disable the `main` ruleset, turn
off alerts, bypass CI, reset a database, or change 1C as a rollback shortcut.
