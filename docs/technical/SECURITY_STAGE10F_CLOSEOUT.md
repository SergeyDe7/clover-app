# Security Stage 10F — adversarial regression and closeout

Дата: 2026-09-29. Candidate base: `9eef63f43d1542be7301ad6a0783722748b2f7a9`.

## Локальный результат

Stage 10B: 21/21 PASS. Stage 10C: 13/13 PASS. Stage 10D: 9/9 PASS and Chromium
CSP PASS. Stage 4B: 224/224 PASS. Stage 6/7, server check, build and lint (0
errors; 53 historical warnings) PASS. Stage 9 fixture incident drill/closeout
PASS. Stage 10E supply-chain gate and both live npm advisory queries PASS.
Security, QA and independent Reviewer: P0=0, P1=0, local candidate READY.

Production read-only baseline: exact checkout SHA confirmed through SSH; current
installed CSP equals tracked pre-Stage10 Report-Only baseline; health 4.0.4;
public browser smoke PASS; 691 active public product images are same-origin
`/uploads`, public certificate URLs empty. Production/1С/GitHub settings were not
changed and no real order/message/restore was executed.

## Closeout decision

Local Stage 10 engineering gate: **READY by P0/P1**. Overall production closeout
is **CONDITIONALLY READY, NOT DEPLOYED**. The following require owner acceptance
or later authorized evidence: zero mandatory GitHub human approvals; process-local
rate limiting; temporary CSP `unsafe-inline`; hidden/archive media inventory;
real Android/iOS/Windows PWA and 1С TEST exchange; full Linux rollback rehearsal;
artifact signing/SAST; production restore; provenance of `dist.lkg-*`.

To reach deployed DoD: create atomic commit/PR, obtain green candidate CI and
independent approval, prepare target-pinned artifact and fresh DB/uploads/env
backup, rehearse rollback on safe Linux, deploy only with explicit permission,
then verify exact SHA, headers, health and browser/PWA smoke. Any failed check
rolls back; CSP rollback precedes UI rollback. This closeout contains no secrets
or working business data.
