/**
 * Чистые билдеры HTML/мета для пререндера витрины (без window / React / Vite env).
 * Используется Vite-middleware и тестами.
 */
import { STOREFRONT_HERO_LEAD, STOREFRONT_HERO_TITLE } from "./siteCopy.js";
import {
  buildStorefrontPath,
  categorySlug,
  listCategorySlugEntries,
  subcategorySlug,
} from "./storefrontSlugs.js";
import { buildStorefrontProductDescription, buildStorefrontProductBodyText } from "./storefrontProductSeo.js";
import { getCatalogPageSeo, isCatalogPageNoindex } from "./storefrontCatalogSeo.js";
import { getCatalogPageContent } from "./storefrontCatalogContent.js";

const ORIGIN = "https://clover-spb.ru";
const STOREFRONT_SITE_NAME = "КЛЕВЕР";
const STOREFRONT_DEFAULT_TITLE = `${STOREFRONT_HERO_TITLE} | ${STOREFRONT_SITE_NAME}`;
const STOREFRONT_DEFAULT_DESCRIPTION = STOREFRONT_HERO_LEAD.slice(0, 160);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncate(text, max = 160) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

export function storefrontOrigin() {
  return ORIGIN;
}

export function buildPageMeta(route, { product, productCount } = {}) {
  const path = buildStorefrontPath(route);
  const canonical = `${ORIGIN}${path === "/" ? "/" : path}`;

  if (!route || route.name === "home") {
    return {
      title: STOREFRONT_DEFAULT_TITLE,
      description: STOREFRONT_DEFAULT_DESCRIPTION,
      path,
      canonical,
      h1: STOREFRONT_HERO_TITLE,
      robots: null,
      type: "website",
    };
  }

  if (route.name === "catalog") {
    const robots = isCatalogPageNoindex(route) ? "noindex, follow" : null;
    const override = getCatalogPageSeo(route);
    if (override) {
      return {
        title: override.title,
        description: truncate(override.description),
        path,
        canonical,
        h1: override.h1,
        robots,
        type: "website",
      };
    }

    const parts = [route.category, route.subcategory, route.facet].filter(Boolean);
    const label = parts.length ? parts.join(" — ") : "Каталог";
    const countSuffix =
      Number.isFinite(productCount) && productCount > 0
        ? ` ${productCount} товар(ов).`
        : "";
    return {
      title: `${label} | ${STOREFRONT_SITE_NAME}`,
      description: truncate(
        `Каталог «${label}»: хозтовары, упаковка и расходники для HoReCa.${countSuffix} Заказ без регистрации на сайте ${STOREFRONT_SITE_NAME}.`
      ),
      path,
      canonical,
      h1: label,
      robots,
      type: "website",
    };
  }

  if (route.name === "product") {
    const name = product?.name || `Товар ${route.code}`;
    return {
      title: `${name} | ${STOREFRONT_SITE_NAME}`,
      description: product
        ? buildStorefrontProductDescription(product)
        : truncate(`Товар ${route.code} в каталоге компании ${STOREFRONT_SITE_NAME}.`),
      path,
      canonical,
      h1: name,
      robots: null,
      type: "product",
      image: product?.imageUrl || undefined,
    };
  }

  if (route.name === "cart") {
    return {
      title: `Корзина | ${STOREFRONT_SITE_NAME}`,
      description: "Корзина заказа на сайте компании КЛЕВЕР.",
      path,
      canonical,
      h1: "Корзина",
      robots: "noindex, follow",
      type: "website",
    };
  }

  if (route.name === "checkout") {
    return {
      title: `Оформление заказа | ${STOREFRONT_SITE_NAME}`,
      description: "Оформление заказа хозтоваров и упаковки для HoReCa.",
      path,
      canonical,
      h1: "Оформление заказа",
      robots: "noindex, follow",
      type: "website",
    };
  }

  if (route.name === "contacts") {
    return {
      title: `Контакты | ${STOREFRONT_SITE_NAME}`,
      description: "Контакты компании КЛЕВЕР: адрес, телефон и карта проезда.",
      path,
      canonical,
      h1: "Контакты",
      robots: null,
      type: "website",
    };
  }

  if (route.name === "install-app") {
    return {
      title: `Установка приложения | ${STOREFRONT_SITE_NAME}`,
      description:
        "Как установить мобильное приложение Clover на iPhone, Android и компьютер: пошаговая инструкция PWA.",
      path,
      canonical,
      h1: "Установка приложения",
      robots: null,
      type: "website",
    };
  }

  return {
    title: STOREFRONT_DEFAULT_TITLE,
    description: STOREFRONT_DEFAULT_DESCRIPTION,
    path: "/",
    canonical: `${ORIGIN}/`,
    h1: STOREFRONT_HERO_TITLE,
    robots: null,
    type: "website",
  };
}

