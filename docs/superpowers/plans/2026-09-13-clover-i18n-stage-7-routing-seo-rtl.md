# Clover I18N Stage 7 — locale URLs + hreflang/canonical/sitemap + RTL

Date: 2026-09-13  
Updated: 2026-09-14 (local Stage 7 closure)  
Branch: `codex/i18n-stage-7-routing-seo-rtl`  
Base / HEAD: `a9ce4bf53411854c37cd562e841c7d0e734cbe74`  
Worktree: `/opt/clover/i18n-stage-7-routing-seo-rtl`  
Do not use `/opt/clover/clover-app` for test execution.

## GOAL

Implement public multilingual routing infrastructure, crawler-visible
canonical/hreflang metadata, locale-aware sitemap generation, and Arabic RTL
layout — without activating foreign languages in production.

## AUTHORITY

Roadmap: `docs/superpowers/plans/2026-09-09-clover-i18n-stage-3-2-closure.md`

- Stage 7: public locale URL prefixes, hreflang/canonical/sitemap, RTL.
- Stage 8: order-comment translation for 1C — not this task.
- Stage 9: public foreign-language activation — not this task.

Historical URL design (does not override Stage 6.2 selector/flag/persistence):
`e14aeb0:docs/superpowers/specs/2026-09-06-clover-multilingual-i18n-design.md`

## CONTRACT

- Public canonical locale prefixes: `/ru`, `/en`, `/uz`, `/ky`, `/tg`, `/zh`, `/ar`.
- Eligible `/ru/...` pages render successfully and are self-canonical.
- Existing valid unprefixed public URLs continue to render Russian content
  successfully. Their canonical points to the equivalent `/ru/...` URL.
- Do not introduce permanent legacy-to-prefixed redirects.
- Do not redirect `/ru/...` to the unprefixed alias.
- Preserve unrelated spelling normalization (prefix case, locale-home `/en` → `/en/`).
- Public Chinese code is `zh`; internal locale remains `zh-CN`.
- `hreflang="x-default"` points to the equivalent canonical RU-prefixed page.
- Indexable RU sitemap entries use `/ru/...`. Legacy unprefixed aliases are not
  duplicate sitemap entries.
- Prefixes apply only to public storefront/content routes.
- `/lk`, APIs, assets, uploads, service worker, manifests, robots, and sitemap
  endpoints stay unprefixed. No localized technical endpoints or cabinet sitemap
  entries.
- Cart, checkout, and install-app stay unprefixed, return 200, and are `noindex`.
  Prefixed copies such as `/en/cart` are genuine 404s. Catalog facets return 200
  + `noindex` and are not sitemap entries.
- Unknown routes remain genuine not-found routes.
- URL locale is authoritative on a published public page. Unprefixed public
  URLs are Russian and do not inherit browser/profile language.
- `/lk` keeps Stage 6.2 profile/browser preference, autosave, race protection,
  and route-neutral cabinet behavior.
- No browser-language or storage-only redirects.
- Publication gate = existing enabled-language policy + existing published
  storefront content. No new completeness threshold. RU display fallback is not
  completeness.

## FEATURE FLAG (infrastructure ≠ Stage 9 activation)

Exact readers — all must agree on the same mode:

- Build/HTML stamp: `CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1` →
  `vite.config.js` writes `<meta name="clover-public-locale-routes" content="enabled">`.
  Any other value stamps `disabled`.
- Client routing/SEO: `publicLocaleInfrastructureEnabledFromDocument()` reads
  that meta (`src/shared/i18n/publicLocaleRouting.js`).
- Sitemap / route manifest: `server/scripts/generate-sitemap.mjs` and
  `server/src/sitemapArtifact.js` enable localized `/ru`… output only when the
  same env var is exactly `1`.
- Request HTML delivery: `resolvePublicRouteRequest()` rewrites only when the
  generated manifest has `infrastructureEnabled: true`.

Supported local/Windows and production UI path is Vite preview on `:5273`
(`tools/Start-Clover.ps1`; nginx proxies `clover-spb.ru` to that preview).
Locale HTML is applied by the shared `publicRouteHtml` resolver used by the
Vite preview middleware — the same process production already proxies.

Infrastructure off = legacy unprefixed Russian HTML/sitemap. That is not
public foreign-language activation.

## EXCLUDED

Production language activation, Stage 8/9, schema/auth/pricing/1C changes,
commit/push/PR/deploy.

## LOCAL CLOSURE STATUS

LOCAL IMPLEMENTATION AND VERIFICATION: **CLOSED**
PUBLICATION / MERGE / DEPLOY / PRODUCTION VERIFICATION: **not done**
Stage 8 and Stage 9: **not started** by this task.

Local closure is not a production rollout CLOSED.

## IMPLEMENTED SCOPE

