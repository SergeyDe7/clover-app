# CLOVER SEO HANDOFF

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
