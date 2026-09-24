# Windows test-harness repair (local preparation)

This package changes test scripts only. It does not change API/UI runtime code,
database schema, 1C exchange, production services, or the Stage 5 upload package.
It starts from local `origin/main` `2dde2e0ea64572336c5926bf01e701d5b384e7fa`.
The initial remote probe failed; before Git delivery, `git ls-remote origin
refs/heads/main` confirmed the same SHA on GitHub.

## Observed baseline

- A clean Windows worktree failed `test:all` in
  `verify-manual-client-price-type.mjs`: its source scan required LF-only text
  and its Git scope assertion was tied to the old client-price PR rather than
  ordinary regression testing.
- `verify-security-stage4-package-c.mjs` had LF-only assertions that rejected
  Windows CRLF. Its source scans now normalize newlines; lone CR remains
  rejected.
- `verify-security-stage3-package3.mjs` failed in the workspace sandbox when
  `realpathSync.native` returned `EPERM` for the user's home path. The unchanged
  test passed all 30 cases outside that sandbox, using only temporary fixtures.
- Several static UI assertions still matched pre-I18N literals or removed CSS
  structures. They now match the current localized keys and structural behavior.
- `verify-orders-hardening.mjs` previously found the migrate route name in a
  JSON-body limit list, not the actual route handler. It now anchors to
  `app.post` before inspecting the merge logic.
- The Stage 6 trusted-bootstrap fixture copied raw CRLF bytes but inherited
  Windows `core.autocrlf=true` when adding those files to its temporary Git
  repository. The fixture now sets `core.autocrlf=false` before staging;
  production blob-verification code is unchanged.

## Gates and boundaries

`test:onec` runs functional and synthetic regression checks, including the
client-price verifier's fixture and self-tests. It does not call working 1C.
The strict historical client-price PR allowlist remains available as
`npm run test:manual-client-price-review`, with an exact base/head; it is not a
general gate for arbitrary later PRs. The command must be invoked explicitly
only on the checkout and review range of that historical client-price PR. A
failure on this test-harness branch is expected because its changed files are
outside that historical allowlist; it is not an applicable release gate here.
It must not be silently treated as having run when only `test:all` runs.

The storefront CSS root background is `#f5f7f4`, while `src/main.jsx` still
sets `STOREFRONT_THEME_COLOR` to `#f3f2ee` after splash. This mismatch is an
observed UI issue outside this test-only package; visual impact is not verified.

Targeted ESLint on all changed `.mjs` scripts passed. Repository-wide
`npm run lint` still fails on three untouched baseline files:
`server/scripts/fixtures/manager-bell-toggle-harness/main.jsx`,
`server/scripts/releaseNamespace.js`, and
`server/src/productBatchTranslation.js`. Those fixes are outside this package.

## Verification on this worktree

- `npm run test:onec`: PASS (synthetic fixtures only).
- `npm run test:security-stage4-package-c`: PASS, 31 checks.
- `npm run test:security-stage6`: PASS.
- `npm run test:security-stage7`: PASS.
- `npm run test:iphone-boot-splash`: PASS.
- `npm run test:all`: PASS, exit code 0, including the Stage 5 temporary
  trusted-bootstrap scenarios and Stage 3 path/symlink tests. On Windows this
  requires running outside the workspace sandbox because `realpathSync.native`
  on the user's home path otherwise returns `EPERM`.
- `npm run test:manual-client-price-review` on this uncommitted branch:
  expected FAIL (`Review base and head must not be identical`); the strict
  historical gate remains active and needs its own applicable commit range.
- Independent code review: APPROVE after the finished full `test:all` run.

## Release boundary

Push and PR are a separate owner-approved delivery step. Merge, PROMOTE,
server change, real login/reset/order/mail, and working 1C actions are not in
scope. Rollback is to close the unmerged PR, or revert the test-only commit if
it is merged later.
