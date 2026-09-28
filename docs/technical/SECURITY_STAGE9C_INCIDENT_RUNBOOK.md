# Security Stage 9C — incident response runbook

Status: source-controlled operational contract. This document does not authorize a
production change. Every action marked **REQUIRES EXPLICIT OWNER APPROVAL** must be
approved for the named incident and exact target before it is performed.

## Scope and safety invariants

This runbook covers Clover API/UI/nginx/systemd, SQLite and uploads, backups,
monitoring, outbound notifications and the Clover ↔ 1C exchange. It does not replace
the 1C acceptance runbook and does not claim a new end-to-end 1C test.

The following invariants take priority over speed:

- preserve the immutable Clover order ID, ACK idempotency and the exact association
  between Clover order and 1C document;
- never merge TEST and VLAVKA evidence, credentials, queues or decisions;
- never use a requested `database` value as authority; the inbound credential owns
  its contour;
- when 1C claims are paused, ACK remains available so an already claimed order can finish;
- never retry a real order, ACK, login or reset as an incident probe;
- never place secrets, cookies, authorization headers, raw request bodies, phone
  numbers, email addresses, addresses, order IDs or 1C document numbers in alerts,
  chat, tickets or Git;
- collect evidence before mutation, keep checks bounded and avoid alert storms;
- MAX transport is not implemented and has no kill switch; record it as `N/A`, not
  healthy, paused or tested.

The primary incident owner and fallback channel are maintained in the private
operator contact register outside Git:

- primary owner: `<OWNER_PRIMARY_FROM_PRIVATE_REGISTER>`;
- fallback decision maker: `<OWNER_FALLBACK_FROM_PRIVATE_REGISTER>`;
- primary incident channel: `<PRIMARY_PRIVATE_INCIDENT_CHANNEL>`;
- out-of-band fallback: `<OUT_OF_BAND_PRIVATE_CHANNEL>`.

Do not replace these placeholders in this file with personal data or credentials.
If the private register is unavailable, escalate severity one level and use the
pre-agreed out-of-band channel; do not improvise a public channel.

## Severity and authority

| Level | Observable impact | Initial response target | Authority |
|---|---|---:|---|
| SEV1 | Confirmed active compromise; unauthorized production access or data disclosure; destructive corruption; duplicate/cross-contour 1C documents; recovery and primary service both unavailable | acknowledge 5 min, containment decision 15 min | owner or fallback immediately; incident commander mandatory |
| SEV2 | Production API/UI unavailable or materially degraded; sustained failed service/restart loop; queue cannot progress; backup integrity failure; valid evidence of attempted privilege/contour breach without confirmed disclosure | acknowledge 15 min, containment decision 30 min | incident commander; owner approval for every production mutation |
| SEV3 | Partial feature/integration failure with bounded impact and safe workaround; single outbound channel failure; abnormal rates without confirmed compromise | acknowledge 1 h | assigned responder; owner approves production mutation |
| SEV4 | No user impact; warning, false positive candidate, documentation gap or fixture-only finding | next working period | normal change workflow |

Unknown scope is not evidence of low severity. Start at SEV2 when confidentiality,
integrity or contour isolation cannot yet be bounded, then downgrade only with cited
evidence. Any duplicate document or contour mismatch remains SEV1 until reconciled.

Roles are assigned in the private incident record:

- incident commander: owns severity, approvals, timeline and stop/go decisions;
- technical responder: performs approved bounded checks and recovery;
- evidence custodian: preserves originals and SHA-256 manifest;
- communications owner: sends sanitized updates;
- 1C owner: validates TEST/VLAVKA decisions and document evidence;
- reviewer: independent closeout verification, not the implementing responder.

One person may fill several roles for SEV3/4. SEV1/2 closure requires an independent
reviewer.

## Approval gates

Read-only collection of already authorized, sanitized operational facts is allowed.
The following require an explicit owner approval naming incident ID, environment,
action, target, rollback and time window:

1. **REQUIRES EXPLICIT OWNER APPROVAL** — change any env file, secret, kill switch,
   unit, nginx/firewall configuration, permission or scheduled job; restart, reload,
   stop, enable or disable a service.
2. **REQUIRES EXPLICIT OWNER APPROVAL** — rotate or revoke any credential; change a
   GitHub setting; send real email/Telegram/push; expose an incident to a third party.
3. **REQUIRES EXPLICIT OWNER APPROVAL** — deploy, merge, target-pinned rollback,
   database write/migration/restore, uploads replacement or production backup restore.
