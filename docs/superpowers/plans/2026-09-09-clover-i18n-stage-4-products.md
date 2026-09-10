# Clover i18n Stage 4 — products, glossary, UOM display

Task 1 of exactly 2. Implements the product/glossary portion of
`docs/superpowers/specs/2026-09-06-clover-multilingual-i18n-design.md`
(historical SHA `e14aeb0b43b658e0a63b33fcf8032abfa7f22af6`).

Localization remains **display-only**. Russian stays the canonical product
source and the unconditional fallback. Localized text never becomes business
authority.

## Factual inventory (base `cbd1d0e`)

Recorded read-only against production `app_state.products` before edits:

| Key | Value |
| --- | --- |
| PRODUCT_COUNT_BASE | 698 |
| ACTIVE_PRODUCT_COUNT | 698 |
| PRODUCT_NAME_SOURCE_COUNT | 698 |
| PRODUCT_DESCRIPTION_SOURCE_COUNT | 659 |
| PRODUCT_COMPOSITION_SOURCE_COUNT | 659 |
| PRODUCT_CHARACTERISTICS_SOURCE_COUNT | 659 |
| Product id representation | JSON integers; all table/API boundaries use `String(product.id)` |
| FRONTEND_UOM_DISPLAY_USAGES | storefront unit helper + product/cart/client/manager label sites using `UNIT_CONFIG.label` / `shortLabel` / `storefrontUnitLabel` / `quantityInputUnitLabel` |
| SERVER_UOM_LABEL_USAGES | `pricing.unitLabel()` plus 1C `saleUnitName`, storefront unit error, price-list PDF |
| Generic catalog | `translation_entries=1856`, `translation_values=11136`, `catalogVersion=2`, `enabledLanguages=["ru"]` |
| ProductEditor callers | `ManagerProducts`, `ManagerClients` |
| Product delete | `DELETE /api/admin/products/:productId` → `removeCloverProductFromState` + `setGlobalState` + upload cleanup |
| Backup | ZIP `snapshot.json` from `exportDatabaseSnapshot()` (must add new tables) |
| Admin role | localization APIs already `roleRequired("admin")`; managers keep product-delete permission |

Open PRs at start: #61 security audit, #60 storefront UOM UX (not i18n product store). No overlapping i18n product/glossary PR.

## Data model

Dedicated tables. Products are **not** stored in generic `translation_entries`.

### `product_translations`

Per-field AUTO and MANUAL values on one row so RETURN TO AUTO cannot destroy
the AUTO baseline.

- Identity: `(product_id, language_code, field_key)`
- `product_id` = `String(product.id)` — application-validated, **no SQL FK**
- `language_code` ∈ `en | uz | ky | tg | zh-CN | ar` (no RU rows)
- `field_key` ∈ `name | description | composition | characteristics`
- Columns: `auto_value`, `auto_source_hash`, `auto_run_id`, `auto_generated_at`, `manual_value`, `manual_source_hash`, `updated_at`, `updated_by`
- CHECKs: non-empty `product_id`; finite `language_code` / `field_key`; AUTO/MANUAL hash/value consistency
- No price, cost, markup, matrix, saleUnits, UOM codes, or 1C authority columns

### `translation_glossary`

- `id`, `source_ru`, `normalized_source`, `language_code`, `target_value`, `context`, `normalized_context`, `protected`, timestamps, `updated_by`
- Unique: `(normalized_source, language_code, normalized_context)`
- Finite contexts only: `"" | product.name | product.description | product.composition | product.characteristics`
- Same internal locales. No credentials. No client/business payloads.

Schema is additive and idempotent (`CREATE TABLE IF NOT EXISTS`).

## Effective translation resolution

Admin workspace (review):

1. Non-empty MANUAL → MANUAL (shown even if STALE)
2. Else non-empty AUTO → AUTO
3. Else MISSING

STALE is derived when the stored source hash ≠ current Russian `sourceHash(field)`.
Stale MANUAL is never auto-overwritten. Stale AUTO may remain visible for admin
review.

Public/client display (`projectLocalizedProductDisplay`):

- MANUAL is used only when `manualSourceHash === currentSourceHash`
- otherwise AUTO is used only when `autoSourceHash === currentSourceHash`
- otherwise canonical Russian fallback
- stale MANUAL does **not** fall through to AUTO for public display

Canonical `product.name` / `storefrontDetails` are never mutated by projection.

