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
- `server/scripts/verify-security-stage10d-csp-browser.mjs`
- `docs/technical/SECURITY_STAGE10D_FRONTEND_PWA_ABUSE.md`
- `server/package.json`

Package A makes production CORS fail closed for development/LAN origins and
marks non-public API responses `no-store`. Origin-less server-to-server requests
remain valid; 1C routing, authentication, polling, claim and ACK are unchanged.

## Package B — nginx/PWA browser boundary

Files:

- `ops/security-stage6/package-b/nginx/clover-security-headers.conf`
- `ops/security-stage6/scripts/promote-package-b.sh`
- `public/offline.html`
- `public/sw.js`

The nginx file is a full replacement candidate for the installed
`/etc/nginx/snippets/clover-security-headers.conf`; it is not installed by this
local preparation. The complete resource-loading CSP is now an enforcement
candidate; inline event attributes are forbidden. Existing inline script blocks
and styles remain temporarily allowed for the current JSON-LD, boot, print and
React style paths. Production promotion requires a read-only inventory of live
product/certificate URLs, deployment of the compatible UI first, browser smoke,
`nginx -t` and the existing exact-file rollback procedure.

Order is security-critical. The Package B promoter installs only the nginx
header snippet; it does not deploy `public/offline.html` or the application UI.
The target-pinned release containing the listener-based offline page must be
deployed and smoke-tested before enabling `script-src-attr 'none'`. Rollback is
the reverse safety order: restore and validate/reload the previous CSP header
first, then roll back the UI release. This prevents the former inline
`onclick` retry control from being served under a policy that blocks it.

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
