# Clover I18N Stage 3.2 — final system UI closure

Date: 2026-09-09  
Branch: `feat/i18n-stage-3-2-errors-pwa-closure`  
Base: `a285f58add577e67ca1789831af3bc5e484f1ae6`

## GOAL

- Close remaining Stage 3 system-owned operational, error, network, and PWA copy.
- Produce a complete final Stage 3 inventory and fail-closed verifier.
- Do not enable any foreign public language.

## INCLUDED

- Frontend operational/error fallbacks currently classified `STAGE32_ERROR_PWA`.
- Transport fallbacks in `src/serverApi.js` (and storefront `publicApi.js` where it is a user-visible system boundary).
- Push/PWA visible system copy at the display boundary.
- Final inventory, residual allowlist, catalog keys, six-target seeds.
- Final Stage 3.2 verifier.

## EXCLUDED

- Products / UOM / characteristics — Stage 4.
- Categories / subcategories / pages / FAQ / SEO — Stage 5.
- LanguageSelector and preferred-language persistence — Stage 6.
- Public locale URL prefixes, hreflang/canonical/sitemap, RTL activation — Stage 7.
- Order-comment translation for 1C — Stage 8.
- Public foreign language activation — Stage 9.

## AUTHORITY RULE

Localized strings are display-only.

Canonical and locale-independent:

- `error.code` / `error.status` / `error.payload`
- push technical reason tokens
- API result codes
- order / 1C status and identity

No translated value may enter order, matrix, category, pricing, or API authority.