function productListHtml(products, limit = 80) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) {
    return `<p>В этой категории пока нет товаров на витрине.</p>`;
  }
  const shown = list.slice(0, limit);
  const items = shown
    .map((product) => {
      const href = `/product/${encodeURIComponent(product.code)}`;
      const name = escapeHtml(product.name);
      const price = Number(product?.prices?.piece) || Number(product?.prices?.pack) || 0;
      const priceText = price > 0 ? ` — от ${price.toFixed(2)} ₽` : "";
      return `<li><a href="${href}">${name}</a>${escapeHtml(priceText)}</li>`;
    })
    .join("\n");
  const more =
    list.length > shown.length
      ? `<p>Ещё ${list.length - shown.length} товар(ов) в каталоге.</p>`
      : "";
  return `<ul>\n${items}\n</ul>\n${more}`;
}

function catalogContentHtml(route) {
  const content = getCatalogPageContent(route);
  if (!content) return { intro: "", below: "" };
  const intro = content.intro
    ? `<p data-seo-content="intro">${escapeHtml(content.intro)}</p>`
    : "";
  const assortment = content.assortment?.length
    ? `<section data-seo-content="assortment">
  <h2>Что входит в ассортимент</h2>
  <ul>
${content.assortment.map((line) => `    <li>${escapeHtml(line)}</li>`).join("\n")}
  </ul>
</section>`
    : "";
  const links = content.links?.length
    ? `<section data-seo-content="links">
  <h2>Смотрите также</h2>
  <ul>
${content.links
  .map(
    (link) =>
      `    <li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a></li>`
  )
  .join("\n")}
  </ul>
</section>`
    : "";
  const faq = content.faq?.length
    ? `<section data-seo-content="faq">
  <h2>Частые вопросы</h2>
${content.faq
  .map(
    (item) => `  <details>
    <summary>${escapeHtml(item.q)}</summary>
    <p>${escapeHtml(item.a)}</p>
  </details>`
  )
  .join("\n")}
</section>`
    : "";
  return { intro, below: `${assortment}\n${links}\n${faq}` };
}

export function buildPrerenderBody(route, { product, products, categories } = {}) {
  const meta = buildPageMeta(route, {
    product,
    productCount: Array.isArray(products) ? products.length : undefined,
  });

  if (route.name === "home") {
    const groups = listCategorySlugEntries()
      .map(
        (entry) =>
          `<li><a href="/catalog/${entry.slug}">${escapeHtml(entry.name)}</a></li>`
      )
      .join("\n");
    return {
      meta,
      html: `<main id="clover-ssr">
  <h1>${escapeHtml(meta.h1)}</h1>
  <p>${escapeHtml(STOREFRONT_HERO_LEAD)}</p>
  <h2>Каталог</h2>
  <ul>
${groups}
  </ul>
  <p><a href="/catalog">Весь каталог</a> · <a href="/contacts">Контакты</a></p>
</main>`,
    };
  }

  if (route.name === "catalog") {
    const crumbs = [];
    crumbs.push(`<a href="/catalog">Каталог</a>`);
    if (route.category) {
      crumbs.push(
        `<a href="/catalog/${categorySlug(route.category)}">${escapeHtml(route.category)}</a>`
      );
    }
    if (route.subcategory) {
      crumbs.push(
        `<a href="/catalog/${categorySlug(route.category)}/${subcategorySlug(route.subcategory)}">${escapeHtml(route.subcategory)}</a>`
      );
    }
    const navCats = (Array.isArray(categories) ? categories : listCategorySlugEntries()).map(
      (entry) => {
        const name = entry.name || entry;
        const slug = entry.slug || categorySlug(name);
        return `<li><a href="/catalog/${slug}">${escapeHtml(name)}</a></li>`;
      }
    );
    const contentBlocks = catalogContentHtml(route);
    return {
      meta,
      html: `<main id="clover-ssr">
  <nav aria-label="Хлебные крошки">${crumbs.join(" / ")}</nav>
  <h1>${escapeHtml(meta.h1)}</h1>
  ${contentBlocks.intro}
  <h2>Товары</h2>
  ${productListHtml(products)}
  ${contentBlocks.below}
  <h2>Категории</h2>
  <ul>
${navCats.join("\n")}
  </ul>
</main>`,
    };
  }

  if (route.name === "product") {
    if (!product) {
      return {
        meta,
        html: `<main id="clover-ssr">
  <h1>${escapeHtml(meta.h1)}</h1>
  <p>Товар не найден.</p>
  <p><a href="/catalog">В каталог</a></p>
</main>`,
        status: 404,
      };
    }
    const desc = escapeHtml(buildStorefrontProductBodyText(product));
    const cat = product.category
      ? `<p>Категория: <a href="/catalog/${categorySlug(product.category)}">${escapeHtml(product.category)}</a></p>`
      : "";
    const code = escapeHtml(product.code || route.code);
    const price = Number(product?.prices?.piece) || 0;
    const priceHtml =
      price > 0 ? `<p>Цена: ${escapeHtml(price.toFixed(2))} ₽</p>` : "";
    return {
      meta,
      html: `<main id="clover-ssr">
  <p><a href="/catalog">← Каталог</a></p>
  <h1>${escapeHtml(product.name)}</h1>
  <p>Артикул: ${code}</p>
  ${cat}
  ${priceHtml}
  <p>${desc}</p>
</main>`,
    };
  }

  if (route.name === "cart" || route.name === "checkout") {
    return {
      meta,
      html: `<main id="clover-ssr">
  <h1>${escapeHtml(meta.h1)}</h1>
  <p>${escapeHtml(meta.description)}</p>
</main>`,
    };
  }

  return {
    meta,
    html: `<main id="clover-ssr">
  <h1>${escapeHtml(meta.h1)}</h1>
  <p>${escapeHtml(meta.description)}</p>
</main>`,
  };
}

