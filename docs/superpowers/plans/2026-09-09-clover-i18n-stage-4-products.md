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
- Columns: `auto_value`, `auto_source_hash`, `manual_value`, `manual_source_hash`, `updated_at`, `updated_by`
- No price, cost, markup, matrix, saleUnits, UOM codes, or 1C authority columns

### `translation_glossary`

- `id`, `source_ru`, `normalized_source`, `language_code`, `target_value`, `context`, `normalized_context`, `protected`, timestamps, `updated_by`
- Unique: `(normalized_source, language_code, normalized_context)`
- Same internal locales. No credentials. No client/business payloads.

Schema is additive and idempotent (`CREATE TABLE IF NOT EXISTS`).

## Effective translation resolution

For each product / language / field:

1. Non-empty MANUAL → MANUAL (shown even if STALE)
2. Else non-empty AUTO → AUTO
3. Else MISSING

STALE is derived when the effective stored `source_hash` ≠ current Russian
`sourceHash(field)`. Stale MANUAL is never auto-overwritten. Stale AUTO may
remain visible for admin review and is incomplete / eligible for explicit
regeneration.

Russian fallback is applied only at display projection time, never written
into canonical `product.name` / `storefrontDetails`.

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

Artifact format `clover-product-auto-import` / `formatVersion: 1`:

```json
{
  "format": "clover-product-auto-import",
  "formatVersion": 1,
  "runId": "stable-run-id",
  "generatedAt": "ISO-8601",
  "items": [
    {
      "productId": "722",
      "language": "en",
      "field": "name",
      "value": "…",
      "sourceHash": "sha256-of-current-ru"
    }
  ]
}
```

Importer (temp-DB tests in Task 1; production run is Task 2 only):

- upsert AUTO only
- never overwrite MANUAL
- require matching current source hash
- validate protected tokens + numeric/dimension semantics
- idempotent on the same `(productId, language, field, value, sourceHash)`

Offline generator may apply glossary longest-match substitution. It is not a
request-time translator and is not invoked by RETURN TO AUTO.

## Fingerprinting

Reuse Stage 3 `sourceHash()` / `normalizeSourceRu()` (NFC, newline normalize,
trim). Empty source fields are not translation-required.

## Completeness

Domain `products` counts critical product **name** cells (non-empty RU name ×
six targets). Details fields appear in untranslated inventory but are not
enablement-critical. Language enablement remains rejected until Stage 9.

Admin «Непереведённое» includes product MISSING/STALE rows.

## Product delete

Same SQLite DB: wrap canonical product-state removal + translation cleanup in
`runInTransaction`. Filesystem photo/certificate cleanup stays after commit.
Manager delete permission unchanged.

## Backup / restore

`exportDatabaseSnapshot` / `importDatabaseSnapshot` include
`productTranslations` and `translationGlossary`. Old snapshots import as empty
new tables.

## Admin UI

- Languages workspace: Products tab + glossary CRUD + untranslated merge
- ProductEditor (admin only): «Переводы» with RU source, six targets, state
  badges, stale warning, RETURN TO AUTO
- Narrow layout reuses the existing one-target-language workspace

## Test strategy

All schema/store/import tests open a **temp** SQLite via `DB_PATH` and prove
`TEST_DB_ISOLATED=YES`. They must not touch
`/opt/clover/clover-app/server/data/clover.sqlite` or the worktree
`server/data` file.

`server/scripts/verify-i18n-stage-4.mjs` covers model, lifecycle, glossary,
validation, import, delete cleanup, completeness, backup tables, locale
boundary, UOM display keys, and Stage 5–9 exclusion.

## Production mutation expectations

Task 1: **no** production DB writes, no merge, no deploy, no AUTO import
against live products.

Task 2 (later, after GitHub review PASS + explicit DB approval): backup,
schema migrate, controlled AUTO import, deploy, `enabledLanguages` still
`["ru"]`.
