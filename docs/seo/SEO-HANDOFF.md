# CLOVER SEO HANDOFF

TASK:
SEO-001 Sitemap

STATUS:
READY_FOR_COMMIT

BASE:
- origin/main SHA: e6111a1e1e4407095d4be171266f499062fcafa4
- working branch: cursor/seo-001-sitemap
- worktree: /opt/clover/seo-001-sitemap

IMPLEMENTED:
- Removed tracked manual `public/sitemap.xml`
- Pure sitemap contract (`src/shared/sitemap/sitemapContract.js`)
- Shared public eligibility + public code helpers reused by `storefrontPublic.listStorefrontProducts`
- Build-time generator → `dist/sitemap.xml` after `vite build` (hard-fail if DB missing)
- Runtime freshness: regenerate `dist/sitemap.xml` on `commitCanonicalProducts` and admin storefront settings save
- Rule-based `verify-sitemap.mjs` (legacy fixture RED → generated GREEN; SET equality)
- Info/aktsii/admin info-pages verifiers assert static allowlist via shared contract

FILES:
- src/shared/sitemap/sitemapContract.js (new)
- server/scripts/generate-sitemap.mjs (new)
- server/scripts/verify-sitemap.mjs (new)
- server/scripts/fixtures/legacy-sitemap-18.xml (new; historic 18-URL RED fixture)
- server/src/sitemapArtifact.js (new; runtime write)
- server/src/productSourceCorpus.js (hook regenerate)
- server/src/server.js (hook regenerate on storefront settings)
- server/src/storefrontPublic.js (reuse shared eligibility/code)
- server/scripts/verify-storefront-info-pages.mjs
- server/scripts/verify-storefront-aktsii.mjs
- server/scripts/verify-storefront-info-pages-admin.mjs
- package.json (`build` runs generate after vite)
- public/sitemap.xml (deleted)
- docs/seo/SEO-HANDOFF.md (this file)

SOURCE OF TRUTH:
- catalog: local `app_state.products` + `oneCProducts` code/name fallback + settings filter matching public catalog
- eligibility: `passesPublicStorefrontEligibility` (shared with API)
- taxonomy: non-empty public category/subcategory pairs from products; empty registry children excluded; data-only included when products exist
- routes: `sitemapStorefrontPath` mirrors `storefrontHref` encoding (no `/vitrina`, no facets)

SITEMAP CONTRACT:
- static: `/` `/catalog` `/contacts` `/aktsii` `/about` `/delivery` `/payment` `/returns` `/wholesale` `/privacy-policy` `/personal-data-consent`
- excluded: `/install-app`, LK/cart/checkout/api/auth/admin/manager, locale prefixes, query/hash, facets, lastmod/priority/changefreq

IMPORTANT DECISIONS:
- Прочее: included as top category when it has public products
- data-only subcategories: included when ≥1 public product (zip-lock, Освежители воздуха, Отбеливатели)
- empty registry subcategories: excluded (currently: Одноразовая посуда/Прочее, Хозяйственные товары/Пленка под запайку)
- privacy/consent: kept in static allowlist
- lastmod: omitted
- CLOVER_SITEMAP_ALLOW_MISSING_DB: removed (YAGNI / silent incomplete risk)
- missing DB at build: hard fail (exit 1)
- freshness: build-time + deferred runtime rewrite of `dist/sitemap.xml` only when public URL set changes (setImmediate coalesce; never inside DB transaction; best-effort log on failure)


RESULT (local DB at independent review time):
- total: 755
- static: 11
- categories: 8
- subcategories: 47 (= 46 registry children − 2 empty + 3 data-only)
- products: 689
- product/taxonomy SET equality vs `getPublicCatalog`: missing 0 / unexpected 0

VERIFICATION:
- verifier: PASS
- legacy RED: PASS (fixture `legacy-sitemap-18.xml` fails full contract)
- info-pages / aktsii / info-pages-admin: PASS
- API regression (shared eligibility): PASS 689/689 SET
- lint: 0 errors (existing warnings only)
- canonical build: PASS with `DB_PATH` only because isolated worktree has no `server/data/clover.sqlite`; production checkout `/opt/clover/clover-app` has default DB path
- build without DB: FAIL exit 1 (no silent incomplete sitemap)
- determinism: checksum identical across 2 generations
- robots: Sitemap directive present; no blanket block of /catalog or /product

SAFETY:
- production untouched
- LK/auth/prices/matrix/cart/checkout/orders/manager-admin UI untouched (aside from sitemap regenerate hooks on existing write paths)
- 1C untouched
- I18N untouched
- DB schema/data untouched (read-only in generator; runtime writes only `dist/sitemap.xml`)
- nginx untouched
- public catalog HTTP behaviour unchanged (shared helper; same filters)

DEPLOY:
NOT DEPLOYED

INDEPENDENT REVIEW:
- result: PASS after local fixes
- issues found:
  - build-time-only sitemap would go stale when public URL set changes without UI rebuild (manager/1C/API product writes)
  - CLOVER_SITEMAP_ALLOW_MISSING_DB allowed silent static-only / incomplete sitemap
  - duplicated eligibility/code logic vs `storefrontPublic` (drift risk)
  - `verify-storefront-aktsii` + `verify-storefront-info-pages-admin` still required deleted `public/sitemap.xml`
  - `--legacy-public` depended on deleted `public/sitemap.xml`
  - prior PASS relied on manual `DB_PATH` in worktree without proving hard-fail on missing DB
- fixes:
  - runtime regenerate via `sitemapArtifact` on `commitCanonicalProducts` + admin storefront settings save
  - **precommit gate:** deferred `setImmediate` refresh (outside DB txn); URL-set change gate (skip price/enrichment-only); coalesce multiple schedules in one turn; CLI generator has no import side effects; tmp cleanup on failed atomic write
  - removed allow-missing escape hatch; missing DB → build exit 1

  - shared `passesPublicStorefrontEligibility` / `resolvePublicProductCode` used by API + sitemap
  - generator loads `oneCProducts` for code/name parity
  - fixed dependent verifiers; legacy RED fixture under `server/scripts/fixtures/`
  - deterministic product-code sort; atomic write (tmp + rename); stronger SET equality in verifier
- catalog freshness decision: YES URL set can change without UI build → fixed with minimal runtime artifact rewrite (no nginx/scheduler)
- build/DB decision: production UI build = `npm run build` (restart-api-ui.sh); generator chained; SQLite required at build on same host default path; worktree needs DB_PATH only because it has no local DB file
- allow-missing decision: removed
- public-contract decision: REUSE shared helpers (not independent duplication)
- route-contract decision: mirrors storefrontHref encodeURIComponent; unit-tested special chars
- verifier independence: expected from DB+helpers; actual from XML; eligibility parity cross-check; legacy fixture not self-derived from generator
- determinism: PASS (sha1 48df6f0f223d0da3089d0bd84b38a08deca2b2c9 ×2)
- robots: OK, no conflict fix needed
- final verification: PASS (see below)
- remaining concerns: NONE critical/important; optional future: serve sitemap from API if UI dist and API ever split hosts

NEXT:
Commit/push/deploy only after explicit human approval (not part of this review).
