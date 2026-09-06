# Clover multilingual / i18n architecture

Status: design approved for specification; implementation is not part of this document change.

Date: 2026-09-06

## 1. Goals

Clover will support a complete, safe and administrable multilingual experience in Russian, English, Uzbek, Kyrgyz, Tajik, Simplified Chinese and Arabic. Russian remains the source language and unconditional fallback.

The design must:

- localize all system-owned visible text in the public storefront, client cabinet, manager cabinet, admin cabinet, desktop browser, mobile browser and PWA;
- preserve existing Russian behavior, URLs, orders, prices, delivery rules, product mappings and 1C exchange semantics;
- provide language-prefixed public routes, localized SEO metadata and localized sitemap entries;
- persist admin-editable translations on the Clover server;
- keep product localization display-only and mapped to the same internal product and 1C identifiers;
- preserve every original order comment and provide Russian text to 1C without allowing translator failure to block an order;
- protect manual translations from automatic overwrite;
- support Arabic RTL and text expansion at 390, 430, 768, 900 and 1440 px;
- allow only complete languages to be publicly enabled.

Success means a user can choose an enabled language, keep that preference across visits and devices when authenticated, navigate equivalent localized routes, and always see either a non-empty target translation or Russian source text. No normal render path calls an online translator.

## 2. Non-goals

This architecture does not:

- translate user-entered client names, organization names, addresses, notes, manager comments or profile fields for display;
- translate internal slugs, product codes, SKU, models, brands, technical series, `oneCId`, `oneCCode` or internal 1C names;
- change pricing, purchase cost, markup, margin, discount, delivery fee, quantity, units of measure, matrices, totals or order state transitions;
- change 1C document matching, queue identity, claim, acknowledgement or idempotency contracts;
- call a translation provider during page rendering;
- select or purchase a paid translation service;
- localize text baked into images; localized image assets are a separate, explicit asset-localization project;
- alter manager permissions as part of multilingual delivery;
- launch any non-Russian language before its completeness gate passes.

## 3. Supported languages

The supported-language registry is code-owned and immutable at runtime. Admin controls public enablement, not the set of valid codes.

- 🇷🇺 Russian: internal `ru`, URL `ru`, direction `ltr`, always enabled and fallback.
- 🇺🇸 English: internal `en`, URL `en`, direction `ltr`.
- 🇺🇿 Uzbek: internal `uz`, URL `uz`, direction `ltr`.
- 🇰🇬 Kyrgyz: internal `ky`, URL `ky`, direction `ltr`.
- 🇹🇯 Tajik: internal `tg`, URL `tg`, direction `ltr`.
- 🇨🇳 Simplified Chinese: internal `zh-CN`, URL `zh`, direction `ltr`.
- 🇸🇦 Arabic: internal `ar`, URL `ar`, direction `rtl`.

All boundaries use a canonicalization function. It accepts only these codes and maps public `zh` to internal `zh-CN`. Unknown, empty and disabled language values resolve to `ru`; they never reach translation lookup as arbitrary keys.

The selector uses the approved compact labels `🇷🇺 RU`, `🇺🇸 EN`, `🇺🇿 UZ`, `🇰🇬 KY`, `🇹🇯 TG`, `🇨🇳 ZH`, `🇸🇦 AR`. Accessible names contain the language name in that language and Russian for admin clarity.

## 4. User experience

### Resolution precedence

Language is resolved once by the application shell in this order:

1. An explicit supported and enabled language prefix in the current URL.
2. The authenticated user's server-side `preferred_language` after session bootstrap.
3. A valid manual choice in local storage.
4. Russian.

There is no redirect based on browser language. A first visit with no saved choice is Russian. For an authenticated manual selection, Clover updates the in-memory locale immediately, saves it locally and writes the same canonical value to the profile endpoint. A failed profile write does not revert the visible choice; it shows a localized retryable error and retains the local preference.

On login, an explicit URL wins for the current navigation. Otherwise the server preference wins and refreshes local storage. On logout, the last manual local preference remains on that device. Disabling a language makes existing saved preferences resolve safely to Russian without deleting the stored value, so re-enabling can restore it.

