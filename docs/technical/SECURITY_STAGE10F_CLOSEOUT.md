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

## Production evidence and final decision

Stage 10 was delivered by PR #197. Candidate commit
`296df7671a244b1fee9265d7c7e0ff04229499d4` and merge commit
`a5ae6c3143378dab2359c8259478e3ea069e7708` passed GitHub frontend/server CI.
The target-pinned application rollout created the fresh backup
`/opt/clover/deployments/backups/security-stage10-20260929T081545Z`, including a
SQLite `VACUUM INTO` copy with `quick_check`, uploads, environment and nginx
evidence. Safe rollback fixtures passed; an actual production restore was not
performed.

At final post-check the production checkout was
`49bb1c5d1ca66b803bcb3a05877bef7a21c95d82`. It descends from the Stage 10 merge;
the only intervening change was PR #198's Yandex verification file, while the
Stage 10 security package stayed unchanged. The installed nginx security header
file and tracked candidate both had SHA-256
`5c809def2644606354b7a5fd83a3357c45c71b3525fa580f1f70e78b1b8fdfed`.
The CSP promotion manifest was
`890373374599f83853bcd5deaaae788ad594158b42fc8ea45a22a9b7015c4370`;
`nginx -t` and reload passed, the full policy is enforced and no
`Content-Security-Policy-Report-Only` header remains.

`nginx`, `clover-api` and `clover-ui` were active. API health returned version
4.0.4. `/`, `/contacts`, `/lk` and `/offline.html` returned HTTP 200 with one
enforced CSP header and no Report-Only header. Independent browser smoke rendered
all four pages with no browser console errors. No real order, working 1С write,
message or restore was executed.

Final result: **CLOSED, P0=0, P1=0**. On 2026-09-29 the owner explicitly accepted
all recorded P2, P3 and `NOT VERIFIED` residuals and directed Stage 10 closeout. The
confirmed non-security P3 is that PR #198's verification file exists in `dist`
but its public URL returns 404; remediation is deferred to a separate task.
Production restore remains `NOT VERIFIED` and still requires separate approval.
Previously recorded residual limitations remain in the package documents and are
not evidence of an unrecorded P0/P1. This closeout contains no secrets or working
business data.
