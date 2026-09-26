import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../../shared/i18n/errorDisplay.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { storefrontApi } from "../publicApi.js";
import { peekPublicSite, loadPublicSite } from "../publicSite.js";
import {
  catalogScrollRouteKey,
  navigateStorefront,
  resetCatalogScrollOnRouteIdentity,
} from "../components/StoreHeader.jsx";
import { handleStorefrontLinkClick } from "../components/storefrontLink.js";
import { ProductCard } from "../components/ProductCard.jsx";
import { CatalogGroupNav } from "../components/CatalogGroupNav.jsx";
import { GroupIcon } from "../components/GroupIcon.jsx";
import {
  getGroupMeta,
  getGroupChildren,
  getSubgroupFacets,
  canonicalizeProductSubcategory,
} from "../productGroups.js";
import { storefrontHref } from "../mode.js";
import { projectLocalizedGroupNav, categoryDisplayNameFromCanonical, categoryDisplayLabelsReady } from "../../../shared/i18n/categoryDisplayProjection.js";
import { storefrontCategoryDisplayOptions } from "../../../shared/i18n/storefrontCategoryDisplay.js";
import { sortProductsWithLidsGrouped } from "../../../shared/productCatalogOrder.js";
import {
  advanceCatalogRequestGeneration,
  isCatalogRequestGenerationCurrent,
  makeCatalogRouteSnapshot,
  mergeCatalogRoutePage,
  resolveStorefrontCatalogView,
} from "../catalogRouteSnapshot.js";
import {
  CATALOG_CARD_RENDER_BATCH,
  isCatalogScrollNearEnd,
  makeFlatCatalogSection,
  nextRenderLimitAfterDemand,
  scheduleCatalogRenderBump,
  sliceSectionsToRenderLimit,
  stabilizeSectionProductOrder,
} from "../catalogProgressiveRender.js";

function bagFromSite(locale) {
  const site = peekPublicSite(locale);
  const bag = site?.categoryTranslations;
  return bag && typeof bag === "object" && Object.keys(bag).length > 0
    ? bag
    : undefined;
}

function normalizeTranslationBag(bag, locale) {
  if (!bag || typeof bag !== "object") return undefined;
  const keys = Object.keys(bag).length;
  // Foreign locales: an empty bag is not "ready" — it produces a RU flash.
  // Keep pending until a non-empty projection arrives (or locale is ru).
  if (String(locale || "ru") !== "ru" && keys === 0) return undefined;
  return bag;
}

