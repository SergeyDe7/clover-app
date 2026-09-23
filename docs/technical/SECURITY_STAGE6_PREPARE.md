# Security Stage 6 — local PREPARE

## Confirmed scope

Source material dated 2026-09-16 defines Security Stage 6 as:

> nginx / CORS / CSP / PWA — browser hardening, cache, headers, production origins.

This is separate from I18N Stage 6. The repository did not contain a standalone
Security Stage 6 definition before this package.

## Trusted base and production boundary

- Base: `origin/main` at `8b6f7ee5d3b5e2ba638882ebb4177f9ceece82bc`.
- Local preparation uses an isolated worktree and branch.
- Production runtime identity is **NOT VERIFIED** in this preparation: no SSH,
  deploy, nginx reload, service restart, database access, real authentication,
  mail, order, or 1C call is performed.
- Stage 5 Package C/D remains the infrastructure baseline. Old listeners are not
  stopped and firewall reboot persistence is not re-tested.

## Findings and minimal packages

### Package A — production origins and private API cache

1. Production CORS default allowed localhost and RFC1918 origins on port 5273
   when `ALLOW_LAN_ORIGINS` was absent.
2. Private API responses had no global `Cache-Control: no-store` guarantee;
   protection was limited to selected credential and backup routes.

Prepared change:

- production now denies development/LAN origins by default;
- an explicit `ALLOW_LAN_ORIGINS=true` remains available for an intentional
  non-production/LAN contour;
- origin-less server-to-server requests remain accepted, preserving 1C clients;
- all non-public `/api/**` success and error responses receive `no-store`;
- `/api/public/**` keeps its route-specific public cache policy.

### Package B — browser headers and PWA boundary

1. The installed Stage 5 nginx header snippet had no CSP.
2. Vite preview emitted wildcard UI CORS despite being loopback-only behind nginx.
3. A signed push payload could request a cross-origin notification click target.

Prepared change:

- blocking CSP covers the low-risk invariants `base-uri`, `object-src`,
  `frame-ancestors`, `form-action`, and HTTPS upgrades;
- the resource-loading policy starts as `Content-Security-Policy-Report-Only`
  and includes current Yandex Maps/Metrika sources; blocking promotion is a
  separate decision after browser evidence;
- COOP and legacy cross-domain-policy protection are added;
- production preview stops emitting wildcard `Access-Control-Allow-Origin`;
- notification clicks are restricted to the Clover origin, otherwise `/lk/`.

The replacement nginx snippet is versioned under `ops/security-stage6`; the
accepted Stage 5 artifact remains byte-for-byte historical and is not rewritten.

## Isolated acceptance

Run from `server/`:

```text
npm run test:security-stage6
```

The verifier uses only a temporary SQLite database, temporary directories and a
loopback Node process. It proves default production CORS denial, origin-less 1C-
compatible access, private/public cache separation, nginx policy structure and
same-origin PWA notification navigation. It also prepares a temporary exact
artifact and runs Package B install, injected-failure rollback, successful
install and explicit rollback beneath an isolated `DEST_ROOT`.

## Exact PREPARE artifact

After tests and review, create a new target directory (it must not already
exist):

```text
npm --prefix server run prepare:security-stage6 -- C:\absolute\stage6-artifact
```

The command prints the immutable manifest SHA-256. Verify that exact copy with:

```text
node server/scripts/securityStage6Artifact.mjs verify C:\absolute\stage6-artifact <MANIFEST_SHA256>
```

The allowlist includes every intended Stage 6 source and operator file. The
verifier rejects any missing, modified or extra file.

## Future PROMOTE / rollback contract (not executed by PREPARE)

Only after separate owner approval and a matching read-only production identity
check can Package B be applied. The artifact copy of the operator is **not** a
trusted production bootstrap.
After a reviewed PR is merged, extract both files below from the exact
owner-approved commit into a root-owned recovery directory and verify their Git
blob identities before execution:

- `ops/security-stage6/scripts/promote-package-b.sh`;
- `server/scripts/securityStage6Artifact.mjs`.

PROMOTE remains blocked until that merged commit exists. Its future invocation
must use the root-owned operator and verifier, while pinning both the commit and
artifact manifest:

```text
/root/clover-security-stage6/<COMMIT>/promote-package-b.sh --artifact-root <ARTIFACT> --expected-manifest <MANIFEST_SHA256> --dest-root / --production --trusted-source-root /opt/clover/clover-app --expected-commit <COMMIT> --trusted-recovery-root /root/clover-security-stage6/<COMMIT> --trusted-verifier /root/clover-security-stage6/<COMMIT>/securityStage6Artifact.mjs
```

The operator requires the recovery directory and both files to be root-owned,
non-writable by group/others and directly inside that directory. It uses fixed
`/usr/bin/git` and `/usr/bin/node`, clears Git environment/config influence,
disables replace objects and compares both blobs with `<COMMIT>`. It then obtains
a global deploy lock, atomically creates the recovery directory, and asks the
trusted verifier to create a checked root-owned artifact snapshot. The mutable
artifact is checked again before any destination mutation; installation reads
only the snapshot. A checksum protects the exact installed nginx pre-state.
`ERR`, `INT` and `TERM` all enter checked rollback; a damaged backup or failed
restore/validation returns a non-zero `INCOMPLETE` status instead of a false
success. Explicit rollback uses the same trusted bootstrap and identity:

```text
/root/clover-security-stage6/<COMMIT>/promote-package-b.sh --artifact-root <ARTIFACT> --expected-manifest <MANIFEST_SHA256> --dest-root / --production --trusted-source-root /opt/clover/clover-app --expected-commit <COMMIT> --trusted-recovery-root /root/clover-security-stage6/<COMMIT> --trusted-verifier /root/clover-security-stage6/<COMMIT>/securityStage6Artifact.mjs --rollback
```

These commands are documentation only in local PREPARE. No production command
was run.

Before any future production PROMOTE, a separate read-only audit must compare
the live nginx config and runtime identity with the exact reviewed artifact.