4. **REQUIRES EXPLICIT OWNER APPROVAL** — pull/claim/requeue/ACK a real order, operate
   the working VLAVKA 1C, change a 1C extension/configuration or switch TEST/production.

Approval for containment is not approval for recovery. Approval for one contour is
not approval for the other. Emergency urgency does not broaden the approved target.

## Incident lifecycle

### 1. Detect and open

1. Create an external incident record with a random incident ID, UTC timestamps,
   detector, sanitized signal ID, environment and initial severity.
2. Verify the signal against its source of fact: monitoring JSON/schema, systemd
   result/restart counters, bounded HTTP status, sanitized audit aggregate, backup
   evidence, deploy receipt or GitHub check. Do not rely on alert text alone.
3. Record production SHA, active units/listeners, health and kill-switch status as
   booleans/enums. Do not print environment values.
4. Declare what is confirmed, disproved and `NOT VERIFIED`.
5. Assign incident commander and evidence custodian from the private register.

If the primary alert channel is unavailable, the local sanitized monitoring sink is
the source of fact and the out-of-band private channel is used. Channel failure is a
separate incident fact; it must not suppress or falsely acknowledge the original
alert.

### 2. Triage

Build a bounded timeline and test no more than three distinguishable hypotheses at
once. Determine:

- confidentiality, integrity and availability impact;
- client, manager and administrator impact;
- exact environment: local fixture, TEST or production;
- exact 1C contour: TEST or VLAVKA, never both by inference;
- first and last known affected time;
- affected component and release SHA;
- whether ongoing writes increase harm;
- whether evidence contains PII or secrets and needs restricted handling.

Do not query a working 1C queue by pulling an order. Read-only aggregates and existing
audit events are acceptable; real claim/ACK is not a health check.

### 3. Contain

Choose the narrowest control that stops new harm while preserving recovery paths.
Apply at most one containment change at a time, confirm its status projection and
user impact, then reassess severity.

| Capability | Control | Effect while active | Must remain available | Notes |
|---|---|---|---|---|
| 1C inbound pull/claim | `CLOVER_PAUSE_ONEC_CLAIMS=true` | blocks new claim | ACK for already claimed order | malformed explicit value fails closed |
| Direct Clover → 1C draft write | `ONEC_WRITE_ENABLED=false` and stored `allowDraftCreation=false` | blocks draft creation | inbound queue/ACK contract | double gate; contour flags are not substitutes |
| Registration | `CLOVER_PAUSE_REGISTRATION=true` | returns bounded 503 | existing login/session paths | do not test with a real registration |
| Guest orders | `CLOVER_PAUSE_GUEST_ORDERS=true` | blocks guest order creation | existing authenticated flows unless separately affected | do not submit a real order as proof |
| Uploads | `CLOVER_PAUSE_UPLOADS=true` | denies before multer writes | existing stored files remain readable under normal authorization | include reconciliation upload paths |
| All outbound notifications | `CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS=true` | denies email, Telegram and push | local audit/monitoring evidence | preferred broad notification containment |
| Email only | `CLOVER_PAUSE_EMAIL=true` | denies email | other unpaused channels | no real test message |
| Telegram only | `CLOVER_PAUSE_TELEGRAM=true` | denies Telegram | other unpaused channels | no real test message |
| Push only | `CLOVER_PAUSE_PUSH=true` | denies push | in-app state | no real push |
| MAX | N/A | transport not implemented | N/A | do not invent a switch |

Every switch change is **REQUIRES EXPLICIT OWNER APPROVAL** and requires: exact prior
state recorded without secret values, backup of the protected config, bounded
activation, health check, monitor status-revision agreement and an explicit reversal
plan. Absence/`false` means available; an invalid explicit Stage 9B value pauses only
that feature. Never edit the public status projection without the matching protected
runtime change.

For suspected credential compromise, first use applicable kill switches to bound new
effects, then use the rotation plan below. Do not rotate several credentials at once
unless the breach scope proves they share exposure.

### 4. Eradicate and recover

Recovery starts only when containment is confirmed and evidence originals are sealed.

#### Application rollback

**REQUIRES EXPLICIT OWNER APPROVAL.** Select a full 40-character, reviewed target SHA
that is present in the trusted repository and record why it is known-good. Use the
target-pinned deployment launcher/scripts extracted from that exact SHA, a prepared
artifact whose inventory matches it, the deployment lock and the existing LKG path.
Do not run a live-tree helper from an unrelated release and do not rebuild between
artifact approval and promote.

