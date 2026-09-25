import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  SEO004_TARGET_CATEGORIES,
  listCategoryCommercialSeoRecords,
  resolveCategoryCommercialSeo,
} from "../../src/shared/seo/categoryCommercialSeo.js";
import {
  buildIndexableRouteDescriptors,
  buildLocalizedRouteManifest,
} from "../../src/shared/sitemap/localizedSitemap.js";
import {
  renderPublicRouteHtml,
  resolvePublicRouteRequest,
} from "../../src/shared/sitemap/publicRouteHtml.js";
import {
  publicAbsoluteUrl,
  publicPathForLocale,
} from "../../src/shared/i18n/publicLocaleRouting.js";
import { sitemapStorefrontPath } from "../../src/shared/sitemap/sitemapContract.js";
import { STOREFRONT_SITE_NAME } from "../../src/shared/i18n/storefrontSeoDefaults.js";

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-seo004-"));
process.on("exit", () => rmSync(tempDir, { recursive: true, force: true }));
const loaderPath = path.join(tempDir, "vite-env-loader.mjs");
writeFileSync(
  loaderPath,
  `export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.format === "module") {
    let source = result.source;
    if (Buffer.isBuffer(source)) source = source.toString("utf8");
    if (typeof source === "string" && source.includes("import.meta.env")) {
      source = source.replaceAll(
        "import.meta.env",
        "({VITE_PUBLIC_BASE_URL:'',VITE_APP_PUBLIC_URL:'',VITE_CABINET_PATH:'/lk',VITE_CABINET_URL:'',VITE_STORE_HOSTS:'clover-spb.ru'})"
      );
      return { format: "module", shortCircuit: true, source };
    }
  }
  return result;
}`
);
register(pathToFileURL(loaderPath).href);
const { storefrontRouteDocumentMeta } = await import(
  "../../src/screens/storefront/seo.js"
);

