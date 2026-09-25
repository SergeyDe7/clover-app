import {
  DEFAULT_LOCALE,
  canonicalizeLocale,
  getEnabledLocales,
} from "../i18n/languageRegistry.js";
import {
  PUBLIC_CANONICAL_ORIGIN,
  publicAbsoluteUrl,
  publicAlternateLinks,
  publicPathForLocale,
} from "../i18n/publicLocaleRouting.js";
import {
  findCategoryCatalogBySource,
} from "../i18n/categoryCatalog.js";
import {
  projectLocalizedProductDisplay,
} from "../i18n/productDisplayProjection.js";
import {
  resolveStorefrontInfoPage,
} from "../storefrontInfoPages.js";
import {
  formatSeoTemplate,
  getSeoCanonicalField,
} from "../i18n/seoCatalog.js";
import {
  STOREFRONT_DEFAULT_DESCRIPTION,
  STOREFRONT_DEFAULT_TITLE,
  STOREFRONT_SITE_NAME,
} from "../i18n/storefrontSeoDefaults.js";
import { resolveCategoryCommercialSeo } from "../seo/categoryCommercialSeo.js";
import {
  SITEMAP_STATIC_PATHS,
  escapeXml,
  sitemapStorefrontPath,
} from "./sitemapContract.js";

const OG_LOCALES = Object.freeze({
  ru: "ru_RU",
  en: "en_US",
  uz: "uz_UZ",
  ky: "ky_KG",
  tg: "tg_TJ",
  zh: "zh_CN",
  ar: "ar_SA",
});

function genericTranslationLookup(translationStore, locale) {
  if (locale === DEFAULT_LOCALE) return new Map();
  const internal = canonicalizeLocale(locale);
  const entries = Array.isArray(translationStore?.entries)
    ? translationStore.entries
    : [];
  const values = Array.isArray(translationStore?.values)
    ? translationStore.values
    : [];
  const byId = new Map(entries.map((entry) => [String(entry.id || ""), entry]));
  const out = new Map();
  for (const value of values) {
    if (String(value?.languageCode || "") !== internal) continue;
    if (!["AUTO", "MANUAL"].includes(String(value?.state || ""))) continue;
    const entry = byId.get(String(value?.entryId || ""));
    if (!entry) continue;
    if (String(value.sourceHash || "") !== String(entry.sourceHash || "")) continue;
    const text = String(value.value || "").trim();
    if (!text) continue;
    out.set(
      `${entry.namespace}\0${entry.entityType || ""}\0${entry.entityId || ""}\0${entry.fieldKey}`,
      text
    );
  }
  return out;
}

function translated(lookup, namespace, entityType, entityId, fieldKey, fallback) {
  return (
    lookup.get(`${namespace}\0${entityType}\0${entityId}\0${fieldKey}`) ||
    String(fallback || "")
  );
}

function categoryLabel(sourceRu, parentSourceRu, lookup) {
  const meta = findCategoryCatalogBySource({
    entityType: parentSourceRu ? "subcategory" : "category",
    sourceRu,
    parentSourceRu,
  });
  if (!meta) return String(sourceRu || "");
  return translated(
    lookup,
    "category",
    meta.entityType,
    meta.entityId,
    "name",
    sourceRu
  );
}

function productTranslationCells(rows, productId, locale) {
  const internal = canonicalizeLocale(locale);
  const cells = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (String(row?.productId || "") !== String(productId || "")) continue;
    if (String(row?.languageCode || "") !== internal) continue;
    cells[row.fieldKey] = row;
  }
  return cells;
}

function localizedProduct(product, locale, enabledLanguages, productTranslations) {
  return projectLocalizedProductDisplay(
    product,
    locale,
    enabledLanguages,
    productTranslationCells(productTranslations, product?.id, locale)
  );
}

export function buildIndexableRouteDescriptors({
  staticPaths = SITEMAP_STATIC_PATHS,
  categories = [],
  subcategories = [],
  publicProducts = [],
} = {}) {
  const out = [];
  for (const path of staticPaths) {
    if (path === "/") out.push({ path, route: { name: "home" } });
    else if (path === "/catalog") out.push({ path, route: { name: "catalog" } });
    else if (path === "/contacts") out.push({ path, route: { name: "contacts" } });
    else if (path === "/aktsii") out.push({ path, route: { name: "aktsii" } });
    else out.push({ path, route: { name: "info", slug: path.slice(1) } });
  }
  for (const category of categories) {
    out.push({
      path: sitemapStorefrontPath({ name: "catalog", category }),
      route: { name: "catalog", category },
    });
  }
  for (const item of subcategories) {
    out.push({
      path: sitemapStorefrontPath({
        name: "catalog",
        category: item.category,
        subcategory: item.subcategory,
      }),
      route: {
        name: "catalog",
        category: item.category,
        subcategory: item.subcategory,
      },
    });
  }
  for (const product of publicProducts) {
    out.push({
      path: sitemapStorefrontPath({ name: "product", code: product.code }),
      route: { name: "product", code: product.code },
      product,
    });
  }
  return out;
}