### Selector placement

One shared `LanguageSelector` contract is used by both lazy-loaded shells:

- storefront desktop: compact flag plus code/name in the header;
- cabinet desktop: compact selector in persistent account/navigation chrome;
- mobile and PWA: compact flag/code trigger opening a keyboard- and screen-reader-accessible list;
- manager/admin: the same selector changes only the operator's UI, never client data or business behavior.

The selector preserves the current route identity, query and hash. On public routes it swaps the language prefix; on legacy unprefixed routes it creates the corresponding prefixed route. It must not reset a cart, unsaved form or authenticated session.

### Fallback contract

`t(key, params)` and entity-localization helpers never expose an empty string, `undefined`, `null` or a technical key. Lookup order is:

1. non-empty requested-language MANUAL value;
2. non-empty requested-language AUTO value;
3. non-empty authoritative `translation_entries.source_ru` for persisted/admin-managed content;
4. bundled Russian source/default for code-owned UI keys when no persisted entry exists;
5. a controlled generic Russian message for genuinely invalid data, with diagnostics recorded outside the UI.

User-entered content is shown exactly as entered, except for the separate order-comment-to-1C pipeline in section 11.

## 5. Routing and SEO

### Route model

The current application chooses storefront versus cabinet in `src/main.jsx`, parses storefront paths in `src/screens/storefront/mode.js`, and manages metadata in `src/screens/storefront/seo.js`. The multilingual route parser must extract an optional language prefix before passing the unchanged internal path to those existing decisions.

Public and cabinet aliases are supported as:

- `/ru/...`, `/en/...`, `/uz/...`, `/ky/...`, `/tg/...`, `/zh/...`, `/ar/...`;
- internal route segments remain unchanged, for example `/en/catalog/hozyajstvennye-tovary/...`;
- `/ru/lk`, `/en/lk` and equivalent prefixes select the cabinet shell while preserving the existing internal `/lk` semantics;
- API, assets, uploaded files, service worker, manifests and health paths are never interpreted as language prefixes.

Route generation always uses the public URL code, so internal `zh-CN` emits `/zh/`.

### Backward-compatible Russian URLs

Rollout is deliberately two-step:

1. At multilingual-route launch, existing unprefixed URLs continue to render Russian and return success. Their canonical points to the equivalent `/ru/...` URL. This protects old links, saved PWA navigation and current indexing while prefixed pages are observed.
2. Only after search-console, access-log and PWA verification may public storefront URLs receive a permanent 308 redirect to `/ru/...`. `/lk`, authentication callbacks and operational endpoints are excluded until their own compatibility gate passes.

No redirect chain is allowed. Query parameters and fragments are preserved. Unknown first segments keep existing route behavior rather than being guessed as languages.

### SEO output

Every indexable localized public page emits:

- a self-referencing canonical for its prefixed URL;
- `hreflang` links only for languages enabled and complete for that page;
- `hreflang="x-default"` pointing to the Russian canonical;
- localized title, description, H1, page content, category description and FAQ;
- localized Open Graph locale and alternate locales;
- the same product/category identity and untranslated slug across languages.

The sitemap generator emits one URL set per enabled, complete language with alternate links. It omits cart, checkout, cabinets and incomplete translations. Russian legacy URLs are not duplicated as independently canonical index entries.

SEO fallback to Russian keeps a page usable but does not qualify a non-Russian page as complete. A page missing critical localized SEO/content is withheld from `hreflang` and sitemap until complete.

## 6. i18n architecture

### Modules and boundaries

Implementation should introduce four explicit layers:

- `languageRegistry`: valid codes, URL mapping, direction, flags, labels and canonicalization;
- `languageResolver`: URL/profile/local preference precedence and navigation helpers;
- `translationRuntime`: immutable snapshot lookup, interpolation, plural/number/date formatting and Russian fallback;
- `localizedProjection`: server-side public/client projections for products, categories, content and SEO.