const EXPECTED = Object.freeze({
  "Одноразовая посуда": Object.freeze({
    metaTitle: "Одноразовая посуда оптом в Санкт-Петербурге | КЛЕВЕР",
    metaDescription:
      "Одноразовая посуда оптом для кафе, ресторанов, кофеен, столовых и доставки. Стаканы, контейнеры, ланч-боксы и расходники. КЛЕВЕР, Санкт-Петербург.",
    h1: "Одноразовая посуда оптом в Санкт-Петербурге",
    lead:
      "Одноразовая посуда для кафе, ресторанов, кофеен, столовых и доставки в Санкт-Петербурге. В каталоге — стаканы, контейнеры, ланч-боксы, соусники, тарелки и миски, столовые приборы и другие расходные позиции.",
    body:
      "КЛЕВЕР помогает компаниям организовать регулярные закупки одноразовой посуды и сопутствующих расходных материалов. Для постоянных клиентов личный кабинет объединяет персональную товарную матрицу и индивидуальные цены.",
    benefits: [
      "Основные расходные позиции для HoReCa",
      "Персональная товарная матрица в личном кабинете",
      "Индивидуальные цены для постоянного клиента",
    ],
    popularSubcategories: [
      "Стаканы",
      "Контейнеры",
      "Ланч-боксы",
      "Соусники",
      "Столовые приборы",
      "Тарелки, миски",
    ],
    faq: [
      {
        q: "Какая одноразовая посуда есть в каталоге?",
        a: "В разделе представлены стаканы, контейнеры, ланч-боксы, соусники, тарелки и миски, столовые приборы и другие расходные позиции.",
      },
      {
        q: "Для кого подходит ассортимент одноразовой посуды?",
        a: "Раздел рассчитан на регулярные закупки кафе, ресторанов, кофеен, столовых, служб доставки и других организаций.",
      },
      {
        q: "Как упростить регулярные заказы?",
        a: "Постоянные клиенты КЛЕВЕР могут работать через личный кабинет: использовать персональную товарную матрицу и индивидуальные цены, чтобы быстрее собирать повторные заказы.",
      },
    ],
  }),
  "Пакеты, упаковочные материалы": Object.freeze({
    metaTitle: "Упаковочные материалы оптом в Санкт-Петербурге | КЛЕВЕР",
    metaDescription:
      "Пакеты и упаковочные материалы оптом для бизнеса в Санкт-Петербурге: пакеты-майки, фасовочные, вакуумные и бумажные пакеты. B2B-каталог КЛЕВЕР.",
    h1: "Пакеты и упаковочные материалы оптом в Санкт-Петербурге",
    lead:
      "Пакеты и упаковочные материалы для магазинов, доставки, кафе, ресторанов и других организаций в Санкт-Петербурге. В разделе представлены пакеты-майки, фасовочные и вакуумные пакеты, а также бумажные пакеты с ручками и без ручек.",
    body:
      "Пакеты можно включать в регулярные закупки бизнеса вместе с остальным ассортиментом КЛЕВЕР. Для постоянного клиента в личном кабинете доступны персональная товарная матрица и индивидуальные цены.",
    benefits: [
      "Форматы пакетов для разных задач бизнеса",
      "Персональная товарная матрица в личном кабинете",
      "Индивидуальные цены для постоянного клиента",
    ],
    popularSubcategories: [
      "Пакеты-майки",
      "Пакеты фасовочные",
      "Пакеты вакуумные",
      "Бумажные пакеты с ручкой",
      "Бумажные пакеты без ручки",
    ],
    faq: [
      {
        q: "Какие пакеты представлены в каталоге?",
        a: "В разделе есть пакеты-майки, фасовочные и вакуумные пакеты, а также бумажные пакеты с ручками и без ручек.",
      },
      {
        q: "Можно ли подобрать пакеты под разные задачи бизнеса?",
        a: "Да. В каталоге собраны несколько основных форматов пакетов для торговли, доставки, общественного питания и других хозяйственных задач.",
      },
      {
        q: "Как заказывать пакеты регулярно?",
        a: "Постоянные клиенты КЛЕВЕР могут использовать личный кабинет, персональную товарную матрицу и индивидуальные цены для повторных закупок.",
      },
    ],
  }),
  "Хозяйственные товары": Object.freeze({
    metaTitle: "Хозтовары оптом в Санкт-Петербурге | КЛЕВЕР",
    metaDescription:
      "Хозтовары оптом для кафе, ресторанов, офисов, клининга и организаций в Санкт-Петербурге: перчатки, мешки для мусора, уборочный инвентарь.",
    h1: "Хозяйственные товары оптом в Санкт-Петербурге",
    lead:
      "Хозяйственные товары для кафе, ресторанов, офисов, клининга и других организаций в Санкт-Петербурге. В разделе — перчатки, мешки для мусора, тряпки и мопы, губки, швабры и щетки, фольга, пленка и другие расходные товары.",
    body:
      "Хозяйственные расходники удобно включать в регулярные закупки вместе с другими товарами для организации. Личный кабинет постоянного клиента помогает работать со своей товарной матрицей и индивидуальными ценами.",
    benefits: [
      "Расходники для уборки и хозяйственных задач",
      "Персональная товарная матрица в личном кабинете",
      "Индивидуальные цены для постоянного клиента",
    ],
    popularSubcategories: [
      "Мешки для мусора",
      "Перчатки",
      "Тряпки, мопы, полотенца",
      "Швабры, щетки",
      "Губки для посуды",
      "Фольга, пленка, пергамент",
    ],
    faq: [
      {
        q: "Какие хозяйственные товары есть в разделе?",
        a: "В разделе представлены перчатки, мешки для мусора, тряпки и мопы, губки, швабры и щетки, фольга, пленка, пергамент и другие хозяйственные расходники.",
      },
      {
        q: "Подходит ли ассортимент для организаций?",
        a: "В разделе есть позиции для хозяйственных задач кафе, ресторанов, офисов, клининга и других организаций.",
      },
      {
        q: "Как организовать повторные закупки хозтоваров?",
        a: "Постоянные клиенты КЛЕВЕР могут использовать личный кабинет, персональную товарную матрицу и индивидуальные цены для регулярных заказов.",
      },
    ],
  }),
});

