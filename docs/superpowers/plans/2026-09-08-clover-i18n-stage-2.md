# I18N Stage 2 execution plan

Source of truth: `docs/superpowers/specs/2026-09-06-clover-multilingual-i18n-design.md` @ `e14aeb0` (`origin/codex/i18n-architecture-spec` §8 / Phase 4).
Base: `origin/main` @ `40579d0`.

Stage 2 only: admin-only section «Языки и переводы», language enablement via existing `app_state`, empty-safe translation workspace, MANUAL non-overwrite on settings save. Reuse Stage 1 `src/shared/i18n/*`. No selector, prefixes, RTL, product/SEO/UI dictionaries, 1C translator.

1. RED: `server/scripts/verify-i18n-stage-2.mjs`
2. GREEN: settings contract + admin API + `ManagerLanguages` wired as admin-only tab
3. Stage 1 verifier + permission tests + lint + build
4. Diff review; independent review; one commit; PR to `main` (no merge)