export function localizedRouteMetadata(
  descriptor,
  {
    locale = DEFAULT_LOCALE,
    enabledLanguages = [DEFAULT_LOCALE],
    translationStore,
    productTranslations,
    productsById,
    infoPages,
  } = {}
) {
  const route = descriptor?.route || { name: "home" };
  const lookup = genericTranslationLookup(translationStore, locale);
  let title = STOREFRONT_DEFAULT_TITLE;
  let description = STOREFRONT_DEFAULT_DESCRIPTION;
  let type = "website";
  let heading = "";

  if (route.name === "home") {
    title = translated(
      lookup,
      "seo",
      "route",
      "home",
      "title",
      STOREFRONT_DEFAULT_TITLE
    );
    description = translated(
      lookup,
      "seo",
      "route",
      "home",
      "description",
      STOREFRONT_DEFAULT_DESCRIPTION
    );
  } else if (route.name === "catalog") {
    const labels = [];
    if (route.category) {
      labels.push(categoryLabel(route.category, "", lookup));
    }
    if (route.subcategory) {
      labels.push(categoryLabel(route.subcategory, route.category, lookup));
    }
    const label =
      labels.join(" — ") ||
      translated(
        lookup,
        "seo",
        "route",
        "catalog",
        "title",
        getSeoCanonicalField("catalog", "title")
      );
    heading = label;
    title = `${label} | ${STOREFRONT_SITE_NAME}`;
    description = formatSeoTemplate(
      translated(
        lookup,
        "seo",
        "route",
        "catalog",
        "descriptionTemplate",
        getSeoCanonicalField("catalog", "descriptionTemplate")
      ),
      { label }
    );
    const commercial = resolveCategoryCommercialSeo({
      category: route.category,
      subcategory: route.subcategory,
      facet: route.facet,
      locale,
    });
    if (commercial) {
      title = commercial.metaTitle;
      description = commercial.metaDescription;
      return {
        heading,
        title,
        description,
        type,
        ogLocale: OG_LOCALES[locale] || OG_LOCALES.ru,
        commercialSeo: {
          category: commercial.category,
          h1: commercial.h1,
          lead: commercial.lead,
          body: commercial.body,
          benefits: [...commercial.benefits],
          popularSubcategories: [...commercial.popularSubcategories],
          faq: commercial.faq.map((item) => ({ q: item.q, a: item.a })),
        },
      };
    }
  } else if (route.name === "product") {
    const canonical =
      productsById?.get?.(String(descriptor?.product?.id || "")) ||
      descriptor?.product ||
      {};
    const product = localizedProduct(
      canonical,
      locale,
      enabledLanguages,
      productTranslations
    );
    const name = String(product?.name || descriptor?.product?.name || route.code);
    heading = name;
    title = `${name} | ${STOREFRONT_SITE_NAME}`;
    description =
      String(product?.storefrontDetails?.description || "").trim().slice(0, 160) ||
      formatSeoTemplate(
        translated(
          lookup,
          "seo",
          "route",
          "product",
          "titleTemplate",
          getSeoCanonicalField("product", "titleTemplate")
        ),
        { code: route.code }
      );
    type = "product";
  } else if (route.name === "contacts" || route.name === "aktsii") {
    title = translated(
      lookup,
      "seo",
      "route",
      route.name,
      "title",
      getSeoCanonicalField(route.name, "title")
    );
    description = translated(
      lookup,
      "seo",
      "route",
      route.name,
      "description",
      getSeoCanonicalField(route.name, "description")
    );
  } else if (route.name === "info") {
    const page = resolveStorefrontInfoPage(route.slug, infoPages);
    if (page) {
      heading = translated(
        lookup,
        "page",
        "info",
        route.slug,
        "heading",
        page.heading
      );
      title = translated(
        lookup,
        "page",
        "info",
        route.slug,
        "title",
        page.title
      );
      description = translated(
        lookup,
        "page",
        "info",
        route.slug,
        "description",
        page.description
      );
      if (!title.includes(STOREFRONT_SITE_NAME)) {
        title = `${title} | ${STOREFRONT_SITE_NAME}`;
      }
    }
  }

  return {
    heading,
    title,
    description,
    type,
    ogLocale: OG_LOCALES[locale] || OG_LOCALES.ru,
  };
}

