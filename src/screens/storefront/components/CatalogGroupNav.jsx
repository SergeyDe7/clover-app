import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { useMemo, useState } from "react";
import { buildGroupNav, canonicalizeProductSubcategory } from "../productGroups.js";
import {
  categoryDisplayLabelsReady,
  projectLocalizedGroupNav,
} from "../../../shared/i18n/categoryDisplayProjection.js";
import { storefrontCategoryDisplayOptions } from "../../../shared/i18n/storefrontCategoryDisplay.js";
import { storefrontHref } from "../mode.js";
import { navigateStorefront } from "./StoreHeader.jsx";
import { handleStorefrontLinkClick } from "./storefrontLink.js";

function NavChevron() {
  return (
    <svg
      className="sf-group-nav-chevron"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.2 4.2 L6 8 L9.8 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Боковое меню категорий — как в ЛК «Добавить товары из каталога»:
 * кнопки category-button + стрелка для подкатегорий.
 * Navigation/filter identity uses canonical `name`; UI shows `displayName`.
 */
export function CatalogGroupNav({
  categories = [],
  activeCategory = "",
  activeSubcategory = "",
  variant = "side",
  translations,
  language,
  crawlableCategories = new Set(),
  crawlableSubcategories = new Set(),
}) {
  const { enabledLanguages, t, locale } = useLocalization();
  const displayLanguage = language || locale;
  const enableCrawlableLinks = displayLanguage === "ru";
  const categoryOptions = storefrontCategoryDisplayOptions(
    displayLanguage,
    translations,
    enabledLanguages
  );
  const labelsReady = categoryDisplayLabelsReady(categoryOptions);
  const groups = useMemo(() => {
    if (!labelsReady) return [];
    const canonical = buildGroupNav(categories);
    return projectLocalizedGroupNav(canonical, categoryOptions);
  }, [categories, categoryOptions, labelsReady]);
  const [openParents, setOpenParents] = useState(() => new Set());

  const toggleParent = (name) => {
    setOpenParents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const goGroup = (name, event) => {
    const route = { name: "catalog", category: name };
    if (event) {
      if (!handleStorefrontLinkClick(event, route)) return;
    } else {
      navigateStorefront(route);
    }
    if (groups.find((g) => g.name === name)?.children?.length) {
      setOpenParents((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    }
  };
  const goSub = (category, subcategory, event) => {
    const route = { name: "catalog", category, subcategory };
    if (event) {
      if (!handleStorefrontLinkClick(event, route)) return;
    } else {
      navigateStorefront(route);
    }
    setOpenParents((prev) => {
      const next = new Set(prev);
      next.add(category);
      return next;
    });
  };

  return (
    <nav
      className={`sf-group-nav sf-group-nav-${variant}`}
      aria-label={t("storefront.productGroups")}
      aria-busy={!labelsReady ? "true" : undefined}
    >
      {enableCrawlableLinks ? (
        <a
          className={`sf-cat-btn${!activeCategory ? " is-active" : ""}`}
          href={storefrontHref({ name: "catalog" })}
          aria-current={!activeCategory ? "page" : undefined}
          onClick={(event) =>
            handleStorefrontLinkClick(event, { name: "catalog" })
          }
        >
          {t("shared.filter.all")}
        </a>
      ) : (
        <button
          type="button"
          className={`sf-cat-btn${!activeCategory ? " is-active" : ""}`}
          onClick={() => navigateStorefront({ name: "catalog" })}
        >
          {t("shared.filter.all")}
        </button>
      )}

      {!labelsReady ? (
        <p className="sf-muted">{t("storefront.loadingCategories")}</p>
      ) : null}

      {groups.map((group) => {
        const hasChildren = group.children.length > 0;
        const isOpen = openParents.has(group.name);
        const isActive = activeCategory === group.name && !activeSubcategory;
        const groupLabel = group.displayName || group.name;
        const groupRoute = { name: "catalog", category: group.name };
        const groupIsCrawlable =
          enableCrawlableLinks && crawlableCategories.has(group.name);

        return (
          <div key={group.name} className="sf-group-nav-block">
            <div className="sf-group-nav-row">
              {groupIsCrawlable ? (
                <a
                  className={`sf-cat-btn${isActive ? " is-active" : ""}`}
                  href={storefrontHref(groupRoute)}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(event) => goGroup(group.name, event)}
                >
                  {groupLabel}
                </a>
              ) : (
                <button
                  type="button"
                  className={`sf-cat-btn${isActive ? " is-active" : ""}`}
                  onClick={() => goGroup(group.name)}
                >
                  {groupLabel}
                </button>
              )}
              {hasChildren ? (
                <button
                  type="button"
                  className={`sf-group-nav-toggle${isOpen ? " is-open" : ""}`}
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? t("client.catalog.hideSubcategories", { name: groupLabel })
                      : t("client.catalog.showSubcategories", { name: groupLabel })
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleParent(group.name);
                  }}
                >
                  <NavChevron />
                </button>
              ) : null}
            </div>
            {hasChildren && isOpen ? (
              <div className="sf-group-nav-children">
                {group.children.map((child) => {
                  const isChildActive =
                    activeCategory === group.name &&
                    canonicalizeProductSubcategory(activeSubcategory) === child.name;
                  const childRoute = {
                    name: "catalog",
                    category: group.name,
                    subcategory: child.name,
                  };
                  const childIsCrawlable =
                    enableCrawlableLinks &&
                    activeCategory === group.name &&
                    crawlableSubcategories.has(child.name);
                  return childIsCrawlable ? (
                    <a
                      key={child.name}
                      className={`sf-cat-btn is-child${isChildActive ? " is-active" : ""}`}
                      href={storefrontHref(childRoute)}
                      aria-current={isChildActive ? "page" : undefined}
                      onClick={(event) => goSub(group.name, child.name, event)}
                    >
                      {child.displayName || child.name}
                    </a>
                  ) : (
                    <button
                      key={child.name}
                      type="button"
                      className={`sf-cat-btn is-child${isChildActive ? " is-active" : ""}`}
                      onClick={() => goSub(group.name, child.name)}
                    >
                      {child.displayName || child.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
