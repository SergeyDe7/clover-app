/**
 * SEO-004 — priority B2B category commercial SEO verifier.
 * Behaviour + exact approved content; taxonomy child links via getGroupChildren.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-seo004-"));
process.on("exit", () => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

globalThis.window = {
  location: {
    hostname: "clover-spb.ru",
    origin: "https://clover-spb.ru",
    pathname: "/",
  },
};

const loaderPath = path.join(tempDir, "vite-env-loader.mjs");
writeFileSync(
  loaderPath,
  `
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.format === "module") {
    let source = result.source;
    if (Buffer.isBuffer(source)) source = source.toString("utf8");
    if (typeof source === "string" && source.includes("import.meta.env")) {
      source = source.replaceAll(
        "import.meta.env",
        "({VITE_PUBLIC_BASE_URL:\\"\\",VITE_APP_PUBLIC_URL:\\"\\",VITE_CABINET_PATH:\\"/lk\\",VITE_CABINET_URL:\\"\\",VITE_STORE_HOSTS:\\"clover-spb.ru\\"})"
      );
      return { format: "module", shortCircuit: true, source };
    }
  }
  return result;
}
`
);
register(pathToFileURL(loaderPath).href);

const {
  resolveCategoryCommercialSeo,
  listCategoryCommercialSeoRecords,
  SEO004_TARGET_CATEGORIES,
} = await import(
  pathToFileURL(
    path.join(projectRoot, "src/screens/storefront/categoryCommercialSeo.js")
  ).href
);

const { getGroupChildren } = await import(
  pathToFileURL(
    path.join(projectRoot, "src/screens/storefront/productGroups.js")
  ).href
);

const { storefrontRouteDocumentMeta, STOREFRONT_SITE_NAME } = await import(
  pathToFileURL(path.join(projectRoot, "src/screens/storefront/seo.js")).href
);

const { storefrontHref } = await import(
  pathToFileURL(path.join(projectRoot, "src/screens/storefront/mode.js")).href
);

const { formatSeoTemplate, getSeoCanonicalField } = await import(
  pathToFileURL(path.join(projectRoot, "src/shared/i18n/seoCatalog.js")).href
);

const APPROVED = Object.freeze({
  "Одноразовая посуда": Object.freeze({
    metaTitle: "Одноразовая посуда оптом в Санкт-Петербурге | КЛЕВЕР",
    metaDescription:
      "Одноразовая посуда оптом для кафе, ресторанов, кофеен, столовых и доставки. Стаканы, контейнеры, ланч-боксы и расходники. КЛЕВЕР, Санкт-Петербург.",
    h1: "Одноразовая посуда оптом в Санкт-Петербурге",
    lead:
      "Одноразовая посуда для кафе, ресторанов, кофеен, столовых и доставки в Санкт-Петербурге. В каталоге — стаканы, контейнеры, ланч-боксы, соусники, тарелки и миски, столовые приборы и другие расходные позиции.",
    body:
      "КЛЕВЕР помогает компаниям организовать регулярные закупки одноразовой посуды и сопутствующих расходных материалов. Для постоянных клиентов личный кабинет объединяет персональную товарную матрицу и индивидуальные цены.",
    benefits: Object.freeze([
      "Основные расходные позиции для HoReCa",
      "Персональная товарная матрица в личном кабинете",
      "Индивидуальные цены для постоянного клиента",
    ]),
    popularSubcategories: Object.freeze([
      "Стаканы",
      "Контейнеры",
      "Ланч-боксы",
      "Соусники",
      "Столовые приборы",
      "Тарелки, миски",
    ]),
    faq: Object.freeze([
      Object.freeze({
        q: "Какая одноразовая посуда есть в каталоге?",
        a: "В разделе представлены стаканы, контейнеры, ланч-боксы, соусники, тарелки и миски, столовые приборы и другие расходные позиции.",
      }),
      Object.freeze({
        q: "Для кого подходит ассортимент одноразовой посуды?",
        a: "Раздел рассчитан на регулярные закупки кафе, ресторанов, кофеен, столовых, служб доставки и других организаций.",
      }),
      Object.freeze({
        q: "Как упростить регулярные заказы?",
        a: "Постоянные клиенты КЛЕВЕР могут работать через личный кабинет: использовать персональную товарную матрицу и индивидуальные цены, чтобы быстрее собирать повторные заказы.",
      }),
    ]),
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
    benefits: Object.freeze([
      "Форматы пакетов для разных задач бизнеса",
      "Персональная товарная матрица в личном кабинете",
      "Индивидуальные цены для постоянного клиента",
    ]),
    popularSubcategories: Object.freeze([
      "Пакеты-майки",
      "Пакеты фасовочные",
      "Пакеты вакуумные",
      "Бумажные пакеты с ручкой",
      "Бумажные пакеты без ручки",
    ]),
    faq: Object.freeze([
      Object.freeze({
        q: "Какие пакеты представлены в каталоге?",
        a: "В разделе есть пакеты-майки, фасовочные и вакуумные пакеты, а также бумажные пакеты с ручками и без ручек.",
      }),
      Object.freeze({
        q: "Можно ли подобрать пакеты под разные задачи бизнеса?",
        a: "Да. В каталоге собраны несколько основных форматов пакетов для торговли, доставки, общественного питания и других хозяйственных задач.",
      }),
      Object.freeze({
        q: "Как заказывать пакеты регулярно?",
        a: "Постоянные клиенты КЛЕВЕР могут использовать личный кабинет, персональную товарную матрицу и индивидуальные цены для повторных закупок.",
      }),
    ]),
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
    benefits: Object.freeze([
      "Расходники для уборки и хозяйственных задач",
      "Персональная товарная матрица в личном кабинете",
      "Индивидуальные цены для постоянного клиента",
    ]),
    popularSubcategories: Object.freeze([
      "Мешки для мусора",
      "Перчатки",
      "Тряпки, мопы, полотенца",
      "Швабры, щетки",
      "Губки для посуды",
      "Фольга, пленка, пергамент",
    ]),
    faq: Object.freeze([
      Object.freeze({
        q: "Какие хозяйственные товары есть в разделе?",
        a: "В разделе представлены перчатки, мешки для мусора, тряпки и мопы, губки, швабры и щетки, фольга, пленка, пергамент и другие хозяйственные расходники.",
      }),
      Object.freeze({
        q: "Подходит ли ассортимент для организаций?",
        a: "В разделе есть позиции для хозяйственных задач кафе, ресторанов, офисов, клининга и других организаций.",
      }),
      Object.freeze({
        q: "Как организовать повторные закупки хозтоваров?",
        a: "Постоянные клиенты КЛЕВЕР могут использовать личный кабинет, персональную товарную матрицу и индивидуальные цены для регулярных заказов.",
      }),
    ]),
  }),
});

const records = listCategoryCommercialSeoRecords();
assert.equal(records.length, 3, "exactly 3 SEO-004 category records");
assert.deepEqual(
  [...SEO004_TARGET_CATEGORIES].sort(),
  Object.keys(APPROVED).sort(),
  "target category identities"
);

const titles = new Set();
const descriptions = new Set();
const h1s = new Set();

for (const category of SEO004_TARGET_CATEGORIES) {
  const expected = APPROVED[category];
  const record = records.find((row) => row.category === category);
  assert.ok(record, `missing record for ${category}`);
  assert.equal(record.metaTitle, expected.metaTitle);
  assert.equal(record.metaDescription, expected.metaDescription);
  assert.equal(record.h1, expected.h1);
  assert.equal(record.lead, expected.lead);
  assert.equal(record.body, expected.body);
  assert.equal(record.benefits.length, 3);
  assert.deepEqual([...record.benefits], [...expected.benefits]);
  assert.equal(record.faq.length, 3);
  assert.deepEqual(
    record.faq.map((item) => ({ q: item.q, a: item.a })),
    expected.faq.map((item) => ({ q: item.q, a: item.a }))
  );
  assert.deepEqual(
    [...record.popularSubcategories],
    [...expected.popularSubcategories]
  );

  for (const item of record.faq) {
    assert.ok(String(item.q || "").trim(), `empty FAQ q in ${category}`);
    assert.ok(String(item.a || "").trim(), `empty FAQ a in ${category}`);
  }
  const qs = record.faq.map((item) => item.q);
  assert.equal(new Set(qs).size, qs.length, `FAQ questions unique in ${category}`);

  assert.equal(titles.has(record.metaTitle), false, "titles unique");
  titles.add(record.metaTitle);
  assert.equal(descriptions.has(record.metaDescription), false, "descriptions unique");
  descriptions.add(record.metaDescription);
  assert.equal(h1s.has(record.h1), false, "h1 unique");
  h1s.add(record.h1);

  // Taxonomy links
  const children = new Set(getGroupChildren(category).map((c) => c.name));
  assert.ok(children.size > 0, `registry children for ${category}`);
  for (const sub of record.popularSubcategories) {
    assert.ok(
      children.has(sub),
      `${category}: popular subcategory missing in registry: ${sub}`
    );
  }

  // Route visibility
  assert.ok(
    resolveCategoryCommercialSeo({
      category,
      subcategory: "",
      facet: "",
      locale: "ru",
    }),
    `resolve RU top-level ${category}`
  );
  assert.equal(
    resolveCategoryCommercialSeo({
      category,
      subcategory: record.popularSubcategories[0],
      facet: "",
      locale: "ru",
    }),
    null,
    `subcategory must be null for ${category}`
  );
  assert.equal(
    resolveCategoryCommercialSeo({
      category,
      subcategory: "",
      facet: "x",
      locale: "ru",
    }),
    null,
    `facet must be null for ${category}`
  );
  for (const locale of ["en", "uz", "ky", "tg", "zh", "zh-CN", "ar"]) {
    assert.equal(
      resolveCategoryCommercialSeo({
        category,
        subcategory: "",
        facet: "",
        locale,
      }),
      null,
      `locale ${locale} must be null for ${category}`
    );
  }
}

assert.equal(
  resolveCategoryCommercialSeo({
    category: "",
    subcategory: "",
    facet: "",
    locale: "ru",
  }),
  null,
  "catalog root"
);
assert.equal(
  resolveCategoryCommercialSeo({
    category: "Химия, чистящие средства",
    subcategory: "",
    facet: "",
    locale: "ru",
  }),
  null,
  "non-target category"
);

// META via storefrontRouteDocumentMeta (locale option)
for (const category of SEO004_TARGET_CATEGORIES) {
  const expected = APPROVED[category];
  const route = { name: "catalog", category };
  const meta = storefrontRouteDocumentMeta(route, null, { locale: "ru" });
  assert.equal(meta.title, expected.metaTitle, `${category} meta title`);
  assert.equal(
    meta.description,
    expected.metaDescription,
    `${category} meta description`
  );
  assert.equal(meta.path, storefrontHref(route), `${category} path`);
}

function genericCatalogMeta(route) {
  const parts = [route.category, route.subcategory, route.facet].filter(Boolean);
  const label = parts.length ? parts.join(" — ") : "Каталог";
  return {
    title: `${label} | ${STOREFRONT_SITE_NAME}`,
    description: formatSeoTemplate(
      getSeoCanonicalField("catalog", "descriptionTemplate"),
      { label }
    ),
    path: storefrontHref(route),
  };
}

const fallbacks = [
  { name: "catalog" },
  {
    name: "catalog",
    category: "Одноразовая посуда",
    subcategory: "Стаканы",
  },
  {
    name: "catalog",
    category: "Одноразовая посуда",
    subcategory: "Стаканы",
    facet: "whatever",
  },
  { name: "catalog", category: "Химия, чистящие средства" },
];

for (const route of fallbacks) {
  const expected = genericCatalogMeta(route);
  const actual = storefrontRouteDocumentMeta(route, null, { locale: "ru" });
  assert.equal(actual.title, expected.title, `fallback title ${JSON.stringify(route)}`);
  assert.equal(
    actual.description,
    expected.description,
    `fallback description ${JSON.stringify(route)}`
  );
  assert.equal(actual.path, expected.path);
}

// Non-RU must not get SEO-004 meta even for target category
{
  const route = { name: "catalog", category: "Одноразовая посуда" };
  const expected = genericCatalogMeta(route);
  const actual = storefrontRouteDocumentMeta(route, null, { locale: "en" });
  assert.equal(actual.title, expected.title, "en locale generic title");
  assert.equal(actual.description, expected.description, "en locale generic description");
}

// Back-compat: 2-arg call still works (defaults locale ru → commercial for target)
{
  const route = { name: "catalog", category: "Хозяйственные товары" };
  const meta = storefrontRouteDocumentMeta(route, null);
  assert.equal(meta.title, APPROVED["Хозяйственные товары"].metaTitle);
}

console.log(JSON.stringify({ SEO004_COMMERCIAL_CATEGORIES: "PASS" }));