React receives a `LocalizationProvider` above the current storefront/cabinet shell split. It exposes locale, direction, `t`, formatting helpers, language metadata and an asynchronous `setLanguage`. Feature components consume keys rather than importing language-specific dictionaries directly.

Translation keys are stable semantic identifiers such as `checkout.submit` or `orders.status.new`; they are not Russian sentences. Keys are namespaced by surface to support completeness and ownership. Interpolation uses named variables and escapes output through normal React rendering. Rich text uses a constrained structured representation or a fixed component map, never arbitrary translated HTML.

Bundled Russian dictionaries are the boot-safe source and fallback. Server snapshots overlay bundled values. Admin writes persist to SQLite and increment a localization version. Rendering never depends on provider availability.

### Business-logic isolation

Localization occurs at display/projection boundaries. Domain objects retain canonical status codes, identifiers, numbers and units. Comparisons, filters, routing identity, totals, delivery decisions and 1C payload construction must never consume localized labels as authority.

An order can record `uiLanguage` as diagnostic metadata, but business logic cannot branch on it. Localized product names are not written back into canonical product or 1C mapping fields.

## 7. Persistent translation data model

The minimum safe SQLite design uses additive schema only.

### User preference

Add nullable `preferred_language TEXT` to `users`. This covers client, manager and admin roles, unlike `client_state`. Reads canonicalize the value; invalid values behave as null/Russian. The profile update endpoint accepts only supported codes and lets a user update only their own preference.

### Language settings

Use the existing `app_state` pattern for a small `localizationSettings` document:

- `enabledLanguages`: always contains `ru` and may contain the other approved codes;
- `catalogVersion`: monotonically increasing integer or opaque version;
- `updatedAt` and `updatedBy` audit metadata.

The server rejects removal of `ru` and rejects enabling a language whose critical completeness gate fails.

### General translation entries

Create normalized tables because admin search/filter/completeness queries do not fit one growing JSON blob:

`translation_entries` contains:

- `id` stable UUID;
- `namespace` such as `ui`, `category`, `page`, `faq`, `seo`;
- `entity_type` and `entity_id` for content-backed records, empty for static UI keys;
- `field_key` stable semantic field/key;
- `source_ru` non-empty Russian source;
- `source_hash` hash of normalized Russian source;
- `critical` boolean;
- timestamps and a uniqueness constraint on namespace/entity/field.

`translation_values` contains:

- `entry_id` foreign key;
- canonical non-Russian `language_code`;
- `value` non-empty translated text;
- `state` constrained to `AUTO` or `MANUAL`;
- `source_hash` used when the translation was produced;
- optional provider/run metadata without secrets;
- `updated_at`, `updated_by`;
- primary key on entry/language.

`FALLBACK_RU` and `MISSING` are derived read states, not persisted writer states. A value is stale when its saved source hash differs from the entry source hash. A stale MANUAL value remains protected and is shown for review; it is never overwritten automatically.

Russian is not stored in `translation_values`. For persisted/admin-managed content, `translation_entries.source_ru` is the authoritative Russian source and is updated only by the owning content editor or an explicit audited admin action. For code-owned UI keys, the bundled Russian dictionary is authoritative; its idempotent seed refreshes `source_ru` and `source_hash` without touching MANUAL non-Russian values. This makes Russian fallback deterministic and removes any separate undefined “RU override” store.

### Product translations

Keep a dedicated `product_translations` table to enforce display-only fields and avoid accidental generic exposure of product internals:

- `product_id`, `language_code` composite key;
- `name`, optional localized public description/composition/characteristics;
- per-field state and source hash, or a constrained JSON metadata object if field count remains small;
- timestamps, editor and generation-run metadata.

The table contains no price, cost, margin, SKU, matrix, UOM or 1C columns. `product_id` points to Clover's stable product identity, not a localized name.

### Glossary

`translation_glossary` contains Russian source phrase, language, preferred target phrase, optional context/category, protected flag, timestamps and editor. The unique key is normalized source phrase/language/context.

### Order comments

