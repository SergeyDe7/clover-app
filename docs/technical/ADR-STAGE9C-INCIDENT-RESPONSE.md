# ADR: Stage 9C incident response and fixture drill

- Status: Accepted
- Date: 2026-09-28
- Accepted by owner: 2026-09-28; private contact register created and the
  `production restore NOT VERIFIED` residual explicitly accepted.
- Baseline inspected: `c7b14a0` (historical SHA is not authority for a future action)
- Related contract: `SECURITY_STAGE9B_MONITORING.md`

## Context

Stage 9B provides source-controlled, bounded monitoring, sanitized local alert output
and fail-closed runtime kill switches. It deliberately does not decide who may change
production, how incident evidence is preserved, how credentials are rotated or how a
recovery is accepted. Clover also has coupled integrity constraints: SQLite and
uploads, target-pinned application releases, and two strictly separate inbound 1C
contours (TEST and working VLAVKA).

The incident design must remain useful when an external alert channel is unavailable,
must not turn a real order/login/message into a probe, and must be testable without
touching production or either real 1C contour.

## Decision

Adopt `SECURITY_STAGE9C_INCIDENT_RUNBOOK.md` as the operational contract with these
decisions:

1. Use four severities (SEV1–SEV4) based on observed confidentiality, integrity and
   availability impact. Unknown security/contour scope starts at SEV2; confirmed
   duplicate/cross-contour 1C behavior is SEV1.
2. Maintain owner identities and primary/fallback incident channels in a private
   register outside Git. The repository contains placeholders only.
3. Separate detection, triage, containment, eradication/recovery, validation and
   close. An approval for one phase or contour does not authorize the next.
4. Require explicit owner approval for every production mutation, kill-switch change,
   credential rotation, real notification/order/1C action, deploy/rollback and restore.
5. Use the narrow Stage 9B switches. When 1C claims are paused, ACK remains available
   for an already claimed order and must never be disabled; direct
   draft writes retain their separate double gate. MAX remains `N/A` because no
   transport/switch exists.
6. Rotate credential classes independently: JWT; inbound TEST and VLAVKA keys;
   outbound 1C key; monitor status HMAC; SMTP; Telegram; VAPID. Values are generated
   and stored through protected channels and never enter argv, shell history, Git,
   chat or evidence.
7. Roll applications only through a reviewed full target SHA and target-pinned helper
   plus trusted prepared artifact/LKG checks. A helper from the mutable live tree is
   not sufficient authority.
8. Treat backup integrity plus fixture restore as evidence only for the fixture.
   Production restore remains `NOT VERIFIED`. SQLite/uploads recovery is explicitly
   non-atomic until a separately approved quiesced restore procedure is exercised.
9. Preserve originals outside Git with SHA-256 manifest and chain of custody. Share
   only minimized derivatives; alerts and routine reports contain no secrets or PII.
10. Exercise the complete lifecycle only on isolated fixtures with disabled network,
    fake sinks/time, synthetic TEST-named data and verified path containment.
11. Require independent security and reviewer READY before Stage 9 closure.

## Alternatives considered

### Use live production as the exercise target

Rejected. It creates real customer, notification, SQLite/uploads and VLAVKA risk and
cannot safely prove negative paths such as rotation failure or rollback failure.

### Use one global emergency-off flag

Rejected. It would unnecessarily remove ACK and recovery paths, increase outage scope
and obscure which capability is contained. Narrow switches provide reversible,
observable containment.

### Store contacts and secret rotation commands in Git

Rejected. Personal contacts change independently and credential values/command lines
can leak through history, review, process lists and logs. Git retains only roles,
placeholders and non-secret procedure.

### Treat a valid backup archive as proof of production restorability

Rejected. Hash/integrity checks do not prove a coherent point-in-time relationship
between SQLite, WAL/SHM and uploads, nor operational permissions and service recovery.

### Roll back using whichever deployment script is currently live

Rejected. A broken or incompatible live helper can invalidate the rollback. The
helper and prepared artifact must be pinned to the reviewed target SHA.

## Consequences

Positive:

- incident decisions and approvals are auditable;
- containment preserves critical recovery paths and contour isolation;
- evidence and notifications avoid secrets/PII;
- drills are repeatable and cannot intentionally contact production;
- unsupported claims such as production restore readiness remain visible.

Costs and limitations:

- owner/fallback register and restricted evidence storage require an external
  operational process;
- JWT rotation invalidates sessions; notification and 1C key rotations require
  coordinated cutovers;
- production recovery from backup remains a known gap;
- SQLite/uploads consistency needs a separately designed quiesced snapshot/restore;
- external browser smoke and provider-side revocation cannot be fully proven by local
  fixtures.

## Compatibility and migration

This decision adds documentation and fixture expectations only. It changes no API,
database schema, order state, service, timer, env value or 1C configuration. Existing
Stage 9B switch semantics and `FEATURE_PAUSED` response remain unchanged. Existing
TEST/VLAVKA credential-to-contour binding and ACK idempotency remain mandatory.

Adoption steps are:

1. independently review runbook statements against current source and deployed facts;
2. create/verify the private contact register outside Git without copying contacts
   into the repository;
3. implement the fixture drill and evidence-manifest verifier;
4. run fixture tests with network disabled and production paths denied;
5. perform independent security/reviewer audit and record residual gaps;
6. merge/deploy documentation or tooling only through the normal approval workflow.

No step above authorizes production mutation. Any future restore exercise, secret
rotation or runtime containment remains **REQUIRES EXPLICIT OWNER APPROVAL**.

## Acceptance criteria

The ADR is accepted when:

- the runbook covers SEV1–4 and the full incident lifecycle;
- every production mutation and real 1C/notification action has an explicit approval
  gate;
- the kill-switch matrix proves the claims/ACK distinction and records MAX as `N/A`;
- TEST and VLAVKA are never combined by credential, evidence or authorization;
- all required credential classes have impact, verification and safe rollback rules;
- rollback is target-pinned and backup restore states `production NOT VERIFIED` plus
  the SQLite/uploads non-atomic risk;
- evidence uses chain of custody and SHA-256 manifests without secrets/PII;
- the drill is fixture-only, bounded, network-disabled and tests false positives;
- Stage 9 closeout requires independent security/reviewer READY and owner acceptance.

## Rollback

Revert the documentation commit if this decision is rejected. That rollback has no
runtime effect and cannot undo any separately approved operational action. Operational
actions retain their own evidence, approval and reversal plan.
