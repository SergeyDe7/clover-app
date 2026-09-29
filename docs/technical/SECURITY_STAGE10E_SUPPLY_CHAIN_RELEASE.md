# Security Stage 10E — supply chain and release integrity

Дата: 2026-09-29. Base SHA: `9eef63f43d1542be7301ad6a0783722748b2f7a9`.

## Подтверждённые факты и исправления

- Root/server `npm audit --package-lock-only`: 0 vulnerabilities.
- Оба lockfile v3; registry packages имеют SHA-512 integrity; vendored xlsx
  checksum связан с lockfile.
- GitHub secret scanning, push protection и Dependabot security updates enabled;
  open alerts: Dependabot 0, secret scanning 0. Code scanning не настроен.
- Workflow имеет только `contents: read`, SHA-pinned Actions,
  `persist-credentials: false`, locked `npm ci --ignore-scripts`.
- Исправлен P2: routine Dependabot PR включены с limit 5.
- Исправлен P2: frontend, root-test и server lockfiles получили CI gate
  `npm audit --package-lock-only --audit-level=high`.
- Добавлен fixture/static gate `test:security-stage10e-supply-chain`: workflow,
  Dependabot, lock integrity и signatures of known real secret formats.
- Main ruleset active: PR, strict `frontend`+`server`, no delete/non-FF/bypass.
  Production SHA CI run 36434732750: success.
- Deploy exact-SHA pinned, builds off-live, inventories artifact hashes and has
  automatic rollback. Full local Windows deploy fixture is NOT VERIFIED because
  Git-Bash receipt path is not portable; production target is Linux.

## Backup, rollback и release gate

Pre-change backup: `stage10ef-prechange` in the task evidence directory. Local
rollback restores `.github/dependabot.yml`, workflow and `server/package.json`,
then removes the new verifier/docs and repeats Stage 8B/10E checks. GitHub setting,
push, PR, merge and deploy were not performed.

Residual P2/NOT VERIFIED: ruleset requires zero human approvals (one-collaborator
constraint; owner accepted at final closeout), no SAST/code-scanning analysis, artifacts
use SHA-256 but no signing/provenance attestation, health omits commit SHA,
production checkout contains an untracked historical `dist.lkg-*`, and full
production rollback/restore is not verified.
