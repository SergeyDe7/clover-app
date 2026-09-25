# Security Stage 8 — package C: Dependabot security updates

## Scope and confirmed baseline

S8-C is limited to npm dependency vulnerability visibility and security-update
pull requests. It does not enable CodeQL, ordinary dependency version-update pull
requests, auto-merge, deployment, production changes, off-site backup, database
changes, dotenv access, or 1C changes.

The read-only audit on 2026-09-25 confirmed repository
`SergeyDe7/clover-app`, public default branch `main`, and SHA
`b416bc5f1473ac40ecbad8a67aaa268c70cc4792`. GitHub reported:

- Dependabot alerts: DISABLED (`403: Dependabot alerts are disabled for this repository`);
- Dependabot security updates: DISABLED;
- `.github/dependabot.yml`: ABSENT;
- GitHub-side alert count: NOT VERIFIED because alerts are disabled;
- SHA-pinned GitHub Actions: NOT COVERED by Dependabot alerts;
- secret scanning and push protection: ENABLED;
- S8-B ruleset and required `frontend`/`server` checks: ACTIVE.

Read-only `npm audit --json` against both committed lockfiles returned zero
critical, high, moderate, low, and total vulnerabilities. This registry result
does not replace the GitHub dependency graph and Dependabot alert scan.

## Source-controlled behavior

`.github/dependabot.yml` covers the npm manifests at `/` and `/server`. The
entry sets `open-pull-requests-limit: 0`, so scheduled ordinary version-update
pull requests are disabled while security-update pull requests remain enabled.
Security updates are intentionally not grouped: one incompatible remediation
must not delay unrelated critical fixes or enlarge their rollback scope. No
`target-branch` is set, allowing the security-update configuration to apply to
the default branch.

GitHub Actions are intentionally absent from this security-only configuration.
The S8-B workflows pin actions to full commit SHAs, while GitHub documents that
the dependency graph generates GitHub Actions alerts only for references using
semantic version tags. Adding a security-only Actions entry here would claim
coverage that the current SHA-pinned workflow cannot receive. Updating pinned
action SHAs therefore remains NOT COVERED by S8-C and requires a separate,
reviewed maintenance policy; S8-C does not weaken the S8-B pinning requirement.

Dependabot security pull requests remain ordinary pull requests. This package
does not auto-merge them, grant bypass, expose secrets, or weaken the S8-B
ruleset. Each update must pass the required `frontend` and `server` checks
before a separately approved merge.

## Safe activation gate

Do not enable repository settings before this configuration exists on `main`.
After a separate approval to change GitHub security settings:

1. Reconfirm the default branch, current `main` SHA, active S8-B ruleset, and
   clean successful `frontend`/`server` checks.
2. Capture the current `security_and_analysis` response and current Dependabot
   alert/update state without recording tokens or repository secrets.
3. Enable Dependabot alerts (and its dependency graph prerequisite), then
   enable Dependabot security updates.
4. Re-read `security_and_analysis`; both features must report `enabled`.
5. Poll the alert endpoint only until the initial scan is available. Record
   aggregate counts by severity, not vulnerable file contents or private data.
6. If security pull requests are created, verify they target `main`, originate
   from Dependabot, and are blocked by S8-B until both required checks pass.

Stop without enabling security updates if the source configuration is absent
from `main`, the repository/default branch differs, the S8-B ruleset is not
active, required checks are not successful, or alerts cannot be enabled.

## Verification

Local contract:

```text
cd server
npm run test:security-stage8-package-c
```

Before source delivery, also run both lockfile audits, root lint, the direct
Vite build, and the complete server suite. Until the separate activation step,
GitHub settings remain NOT APPLIED and GitHub alert results remain NOT VERIFIED.

## Recovery without hiding vulnerabilities

If automated security pull requests cause a confirmed availability or workflow
problem, disable Dependabot security updates only. Keep Dependabot alerts enabled
so vulnerabilities remain visible, and do not dismiss alerts merely to clear a
dashboard. Existing Dependabot pull requests should be reviewed or closed
individually with a recorded reason; this package never deletes or auto-closes
them.

Correct the configuration through a normal protected pull request, prove it in
CI, then re-enable security updates. Do not disable the S8-B ruleset, required
checks, dependency alerts, secret scanning, or push protection as recovery for
a failing dependency update.
