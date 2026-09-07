# I18N Stage 1 execution plan

Source of truth: `docs/superpowers/specs/2026-09-06-clover-multilingual-i18n-design.md` @ `e14aeb0` (`origin/codex/i18n-architecture-spec`).
Base: `origin/main` @ `e26ddbd`.

Stage 1 only: code-owned language registry, locale canonicalize, resolver contracts, translation lookup with RU fallback. No selector, no public prefixes, no DB, no string extraction, no 1C/order/pricing changes.

1. RED: `server/scripts/verify-i18n-stage-1.mjs`
2. GREEN: `src/shared/i18n/*` modules
3. Build + existing storefront/LK source-contract checks in the same verifier
4. Diff review against `origin/main`; independent review; one commit; PR to `main`