Because orders already persist `payload_json`, add backward-compatible fields to the payload rather than a destructive orders-table rewrite:

- `clientCommentOriginal` unchanged;
- `clientCommentDetectedLanguage`;
- `clientCommentRu`;
- `clientCommentTranslationState`: `EMPTY`, `PENDING_WITH_FALLBACK`, `NOT_REQUIRED`, `TRANSLATED`, `FAILED_FALLBACK`;
- `clientCommentTranslationDeadlineAt`, calculated from the fixed two-second translation budget;
- provider/run/error metadata safe for internal diagnostics;
- `uiLanguage` as a non-authoritative hint.

Existing `clientComment` remains readable during migration. Writers dual-read conservatively and must not remove it until all supported versions are migrated and verified.

All schema additions are included in backup export/import and are created through idempotent, transaction-safe migrations.

## 8. Admin: “Языки и переводы”

Add an admin-only navigation entry named “Языки и переводы”. It is not added to manager permissions.

The section has five views:

1. “Интерфейс” for system keys grouped by surface.
2. “Категории и подкатегории” for names and descriptions.
3. “SEO / FAQ / страницы” for structured public content and metadata.
4. “Словарь номенклатуры” for preferred market terminology.
5. “Непереведённое” for missing, fallback and stale items.

All views support search, language filter, section filter and “только непереведённые”. Rows show Russian source, EN/UZ/KY/TG/ZH/AR values, state, stale-source warning and last editor/time. Editing a value creates or changes it to MANUAL. An explicit “вернуть к AUTO” action requires confirmation and changes only that field/language.

Language enablement shows completeness by domain: interface, product names, categories, page content, FAQ, SEO and critical checkout. Russian is visibly locked on. Enable is rejected server-side until all critical items for that language are non-fallback, non-empty and not stale.

Bulk automatic generation operates only on MISSING, FALLBACK_RU and AUTO records. Its update condition explicitly excludes MANUAL records in the transaction. Every admin write and generation run is audited.

## 9. Product translation architecture

Each existing admin product card gains a “Переводы” section. It displays the Russian canonical source and editable EN, UZ, KY, TG, ZH and AR fields with state badges.

At read time, an internal localized product view combines the canonical product with display fields for the requested language. Inside the trusted domain/order layer it retains the same `id`, `oneCId`, `oneCCode`, SKU, mapping, unit and numeric fields; localization substitutes only approved display fields and never mutates the canonical object.

Public and client DTOs are a separate explicit allowlist. They expose the stable public product identity and approved display/commerce fields but never contain `oneCId`, `oneCCode`, purchase cost, markup, margin or internal mapping metadata. The internal 1C payload builder continues to read the unchanged canonical IDs independently of the public/client localized DTO.

Russian source changes mark matching AUTO translations stale and eligible for regeneration. MANUAL fields remain unchanged and are flagged for human review. Initial generation is a one-time, resumable job with stable run ID, per-product results and idempotent upserts.

Protected tokens are extracted before translation and restored exactly afterward. At minimum these include SKU, article/model codes, brand identifiers, technical series such as `СПК` and `ПРМС`, and numeric dimensions/quantities/volumes such as `750 мл`, `50 шт` and `21 см`. Locale-appropriate unit presentation may be display-formatted only when semantic quantity remains identical.

## 10. Local-market terminology and glossary

Product localization is commercial copy, not word-for-word substitution. Every language has an editorially reviewed terminology profile reflecting marketplace vocabulary and product jargon used by buyers and sellers.

The glossary covers nouns, adjectives and phrases such as стакан, контейнер, соусник, миска, тарелка, крышка, пакет-майка, мешок для мусора, перчатки, вафельное полотно, одноразовая одежда, черный and прозрачный.

Generation performs these steps:

1. Detect and protect immutable tokens, brands, models and measurements.
2. Apply the longest matching glossary phrases with context before shorter terms.
3. Ask the selected free provider for a natural catalog title, allowing language-specific word order.
4. Restore and validate protected tokens and numeric semantics.
5. Reject empty, token-losing or measurement-changing output.
6. Save acceptable output as AUTO with source hash and run metadata.

