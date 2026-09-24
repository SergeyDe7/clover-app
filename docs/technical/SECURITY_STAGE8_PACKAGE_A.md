# Security Stage 8 — package A: historical deployment artifacts

## Scope and baseline

This package changes only file modes for the exact regular files in
`ops/security-stage8/package-a/deployment-sensitive-files.allowlist`. It never
reads database, WAL, SHM, dotenv, archive, secret, or PII contents. It never
deletes or moves historical files. Symlinks and paths escaping the selected
deployment root are refused.

The 2026-09-24 read-only production audit confirmed SHA
`c5963c1dabd3fb9fc9f793f09b484197068f8381`. The checkout was not clean:
`dist.lkg-ui-20260910-DS202DDX-20260910T215957Z/` was untracked and was not
read or changed.

Metadata-only inventory found these permission-chain categories:

- accessible by unrelated-user mode bits: the allowlisted SQLite files under
  `lkg` and `pr129-pre-20260916T2010Z`, plus `.env.production` under both
  `isolated-metrika-flag-20260920T2223Z` release roots and the Stage 7 staging
  dependency directory;
- blocked for unrelated identities by a `0700` parent mode: the DB/WAL/SHM files under `db-backups`,
  `staging/prepare-db-*`, `staging/ui-403-recovery-*`, and the staging metrika
  DB backup;
- blocked for unrelated identities by file mode `0600`: the two historical `server/.env` files;
- refused symlink: the UI recovery worktree `.env.production` link;
- NOT VERIFIED: root-owned `pr80-*`, `pr81-*`, and non-traversable parts of
  `pr110-*`, because the audit identity received `Permission denied`.

`.env.example` files are public templates and are deliberately outside the
allowlist. No archive contents were inspected. Extended ACLs were not verified,
so the blocked categories describe the observed POSIX owner/group/other modes;
they are not an ACL audit.

## Dry-run and apply

Run from the pinned checkout. Dry-run is metadata-only and makes no target
changes:

```bash
bash scripts/linux/harden-deployment-artifacts.sh --dry-run
```

Apply requires the canonical
production root and repository allowlist, takes the shared deploy lock, opens
the root, every parent directory, each allowlisted file, and the deploy lock
through pinned directory descriptors with `O_NOFOLLOW`. It validates and opens
all targets before using `fchmod` on the pinned file descriptors. Missing or
replaced files fail closed. Repeating apply is safe and keeps every target at
`0600`. The helper
uses the root-owned regular binary `/usr/bin/python3.13` (mode `0755`), confirmed
during the read-only audit; it does not resolve the interpreter through `PATH`:

```bash
bash scripts/linux/harden-deployment-artifacts.sh --apply
```

No historical directory mode change is required once each regular sensitive
file is `0600`. Both target-pinned deploy entrypoints set `umask 077`, so newly
created artifact directories default to `0700`; existing staging/LKG root modes
are not changed implicitly. The deploy flow scans newly copied LKG/prepared
dist trees without following symlinks. A sensitive symlink is rejected; a
sensitive regular file preserved by `cp -a` is first restricted to `0600` and
then the UI deploy fails closed so it cannot be published.

## Safe recovery; no permission rollback

This package deliberately has no rollback command and does not record a plan
capable of restoring insecure modes. Both `--rollback` and `--plan-out` are
rejected. Returning an exposed historical artifact to `0644` or `0777` would
reintroduce the confirmed vulnerability.

If a service-access regression is observed, keep the sensitive file at `0600`,
stop the rollout, diagnose the expected service identity, and correct ownership
or the service configuration under a separate approved change. A partial apply
is safe in the security direction and can be completed by rerunning the same
idempotent apply command. Installation, commit, push, PR, merge, and deployment
are not performed by this local preparation package.
