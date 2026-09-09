# Clover I18N Stage 3.1 — System UI + persistence

Base: `059ab7ffd591250a9359185c2de32b4b29c93aa2`  
Branch: `feat/i18n-stage-3-1-system-ui`  
Worktree: `/opt/clover/i18n-stage-3-1-system-ui`

## Scope

One branch implements the authoritative system UI catalog, RU dictionary derived
from that catalog, server-owned EN/UZ/KY/TG/ZH-CN/AR seeds, additive SQLite
translation persistence, MANUAL/AUTO editing, completeness hardening, runtime
projection, and complete Stage 3.1 system UI `t()` migration.

Production remains on BASE. This task does not migrate production SQLite.

## Inventory (pre-implementation)

Audited frontend scope:

- `src/App.jsx`
- `src/components/**`
- `src/shared/**`
- `src/screens/client/**`
- `src/screens/manager/**`
- `src/screens/storefront/StorefrontApp.jsx`
- `src/screens/storefront/components/**`
- `src/screens/storefront/pages/**`

Classification used for every remaining non-`t()` visible literal:

- `STAGE31_SYSTEM_UI` — migrate (final residual must be 0)
- `FUTURE_PRODUCT` — product names / characteristics / UOM content
- `FUTURE_CATEGORY_PAGE_FAQ_SEO` — editorial pages, FAQ, SEO copy
- `USER_CONTENT` — entered values, org names, comments
- `TECHNICAL_IDENTIFIER` — status/role/1C codes used as authority
- `STAGE32_ERROR_PWA` — reserved network/PWA error pipeline
- `NON_VISIBLE` — comments, regex, taxonomy matchers, CSS-only

## Allowlist (expected change areas)

Actual Stage 3.1 files changed in this worktree:

- `src/shared/i18n/uiCatalog.js`
- `src/shared/i18n/dictionaries/ru.js`
- `src/shared/i18n/index.js`
- `src/shared/i18n/languageRegistry.js`
- `src/shared/i18n/localizationSettings.js`
- `src/shared/i18n/placeholderValidation.js`
- `src/shared/i18n/sourceHash.js`
- `src/shared/i18n/translationRuntime.js`
- `src/shared/i18n/translationStoreProjection.js`
- `server/src/db.js`
- `server/src/localizationStore.js`
- `server/src/server.js`
- `server/src/i18n/uiTranslationSeed.js`
- `server/scripts/verify-i18n-stage-3-persistence.mjs`
- `server/scripts/verify-i18n-stage-3-system-ui.mjs`
- `server/scripts/verify-i18n-stage-3-core.mjs`
- `server/scripts/verify-i18n-stage-2.mjs`
- `server/scripts/i18n-stage31-residual-allowlist.json`
- `src/serverApi.js`
- `src/styles/clover-theme.css`
- `src/screens/manager/ManagerLanguages.jsx`
- `src/shared/appHelpers.js`
- `docs/superpowers/plans/2026-09-09-clover-i18n-stage-3-1-system-ui.md`
- `src/App.jsx`
- `src/components/AddressManager.jsx`
- `src/components/AdminRolePanel.jsx`
- `src/components/ClientProfile.jsx`
- `src/components/CustomProductForm.jsx`
- `src/shared/AppModal.jsx`
- `src/shared/SharedPanels.jsx`
- `src/shared/uxFeedback.jsx`
- `src/screens/client/AddressesPanel.jsx`
- `src/screens/client/CatalogSearchInput.jsx`
- `src/screens/client/ClientCatalogAddPanel.jsx`
- `src/screens/client/ClientMatrixPanel.jsx`
- `src/screens/client/ClientScreen.jsx`
- `src/screens/client/ClientSectionMenu.jsx`
- `src/screens/client/CustomItemForm.jsx`
- `src/screens/client/DeliveryDateCalendar.jsx`
- `src/screens/client/ManagerContact.jsx`
- `src/screens/client/OrderEditor.jsx`
- `src/screens/client/ProfilePanel.jsx`
- `src/screens/client/ReconciliationPanel.jsx`
- `src/screens/manager/ManagerAccessVault.jsx`
- `src/screens/manager/ManagerAudit.jsx`
- `src/screens/manager/ManagerBackup.jsx`
- `src/screens/manager/ManagerClients.jsx`
- `src/screens/manager/ManagerExchange.jsx`
- `src/screens/manager/ManagerNotifications.jsx`
- `src/screens/manager/ManagerOrders.jsx`
- `src/screens/manager/ManagerPriceList.jsx`
- `src/screens/manager/ManagerProducts.jsx`
- `src/screens/manager/ManagerReconciliation.jsx`
- `src/screens/manager/ManagerScreen.jsx`
- `src/screens/manager/ManagerSettings.jsx`
- `src/screens/manager/ManagerStorefront.jsx`
- `src/screens/manager/ManagerStorefrontInfoPages.jsx`
- `src/screens/manager/ManagerStorefrontPromotions.jsx`
- `src/screens/manager/MatrixCloverCatalogAdd.jsx`
- `src/screens/manager/MatrixExcelImport.jsx`
- `src/screens/manager/MatrixOneCProductAdd.jsx`
- `src/screens/manager/ProductEditor.jsx`
- `src/screens/manager/StorefrontProductAdd.jsx`
- `src/screens/storefront/components/CatalogGroupNav.jsx`
- `src/screens/storefront/components/GroupTile.jsx`
- `src/screens/storefront/components/HeroSlides.jsx`
- `src/screens/storefront/components/ProductCard.jsx`
- `src/screens/storefront/components/StoreFooter.jsx`
- `src/screens/storefront/components/StoreHeader.jsx`
- `src/screens/storefront/components/StorefrontContacts.jsx`
- `src/screens/storefront/components/StorefrontQtyControl.jsx`
- `src/screens/storefront/components/StorefrontUnitChoice.jsx`
- `src/screens/storefront/pages/AktsiiPage.jsx`
- `src/screens/storefront/pages/CartPage.jsx`
- `src/screens/storefront/pages/CatalogPage.jsx`
- `src/screens/storefront/pages/CheckoutPage.jsx`
- `src/screens/storefront/pages/ContactsPage.jsx`
- `src/screens/storefront/pages/HomePage.jsx`
- `src/screens/storefront/pages/InstallAppPage.jsx`
- `src/screens/storefront/pages/ProductPage.jsx`

## Non-goals

LanguageSelector, preferred_language, locale prefixes, RTL DOM, product /
category / SEO / FAQ translation, order-comment / 1C translation, package
changes, production deploy/merge.

## Persistence

Additive tables `translation_entries` + `translation_values`.  
`localizationSettings` stays in `app_state`.  
Startup `initializeLocalizationCatalog()` after DB ready, before listen.

## Future production deploy

Requires explicit additive SQLite migration approval. Not performed here.
