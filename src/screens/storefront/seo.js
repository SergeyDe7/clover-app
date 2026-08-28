import { PUBLIC_BASE_URL } from "../../config/urls.js";
import { storefrontHref } from "./mode.js";
import { STOREFRONT_HERO_LEAD, STOREFRONT_HERO_TITLE } from "./siteCopy.js";

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

export function applyStorefrontDocumentMeta({
  title,
  description,
  path,
  image,
  type = "website",
  robots,
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
  if (robots) {
    upsertMetaByName("robots", robots);
  } else {
    const robotsEl = document.querySelector('meta[name="robots"]');
    if (robotsEl) robotsEl.remove();
  }

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

export function storefrontRouteDocumentMeta(route) {
  if (!route || route.name === "home") {
    return {
      title: STOREFRONT_DEFAULT_TITLE,
      description: STOREFRONT_DEFAULT_DESCRIPTION,
      path: storefrontHref("home"),
    };
  }
  if (route.name === "catalog") {
    const parts = [route.category, route.subcategory, route.facet].filter(Boolean);
    const label = parts.length ? parts.join(" — ") : "Каталог";
    return {
      title: `${label} | ${STOREFRONT_SITE_NAME}`,
      description: `Каталог «${label}»: хозтовары, упаковка и расходники для HoReCa. Заказ без регистрации на сайте ${STOREFRONT_SITE_NAME}.`,
      path: storefrontHref(route),
    };
  }
  if (route.name === "product") {
    return {
      title: `Товар ${route.code} | ${STOREFRONT_SITE_NAME}`,
      description: STOREFRONT_DEFAULT_DESCRIPTION,
      path: storefrontHref(route),
      type: "product",
    };
  }
  if (route.name === "cart") {
    return {
      title: `Корзина | ${STOREFRONT_SITE_NAME}`,
      description: "Корзина заказа на сайте компании КЛЕВЕР.",
      path: storefrontHref(route),
      robots: "noindex, follow",
    };
  }
  if (route.name === "checkout") {
    return {
      title: `Оформление заказа | ${STOREFRONT_SITE_NAME}`,
      description: "Оформление заказа хозтоваров и упаковки для HoReCa.",
      path: storefrontHref(route),
      robots: "noindex, follow",
    };
  }
  if (route.name === "contacts") {
    return {
      title: `Контакты | ${STOREFRONT_SITE_NAME}`,
      description: "Контакты компании КЛЕВЕР: адрес, телефон и карта проезда.",
      path: storefrontHref(route),
    };
  }
  if (route.name === "install-app") {
    return {
      title: `Установка приложения | ${STOREFRONT_SITE_NAME}`,
      description:
        "Как установить мобильное приложение Clover на iPhone, Android и компьютер: пошаговая инструкция PWA.",
      path: storefrontHref(route),
    };
  }
  return {
    title: STOREFRONT_DEFAULT_TITLE,
    description: STOREFRONT_DEFAULT_DESCRIPTION,
    path: storefrontHref("home"),
  };
}