const baseHtml =
  '<!doctype html><html lang="ru"><head><title>Clover</title><meta name="description" content="base" /><meta name="robots" content="index,follow" /><link rel="canonical" href="https://example.invalid/" /><link rel="alternate" hreflang="ru" href="https://example.invalid/ru" /></head><body><div id="root"></div></body></html>';
const enabledLanguages = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];
const records = listCategoryCommercialSeoRecords();
assert.equal(records.length, 3, "SEO-004 must contain exactly three records");
assert.deepEqual([...SEO004_TARGET_CATEGORIES], Object.keys(EXPECTED));

const titles = new Set();
const descriptions = new Set();
const headings = new Set();
for (const record of records) {
  const expected = EXPECTED[record.category];
  assert.ok(expected, `unexpected SEO-004 category ${record.category}`);
  assert.deepEqual(
    {
      metaTitle: record.metaTitle,
      metaDescription: record.metaDescription,
      h1: record.h1,
      lead: record.lead,
      body: record.body,
      benefits: [...record.benefits],
      popularSubcategories: [...record.popularSubcategories],
      faq: record.faq.map(({ q, a }) => ({ q, a })),
    },
    expected,
    `approved content drift for ${record.category}`
  );
  assert.equal(record.benefits.length, 3);
  assert.equal(record.faq.length, 3);
  assert.equal(titles.has(record.metaTitle), false, "titles must be unique");
  assert.equal(descriptions.has(record.metaDescription), false, "descriptions must be unique");
  assert.equal(headings.has(record.h1), false, "H1 values must be unique");
  titles.add(record.metaTitle);
  descriptions.add(record.metaDescription);
  headings.add(record.h1);
}

for (const category of SEO004_TARGET_CATEGORIES) {
  assert.ok(resolveCategoryCommercialSeo({ category, locale: "ru" }));
  assert.equal(
    resolveCategoryCommercialSeo({ category, subcategory: "Стаканы", locale: "ru" }),
    null,
    "subcategory guard"
  );
  assert.equal(
    resolveCategoryCommercialSeo({ category, facet: "facet", locale: "ru" }),
    null,
    "facet guard"
  );
  for (const locale of ["en", "uz", "ky", "tg", "zh", "ar"]) {
    assert.equal(resolveCategoryCommercialSeo({ category, locale }), null);
  }
}
assert.equal(resolveCategoryCommercialSeo({ category: "", locale: "ru" }), null);
assert.equal(
  resolveCategoryCommercialSeo({ category: "Химия, чистящие средства", locale: "ru" }),
  null
);

const staleRegistryOnly = Object.freeze({
  category: "Одноразовая посуда",
  subcategory: "Тарелки, миски",
});
const subcategories = records.flatMap((record) =>
  record.popularSubcategories
    .filter(
      (subcategory) =>
        record.category !== staleRegistryOnly.category ||
        subcategory !== staleRegistryOnly.subcategory
    )
    .map((subcategory) => ({ category: record.category, subcategory }))
);
const genericCategory = "Химия, чистящие средства";
const genericSubcategory = "Для окон";
const product = {
  id: "seo-004-product",
  code: "SEO-004-PRODUCT",
  name: "Generic product",
  category: genericCategory,
  subcategory: genericSubcategory,
  storefrontDetails: { description: "Generic product description" },
};
const descriptors = buildIndexableRouteDescriptors({
  staticPaths: ["/", "/catalog"],
  categories: [...SEO004_TARGET_CATEGORIES, genericCategory],
  subcategories: [
    ...subcategories,
    { category: genericCategory, subcategory: genericSubcategory },
  ],
  publicProducts: [product],
});
const manifest = buildLocalizedRouteManifest({
  descriptors,
  enabledLanguages,
  products: [product],
});

const routePath = (route, locale = "ru") =>
  publicPathForLocale(sitemapStorefrontPath(route), locale);
