# CLOVER SEO HANDOFF

## SEO-004 Priority B2B category pages — current refresh

BASE: `eccbe445cad5091b7e1601f9b72e17dc72e6d3b7`

SCOPE:
- refresh the useful PR #104 commercial content on the current locale-routing architecture;
- keep the source contract shared by browser metadata, React UI, sitemap manifest,
  and initial raw HTML;
- publish only the three approved RU top-level categories;
- emit popular links only when the target is present in the generated manifest.

VERIFICATION:
- deterministic `test:seo-004-commercial-categories` covers exact content,
  negative route/locale guards, browser/manifest metadata parity, raw HTML,
  canonical/robots/alternates, and manifest-backed popular links;
- included in `server` `test:all`.
- focused SEO-004, crawlable-links, and stale-route verifiers: PASS;
- Vite production build and Stage 7 route/HTML/sitemap verifier: PASS;
- full `server` `test:all`: PASS on Windows; the existing Stage 8A Linux-only
  `openat`/`fchmod`/`flock` check remains explicitly not verified on Windows.
- Playwright/Edge browser smoke: PASS for 28 locale/page combinations, including
  RU commercial desktop/mobile UI and negative search/subcategory/facet/non-RU guards.

PRODUCTION: **NOT DEPLOYED**

---

## SEO-002 Google product soft 404

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
