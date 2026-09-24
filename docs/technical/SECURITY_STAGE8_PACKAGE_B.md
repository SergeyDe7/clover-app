# Security Stage 8 — package B: protected main and mandatory CI

## Scope and confirmed baseline

S8-B is limited to GitHub pull-request and branch controls. It does not change
production, databases, dotenv files, backups, 1C, Dependabot, CodeQL, or
off-site backup.

The read-only audit on 2026-09-25 confirmed repository `SergeyDe7/clover-app`,
default branch `main`, and SHA
`fdbd39152dcaf049da974ae329412001a472114f`. The repository had no rulesets,
`main` returned `Branch not protected`, and that SHA had no check runs or commit
statuses. GitHub Actions was enabled with all actions allowed and SHA pinning
disabled. The repository is public, so repository rulesets are available on
GitHub Free. The repository has one direct collaborator, its administrator and
owner `SergeyDe7`.

## Source-controlled controls

`.github/workflows/security-stage8.yml` runs on pull requests to `main`, pushes
to `main`, and manual dispatch. It grants only `contents: read`, does not read
secrets, uses GitHub-hosted runners, disables persisted checkout credentials,
and pins every external action to a full commit SHA. The stable job/check names
are `frontend` and `server`.

The frontend job installs the locked dependency tree with lifecycle scripts
disabled, lints the repository, and runs the Vite build directly. It does not
run the production sitemap generator because that step can access deployment
data. The server job installs the locked server dependency tree with lifecycle
scripts disabled and runs the complete server verification suite. Its Linux
fixture explicitly selects `/usr/bin/python3` through the fixture-only
`S8A_FIXTURE_PYTHON` override; the production interpreter pin remains unchanged.

`ops/security-stage8/package-b/main-ruleset.json` targets only
`refs/heads/main`. It blocks deletion and force pushes, requires changes through
a pull request, requires resolved review threads, and requires current
`frontend` and `server` checks. There is no bypass actor. Approval count is
deliberately zero: the confirmed repository has one direct collaborator, and
requiring another person's approval would make normal delivery impossible.
Both checks are restricted to GitHub Actions App ID `15368`, confirmed through
the GitHub API on 2026-09-25. A same-named status from another integration
cannot satisfy the rule.

## Safe activation gate

Do not post the ruleset before its workflow exists on `main`. Use this sequence
only after separate approval to change GitHub settings:

1. Merge the S8-B source PR after both workflow jobs pass.
2. Record the current rulesets and Actions permissions as immutable audit
   evidence. Do not record tokens, environment values, logs containing user
   data, or repository secrets.
3. On the merged `main` SHA, verify the observed check-run names are exactly
   `frontend` and `server`, both completed with conclusion `success`, and both
   report GitHub App ID `15368` (`github-actions`).
4. Enable repository action SHA pinning, then create the active ruleset from
   `ops/security-stage8/package-b/main-ruleset.json`.
5. Re-read the created ruleset and Actions permissions, then open a harmless
   fixture PR to prove that failed/pending checks block merge and successful
   checks permit it.

Activation must stop before step 4 if the observed check contexts or App ID
differ, a workflow job is absent, any job is not successful, the
repository/default branch differs, or the baseline changed unexpectedly. Never
guess a required check name or source.

## Verification

Local static contract:

```text
cd server
npm run test:security-stage8-package-b
```

Before source delivery, also run root lint, the direct Vite build, and the
complete server suite. GitHub remains NOT VERIFIED until the PR workflow has
actually run. Ruleset enforcement remains NOT APPLIED until the separate
GitHub-settings approval and post-merge activation gate are complete.

## Rollback and recovery

Rollback exists for availability recovery, but it does not disable or weaken
protection as a routine response to a failing check. First fix the workflow or
code in a PR. If a confirmed ruleset defect makes every PR impossible, an
administrator may temporarily change only this S8-B ruleset from `active` to
`disabled`, preserving the ruleset and audit trail. Restore the captured
pre-change Actions permission only if SHA pinning itself is the confirmed
cause. Re-enable the corrected protection immediately after a fixture PR proves
the repair.

Do not delete the ruleset as rollback, do not force-push `main`, do not bypass
failed checks, and do not weaken required checks merely to complete a merge.