## RETURN TO AUTO

Clears only the MANUAL override for that exact product/language/field.
Reveals the preserved AUTO baseline. Does not call a translator and does not
invent AUTO text. If AUTO hash is stale → STALE. If no AUTO → MISSING.

## Product API (ADMIN only)

Manager cannot write translations.

- `GET /api/admin/product-translations/:productId`
- `PUT /api/admin/product-translations/:productId/:language/:field` — MANUAL
- `POST /api/admin/product-translations/:productId/:language/:field/reset-auto`
- Workspace merge through existing `GET /api/admin/translations` for views
  `products` and `untranslated`

Every write validates: product exists, exact locale helper, allowed field,
non-empty MANUAL, current source identity, protected tokens, numeric/dimension
semantics.

Locale boundary reuses Stage 3 exact helpers: accept `en|uz|ky|tg|zh|zh-CN|ar`;
persist `zh-CN`; reject aliases (`ZH`, `zh_cn`, `ar-SA`, padded codes).

## Display projection

`projectLocalizedProductDisplay(product, language)` copies the canonical
object and substitutes only:

- `name`
- `storefrontDetails.description|composition|characteristics`

Identity, 1C, SKU, category, UOM codes, sizes, prices, matrix, and saleUnits
stay on the canonical object. Public DTO overlay uses the same allowlist.
1C payload builders continue to read canonical fields.

Projection applies only when the requested language is an enabled non-RU
target. Production stays `enabledLanguages=["ru"]`, so live storefront remains
Russian.

## UOM display boundary

Canonical unit **codes** (`piece`, `pack`, …) and size/price fields stay
Russian-authority / numeric. Frontend labels go through catalog keys
`shared.unit.<unit>` / `shared.unit.<unit>Short` with `UNIT_CONFIG` as RU
fallback.

`server unitLabel()` stays Russian for 1C `saleUnitName` and existing server
documents. Do not localize 1C unit names.

## Glossary

Admin CRUD. Longest `source_ru` wins, then longer/more specific context.
Protected entries must appear in AUTO/MANUAL targets when the Russian source
contains that phrase. Glossary edits never rewrite MANUAL rows; they affect
future AUTO import/regeneration only.

## Controlled offline AUTO import

Approved Stage 4 artifact is **chunked**. Top-level `items[]` is forbidden.

```json
{
  "format": "clover-product-auto-import",
  "formatVersion": 1,
  "quality": "AUTO_MACHINE_DRAFT",
  "runId": "stage4-initial-cbd1d0e-6259e882d1bf",
  "baseMainSha": "cbd1d0e3ac831fd41126d4e6b0e7af446d436d42",
  "generatedAt": "ISO-8601",
  "productCount": 698,
  "sourceFieldCounts": { "name": 698, "description": 659, "composition": 659, "characteristics": 659 },
  "sourceCellCount": 2675,
  "targetCellCount": 16050,
  "wholeCatalogSourceFingerprint": "sha256",
  "glossaryCount": 0,
  "glossaryFingerprint": "sha256-of-empty",
  "languageCounts": { "en": 2675, "uz": 2675, "ky": 2675, "tg": 2675, "zh-CN": 2675, "ar": 2675 },
  "chunks": [
    { "file": "chunk-en.json", "language": "en", "count": 2675, "sha256": "64-hex" }
  ]
}
```

Each chunk file holds `{ "language", "items": [{ productId, language, field, sourceHash, value }] }`.
`sha256` is required. Paths must stay inside the artifact directory (no `..`, no absolute, no symlink escape).

Generator: explicit `--source-db` (READ ONLY). Uses persisted `translation_glossary` if the table exists. Writes a temp sibling directory and promotes only after coverage + semantic + lint validation. Failed generation leaves the committed artifact untouched.

`--dry-run` opens SQLite `{ readOnly: true }` and does **not** import `db.js`. Writes: 0. Idempotent no-change apply does not bump `catalogVersion` (an explicit no-op audit row may still be written).

`--apply` requires `DB_PATH`. Production apply additionally requires `CLOVER_ALLOW_PRODUCT_AUTO_IMPORT=YES`, `CLOVER_EXPECT_PRODUCT_AUTO_RUN_ID`, and `CLOVER_EXPECT_PRODUCT_AUTO_FINGERPRINT`. Inside `BEGIN IMMEDIATE` the importer re-reads live products/glossary, rechecks fingerprints, coverage, hashes, and semantics, then writes AUTO rows, bumps `catalogVersion` **once** if any AUTO row changed, and writes sanitized audit `localization.product.auto.import`. Any fatal defect → ROLLBACK, 0 AUTO writes, 0 version change. MANUAL rows are skipped, not fatal.