- Public locale routing via `publicLocaleRouting.js` + Vite preview HTML
  resolver `publicRouteHtml.js`.
- Canonical / hreflang / x-default / robots on eligible public pages.
- Enabled sitemap: canonical `/ru|en|uz|ky|tg|zh|ar` variants + reciprocal
  alternates; no unprefixed RU duplicates.
- Disabled infrastructure: legacy unprefixed RU HTML/sitemap.
- Arabic RTL (`lang`/`dir` + layout).
- Cart / checkout / install-app remain unprefixed `200` + `noindex`.
- Organization JSON-LD: stable url `https://clover-spb.ru/ru/`; description
  from that locale’s home SEO, not product/page copy.
- Product SPA locale switch reapplies home-derived Organization description.
- Stage 7 verifier: `server/scripts/verify-i18n-stage-7-routing-seo-rtl.mjs`.

## CANDIDATE IDENTITY

| Field | Value |
|---|---|
| Worktree | `/opt/clover/i18n-stage-7-routing-seo-rtl` |
| Branch | `codex/i18n-stage-7-routing-seo-rtl` |
| Base / HEAD | `a9ce4bf53411854c37cd562e841c7d0e734cbe74` |
| Files | 31 tracked modified + 8 untracked |
| Code-identical prior artifact | `/opt/clover/recovery/i18n-stage7-candidate-20260913T220900Z` hash `90dbedc64…` — implementation unchanged; this update is docs-only after final-code lint/build |
| Final artifact (includes this docs update) | `/opt/clover/recovery/i18n-stage7-candidate-20260913T221330Z` — hash in that `manifest.txt` |
| Serialization | `git diff --binary <base>` then `git diff --no-index /dev/null` for each untracked file in sorted untracked order |
| Earlier same-hash snapshot | `/opt/clover/recovery/i18n-stage7-candidate-20260913T214327Z` and `/opt/clover/recovery/i18n-stage7-pre-closure-20260913T214926Z` hash `2cdefa2fef5726de0b2c7772e49f6b30a258c4d188d1195750728dc7a05025db` — **stale** after JSON-LD + ProductPage org-desc fixes |

## THIS-CYCLE FIXES

1. Organization JSON-LD description taken from locale home SEO
   (`localizedSitemap.js`, `publicRouteHtml.js`, `seo.js`), not product/page.
2. ProductPage receives `site` and passes `organizationDescription` so AR→RU
   SPA navigation does not leave a stale AR home description.

## COMMAND EVIDENCE

Logs: `/tmp/stage7-closure-evidence/`.
Isolation: synthetic/temp SQLite, `CLOVER_SITEMAP_RUNTIME_WRITE=0` where
needed, Vite `--outDir` outside the worktree. No production DB, no
`/opt/clover/clover-app` test execution in this cycle.

| Required entry point | Coverage | Result | Evidence |
|---|---|---|---|
| Root `npm run lint` (`eslint .`) | **full, on final code after ProductPage** (hash `90dbedc64…`) | 0 errors, 48 warnings | `final-code-lint.log` `LINT=0` |
| Root `npm run build` | **isolated equivalent of both package constituents** on the same final code: `vite build --outDir /tmp/stage7-final-code-build/dist` + `generate-sitemap.mjs` with synthetic `DB_PATH`/`SITEMAP_OUT`. Raw `npm run build` not run (writes worktree `dist/` + default DB). | `VITE=0` `GEN=0` | `final-code-build.log` |
| Root `npm run sitemap:verify` | **documented disabled-only entry point** (`verify-sitemap.mjs`). Enabled artifact is rejected by design (`forbidden …/ru/`). Enabled coverage is Stage 7 verifier + inspect of isolated generated XML | disabled PASS; enabled REJECT_AS_DESIGNED | `build-sitemap-check.log`; `enabled-sitemap-inspect.log` |
| Server `npm run check` | **full** (`node --check` file list) | PASS | `build-sitemap-check.log` `SERVER_CHECK=0` |
| Server `npm run test:all` | **full chain started**; stopped at `verify-v17-ui` (PRE_EXISTING). Remaining constituents enumerated and run | v17/taxonomy/tree FAIL on candidate **and** clean base; all other listed constituents PASS | `test-all.log` `TEST_ALL=1`; `test-all-remaining.log` |
| Stage 1 | full | PASS | `stages-1-6.log` |
| Stage 2 | full | PASS | `stages-1-6.log` |
| Stage 3-core | full | PASS | `stages-1-6.log` |
| Stage 3-persistence | full | PASS | `stages-1-6.log` |
| Stage 4 | full | PASS | `stages-1-6.log` |
| Stage 5.1 / 5.2-a / 5.2-b | full | PASS | `stages-1-6.log` |
| Stage 6.1 | full | PASS | `stages-1-6.log` |
| Stage 6.2 | full, re-run after ProductPage/SEO delta | PASS | `stage7-after-product-org.log` `STAGE62=0` |
| Stage 7 | full, re-run after ProductPage/SEO delta | PASS | `stage7-after-product-org.log` `STAGE7=0` |
| `git diff --check` | full vs worktree | PASS | `stages-1-6.log` `DIFF_CHECK=0` |