const occurrenceCount = (text, pattern) => (text.match(pattern) || []).length;
const renderRequest = (rawUrl) => {
  const resolution = resolvePublicRouteRequest(manifest, rawUrl);
  assert.equal(resolution.action, "render", `must render ${rawUrl}`);
  return {
    resolution,
    html: renderPublicRouteHtml(baseHtml, resolution.record, {
      indexable: resolution.indexable,
    }),
  };
};

for (const record of records) {
  const route = { name: "catalog", category: record.category };
  const pathname = routePath(route);
  const manifestRecord = manifest.routes[pathname];
  assert.ok(manifestRecord, `manifest route for ${record.category}`);
  assert.equal(manifestRecord.title, record.metaTitle);
  assert.equal(manifestRecord.description, record.metaDescription);
  assert.equal(manifestRecord.heading, record.category);
  assert.equal(manifestRecord.canonical, publicAbsoluteUrl(sitemapStorefrontPath(route), "ru"));
  assert.deepEqual(JSON.parse(JSON.stringify(manifestRecord.commercialSeo)), {
    category: record.category,
    h1: record.h1,
    lead: record.lead,
    body: record.body,
    benefits: [...record.benefits],
    popularSubcategories: [...record.popularSubcategories],
    faq: record.faq.map(({ q, a }) => ({ q, a })),
  });

  const browserMeta = storefrontRouteDocumentMeta(route, null, {
    locale: "ru",
    infrastructureEnabled: true,
    enabledLanguages,
  });
  assert.equal(browserMeta.title, manifestRecord.title, "browser/manifest title parity");
  assert.equal(
    browserMeta.description,
    manifestRecord.description,
    "browser/manifest description parity"
  );
  assert.equal(browserMeta.path, pathname, "browser/manifest path parity");

  const { resolution, html } = renderRequest(pathname);
  assert.equal(resolution.indexable, true);
  assert.ok(html.includes(`<title>${record.metaTitle}</title>`));
  assert.ok(html.includes(`<h1>${record.category}</h1>`));
  assert.equal(html.includes(record.lead), false, "commercial lead stays out of visible HTML");
  assert.equal(html.includes(record.body), false, "commercial body stays out of visible HTML");
  for (const benefit of record.benefits) assert.equal(html.includes(benefit), false);
  for (const item of record.faq) {
    assert.equal(html.includes(`<summary>${item.q}</summary>`), false);
    assert.equal(html.includes(`<p>${item.a}</p>`), false);
  }
  assert.ok(html.includes(`content="index,follow"`));
  assert.ok(html.includes(`<link rel="canonical" href="${manifestRecord.canonical}" />`));
  assert.equal(occurrenceCount(html, /<link rel="canonical"/g), 1);
  assert.equal(occurrenceCount(html, /<meta name="robots"/g), 1);
  assert.equal(
    occurrenceCount(html, /<link rel="alternate"/g),
    manifestRecord.alternates.length
  );
  for (const alternate of manifestRecord.alternates) {
    assert.ok(
      html.includes(
        `<link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`
      ),
      `missing alternate ${alternate.hreflang}`
    );
  }
  assert.equal(occurrenceCount(html, /data-seo-commercial-category=/g), 0);

  const availablePopular = record.popularSubcategories.filter((name) =>
    manifestRecord.crawlLinks.some((link) => link.label === name)
  );
  let previousIndex = -1;
  for (const name of availablePopular) {
    const link = manifestRecord.crawlLinks.find((candidate) => candidate.label === name);
    const marker = `<a href="${link.href}">${name}</a>`;
    const index = html.indexOf(marker);
    assert.ok(index > previousIndex, `popular links keep approved order: ${name}`);
    previousIndex = index;
  }
  const secondHtml = renderPublicRouteHtml(baseHtml, manifestRecord, { indexable: true });
  assert.equal(secondHtml, html, "raw render must be deterministic");
}

const staleHref = routePath({
  name: "catalog",
  category: staleRegistryOnly.category,
  subcategory: staleRegistryOnly.subcategory,
});
const staleParentHtml = renderRequest(
  routePath({ name: "catalog", category: staleRegistryOnly.category })
).html;
assert.equal(
  staleParentHtml.includes(`href="${staleHref}"`),
  false,
  "registry-only popular item must not become a crawlable link"
);