Acceptance requires two consecutive bounded API/UI/asset probes, correct external
MIME, source SHA equality, clean expected tracked state, successful systemd results
and a deployment receipt. An origin-only check is not external browser proof. If the
automatic rollback cannot restore source plus LKG UI, declare SEV1 and stop further
mutation.

#### Backup restore

The automated evidence contract proves archive hash/integrity and an isolated fixture
restore. **Production backup restore is NOT VERIFIED.** No Stage 9C drill may restore
over production.

SQLite and uploads are captured as separate filesystem objects; restoring them is not
an atomic cross-object transaction. A database may reference an upload absent from the
selected upload snapshot, or an upload may have no matching database row. WAL/SHM
state, archive time and active writer quiescence must also be handled. Therefore a
future production restore is **REQUIRES EXPLICIT OWNER APPROVAL** and requires a
separate, reviewed procedure with: write quiescence, compatible DB/WAL set, timestamped
DB/uploads inventory, hashes, isolated restore validation, referential sampling,
rollback snapshot and owner acceptance. Until that exercise succeeds, recovery status
must say `production restore NOT VERIFIED`.

#### Credential rotation matrix

All rotations are **REQUIRES EXPLICIT OWNER APPROVAL**. Generate secrets only in the
approved secret manager or protected interactive input; never place values in command
arguments, shell history, process lists, Git, chat, screenshots or evidence manifests.
Back up only the protected configuration container, not plaintext into the incident
folder. Verify by metadata/status and fixture probes, never by printing a value.

| Credential | Containment and order | Expected impact | Verification / rollback |
|---|---|---|---|
| `JWT_SECRET` | pause risky writes if indicated; replace protected value; controlled API restart | all existing JWT sessions become invalid | fixture login/token validation plus health; rollback only if old secret is not compromised, otherwise recover access through approved account procedure |
| `ONEC_TEST_EXCHANGE_API_KEY` | isolate TEST; rotate TEST client and server only | TEST inbound exchange interrupted | TEST fixture/auth negative and positive checks; no VLAVKA request |
| `ONEC_VLAVKA_EXCHANGE_API_KEY` | pause new VLAVKA claims; keep ACK path available during coordinated cutover; rotate server and working 1C | VLAVKA pull temporarily interrupted | owner-coordinated contour-auth check without claiming a real order; old key must be rejected; rollback forbidden when old key is compromised |
| `ONEC_API_KEY` outbound | disable direct draft writes; rotate Clover and outbound 1C endpoint together | Clover → 1C draft/health path interrupted | isolated/approved endpoint check; does not authorize inbound routes |
| `CLOVER_MONITOR_STATUS_HMAC_KEY` | replace protected API and monitor copies as one coordinated change | status revision mismatch until both sides agree | revision agreement and successful one-shot; never log key; restore both copies together only if not compromised |
| SMTP password/credential | pause email; rotate at provider and protected Clover config | email unavailable | provider metadata and fixture/stub send only; revoke old credential after cutover |
| Telegram bot token | pause Telegram; rotate with provider and protected config | Telegram unavailable | provider metadata plus fixture/stub; revoke old token; never send a real incident test |
| VAPID private/public pair | pause push; rotate pair and protected/public configuration coherently | existing subscriptions may require renewal | fixture push signing/config checks; publish only the public key; revoke old private key handling path |

### 5. Validate and return to service

1. Repeat the exact detector check and negative/security fixtures.
2. Confirm expected SHA, health, units/listeners, restart counters, disk and fresh
   monitoring run.
3. Confirm TEST/VLAVKA allowlists and credential ownership separately without exposing
   values or pulling a real order.
4. Reverse containment one switch at a time — each reversal is **REQUIRES EXPLICIT
   OWNER APPROVAL** — and observe at least two healthy monitoring samples.
5. Keep a rollback trigger and owner available through the observation window.

Do not declare recovered when the alert is merely silenced. Recovery means the source
of fact is healthy, the risky path is bounded and customer/queue integrity is checked.

### 6. Close

An incident can close only when:

- severity, scope, timeline and root cause are evidence-backed; unresolved claims are
  explicitly `NOT VERIFIED`;
- containment and every reversal have recorded approvals;
- service/queue/contour invariants pass and no duplicate or foreign ACK exists;
- all exposed credentials are revoked or their non-exposure is justified;
- evidence manifest verifies and access to restricted evidence is recorded;
- owner accepts residual risk and communications are complete;
- independent security/reviewer audit is READY for SEV1/2;
- follow-up items have owner and due date outside Git;
- false positives result in a fixture-backed rule adjustment, never disabling the
  monitor or increasing thresholds without review.

## Evidence chain of custody