`test:all` remaining after v17: v18, runtime, manager-notifications, manager-tabs, order-trash, and the `test:onec` tail (orders-hardening through client-self-matrix). Failures only: v17-ui, catalog-tree-ui, clover-taxonomy — proven on clean base `a9ce4bf`.

## BROWSER EVIDENCE

Final-candidate focused Playwright (synthetic APIs, no production API):
`/opt/clover/recovery/i18n-stage7-final-browser-20260913T215724Z`

Settled client state after hydration:

| Scenario | Pathname | Canonical | Robots / notes |
|---|---|---|---|
| `/cart` | `/cart` | `https://clover-spb.ru/cart` | noindex; not `/ru/cart` |
| `/checkout` | `/checkout` | `https://clover-spb.ru/checkout` | noindex |
| `/install-app` | `/install-app` | `https://clover-spb.ru/install-app` | noindex; not home `/ru/` |
| `/ru/catalog` | `/ru/catalog` | self-canonical `/ru/catalog` | index |
| legacy `/catalog` | `/catalog` | `/ru/catalog` | alias 200 |
| `/en/catalog` | `/en/catalog` | self | org JSON-LD `EN Organization description`; url `/ru/` |
| `/ar/product/SKU-7` | AR RTL | self | org `AR Organization description` (not product text) |
| AR → RU selector | `/ru/product/SKU-7` | `/ru/product/SKU-7` | LTR; org `Организация КЛЕВЕР` |

Broad visual matrix (unchanged layout/RTL/nav areas):
`/opt/clover/recovery/i18n-stage7-visual-20260913T213742Z`
Collected on the post-URL-correction candidate **before** cart SEO,
JSON-LD home-desc, and ProductPage org-desc fixes. Those later changes
do not alter header/RTL/layout. Meta claims in that matrix are superseded
by the final-candidate browser folder above.

### Enabled sitemap (documented split, not a gap)

Two specialized entry points:

- `npm run sitemap:verify` / `verify-sitemap.mjs` — **disabled/legacy**
  unprefixed contract. `isForbiddenSitemapUrl` without
  `allowLocalePrefixes`.
- `node server/scripts/verify-i18n-stage-7-routing-seo-rtl.mjs` — **enabled**
  contract. Generates via `generate-sitemap.mjs` (`CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1`)
  and asserts unique absolute locs, no unprefixed aliases, `/ru/` present,
  no `/lk|/api`, `isForbiddenSitemapUrl(..., { allowLocalePrefixes: true })`,
  alternates `=== publicAlternateLinks(...)`, x-default starts with `/ru`.

Isolated generated XML `/tmp/stage7-root-build/enabled/sitemap.xml`
(not hand-composed): 98 locs; xmlns sitemap/0.9 + xhtml; reciprocal
alternates including `zh-CN`; no cart/checkout/install-app/lk/api;
disabled verifier on that file → `forbidden https://clover-spb.ru/ru/`
(`enabled-sitemap-inspect.log`). Do not merge the two verifiers.

### Transitional JSON-LD

NOT VERIFIED closed. Delayed synthetic `/api/public/site` + intermediate
snapshots (not only settled DOM):
`/opt/clover/recovery/i18n-stage7-jsonld-transition-20260913T220825Z`

- Direct `/en/catalog`: HTTP HTML Organization identity/url `/ru/`, EN home
  copy, not product text. During 400ms site delay the SSR description
  remains (transitional). After site accept: `EN Organization description`.
- AR → RU with 700ms RU site delay: 14 intermediate ticks of RU URL + AR
  home org description while RU site in flight. After accept: RU product,
  LTR, `Организация КЛЕВЕР`. Hold window did not flip.
- Rapid EN then RU: delayed EN fulfillment after RU accept did not
  overwrite (`staleOverwriteCount=0`). `StorefrontApp` `cancelled` +
  `loadPublicSite` cache.

Defect definition used: wrong language metadata after the new locale
content is accepted, or stale response overwriting the new state.
Neither reproduced. No implementation change.

## THIS-CYCLE IMPLEMENTATION CHANGES

Дополнительные изменения реализации не потребовались.
Documentation-only update of this plan after sitemap/JSON-LD closure.

## INDEPENDENT REVIEW

Self-review is not independent review.