const commercialPath = routePath({
  name: "catalog",
  category: SEO004_TARGET_CATEGORIES[0],
});
for (const search of ["?q=стаканы", "?sort=price"]) {
  const { resolution, html } = renderRequest(`${commercialPath}${search}`);
  assert.equal(resolution.indexable, false);
  assert.ok(html.includes('content="noindex,follow"'));
  assert.doesNotMatch(html, /data-seo-snapshot=/);
  assert.doesNotMatch(html, /<link rel="alternate"/);
}
{
  const { resolution, html } = renderRequest(`${commercialPath}?utm_source=test`);
  assert.equal(resolution.indexable, true);
  assert.doesNotMatch(html, /data-seo-commercial-category=/);
}

const firstSubcategory = subcategories[0];
const subcategoryPath = routePath({ name: "catalog", ...firstSubcategory });
const subcategoryRecord = manifest.routes[subcategoryPath];
assert.equal(subcategoryRecord.commercialSeo, undefined);
assert.equal(
  subcategoryRecord.heading,
  `${firstSubcategory.category} — ${firstSubcategory.subcategory}`
);
assert.equal(
  subcategoryRecord.title,
  `${firstSubcategory.category} — ${firstSubcategory.subcategory} | ${STOREFRONT_SITE_NAME}`
);
assert.doesNotMatch(renderRequest(subcategoryPath).html, /data-seo-commercial-category=/);

const facetPath = `${subcategoryPath}/${encodeURIComponent("цвет")}`;
{
  const { resolution, html } = renderRequest(facetPath);
  assert.equal(resolution.indexable, false);
  assert.match(html, /content="noindex,follow"/);
  assert.doesNotMatch(html, /data-seo-snapshot=/);
  assert.doesNotMatch(html, /<link rel="alternate"/);
}

for (const locale of enabledLanguages.filter((value) => value !== "ru")) {
  const localizedPath = routePath(
    { name: "catalog", category: SEO004_TARGET_CATEGORIES[0] },
    locale
  );
  const localizedRecord = manifest.routes[localizedPath];
  assert.equal(localizedRecord.commercialSeo, undefined);
  assert.equal(
    localizedRecord.title,
    `${SEO004_TARGET_CATEGORIES[0]} | ${STOREFRONT_SITE_NAME}`
  );
  assert.doesNotMatch(renderRequest(localizedPath).html, /data-seo-snapshot=/);
}

const genericCategoryPath = routePath({ name: "catalog", category: genericCategory });
const genericCategoryRecord = manifest.routes[genericCategoryPath];
assert.equal(genericCategoryRecord.commercialSeo, undefined);
assert.equal(genericCategoryRecord.heading, genericCategory);
assert.match(renderRequest(genericCategoryPath).html, /data-seo-snapshot="ru"/);

const productPath = routePath({ name: "product", code: product.code });
const productRecord = manifest.routes[productPath];
assert.equal(productRecord.commercialSeo, undefined);
assert.equal(productRecord.heading, product.name);
assert.ok(renderRequest(productPath).html.includes(product.storefrontDetails.description));

const dangerous = `<script>&"'`;
const escapedHtml = renderPublicRouteHtml(
  baseHtml,
  {
    ...manifest.routes[commercialPath],
    heading: dangerous,
    commercialSeo: {
      category: dangerous,
      h1: dangerous,
      lead: dangerous,
      body: dangerous,
      benefits: [dangerous],
      popularSubcategories: [dangerous],
      faq: [{ q: dangerous, a: dangerous }],
    },
    crawlLinks: [{ href: `/ru/${dangerous}`, label: dangerous }],
  },
  { indexable: true }
);
assert.equal(escapedHtml.includes(dangerous), false, "commercial snapshot values must be escaped");
assert.match(escapedHtml, /&lt;script&gt;&amp;&quot;&#39;/);

console.log(
  JSON.stringify({
    SEO004_COMMERCIAL_CATEGORIES: "PASS",
    records: records.length,
    staleRegistryOnlyExcluded: staleRegistryOnly,
  })
);