export function CatalogPage({
  category = "",
  subcategory = "",
  facet = "",
  routeLocale,
}) {
  const { enabledLanguages, t, locale } = useLocalization();
  const publicLocale = routeLocale || locale;
  const enableCrawlableLinks = publicLocale === "ru";
  const routeKey = catalogScrollRouteKey(category, subcategory, facet);
  const [catalogRouteSnapshot, setCatalogRouteSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [requestQuery, setRequestQuery] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  // Mobile: каталог открывается со свёрнутыми категориями; раскрытие — только тапом «Категории».
  const [treeOpen, setTreeOpen] = useState(false);
  // Mobile + category: search after chips so products start higher; desktop keeps top search.
  const [inlineSearch, setInlineSearch] = useState(false);
  // Keep last-good translation bag across route changes so H1/nav never flash RU
  // while the next catalog payload is in flight. Seed from site cache when present
  // (home → category) so the first catalog paint already has foreign labels.
  const translationBagRef = useRef(bagFromSite(publicLocale));
  const translationLocaleRef = useRef(publicLocale);
  const loadingMoreRef = useRef(false);
  const [, setTranslationBagEpoch] = useState(0);
  const requestKey = `${publicLocale}\u0000${routeKey}\u0000${requestQuery}`;
  const catalogRequestGenerationRef = useRef({ key: "", generation: 0 });
  const nextRequestGeneration = advanceCatalogRequestGeneration(
    catalogRequestGenerationRef.current,
    requestKey
  );
  if (nextRequestGeneration !== catalogRequestGenerationRef.current) {
    catalogRequestGenerationRef.current = nextRequestGeneration;
    loadingMoreRef.current = false;
  }
  const requestGeneration = catalogRequestGenerationRef.current.generation;

  useEffect(() => {
    const timer = window.setTimeout(() => setRequestQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const publishTranslationBag = (bag) => {
    const next = normalizeTranslationBag(bag, publicLocale);
    if (!next) return;
    const prev = translationBagRef.current;
    translationBagRef.current = next;
    if (prev !== next) setTranslationBagEpoch((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    // Warm site bag for cold/direct URL before/while catalog fetch runs.
    if (publicLocale && publicLocale !== "ru") {
      const existing = bagFromSite(publicLocale);
      if (existing) {
        publishTranslationBag(existing);
      } else {
        loadPublicSite(publicLocale)
          .then((site) => {
            if (cancelled) return;
            publishTranslationBag(site?.categoryTranslations);
          })
          .catch(() => {});
      }
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish uses publicLocale
  }, [publicLocale]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    loadingMoreRef.current = false;
    setLoadingMore(false);
    storefrontApi
      .catalog({
        category: category || undefined,
        subcategory: subcategory || undefined,
        facet: facet || undefined,
        q: requestQuery || undefined,
        language: publicLocale,
        limit: 60,
        offset: 0,
      })
      .then((payload) => {
        if (
          !cancelled &&
          isCatalogRequestGenerationCurrent(
            catalogRequestGenerationRef.current,
            requestGeneration
          )
        ) {
          setCatalogRouteSnapshot(makeCatalogRouteSnapshot(requestKey, payload));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorDisplayMessage(err, t, "storefront.error.catalogLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [category, subcategory, facet, publicLocale, requestGeneration, requestKey, requestQuery, t]);

  const prevRouteKeyRef = useRef(null);
  useLayoutEffect(() => {
    resetCatalogScrollOnRouteIdentity(prevRouteKeyRef.current, routeKey);
    prevRouteKeyRef.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      setTreeOpen(false);
    }
  }, [category, subcategory]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 900px)");
    const syncMobileChrome = () => {
      if (mq.matches) setTreeOpen(false);
      setInlineSearch(mq.matches && Boolean(category));
    };
    syncMobileChrome();
    mq.addEventListener?.("change", syncMobileChrome);
    return () => mq.removeEventListener?.("change", syncMobileChrome);
  }, [category]);

  const { categories: navCategories, currentPayload } = useMemo(
    () => resolveStorefrontCatalogView(requestKey, catalogRouteSnapshot),
    [requestKey, catalogRouteSnapshot]
  );

  if (translationLocaleRef.current !== publicLocale) {
    translationLocaleRef.current = publicLocale;
    translationBagRef.current = bagFromSite(publicLocale);
  }
  if (currentPayload) {
    const nextBag = normalizeTranslationBag(
      currentPayload.categoryTranslations,
      publicLocale
    );
    if (nextBag) translationBagRef.current = nextBag;
  }
  const effectiveTranslations =
    (currentPayload &&
      normalizeTranslationBag(currentPayload.categoryTranslations, publicLocale)) ||
    translationBagRef.current ||
    bagFromSite(publicLocale);

  const categoryOptions = storefrontCategoryDisplayOptions(
    publicLocale,
    effectiveTranslations,
    enabledLanguages
  );
  const labelsReady = categoryDisplayLabelsReady(categoryOptions);
  const categoryDisplayName = labelsReady
    ? categoryDisplayNameFromCanonical(category, "", categoryOptions)
    : "";
  const subcategoryDisplayName =
    labelsReady && subcategory
      ? categoryDisplayNameFromCanonical(subcategory, category, categoryOptions)
      : "";

  const products = useMemo(() => {
    if (!currentPayload) return [];
    return currentPayload.products || [];
  }, [currentPayload]);

  const activeMeta = category ? getGroupMeta(category) : null;
  const facets = subcategory ? getSubgroupFacets(category, subcategory) : [];

  // Родительская категория: все товары группы (включая подкатегории).
  // Подкатегория/facet сужают выборку на API.
  const sections = useMemo(() => {
    if (!currentPayload) return [];
    if (category) {
      const sorted = sortProductsWithLidsGrouped(products);
      return sorted.length
        ? [{ name: subcategory || category, products: sorted, count: sorted.length }]
        : [];
    }
    return makeFlatCatalogSection(products);
  }, [category, subcategory, products, currentPayload]);

  const stableSectionOrderRef = useRef({ key: "", sections: [] });
  const stableSections = useMemo(() => {
    const previousSections = stableSectionOrderRef.current.key === requestKey
      ? stableSectionOrderRef.current.sections
      : [];
    const stabilized = stabilizeSectionProductOrder(sections, previousSections);
    stableSectionOrderRef.current = {
      key: requestKey,
      sections: stabilized,
    };
    return stabilized;
  }, [requestKey, sections]);

  const totalCatalogCards = useMemo(
    () => stableSections.reduce((sum, section) => sum + (section.products?.length || 0), 0),
    [stableSections]
  );
  const [renderLimit, setRenderLimit] = useState(CATALOG_CARD_RENDER_BATCH);
  const catalogMainRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);

  useEffect(() => {
    setRenderLimit(CATALOG_CARD_RENDER_BATCH);
  }, [requestKey]);

  useEffect(() => {
    // Clamp after filter shrink; small result sets mount fully (no empty gap).
    setRenderLimit((current) => {
      if (totalCatalogCards <= 0) return CATALOG_CARD_RENDER_BATCH;
      if (totalCatalogCards <= CATALOG_CARD_RENDER_BATCH) return totalCatalogCards;
      return Math.min(current, totalCatalogCards);
    });
  }, [totalCatalogCards]);

  const hasMore = Boolean(currentPayload?.pagination?.hasMore);
  const nextOffset = currentPayload?.pagination?.nextOffset;

  const loadNextPage = useCallback(() => {
    if (!hasMore || loadingMoreRef.current || !Number.isInteger(nextOffset)) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    storefrontApi
      .catalog({
        category: category || undefined,
        subcategory: subcategory || undefined,
        facet: facet || undefined,
        q: requestQuery || undefined,
        language: publicLocale,
        limit: 60,
        offset: nextOffset,
      })
      .then((payload) => {
        if (!isCatalogRequestGenerationCurrent(
          catalogRequestGenerationRef.current,
          requestGeneration
        )) return;
        setCatalogRouteSnapshot((current) =>
          mergeCatalogRoutePage(current, requestKey, payload)
        );
      })
      .catch((err) => {
        if (isCatalogRequestGenerationCurrent(
          catalogRequestGenerationRef.current,
          requestGeneration
        )) {
          setError(errorDisplayMessage(err, t, "storefront.error.catalogLoadFailed"));
        }
      })
      .finally(() => {
        if (!isCatalogRequestGenerationCurrent(
          catalogRequestGenerationRef.current,
          requestGeneration
        )) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [
    category,
    facet,
    hasMore,
    nextOffset,
    publicLocale,
    requestGeneration,
    requestKey,
    requestQuery,
    subcategory,
    t,
  ]);

  useEffect(() => {
    if (renderLimit >= totalCatalogCards) return undefined;
    return scheduleCatalogRenderBump(() => {
      setRenderLimit((current) =>
        Math.min(current + CATALOG_CARD_RENDER_BATCH, totalCatalogCards)
      );
    });
  }, [renderLimit, totalCatalogCards]);

  // Fast scroll / near-end: demand more cards before the user hits an empty tail.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const scrollRoot = catalogMainRef.current;
    if (!scrollRoot) return undefined;
    if (renderLimit >= totalCatalogCards && !hasMore) return undefined;
    const revealMore = () => {
      if (renderLimit < totalCatalogCards) {
        setRenderLimit((current) =>
          nextRenderLimitAfterDemand(current, totalCatalogCards)
        );
        return;
      }
      loadNextPage();
    };
    const onScroll = () => {
      if (isCatalogScrollNearEnd(scrollRoot)) revealMore();
    };
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const node = loadMoreSentinelRef.current;
    let observer = null;
    if (node && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) revealMore();
        },
        { root: scrollRoot, rootMargin: "400px 0px", threshold: 0 }
      );
      observer.observe(node);
    }
    return () => {
      scrollRoot.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [hasMore, loadNextPage, renderLimit, totalCatalogCards, requestKey]);

  const visibleSections = useMemo(
    () => sliceSectionsToRenderLimit(stableSections, renderLimit),
    [stableSections, renderLimit]
  );

  const imagePriorityById = useMemo(() => {
    const map = new Map();
    let index = 0;
    for (const section of visibleSections) {
      for (const product of section.products || []) {
        // Render-order cursor; Map last-write wins if duplicate ids ever appear.
        // Canonical catalog products use unique ids; priority follows first render encounter.
        if (!map.has(product.id)) {
          map.set(product.id, index);
          index += 1;
        }
      }
    }
    return map;
  }, [visibleSections]);

  const localizedSubgroups = useMemo(() => {
    if (!category || !labelsReady) return [];
    const children = getGroupChildren(category);
    return (
      projectLocalizedGroupNav(
        [{ name: category, children }],
        categoryOptions
      )[0]?.children || []
    );
  }, [category, categoryOptions, labelsReady]);
  const crawlableSubcategories = useMemo(
    () =>
      new Set(
        (currentPayload?.subcategories || [])
          .filter((item) => !category || item?.category === category)
          .map((item) => canonicalizeProductSubcategory(item?.name))
          .filter(Boolean)
      ),
    [category, currentPayload]
  );
  const crawlableCategories = useMemo(
    () =>
      new Set(
        (currentPayload?.categories || [])
          .filter((item) => Number(item?.count) > 0)
          .map((item) => String(item?.name || "").trim())
          .filter(Boolean)
      ),
    [currentPayload]
  );
  const activeCategoryIsCrawlable = useMemo(
    () => !category || crawlableCategories.has(category),
    [category, crawlableCategories]
  );

  const title = !category
    ? t("storefront.nav.catalog")
    : !labelsReady
      ? ""
      : subcategory
        ? subcategoryDisplayName || categoryDisplayName
        : categoryDisplayName;

  const searchToolbar = (
    <div className="sf-catalog-toolbar">
      <input
        className="sf-input sf-catalog-search"
        type="search"
        placeholder={t("storefront.searchByNameOrSku")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  return (
    <div className={`sf-catalog${category ? " has-category" : ""}`}>
      {!inlineSearch ? searchToolbar : null}

      <div className="sf-catalog-layout">
        <aside className={`sf-catalog-side${treeOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="sf-catalog-tree-toggle"
            aria-expanded={treeOpen}
            onClick={() => setTreeOpen((open) => !open)}
          >
            <span>
              {category
                ? labelsReady
                  ? categoryDisplayName
                  : "\u00a0"
                : t("client.catalog.categories")}
            </span>
            <svg
              className="sf-catalog-tree-toggle-icon"
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
          </button>
          <p className="sf-catalog-side-title">{t("storefront.nav.catalog")}</p>
          <div className="sf-catalog-tree-body">
            {labelsReady ? (
              <CatalogGroupNav
                categories={navCategories}
                activeCategory={category}
                activeSubcategory={subcategory}
                variant="side"
                translations={effectiveTranslations}
                language={publicLocale}
                crawlableCategories={crawlableCategories}
                crawlableSubcategories={crawlableSubcategories}
              />
            ) : (
              <p className="sf-muted" aria-busy="true">
                {t("storefront.loadingCategories")}
              </p>
            )}
          </div>
        </aside>

        <div className="sf-catalog-main" ref={catalogMainRef}>
          {category && activeMeta ? (
            <header className="sf-group-landing">
              <div className="sf-group-landing-icon" aria-hidden="true">
                <GroupIcon name={activeMeta.icon} />
              </div>
              <div className="sf-group-landing-copy">
                <nav className="sf-crumb sf-group-landing-crumb" aria-label={t("storefront.nav.aria")}>
                  {enableCrawlableLinks ? (
                    <a
                      className="sf-back"
                      href={storefrontHref({ name: "catalog" })}
                      onClick={(event) =>
                        handleStorefrontLinkClick(event, { name: "catalog" })
                      }
                    >
                      {t("storefront.nav.catalog")}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="sf-back"
                      onClick={() => navigateStorefront({ name: "catalog" })}
                    >
                      {t("storefront.nav.catalog")}
                    </button>
                  )}
                  {category ? (
                    <>
                      <span className="sf-crumb-sep">/</span>
                      {enableCrawlableLinks && activeCategoryIsCrawlable ? (
                        <a
                          className="sf-back"
                          href={storefrontHref({ name: "catalog", category })}
                          aria-current={!subcategory && !facet ? "page" : undefined}
                          onClick={(event) =>
                            handleStorefrontLinkClick(event, {
                              name: "catalog",
                              category,
                            })
                          }
                        >
                          {labelsReady ? categoryDisplayName : "\u00a0"}
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="sf-back"
                          onClick={() =>
                            navigateStorefront({ name: "catalog", category })
                          }
                        >
                          {labelsReady ? categoryDisplayName : "\u00a0"}
                        </button>
                      )}
                    </>
                  ) : null}
                  {facet ? (
                    <>
                      <span className="sf-crumb-sep">/</span>
                      <span className="sf-crumb-current">{facet}</span>
                    </>
                  ) : null}
                </nav>
                <h1 aria-busy={!labelsReady ? "true" : undefined}>
                  {labelsReady ? title : "\u00a0"}
                </h1>
              </div>
            </header>
          ) : (
            <div className="sf-section-head">
              <h1>{t("storefront.nav.catalog")}</h1>
            </div>
          )}

          {localizedSubgroups.length > 0 ? (
            <div className="sf-subcat-chips" aria-label={t("storefront.subgroups")}>
              {localizedSubgroups.map((child) => {
                const route = {
                  name: "catalog",
                  category,
                  subcategory: child.name,
                };
                const isActive = subcategory === child.name;
                return enableCrawlableLinks && crawlableSubcategories.has(child.name) ? (
                  <a
                    key={child.name}
                    className={`sf-chip${isActive ? " is-active" : ""}`}
                    href={storefrontHref(route)}
                    aria-current={isActive && !facet ? "page" : undefined}
                    onClick={(event) => handleStorefrontLinkClick(event, route)}
                  >
                    {child.displayName || child.name}
                  </a>
                ) : (
                  <button
                    key={child.name}
                    type="button"
                    className={`sf-chip${isActive ? " is-active" : ""}`}
                    onClick={() => navigateStorefront(route)}
                  >
                    {child.displayName || child.name}
                  </button>
                );
              })}
            </div>
          ) : null}

          {subcategory && facets.length > 0 ? (
            <section className="sf-subgroup-strip" aria-label={t("storefront.clarification")}>
              <div className="sf-facet-tree" role="list">
                <button
                  type="button"
                  className={`sf-facet-item${!facet ? " is-active" : ""}`}
                  onClick={() =>
                    navigateStorefront({
                      name: "catalog",
                      category,
                      subcategory,
                    })
                  }
                >{
                  t("shared.filter.all")
                }</button>
                {facets.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`sf-facet-item${
                      facet === item.name ? " is-active" : ""
                    }`}
                    role="listitem"
                    onClick={() =>
                      navigateStorefront({
                        name: "catalog",
                        category,
                        subcategory,
                        facet: item.name,
                      })
                    }
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {inlineSearch ? searchToolbar : null}

          {error ? <p className="sf-error">{error}</p> : null}

          {visibleSections.map((section) => (
            <section className="sf-group-block" key={section.renderKey || section.name}>
              {!category && !section.continuation && !section.hideHeading ? (
                <div className="sf-group-head">
                  <h2>
                    {labelsReady
                      ? categoryDisplayNameFromCanonical(
                          section.name,
                          "",
                          categoryOptions
                        )
                      : "\u00a0"}
                  </h2>
                </div>
              ) : null}
              <div className="sf-product-grid">
                {section.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    imagePriorityIndex={imagePriorityById.get(product.id)}
                    categoryTranslations={effectiveTranslations}
                  />
                ))}
              </div>
            </section>
          ))}

          {currentPayload && totalCatalogCards > 0 && (renderLimit < totalCatalogCards || hasMore) ? (
            <div
              ref={loadMoreSentinelRef}
              className="sf-catalog-load-sentinel"
              aria-hidden="true"
              data-loading={loadingMore ? "true" : "false"}
            />
          ) : null}

          {!error && currentPayload && !products.length ? (
            <p className="sf-muted">
              {category
                ? t("storefront.thereAreNoProductsInThis")
                : t("storefront.thereAreNoProductsInThe")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