| Review | Id | Scope | Verdict |
|---|---|---|---|
| Full candidate | [884b3d74](884b3d74-c22f-4b5f-ac69-f5a5d331217d) | full Stage 7 | FAIL F1/F2 cart/checkout/install-app client SEO — **fixed** |
| Focused SEO | [c2d61651](c2d61651-b615-4477-9c25-4f06e936f7c7) | F1/F2 delta | PASS |
| JSON-LD home vs product | [bb2d5bac](bb2d5bac-0d9b-47a5-ba68-dccb904e2a09) | org-desc source | PASS; minor ProductPage stale org after SPA switch |
| ProductPage org-desc | [797b1224](797b1224-b0ab-4fab-8eef-af5c01fa4017) | ProductPage/`site` + verifier lock | PASS; disposition NONE |

Combined coverage: full candidate + all subsequent implementation deltas.

## PRE_EXISTING FAILURES

Proven on separate clean worktree `/opt/clover/recovery/i18n-stage7-clean-base-a9ce4bf`
at `a9ce4bf53411854c37cd562e841c7d0e734cbe74` (`clean-baseline.log`):

- Stage 3.2 lockfile freeze vs `a285f58` (`CLEAN_32_LOCK=1`)
- Stage 3-system-ui lockfile freeze vs `059ab7ff` (`CLEAN_31_LOCK=1`)
- `verify-v17-ui.mjs`: missing historical CSS text (`CLEAN_V17=1`)
- `verify-clover-taxonomy.mjs`: category order (`CLEAN_TAXONOMY=1`)
- `verify-storefront-catalog-tree-ui.mjs`: `.sf-group-nav-row` grid regex (`CLEAN_TREE=1`)

Same failures on the candidate. Not Stage 7 regressions.

## HISTORICAL REPORT CORRECTIONS

- Previous cycle ran `verify-v17-ui` and lockfile `git diff` **on**
  `/opt/clover/clover-app`. That is command execution on the production
  checkout (read-only), not “production access NONE”.
- This cycle: identity inspection only on `/opt/clover/clover-app`
  (HEAD `a9ce4bf`); baseline tests on the isolated clean worktree.
- Data access / mutation of production: none observed in this cycle.
- `READY_FOR_RELEASE_GATE` in the prior report overstated local-only
  closure. Correct local label is `LOCAL_STAGE_7_CLOSED` /
  `READY_FOR_SEPARATE_RELEASE_AUTHORIZATION`.
- Lint/build/sitemap/test:all/browser gaps listed in the prior
  `READY_FOR_RELEASE_GATE` claim are closed or accounted as equivalent
  isolated constituents above.

## PROTECTED CONTOURS

Unchanged by this candidate: pricing/matrix/order/1C/auth/schema semantics;
cabinet `/lk`; APIs/assets/SW/manifests/technical endpoints unprefixed;
Stage 6.2 selector/persistence/races; no admin selector; no browser-language
redirect; no Stage 8/9 activation. JSON-LD Organization `@type`, name, logo,
and url stay the canonical business entity (`https://clover-spb.ru/ru/`).

Changed invariants (approved Stage 7): public prefixes; RU self-canonical
`/ru/...`; unprefixed RU aliases; no new permanent legacy↔prefix redirects;
enabled sitemap `/ru` entries; RTL; cart/checkout/install-app unprefixed
noindex; Organization description from locale home SEO.

## RECOVERY

Artifact contains `files/` (every changed/new file), `candidate.patch`,
`file-list.txt`, `manifest.txt`, `candidate.patch.sha256`.

**New clean worktree at the exact base**

```bash
git fetch origin
git worktree add /path/to/new-stage7 a9ce4bf53411854c37cd562e841c7d0e734cbe74
cd /path/to/new-stage7
git checkout -B codex/i18n-stage-7-routing-seo-rtl
git apply --check /opt/clover/recovery/i18n-stage7-candidate-20260913T215923Z/candidate.patch
git apply /opt/clover/recovery/i18n-stage7-candidate-20260913T215923Z/candidate.patch
```

Alternatively copy `files/` onto that clean tree after confirming it is
exactly `a9ce4bf` with a clean status.

**Existing dirty worktree**

Do not blindly copy or `git apply` over unverified local edits.
Compare `git status` and `git diff a9ce4bf` to `file-list.txt`.
Restore only after confirming there is no unexpected overlapping change.
No destructive reset/clean is authorized by Stage 7 local closure.

Verify after restore:

```bash
sha256sum -c candidate.patch.sha256
# regenerate patch with the same method and compare hash
```

## REMAINING RELEASE GATES (NOT THIS CYCLE)

- Commit / push / PR / merge — separate authorization.
- Deploy / production verification — separate authorization.
- Stage 8 (1C order-comment translation).
- Stage 9 public foreign-language activation.
- Do not treat `CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED=1` as Stage 9.