Glossary edits affect only future or explicitly requested regeneration of AUTO values. They never rewrite MANUAL values. Regeneration previews counts and impacted fields before execution and is resumable/idempotent.

Quality acceptance uses native or market-competent human review samples per major category. Literal correctness alone is insufficient.

## 11. Order comment translation pipeline

The pipeline is an asynchronous fail-open state machine isolated from ordinary UI localization. It uses a fixed two-second translation budget; changing that budget later is an explicit reviewed configuration change, not provider-controlled behavior.

1. Normalize only to decide whether the comment is empty; always retain `clientCommentOriginal` byte-for-byte/string-for-string as received. For empty or whitespace-only input, one short database transaction creates the order and queue identity, stores blank `clientCommentRu` and blank `oneCCommentSnapshot`, and sets `EMPTY`. It makes no detector/provider call and 1C emits no comment line, matching existing behavior.
2. For non-empty input, that transaction creates the order exactly once, saves the unchanged original, initializes `clientCommentRu` to `[не переведено] <original comment>`, sets `PENDING_WITH_FALLBACK`, records `clientCommentTranslationDeadlineAt = createdAt + 2 seconds`, and creates the existing queue identity. Commit happens before any detector/provider call.
3. A separate translation worker starts immediately and uses the order ID as its idempotency key. It detects language from the comment text itself; selected UI language is only a low-confidence hint. Detector and provider share the same absolute deadline and cancellation signal.
4. If Russian is detected before the deadline, one conditional transaction copies the original into `clientCommentRu` and sets `NOT_REQUIRED`. No translation call is made. Otherwise the configured free provider translates to Russian within the remaining budget; a successful non-empty result is stored as `TRANSLATED` by compare-and-set.
5. A provider/detector error or invalid output atomically sets `FAILED_FALLBACK` early. A hang or worker crash requires no recovery to unblock 1C: the persisted absolute deadline remains authoritative and the fallback is already durable.
6. Queue listing may expose the same order identity immediately, but queue/pre-claim/claim defer only this order while it is `PENDING_WITH_FALLBACK` and the absolute deadline has not arrived. They do not hold a transaction, block the queue worker or prevent other orders from progressing; they return a bounded retry-after for this identity.
7. At or after the deadline, or immediately for a terminal state, the claim transaction calls one comment resolver. It atomically chooses the stored Russian result when `NOT_REQUIRED`/`TRANSLATED`; otherwise it changes pending to `FAILED_FALLBACK` and chooses the durable marker. It writes the choice to immutable `oneCCommentSnapshot` and claims the order in the same transaction.
8. The 1C payload uses only `oneCCommentSnapshot`, never transient provider output or UI language. Translation compare-and-set rejects updates after snapshot creation, so a late result cannot change an in-flight or sent payload.

A crash between order commit and worker execution is safe: the order already has one queue identity, a durable fallback and an absolute deadline. A recovery scan may retry the same operation ID before that deadline but never creates or enqueues another order. No outage can defer this order beyond two seconds, and no translation wait affects a comment-free order or another queue item.

Tests use a fake clock and deterministic claim/translation races. They prove that a healthy result completed before the deadline is always selected; a hung/crashed provider falls back and becomes claimable at the exact bound; empty, whitespace-only and non-empty comments preserve existing 1C line behavior; and queue, pre-claim and claim use one persisted snapshot with one order identity.

Logging records timing, detected code, confidence, provider adapter name, outcome and sanitized error. It never logs provider secrets and must avoid duplicating sensitive free text in routine logs.

## 12. Free provider abstraction

Define an internal adapter independent of any vendor:

```text
detectLanguage(text, { hint, signal, timeoutMs })
  -> { language, confidence }

translate(text, { from, to, glossary, signal, timeoutMs, operationId })
  -> { text, provider, modelVersion }
```

The adapter normalizes provider codes to Clover codes, enforces size/time limits, validates non-empty output and classifies retryable versus permanent errors. Credentials/configuration stay in server environment or protected configuration, never translation records or client bundles.

