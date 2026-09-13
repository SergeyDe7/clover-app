import { PUBLIC_BASE_URL } from "../../config/urls.js";
import { storefrontHref } from "./mode.js";
import {
  formatStorefrontDocumentTitle as formatInfoPageTitle,
  resolveStorefrontInfoPage,
} from "../../shared/storefrontInfoPages.js";
import { STOREFRONT_HERO_LEAD, STOREFRONT_HERO_TITLE } from "./siteCopy.js";
import {
  formatSeoTemplate,
  getSeoCanonicalField,
} from "../../shared/i18n/seoCatalog.js";
import { resolveCategoryCommercialSeo } from "./categoryCommercialSeo.js";

export const STOREFRONT_SITE_NAME = "КЛЕВЕР";
export const STOREFRONT_DEFAULT_TITLE = `${STOREFRONT_HERO_TITLE} | ${STOREFRONT_SITE_NAME}`;
export const STOREFRONT_DEFAULT_DESCRIPTION = STOREFRONT_HERO_LEAD.slice(0, 160);
export const STOREFRONT_DEFAULT_OG_IMAGE = "/apple-touch-icon.png";

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
} = {}) {
  const origin = storefrontSiteOrigin();
  const pageTitle = title || STOREFRONT_DEFAULT_TITLE;
  const pageDescription = description || STOREFRONT_DEFAULT_DESCRIPTION;
  const pagePath = path || storefrontHref("home");
  const canonical = pagePath.startsWith("http") ? pagePath : `${origin}${pagePath}`;
  const ogImagePath = image || STOREFRONT_DEFAULT_OG_IMAGE;
  const ogImage = ogImagePath.startsWith("http") ? ogImagePath : `${origin}${ogImagePath}`;

  document.title = pageTitle;
  upsertMetaByName("description", pageDescription);
  upsertLink("canonical", canonical);

  upsertMetaByProperty("og:type", type);
  upsertMetaByProperty("og:site_name", STOREFRONT_SITE_NAME);
  upsertMetaByProperty("og:title", pageTitle);
  upsertMetaByProperty("og:description", pageDescription);
  upsertMetaByProperty("og:url", canonical);
  upsertMetaByProperty("og:image", ogImage);
  upsertMetaByProperty("og:locale", "ru_RU");

  upsertMetaByName("twitter:card", "summary_large_image");
  upsertMetaByName("twitter:title", pageTitle);
  upsertMetaByName("twitter:description", pageDescription);
  upsertMetaByName("twitter:image", ogImage);
}

export function storefrontRouteDocumentMeta(
  route,
  site,
  { locale = "ru" } = {}
) {
  if (!route || route.name === "home") {
    return {
      title: STOREFRONT_DEFAULT_TITLE,
      description: STOREFRONT_DEFAULT_DESCRIPTION,
      path: storefrontHref("home"),
    };
  }
  if (route.name === "catalog") {
    const commercial = resolveCategoryCommercialSeo({
      category: route.category || "",
      subcategory: route.subcategory || "",
      facet: route.facet || "",
      locale,
    });
    if (commercial) {
      return {
        title: commercial.metaTitle,
        description: commercial.metaDescription,
        path: storefrontHref(route),
      };
    }
    const parts = [route.category, route.subcategory, route.facet].filter(Boolean);
    const label = parts.length ? parts.join(" — ") : "Каталог";
    return {
      title: `${label} | ${STOREFRONT_SITE_NAME}`,
      description: formatSeoTemplate(getSeoCanonicalField("catalog", "descriptionTemplate"), {
        label,
      }),
      path: storefrontHref(route),
    };
  }
  if (route.name === "product") {
    return {
      title: formatSeoTemplate(getSeoCanonicalField("product", "titleTemplate"), {
        code: route.code,
      }),
      description: STOREFRONT_DEFAULT_DESCRIPTION,
      path: storefrontHref(route),
      type: "product",
    };
  }
  if (route.name === "cart") {
    return {
      title: getSeoCanonicalField("cart", "title"),
      description: getSeoCanonicalField("cart", "description"),
      path: storefrontHref(route),
    };
  }
  if (route.name === "checkout") {
    return {
      title: getSeoCanonicalField("checkout", "title"),
      description: getSeoCanonicalField("checkout", "description"),
      path: storefrontHref(route),
    };
  }
  if (route.name === "contacts") {
    return {
      title: getSeoCanonicalField("contacts", "title"),
      description: getSeoCanonicalField("contacts", "description"),
      path: storefrontHref(route),
    };
  }
  if (route.name === "aktsii") {
    return {
      title: getSeoCanonicalField("aktsii", "title"),
      description: getSeoCanonicalField("aktsii", "description"),
      path: "https://clover-spb.ru/aktsii",
    };
  }
  if (route.name === "info") {
    const page = resolveStorefrontInfoPage(route.slug, site?.infoPages);
    if (page) {
      return {
        title: formatStorefrontDocumentTitle(page.title),
        description: page.description,
        path: storefrontHref(route),
      };
    }
  }
  return {
    title: STOREFRONT_DEFAULT_TITLE,
    description: STOREFRONT_DEFAULT_DESCRIPTION,
    path: storefrontHref("home"),
  };
}
