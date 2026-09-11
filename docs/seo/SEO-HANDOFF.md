# CLOVER SEO HANDOFF

## SEO-002 Google product soft 404 — current-state correction

Git history: PR #99 merged.

Coordinator-provided production evidence: GSC Live Test for product
`НФ-00000243` rendered the real product page and reported
«URL доступен Google»; an indexing request was submitted.

This manual GSC evidence is coordinator-provided and was not independently
reproduced by the SEO-004 agent.

---

## SEO-004 Priority B2B category pages

TASK:
SEO-004 Priority B2B category pages

START_BASE:
a845f30884714aadc24b61444936b8b393ae9d84

FINAL_MAIN:
a845f30884714aadc24b61444936b8b393ae9d84

STATUS:
PR_READY_NEEDS_RENDER_CHECK

TARGETS:
- Одноразовая посуда
- Пакеты, упаковочные материалы
- Хозяйственные товары

IMPLEMENTED:
- Storefront-local RU commercial resolver (`categoryCommercialSeo.js`) for
  exactly 3 top-level categories when locale=ru and subcategory/facet empty
- Commercial H1 + compact lead + crawlable «Популярные разделы» anchors
- Lower B2B body + 3 benefits + 3 native `<details>` FAQs after products
  (only when payload ready, products present, search query empty)
- Locale-aware optional 3rd arg on `storefrontRouteDocumentMeta`;
  StorefrontApp passes `locale` from `useLocalization()`
- Deterministic verifier `verify-seo-004-commercial-categories.mjs`

FILES:
- NEW: `src/screens/storefront/categoryCommercialSeo.js`
- NEW: `server/scripts/verify-seo-004-commercial-categories.mjs`
- MOD: `src/screens/storefront/pages/CatalogPage.jsx`
- MOD: `src/screens/storefront/seo.js`
- MOD: `src/screens/storefront/StorefrontApp.jsx`
- MOD: `src/screens/storefront/storefront.css`
- MOD: `docs/seo/SEO-HANDOFF.md`

TESTS:
- SEO-004 verifier GREEN (RED first: exactly 3 records)
- I18N 5.1 PASS; I18N 5.2-B PASS (`env -u DB_PATH`)
- SEO-002 PASS; catalog stale-route / prefix-search / sale-price / scroll-top PASS
- catalog tree-ui FAIL on START_BASE already (pre-existing CSS contract drift;
  not introduced by SEO-004)
- lint PASS; `git diff --check` PASS; safe build PASS; sitemap verify PASS

I18N:
- I18N corpus changed: NO
- active overlap: I18N_FILE_OVERLAP=YES (`seo.js`, `CatalogPage.jsx`,
  `StorefrontApp.jsx` — same UI surfaces as Stage 5.2-B; no equivalent
  category-landing/FAQ architecture on unmerged I18N refs)
- base stale: NO
- merge gate required: YES

PRODUCTION:
NOT DEPLOYED

NEXT:
wait for I18N safe window;
then fresh overlap/reconciliation check;
then separate merge authorization;
complete desktop/mobile render check on isolated preview.

---

## SEO-002 Google product soft 404 (historical pre-merge note)

TASK:
SEO-002 Google product soft 404

STATUS:
READY_FOR_COMMIT

BASE:
- origin/main SHA: 131cddfe6a6df6aaee32759a796579914f324888
- working branch: cursor/seo-002-google-soft404
- worktree: /opt/clover/seo-002-google-soft404

ROOT CAUSE:
PUBLIC_API_BLOCKED_BY_ROBOTS — `Disallow: /api/` blocked Google WRS from
`GET /api/public/catalog/{code}` required by ProductPage; API itself returns 200
for valid products; product HTML is crawlable; Google Live Test Soft 404 matched
ProductPage error UI (request-failed / to-catalog).

FIX:
- robots.txt: `Allow: /api/public/` (more specific than `Disallow: /api/`)
- Express middleware: `X-Robots-Tag: noindex` on `/api/public/*` only
- private `/api/*` remains disallowed; HTML storefront not noindexed

ROBOTS CONTRACT:
- ALLOW: `/`, `/catalog`, `/product/…`, `/api/public/…`
- DISALLOW: other `/api/…`, `/lk`, `/vitrina/lk`

PUBLIC API INDEXING CONTRACT:
- crawl allowed for rendering XHR
- JSON responses: `X-Robots-Tag: noindex`

TESTS:
- `server/scripts/verify-seo-002-public-api-robots.mjs` (RED→GREEN)
- sitemap verifier, info-pages robots asserts, lint, build

PRODUCTION:
NOT DEPLOYED (pre-commit)

NEXT:
After deploy — GSC Live Test `https://clover-spb.ru/product/%D0%9D%D0%A4-00000243`

---

## SEO-001 Sitemap (prior)

TASK:
SEO-001 Sitemap

STATUS:
DEPLOYED (see git history / PR #98)

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
