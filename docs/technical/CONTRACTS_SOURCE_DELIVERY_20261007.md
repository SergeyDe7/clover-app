# Contracts source delivery — 2026-10-07

Admin-only contracts workspace: local extraction/OCR, optional AI assistance, reviewable requisites, saved drafts, versioned DOCX/PDF generation, archive/trash and supplier/template administration. Source does not contain real supplier templates, cards, SQLite databases, private storage, keys or environment files.

FNS verification is a mandatory server-owned attempt before draft creation/generation, with advisory results. Differences, unavailable registry and unresolved choices produce visible warnings; fields are not overwritten and generation is not blocked by FNS. Normal required-field/template/permission validation remains blocking.

AI remains optional and independent of FNS and document generation. Accepted labels include «Вася всегда на старте» and «Вася разбирает карточки и помогает с реквизитами. Помогает бедолагам чем может)».

Backend parser children receive an environment allowlist, excluding server credentials. Server SheetJS is pinned to official 0.20.3 archive with lock integrity. Compatible dependency updates resolve proxy-addr and sharp advisories; npm audit reports zero vulnerabilities for the server lock.

## Validation

250 contract tests pass, zero fail; one optional private user DOCX fixture is skipped. Child-environment regression passes. Targeted ESLint passes. Production Vite build with VITE_CLOVER_DOCUMENTS_UI_ENABLED=true passes. Private real-template validation and actual production installation are separate release acceptance steps.

## Delivery distinction

This branch integrates contracts against GitHub origin/main 1da6952. The separately prepared production package integrates the same contracts modules against the actual production baseline and preserves its existing local navigation changes. This PR does not claim those unrelated changes as contract source.

## Installation and rollback

No automatic startup migration. Explicit schema migration requires a timestamped backup and installer acceptance. Keep private configuration, original templates and credentials outside public source. Use scripts/release-documents/preflight.py and install-staged.py with a fresh server-specific manifest and separately reviewed private configuration. These source scripts are not a self-contained production release.

On deployment failure the installer restores backed-up source/configuration and restarts services, checking backend and frontend health independently. Rollback of source alone must not discard documents written after installation; database/private-storage rollback needs a coordinated backup plan. Never run a legacy database restore while document state exists without the guarded document backup flow.