Create a restricted incident directory outside the repository. The evidence custodian
records for each artifact: random evidence ID, incident ID, UTC collection time,
collector, source component, environment/contour, byte size, SHA-256, original/read-only
copy location, redaction derivative ID and every transfer/access. Seal a canonical
manifest and hash the manifest itself. Never modify an original; analyze a verified
copy.

Allowed routine evidence is bounded and sanitized: unit properties, counters, enum
signal IDs, booleans, timestamps, release SHA, HTTP status/MIME, schema-valid monitor
output and backup/deploy receipts. Raw logs/database rows are restricted evidence and
must be minimized and redacted before sharing. The sanitized derivative receives its
own SHA-256 and a link to the original evidence ID. Do not hash a secret as a way to
make it safe for broad disclosure; low-entropy values remain guessable.

Clock source/timezone, unavailable sources and failed collection attempts are part of
the manifest. A screenshot is supplementary, not a substitute for machine-readable
evidence.

## Communication templates

Use the private channels from the external register. Never include PII, secrets,
orders, document numbers, raw URLs with query strings or unredacted logs.

Initial:

> `[INCIDENT_ID] [SEV] [ENVIRONMENT] Investigating [sanitized capability/signal].`
> `Confirmed impact: [bounded statement/NOT VERIFIED]. Containment: [status].`
> `Next update: [UTC]. Owner approval needed: [exact action or none].`

Update:

> `[INCIDENT_ID] [UTC] Confirmed: [facts]. Disproved: [facts]. Not verified: [items].`
> `Current containment: [switch/capability, no values]. Recovery gate: [gate].`
> `Next update: [UTC].`

Recovery:

> `[INCIDENT_ID] Service restored at [UTC]. Evidence: [sanitized checks].`
> `Observation window: [duration]. Residual risk: [statement]. Production restore:`
> `[NOT USED / NOT VERIFIED]. Closeout review: [pending/READY].`

## Safe fixture-only exercise

The Stage 9C drill is local/isolated only. It must use a temporary root, temporary
SQLite database, synthetic identities, fake notification sinks, disabled network,
TEST-named synthetic contour and fake time. No production env is inherited.

1. Record baseline bytes/mtime/hashes for fixture DB, uploads and backup archive.
2. Inject a synthetic monitor alert and classify it; verify sanitized notification,
   dedupe, escalation, fallback sink behavior and a bounded timeline.
3. Activate fixture kill switches and prove denied registration, guest order, upload,
   notifications and 1C claim. Prove fixture ACK remains reachable when claims are
   paused. Record MAX as `N/A`.
4. Rotate synthetic copies of every credential class in the matrix and prove no value
   appears in output, argv capture or artifacts.
5. Restore the fixture backup to a new temporary destination, verify archive/hash,
   SQLite integrity and fixture DB/upload inventory. Do not overwrite the source
   fixture. Record production restore as `NOT VERIFIED`.
6. Run a rollback simulation against a temporary release fixture pinned by an
   independently recorded synthetic full SHA and inventory hash; verify success,
   selected-candidate tamper rejection, forced validation failure and idempotent
   LKG restoration. The existing safe-deploy verifier separately exercises the
   target-pinned temporary Git workflow.
7. Generate and verify the SHA-256 evidence manifest, redact a derivative, simulate a
   false positive and require two healthy samples before recovery.
8. Remove only the exact temporary fixture root after its resolved path and manifest
   have been reviewed. Fixture cleanup does not authorize production deletion.

Drill PASS requires deterministic tests, no external network/send, no production path
access, no secret/PII pattern in artifacts, unchanged production facts, a verified
manifest and independent security/reviewer READY. Any escape from the fixture root,
real send/request or source mutation is an immediate FAIL.

The automated package is `npm run test:security-stage9c`; Stage 9B kill-switch/ACK
regression is `npm run test:security-stage9b-monitoring`, and the target-pinned deploy
fixture remains part of `npm run check`. The private owner/fallback contact register is
outside Git and remains `NOT VERIFIED` by these automated tests; its existence and
access are an operator closeout check, never a reason to place personal data in source.

## Runbook rollback and false positives

This documentation has no runtime effect. Reverting its commit restores the prior
documentation but does not reverse an operational action. Operational rollback is the
action-specific, pre-approved reversal recorded with the incident.

A false positive is confirmed only when the source of fact is healthy and the fixture
reproduces the alerting defect. Preserve the event, tune the smallest pure rule,
re-run boundary/dedupe/recovery/storm fixtures and obtain independent review. Never
delete evidence, mute the signal indefinitely or treat channel failure as recovery.
