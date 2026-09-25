import { PUBLIC_BASE_URL } from "../../config/urls.js";
import { storefrontHref, storefrontRoutePath } from "./mode.js";
import {
  formatStorefrontDocumentTitle as formatInfoPageTitle,
  resolveStorefrontInfoPage,
} from "../../shared/storefrontInfoPages.js";
import {
  formatSeoTemplate,
  getSeoCanonicalField,
} from "../../shared/i18n/seoCatalog.js";
import {
  STOREFRONT_DEFAULT_DESCRIPTION,
  STOREFRONT_DEFAULT_OG_IMAGE,
  STOREFRONT_DEFAULT_TITLE,
  STOREFRONT_SITE_NAME,
} from "../../shared/i18n/storefrontSeoDefaults.js";
import {
  PUBLIC_CANONICAL_ORIGIN,
  publicAlternateLinks,
  publicDocumentPath,
  publicLocaleInfrastructureEnabledFromDocument,
  publicPathForLocale,
} from "../../shared/i18n/publicLocaleRouting.js";
import { categoryDisplayNameFromCanonical } from "../../shared/i18n/categoryDisplayProjection.js";
import { storefrontCategoryDisplayOptions } from "../../shared/i18n/storefrontCategoryDisplay.js";
import { resolveCategoryCommercialSeo } from "../../shared/seo/categoryCommercialSeo.js";

export {
  STOREFRONT_DEFAULT_DESCRIPTION,
  STOREFRONT_DEFAULT_OG_IMAGE,
  STOREFRONT_DEFAULT_TITLE,
  STOREFRONT_SITE_NAME,
};

export function storefrontSiteOrigin() {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://clover-spb.ru";
}