Before phase 8 implementation, a provider research gate must reproduce free support and acceptable quality for `en→ru`, `uz→ru`, `ky→ru`, `tg→ru`, `zh→ru` and `ar→ru`. It must document rate limits, privacy/data retention, deployment model, availability and licensing. Self-hosted open-source and genuinely free remote options may be evaluated, but the application contract is not coupled to either.

If any required language lacks an acceptable free solution, phase 8 stops and reports the gap. Clover must not silently enable a paid API or send production comments to an unapproved service.

## 13. Arabic RTL

When locale is `ar`, set `lang="ar"` and `dir="rtl"` on the document root and appropriate portals. Components use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`, `text-align: start/end`) rather than duplicating whole stylesheets.

Bidirectional isolation is mandatory for prices, numbers, SKU, article/model/1C codes, dimensions, phone, email and URLs. Use semantic LTR wrappers or `dir="ltr"` plus `unicode-bidi: isolate` at the smallest meaningful boundary. Inputs containing these values keep sensible cursor direction.

RTL acceptance covers storefront, product cards, cart, checkout, client/manager/admin cabinets, tables, forms, dialogs, overlays, toasts and installed PWA. Icon meaning is reviewed individually: directional arrows mirror; logos, media controls and non-directional icons do not.

## 14. Responsive and text-expansion strategy

Localization must not be solved by globally shrinking typography. Components are hardened with wrapping flex/grid layouts, `min-width: 0`, content-aware min/max sizes, multi-line buttons where appropriate and overflow behavior for genuinely tabular data.

Required visual regression widths are 390, 430, 768, 900 and 1440 px for all seven languages. The suite checks:

- no horizontal page scroll caused by translations;
- no overlap, clipping, border crossing or control collision;
- buttons remain touch-accessible when wrapping to two lines;
- navigation and selector remain usable with keyboard and screen reader;
- UZ/KY/TG and English expansion;
- compact Chinese behavior;
- Arabic RTL and isolated LTR tokens;
- dialogs, errors, validation, notifications and loading/empty states, not only happy paths.

Localized copy should be natural and concise, but layout remains robust when strings expand beyond the reviewed sample.

## 15. Security and data exposure

Public/client localization endpoints return allowlisted locale metadata and display content only. They must not expose purchase cost, markup, margin, internal 1C IDs/codes, manager comments, admin configuration, secrets or unrelated internal flags.

Admin translation reads/writes require authenticated admin authorization on every route. CSRF/origin protections and existing audit patterns apply. Clients cannot write translations; managers receive no new translation permission in this scope.

Inputs are constrained by supported code, namespace, entity, maximum length and permitted field. Rich content is stored as validated structured content or sanitized against a strict allowlist. Translation keys cannot select arbitrary database columns or filesystem paths.

Provider calls occur only server-side. Secrets are never returned, logged or stored in translation metadata. Order comments follow the existing access policy and are not exposed through public localization APIs.

## 16. Performance and caching

At server start, build immutable translation snapshots by language/namespace from SQLite and bundled Russian defaults. Public responses can request only the namespaces needed by a shell. Product/category endpoints localize in bounded batches rather than per-item queries.

Each admin edit commits data and increments `catalogVersion` in one transaction. The server atomically replaces affected in-memory snapshot entries after commit, so no restart is required. Clients receive version/ETag metadata and re-fetch when versions differ; a stale cache can continue using its last complete snapshot plus Russian fallback.

Do not put entire product translations into the initial UI dictionary. Code-split UI namespaces with the existing storefront/cabinet split, paginate admin searches and index translation tables by language, namespace, entity and missing/stale state.

No external provider call occurs in request-time UI rendering. Initial generation and bulk regeneration are explicit background/admin jobs with bounded concurrency and progress checkpoints.

## 17. Migration and backward compatibility

Migration is additive and staged:

- backup and integrity-check SQLite before schema changes;
- add nullable user preference and new localization tables without rewriting canonical product/order fields;
- seed bundled Russian keys and content sources idempotently;
- default missing user preferences and all unknown language inputs to Russian;
- keep existing products and pages readable through Russian fallback before any generated translation exists;
- dual-read legacy order `clientComment` while new comment fields are introduced;
- keep unprefixed routes serving existing Russian behavior during the compatibility period;
- leave existing order/1C queue, claim and acknowledgement fields untouched.

Migration jobs use stable IDs/source hashes and can resume safely. No migration deletes canonical Russian content. Backup export/import and restore tests must include every new table and field before production enablement.

## 18. Implementation phases

Each phase has its own branch, tests, review, backup, deployment gate and rollback. A later phase cannot be used to repair an earlier failed deployment.

### Phase 1 — core and Russian fallback

Add language registry, resolver/runtime contracts, bundled Russian source, additive persistence schema and translation lookup. Keep all foreign languages disabled and expose no new public language URLs.

Gate: current Russian UI and all business regression suites remain identical; fallback never emits keys/empty values.

### Phase 2 — selector and preference synchronization

Add the shared selector, local persistence and authenticated `preferred_language` endpoint/sync for storefront and all cabinets. Foreign choices may be exercised only in TEST/preview.

Gate: precedence, offline behavior, login/logout/device synchronization and role authorization tests.

### Phase 3 — system UI dictionaries

Extract and translate all visible system-owned UI text, including navigation, buttons, labels, placeholders, tooltips, validation, errors, success, notifications, auth, profiles, addresses, order states, delivery, recurring orders, reconciliation and communication surfaces.

Gate: key inventory coverage and Russian visual/behavioral parity.

### Phase 4 — admin languages and translations

Add the admin-only five-view section, search/filters/states, manual edit protection, audit and completeness reporting.

Gate: authorization, MANUAL non-overwrite mutation tests and live cache invalidation.

### Phase 5 — category, page, FAQ and SEO content

Persist structured content translations and localized metadata without exposing URLs publicly yet.

Gate: per-page completeness and safe public projections; text-in-image assets reported separately.

### Phase 6 — products, glossary and initial population

Add per-product translation cards, glossary, protected-token validation and one-time resumable AUTO population.

Gate: same product IDs/1C mappings/prices/UOM/matrices across every locale; human market-language sample approval.

### Phase 7 — multilingual routes and SEO

Enable prefixed routing, canonical/hreflang, localized sitemap and legacy Russian compatibility. Publicly enable only languages passing their completeness gate.

Gate: crawl test, redirect/canonical matrix, old-link/PWA compatibility and no duplicate canonical pages.

### Phase 8 — free order-comment translator

Complete provider research gate, implement detection/translation abstraction, persisted original/Russian fields and fail-open 1C text selection.

Gate: all six language-to-Russian pairs, outage/timeout tests, queue/pre-claim/claim idempotency and real 1C TEST validation with a controlled test order only after separate approval.

### Phase 9 — Arabic RTL hardening

Apply logical layout properties and bidirectional isolation across every surface.

Gate: RTL functional/accessibility/visual suite and LTR-token integrity.

### Phase 10 — full regression and controlled enablement

Run all seven languages at 390/430/768/900/1440, complete critical translations, verify operational metrics and enable languages one at a time.

Gate: full Clover regression matrix, zero critical missing items, reviewed rollback and explicit production approval per language.

## 19. Testing strategy

### Unit and contract tests

- canonical language/URL mapping, including `zh` ↔ `zh-CN`;
- resolution precedence and disabled/invalid fallback;
- no key/empty/undefined leakage;
- interpolation, plural, date/number/currency formatting;
- MANUAL overwrite protection and source-hash staleness;
- protected product tokens and unchanged measurements;
- safe localized product/public projections;
- comment detection, Russian bypass, translation success and failure marker;
- provider timeout/cancellation/code normalization;
- cache version/ETag invalidation;
- RTL direction and LTR isolation helpers.

### Integration tests

- admin authorization and client/manager write denial;
- language preference sync across sessions/devices;
- additive migration, backup/export/import and rollback fixtures;
- bulk generation resumability and idempotency;
- localized catalog/content/SEO APIs without restricted fields;
- order creation continues during provider outage;
- queue, pre-claim and claim use persisted Russian/fallback comment while preserving the same order and product identifiers;
- no change to pricing, delivery-zone fees, totals, UOM, matrices or 1C mappings.

### Route and SEO tests

For every enabled language and public route type, assert status, preserved internal slug, canonical, `hreflang`, `x-default`, localized title/description/H1 and sitemap inclusion. Verify legacy unprefixed Russian URLs and exclude API/assets/service worker/cabinet-private routes from public SEO behavior.

### Visual, accessibility and E2E

Run storefront, product, cart, checkout, auth, client, manager and admin journeys in all seven languages at 390, 430, 768, 900 and 1440 px. Include keyboard selector use, screen-reader names, focus restoration, dialog/validation/error states, PWA standalone mode and Arabic RTL.

Every phase must retain PASS for auth/login, all cabinets, catalog/product cards, cart/checkout, delivery zones/prices, order creation/status, recurring orders, reconciliation, matrices, pricing, PWA, storefront, current Russian SEO and existing 1C regression verifiers.

## 20. Rollback strategy

Before every schema/content phase, create and checksum the standard Clover source and SQLite/data/environment backups. Record old commit, database schema version, localization version and enabled-language set.

Rollback is phase-specific:

- disable newly enabled non-Russian languages first, which immediately returns users to Russian fallback;
- revert application code through the normal Git deployment workflow;
- retain additive translation tables when old code ignores them, avoiding destructive downgrade;
- restore the database backup only when a verified schema/data corruption requires it and only with explicit DB approval;
- never roll back canonical products/orders/1C identifiers by copying translated display data into them;
- keep original order comments even if the translator feature is disabled.

Each deployment proves old-version compatibility with additive data before release. A rollback drill in TEST must cover UI snapshot/version mismatch, failed language enablement and comment-provider outage.

## 21. Risks and open implementation checks

The following are implementation gates, not permission to guess:

- free-provider support, privacy, rate limits, licensing and commercial-language quality for all six required routes to Russian;
- language-detection accuracy for short, mixed-script and code-heavy comments;
- exact deployment architecture for background generation without introducing order delays;
- complete inventory of hard-coded Russian UI text across large JSX modules, server errors, emails, push messages and generated documents;
- whether server-rendered/static SEO support is needed for crawlers beyond the current client-side metadata mechanism;
- reverse-proxy/PWA handling of prefixed `/.../lk` and service-worker navigation fallbacks;
- canonical strategy observation period and evidence required before any 308 rollout;
- source identity for categories whose current Russian labels also serve as internal taxonomy keys;
- safe product source-hash normalization that does not mistake formatting changes for semantic changes;
- human reviewers or market-language acceptance criteria for UZ, KY, TG, ZH and AR terminology;
- storage/backup growth for product translations and audit metadata;
- Arabic font coverage, PDF/print/email direction and third-party widget behavior;
- exact critical completeness thresholds per namespace and route;
- provider handling of personal data in order comments under applicable policy;
- real 1C TEST proof that translated display fields never alter item mapping and only the explicit Russian comment field changes.

Any failed provider/language, security, completeness, 1C-isolation or migration gate stops that phase. It must not trigger a silent paid-provider switch, automatic business-logic change or public language enablement.

## Architecture decisions summary

This design deliberately uses the existing SQLite and `app_state` patterns where they fit, but uses normalized translation tables for searchable/admin-editable data. It keeps Russian bundled as a boot-safe fallback, uses server persistence for edits, localizes only at UI/API projection boundaries, and separates dynamic order-comment translation from normal i18n.

The alternatives rejected for implementation are:

- bundled JSON only, because admin edits and cross-device consistency would not persist;
- one unstructured translation JSON blob, because search, completeness, state protection and product-scale updates become unsafe;
- runtime online translation, because latency/outages would affect rendering and manual quality control;
- localized copies of canonical products, because they risk divergence of price, matrix, UOM and 1C identity.