Importer accounting: `inserted` / `updated` / `skippedManual` / `identical` / `failed`. Fresh TEMP import: inserted=16050. Second identical import: identical=16050, version +0.

## catalogVersion

In-transaction helper `bumpLocalizationCatalogVersion` (no nested BEGIN).

| Event | Δ |
| --- | --- |
| MANUAL actual change | +1 |
| identical MANUAL no-op | +0 |
| return-to-AUTO actual change | +1 |
| reset no-op | +0 |
| glossary ADD / actual EDIT / DELETE | +1 |
| identical glossary save | +0 |
| AUTO import with ≥1 changed AUTO row | +1 for the whole run |
| idempotent AUTO import / MANUAL-only skip | +0 |
| canonical RU source create/delete/change (`name` + storefront details) | +1 once |
| price-only / UOM-size-only / 1C-ref-only | +0 |
| product delete (source removal + translation cleanup) | +1 once |

`enabledLanguages` stays unchanged.

Task 2 expected production arithmetic if no concurrent localization edits:

- PRE `catalogVersion=2`
- Stage 4 generic UI catalog startup sync +1 → `3`
- Initial 16050-cell AUTO import +1 → `4`

## UI catalog arithmetic

PRE 1856. Stage 4 added 44 keys (38 original + 6 glossary-context / load-more). POST **1900**. `translation_values` POST: 1900 × 6 = **11400**.

## Completeness

Counts `product.active !== false` only. Inactive products do not block language
completeness. Domain `products` counts critical **name** cells for active
products × six targets. Detail fields (description/composition/characteristics)
are tracked separately and are not enablement-critical. Language enablement
remains rejected until Stage 9.

Admin «Непереведённое» includes product MISSING/STALE rows for the selected
target language only.

## Admin workspace

Product/untranslated/glossary listings are bounded: selected target language only, default limit 100, max 200, offset + total/hasMore, server-side search. Interface workspace pagination is unchanged.

## Fingerprinting

Reuse Stage 3 `sourceHash()` / `normalizeSourceRu()` (NFC, newline normalize,
trim). Empty source fields are not translation-required.

## Product delete

Same SQLite DB: wrap canonical product-state removal + translation cleanup in
`runInTransaction`. Filesystem photo/certificate cleanup stays after commit.
Manager delete permission unchanged.

## Backup / restore

`exportDatabaseSnapshot` / `importDatabaseSnapshot` snapshot **v5** includes
AUTO value/hash/run id/generated-at, MANUAL value/hash, and glossary fields.
v4 snapshots import successfully with empty Stage4 tables.

## Admin UI

- Languages workspace: Products tab + glossary CRUD + untranslated merge
- ProductEditor (admin only): «Переводы» with RU source, six targets, state
  badges, stale warning, RETURN TO AUTO
- Narrow layout reuses the existing one-target-language workspace

## Test strategy

All schema/store/import tests open a **temp** SQLite via `DB_PATH` and prove
`TEST_DB_ISOLATED=YES`. Default `node server/scripts/verify-i18n-stage-4.mjs`
does **not** open `/opt/clover`. It validates the committed chunked artifact,
true read-only dry-run, full 16050 TEMP apply, idempotent second apply,
resumable subset→full, MANUAL freeze, fatal rollback, SOURCE_STALE order,
stale public fallback, version matrix, backup v5, HTTP auth, pagination, and
inactive completeness.

Optional `--source-db` may be used later by Task 2 for live fingerprint checks.

## Production mutation expectations

Task 1: **no** production DB writes, no merge, no deploy, no AUTO import
against live products. Quality remains `AUTO_MACHINE_DRAFT`. Human market QA
is not performed. Foreign languages stay disabled.

Task 2 (later, after independent GitHub review PASS + explicit DB approval):
backup, schema migrate, generic UI catalog sync (1856→1900 entries,
11136→11400 values, catalogVersion 2→3), controlled AUTO import (16050 rows,
catalogVersion 3→4), deploy. `enabledLanguages` still `["ru"]`.