function upsertMetaByName(name, content) {
  if (!content) return;
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property, content) {
  if (!content) return;
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function localizeOrganizationJsonLd({ organizationDescription } = {}) {
  const script = document.querySelector('script[type="application/ld+json"]');
  if (!script) return;
  try {
    const data = JSON.parse(script.textContent || "{}");
    if (data["@type"] !== "Organization") return;
    data.url = `${PUBLIC_CANONICAL_ORIGIN}${publicPathForLocale("/", "ru")}`;
    if (organizationDescription) data.description = organizationDescription;
    script.textContent = JSON.stringify(data);
  } catch {
    // Keep the existing valid block rather than dropping structured data.
  }
}

function replaceAlternateLinks(alternates = []) {
  for (const existing of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    existing.remove();
  }
  for (const alternate of alternates) {
    const link = document.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", alternate.hreflang);
    link.setAttribute("href", alternate.href);
    document.head.appendChild(link);
  }
}

export function formatStorefrontDocumentTitle(title) {
  return (
    formatInfoPageTitle(title, STOREFRONT_SITE_NAME) || STOREFRONT_DEFAULT_TITLE
  );
}

export function applyStorefrontDocumentMeta({
  title,
  description,
  path,
  image,
  type = "website",
  locale = "ru",
  alternates = [],
  indexable = true,
  organizationDescription = "",
} = {}) {
  const origin = alternates.length ? PUBLIC_CANONICAL_ORIGIN : storefrontSiteOrigin();
  const pageTitle = title || STOREFRONT_DEFAULT_TITLE;
  const pageDescription = description || STOREFRONT_DEFAULT_DESCRIPTION;
  const pagePath = path || storefrontHref("home");
  const canonical = pagePath.startsWith("http") ? pagePath : `${origin}${pagePath}`;
  const ogImagePath = image || STOREFRONT_DEFAULT_OG_IMAGE;
  const ogImage = ogImagePath.startsWith("http") ? ogImagePath : `${origin}${ogImagePath}`;

  document.title = pageTitle;
  upsertMetaByName("description", pageDescription);
  upsertMetaByName("robots", indexable ? "index,follow" : "noindex,follow");
  upsertLink("canonical", canonical);
  replaceAlternateLinks(indexable ? alternates : []);

  upsertMetaByProperty("og:type", type);
  upsertMetaByProperty("og:site_name", STOREFRONT_SITE_NAME);
  upsertMetaByProperty("og:title", pageTitle);
  upsertMetaByProperty("og:description", pageDescription);
  upsertMetaByProperty("og:url", canonical);
  upsertMetaByProperty("og:image", ogImage);
  upsertMetaByProperty(
    "og:locale",
    {
      ru: "ru_RU",
      en: "en_US",
      uz: "uz_UZ",
      ky: "ky_KG",
      tg: "tg_TJ",
      zh: "zh_CN",
      ar: "ar_SA",
    }[locale] || "ru_RU"
  );

  upsertMetaByName("twitter:card", "summary_large_image");
  upsertMetaByName("twitter:title", pageTitle);
  upsertMetaByName("twitter:description", pageDescription);
  upsertMetaByName("twitter:image", ogImage);
  localizeOrganizationJsonLd({ organizationDescription });
}

export function storefrontRouteDocumentMeta(route, site, options = {}) {
  const locale = options.locale || route?.locale || "ru";
  const infrastructureEnabled =
    options.infrastructureEnabled ??
    (typeof document !== "undefined" &&
      publicLocaleInfrastructureEnabledFromDocument(document));
  const localeEligible = !["cart", "checkout", "notFound"].includes(route?.name);
  const routeHref = (value) => {
    const name = typeof value === "object" ? value?.name : String(value || "home");
    const eligible = !["cart", "checkout"].includes(name);
    const canonicalPath = publicDocumentPath({
      pathname: storefrontRoutePath(value),
      locale,
      infrastructureEnabled,
      localeEligible: eligible,
    });
    if (!infrastructureEnabled && typeof window !== "undefined") {
      return storefrontHref(value, { locale, infrastructureEnabled: false });
    }
    return canonicalPath;
  };
  const alternateList =
    infrastructureEnabled && localeEligible && !route?.facet
      ? publicAlternateLinks(
          storefrontRoutePath(route),
          options.enabledLanguages || ["ru"]
        )
      : [];
  const common = {
    locale,
    organizationDescription:
      site?.seo?.home?.description || STOREFRONT_DEFAULT_DESCRIPTION,
    alternates: alternateList,
    indexable: localeEligible && !route?.facet && options.indexable !== false,
  };
  if (!route || route.name === "home") {
    return {
      title: site?.seo?.home?.title || STOREFRONT_DEFAULT_TITLE,
      description:
        site?.seo?.home?.description || STOREFRONT_DEFAULT_DESCRIPTION,
      path: routeHref("home"),
      ...common,
    };
  }
  if (route.name === "catalog") {
    const commercial = resolveCategoryCommercialSeo({
      category: route.category || "",
      subcategory: route.subcategory || "",
      facet: route.facet || "",
      locale,
    });
    const categoryOptions = storefrontCategoryDisplayOptions(
      locale,
      site?.categoryTranslations,
      options.enabledLanguages
    );
    const parts = [
      route.category
        ? categoryDisplayNameFromCanonical(route.category, "", categoryOptions)
        : "",
      route.subcategory
        ? categoryDisplayNameFromCanonical(
            route.subcategory,
            route.category,
            categoryOptions
          )
        : "",
      route.facet,
    ].filter(Boolean);
    const label =
      parts.length ? parts.join(" — ") : site?.seo?.catalog?.title || "Каталог";
    return {
      title: commercial?.metaTitle || `${label} | ${STOREFRONT_SITE_NAME}`,
      description:
        commercial?.metaDescription ||
        formatSeoTemplate(
          site?.seo?.catalog?.descriptionTemplate ||
            getSeoCanonicalField("catalog", "descriptionTemplate"),
          { label }
        ),
      path: routeHref(route),
      ...common,
    };
  }
  if (route.name === "product") {
    return {
      title: formatSeoTemplate(getSeoCanonicalField("product", "titleTemplate"), {
        code: route.code,
      }),
      description: STOREFRONT_DEFAULT_DESCRIPTION,
      path: routeHref(route),
      type: "product",
      ...common,
    };
  }
  if (route.name === "cart") {
    return {
      title: getSeoCanonicalField("cart", "title"),
      description: getSeoCanonicalField("cart", "description"),
      path: routeHref(route),
      ...common,
    };
  }
  if (route.name === "checkout") {
    return {
      title: getSeoCanonicalField("checkout", "title"),
      description: getSeoCanonicalField("checkout", "description"),
      path: routeHref(route),
      ...common,
    };
  }
  if (route.name === "install-app") {
    return {
      title: STOREFRONT_DEFAULT_TITLE,
      description: STOREFRONT_DEFAULT_DESCRIPTION,
      path: routeHref(route),
      ...common,
      // Utility PWA guide: localizable, but stay noindex (Stage 7 contract).
      indexable: false,
      alternates: [],
    };
  }
  if (route.name === "contacts") {
    return {
      title:
        site?.seo?.contacts?.title ||
        getSeoCanonicalField("contacts", "title"),
      description:
        site?.seo?.contacts?.description ||
        getSeoCanonicalField("contacts", "description"),
      path: routeHref(route),
      ...common,
    };
  }
  if (route.name === "aktsii") {
    return {
      title:
        site?.seo?.aktsii?.title ||
        getSeoCanonicalField("aktsii", "title"),
      description:
        site?.seo?.aktsii?.description ||
        getSeoCanonicalField("aktsii", "description"),
      path: infrastructureEnabled
        ? routeHref(route)
        : "https://clover-spb.ru/aktsii",
      ...common,
    };
  }
  if (route.name === "info") {
    const page = resolveStorefrontInfoPage(route.slug, site?.infoPages);
    if (page) {
      return {
        title: formatStorefrontDocumentTitle(page.title),
        description: page.description,
        path: routeHref(route),
        ...common,
      };
    }
  }
  return {
    title: STOREFRONT_DEFAULT_TITLE,
    description: STOREFRONT_DEFAULT_DESCRIPTION,
    path: routeHref("home"),
    ...common,
    indexable: false,
  };
}