export function buildLocalizedRouteManifest({
  descriptors = [],
  enabledLanguages = [DEFAULT_LOCALE],
  translationStore,
  productTranslations,
  products = [],
  infoPages,
} = {}) {
  const locales = getEnabledLocales(enabledLanguages);
  const productsById = new Map(
    (Array.isArray(products) ? products : []).map((product) => [
      String(product?.id || ""),
      product,
    ])
  );
  const routes = {};
  for (const descriptor of descriptors) {
    const alternates = publicAlternateLinks(descriptor.path, locales);
    for (const locale of locales) {
      const pathname = publicPathForLocale(descriptor.path, locale);
      routes[pathname] = {
        pathname,
        sourcePath: descriptor.path,
        routeName: descriptor?.route?.name || "",
        locale,
        direction: locale === "ar" ? "rtl" : "ltr",
        canonical: publicAbsoluteUrl(descriptor.path, locale),
        alternates,
        ...localizedRouteMetadata(descriptor, {
          locale,
          enabledLanguages: locales,
          translationStore,
          productTranslations,
          productsById,
          infoPages,
        }),
      };
    }
  }

  // This SEO wave promotes only Russian pages. Build a crawlable, manifest-backed
  // hierarchy from indexable descriptors so no static href can point at an empty
  // registry category that would return 404 on a fresh request.
  const russianCatalogDescriptors = descriptors.filter(
    (descriptor) => descriptor?.route?.name === "catalog"
  );
  const russianProductDescriptors = descriptors.filter(
    (descriptor) => descriptor?.route?.name === "product"
  );
  const russianRecord = (descriptor) =>
    routes[publicPathForLocale(descriptor.path, DEFAULT_LOCALE)] || null;
  const linkFor = (descriptor) => {
    const target = russianRecord(descriptor);
    if (!target?.pathname || !target?.heading) return null;
    return { href: target.pathname, label: target.heading };
  };

  for (const descriptor of russianCatalogDescriptors) {
    const record = russianRecord(descriptor);
    if (!record) continue;
    const route = descriptor.route || {};
    let targets;
    if (!route.category) {
      targets = russianCatalogDescriptors.filter(
        (candidate) => candidate?.route?.category && !candidate?.route?.subcategory
      );
    } else if (!route.subcategory) {
      targets = [
        ...russianCatalogDescriptors.filter(
          (candidate) =>
            candidate?.route?.category === route.category &&
            candidate?.route?.subcategory
        ),
        ...russianProductDescriptors.filter(
          (candidate) =>
            String(candidate?.product?.category || "") === route.category &&
            !String(candidate?.product?.subcategory || "").trim()
        ),
      ];
    } else {
      targets = russianProductDescriptors.filter(
        (candidate) =>
          String(candidate?.product?.category || "") === route.category &&
          String(candidate?.product?.subcategory || "") === route.subcategory
      );
    }
    const seen = new Set();
    record.crawlLinks = targets
      .map(linkFor)
      .filter((link) => link && !seen.has(link.href) && seen.add(link.href));
  }

  for (const descriptor of russianProductDescriptors) {
    const record = russianRecord(descriptor);
    if (!record) continue;
    const category = String(descriptor?.product?.category || "").trim();
    const subcategory = String(descriptor?.product?.subcategory || "").trim();
    const parent = russianCatalogDescriptors.find(
      (candidate) =>
        candidate?.route?.category === category &&
        String(candidate?.route?.subcategory || "") === subcategory
    ) || russianCatalogDescriptors.find(
      (candidate) =>
        candidate?.route?.category === category && !candidate?.route?.subcategory
    );
    const parentLink = parent ? linkFor(parent) : null;
    record.crawlLinks = parentLink ? [parentLink] : [];
  }

  for (const locale of locales) {
    const home = routes[publicPathForLocale("/", locale)];
    const organizationDescription = home?.description || "";
    for (const record of Object.values(routes)) {
      if (record.locale === locale) {
        record.organizationDescription = organizationDescription;
      }
    }
  }
  return {
    version: 1,
    infrastructureEnabled: true,
    origin: PUBLIC_CANONICAL_ORIGIN,
    enabledLanguages: locales,
    routes,
  };
}

export function renderLocalizedSitemapXml(manifest) {
  const canonicalRecords = Object.values(manifest?.routes || {}).filter(
    (record) => !record.canonicalAlias && record.pathname
  );
  const urls = canonicalRecords
    .map((record) => {
      const alternates = record.alternates
        .map(
          (alternate) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`
        )
        .join("\n");
      return `  <url>
    <loc>${escapeXml(record.canonical)}</loc>
${alternates}
  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}