function replaceOrInsertMetaName(html, name, content) {
  const re = new RegExp(
    `<meta\\s+[^>]*name=["']${name}["'][^>]*>`,
    "i"
  );
  const tag = `<meta name="${name}" content="${escapeHtml(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function replaceOrInsertMetaProperty(html, property, content) {
  const re = new RegExp(
    `<meta\\s+[^>]*property=["']${property}["'][^>]*>`,
    "i"
  );
  const tag = `<meta property="${property}" content="${escapeHtml(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function replaceOrInsertCanonical(html, href) {
  const re = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  const tag = `<link rel="canonical" href="${escapeHtml(href)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function replaceTitle(html, title) {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  }
  return html.replace(/<\/head>/i, `    <title>${escapeHtml(title)}</title>\n  </head>`);
}

export function injectPrerenderIntoHtml(indexHtml, { meta, html, status } = {}) {
  let out = String(indexHtml || "");
  if (!meta) return { html: out, status: status || 200 };

  out = replaceTitle(out, meta.title);
  out = replaceOrInsertMetaName(out, "description", meta.description);
  out = replaceOrInsertCanonical(out, meta.canonical);
  if (meta.robots) {
    out = replaceOrInsertMetaName(out, "robots", meta.robots);
  } else {
    out = out.replace(/<meta\s+[^>]*name=["']robots["'][^>]*>\s*/i, "");
  }
  out = replaceOrInsertMetaProperty(out, "og:title", meta.title);
  out = replaceOrInsertMetaProperty(out, "og:description", meta.description);
  out = replaceOrInsertMetaProperty(out, "og:url", meta.canonical);
  out = replaceOrInsertMetaProperty(out, "og:type", meta.type || "website");
  if (meta.image) {
    const image = meta.image.startsWith("http")
      ? meta.image
      : `${ORIGIN}${meta.image}`;
    out = replaceOrInsertMetaProperty(out, "og:image", image);
  }

  const rootRe = /<div id="root"><\/div>/i;
  if (rootRe.test(out)) {
    out = out.replace(
      rootRe,
      `<div id="root">${html || ""}</div>`
    );
  } else {
    out = out.replace(
      /<div id="root">[\s\S]*?<\/div>/i,
      `<div id="root">${html || ""}</div>`
    );
  }

  return { html: out, status: status || 200 };
}

export function buildSitemapXml({ products } = {}) {
  const urls = [];
  const push = (loc, priority = "0.6") => {
    urls.push({ loc: `${ORIGIN}${loc}`, priority });
  };

  push("/", "1.0");
  push("/catalog", "0.9");
  push("/contacts", "0.5");
  push("/install-app", "0.4");

  for (const entry of listCategorySlugEntries()) {
    const catRoute = { name: "catalog", category: entry.name };
    if (!isCatalogPageNoindex(catRoute)) {
      push(`/catalog/${entry.slug}`, "0.8");
    }
    for (const child of entry.children) {
      const subRoute = {
        name: "catalog",
        category: entry.name,
        subcategory: child.name,
      };
      if (isCatalogPageNoindex(subRoute)) continue;
      push(`/catalog/${entry.slug}/${child.slug}`, "0.7");
    }
  }

  for (const product of Array.isArray(products) ? products : []) {
    if (!product?.code) continue;
    push(`/product/${encodeURIComponent(product.code)}`, "0.6");
  }

  const body = urls
    .map(
      (item) => `  <url>
    <loc>${escapeHtml(item.loc)}</loc>
    <changefreq>weekly</changefreq>
    <priority>${item.priority}</priority>
  </url>`
    )
    .join("\n");

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`,
    count: urls.length,
  };
}
