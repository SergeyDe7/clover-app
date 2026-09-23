# Security Stage 6 packages

Trusted base: `8b6f7ee5d3b5e2ba638882ebb4177f9ceece82bc`.

## Package A — application origin/cache boundary

Files:

- `server/src/server.js`
- `vite.config.js`
- `server/.env.example`
- `docs/deploy/server.env.datacenter.example`
- `server/scripts/verify-security-stage6.mjs`
- `server/scripts/securityStage6Artifact.mjs`
- `server/package.json`

Package A makes production CORS fail closed for development/LAN origins and
marks non-public API responses `no-store`. Origin-less server-to-server requests
remain valid; 1C routing, authentication, polling, claim and ACK are unchanged.

## Package B — nginx/PWA browser boundary

Files:

- `ops/security-stage6/package-b/nginx/clover-security-headers.conf`
- `ops/security-stage6/scripts/promote-package-b.sh`
- `public/sw.js`

The nginx file is a full replacement candidate for the installed
`/etc/nginx/snippets/clover-security-headers.conf`; it is not installed by this
local preparation. CSP resource loading remains Report-Only, while the minimal
`base-uri`, `object-src`, `frame-ancestors` and `form-action` policy is enforced.

## Gates

PREPARE uses `securityStage6Artifact.mjs` to copy the complete allowlisted file
set and bind it to one immutable manifest SHA-256. The verifier rejects changed,
missing and extra artifact files. Its isolated `DEST_ROOT` exercise proves both
automatic failure rollback and explicit rollback restore the pre-state bytes.

PROMOTE requires a separate owner confirmation, a fresh read-only production
identity check, backup of the installed nginx snippet, `nginx -t`, and rollback
to that exact backup on any failed header/browser smoke. The operator script
refuses `/` unless `--production` is explicit and both the operator and verifier
match their blobs in an owner-approved Git commit. Production must execute
root-owned recovery copies extracted from that commit, never copies from the
mutable artifact. A global `flock`, atomic recovery-directory creation and a
checksummed pre-state prevent concurrent or corrupt rollback.

Do not rebuild between artifact review and PROMOTE. Do not change 1C, database,
firewall, systemd, old listeners or TEST/production isolation in Stage 6.
