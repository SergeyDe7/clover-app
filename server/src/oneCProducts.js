const ONE_C_PRODUCT_FIELDS = [
  "oneCId",
  "oneCCode",
  "oneCName",
  "oneCLinkMode",
  "oneCLinkedAt",
  "oneCMatchCode",
  "oneCMatchName",
  "oneCSearchQuery",
  "oneCSearchRequestedAt",
];

const STOP_WORDS = new Set([
  "для",
  "и",
  "в",
  "во",
  "на",
  "из",
  "с",
  "со",
  "по",
  "шт",
  "штук",
  "штука",
  "штуки",
  "уп",
  "упак",
  "упаковка",
  "упаковки",
  "пачка",
  "пачки",
  "х",
]);

function cleanText(value) {
  return String(value ?? "").trim();
}

/** Внутренний артикул Clover вида CL-0001 — не показывать как артикул товара. */
export function isInternalCloverArticle(value) {
  return /^cl-\d+$/i.test(cleanText(value));
}

/**
 * Артикул товара = код 1С. Внутренние CL-… не считаются артикулом.
 */
export function resolveOneCProductArticle(product = {}) {
  const oneC = cleanText(product.oneCCode || product.oneCMatchCode);
  if (oneC) return oneC;
  const code = cleanText(product.code);
  if (code && !isInternalCloverArticle(code)) return code;
  return "";
}

/**
 * Проставляет product.code из кода 1С; снимает CL-… у связанных и несвязанных.
 */
export function applyOneCArticles(products) {
  const source = Array.isArray(products) ? products : [];
  let changed = 0;
  const next = source.map((product) => {
    const oneCCode = cleanText(product?.oneCCode || product?.oneCMatchCode);
    const currentCode = cleanText(product?.code);
    const linked = Boolean(cleanText(product?.oneCId) || oneCCode);

    if (linked) {
      if (currentCode === oneCCode && cleanText(product?.oneCCode) === oneCCode) {
        return product;
      }
      changed += 1;
      return {
        ...product,
        code: oneCCode,
        oneCCode: oneCCode || cleanText(product?.oneCCode),
        ...(oneCCode && !cleanText(product?.oneCMatchCode)
          ? { oneCMatchCode: oneCCode }
          : {}),
      };
    }

    if (isInternalCloverArticle(currentCode)) {
      changed += 1;
      return { ...product, code: "" };
    }
    return product;
  });
  return { products: next, changed };
}

function firstNumeric(...values) {
  for (const value of values) {
    if (value === "" || value === null || value === undefined) continue;
    const numeric = Number(String(value).replace(",", "."));
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

export function normalizeOneCProduct(item = {}) {
  const prices = item.prices && typeof item.prices === "object" ? item.prices : {};
  const purchasePrice = firstNumeric(
    item.purchasePrice,
    item.purchase_price,
    item.purchaseCost,
    item.costPrice,
    item.cost,
    item.pricePurchase,
    item.purchase,
    item["ЗакупочнаяЦена"],
    item["ЦенаЗакупки"],
    prices.purchase,
    prices.cost
  );

  const salePricesByType =
    item.salePricesByType && typeof item.salePricesByType === "object"
      ? item.salePricesByType
      : {};

  return {
    id: cleanText(item.id ?? item.oneCId ?? item.ref),
    code: cleanText(item.code ?? item.oneCCode),
    name: cleanText(item.name ?? item.presentation ?? item.description),
    purchasePrice,
    purchasePricePiece: firstNumeric(item.purchasePricePiece, item.costPricePiece, prices.piece),
    purchasePricePack: firstNumeric(item.purchasePricePack, item.costPricePack, prices.pack),
    purchasePriceBundle: firstNumeric(item.purchasePriceBundle, item.costPriceBundle, prices.bundle),
    purchasePriceBox: firstNumeric(item.purchasePriceBox, item.costPriceBox, prices.box),
    purchasePricePair: firstNumeric(item.purchasePricePair, item.costPricePair, prices.pair),
    purchasePriceRoll: firstNumeric(item.purchasePriceRoll, item.costPriceRoll, prices.roll),
    purchasePriceUnit: cleanText(item.purchasePriceUnit ?? item.costUnit ?? item.unit ?? "piece"),
    purchasePriceUpdatedAt: cleanText(
      item.purchasePriceUpdatedAt ?? item.priceUpdatedAt ?? item.updatedAt
    ),
    purchasePriceReceivedAt: cleanText(
      item.purchasePriceReceivedAt ?? item.priceReceivedAt
    ),
    purchasePriceSourceUpdatedAt: cleanText(
      item.purchasePriceSourceUpdatedAt ?? item.sourcePriceUpdatedAt
    ),
    purchasePriceSourceDatabase: cleanText(
      item.purchasePriceSourceDatabase ?? item.sourceDatabase ?? item.database
    ),
    salePricesByType,
    salePriceUpdatedAt: cleanText(item.salePriceUpdatedAt),
    salePriceReceivedAt: cleanText(item.salePriceReceivedAt),
  };
}

export function normalizeOneCProducts(items) {
  const unique = new Map();

  for (const rawItem of Array.isArray(items) ? items : []) {
    const item = normalizeOneCProduct(rawItem);
    if (!item.id || !item.name) continue;
    unique.set(item.id, item);
  }

  return [...unique.values()];
}

function hasSalePricesByType(item) {
  const byType =
    item?.salePricesByType && typeof item.salePricesByType === "object"
      ? item.salePricesByType
      : null;
  return Boolean(byType && Object.keys(byType).length);
}

/**
 * Выгрузка products-preview не содержит salePricesByType —
 * не затираем уже принятые продажные цены по видам.
 */
export function preserveOneCProductPricingFields(previousItems, nextItems) {
  const previousById = new Map(
    (Array.isArray(previousItems) ? previousItems : [])
      .filter((item) => cleanText(item?.id))
      .map((item) => [String(item.id), item])
  );

  return (Array.isArray(nextItems) ? nextItems : []).map((item) => {
    const previous = previousById.get(String(item?.id || ""));
    if (!previous) return item;

    const next = { ...item };
    if (!hasSalePricesByType(next) && hasSalePricesByType(previous)) {
      next.salePricesByType = previous.salePricesByType;
      next.salePriceUpdatedAt =
        cleanText(next.salePriceUpdatedAt) || cleanText(previous.salePriceUpdatedAt);
      next.salePriceReceivedAt =
        cleanText(next.salePriceReceivedAt) || cleanText(previous.salePriceReceivedAt);
    }

    // Закупка из preview может быть пустой — не обнуляем ранее принятую.
    if (
      (next.purchasePrice === null || next.purchasePrice === undefined) &&
      previous.purchasePrice !== null &&
      previous.purchasePrice !== undefined
    ) {
      next.purchasePrice = previous.purchasePrice;
      next.purchasePricePiece = previous.purchasePricePiece ?? next.purchasePricePiece;
      next.purchasePricePack = previous.purchasePricePack ?? next.purchasePricePack;
      next.purchasePriceBundle = previous.purchasePriceBundle ?? next.purchasePriceBundle;
      next.purchasePriceBox = previous.purchasePriceBox ?? next.purchasePriceBox;
      next.purchasePricePair = previous.purchasePricePair ?? next.purchasePricePair;
      next.purchasePriceRoll = previous.purchasePriceRoll ?? next.purchasePriceRoll;
      next.purchasePriceUnit = previous.purchasePriceUnit || next.purchasePriceUnit;
      next.purchasePriceUpdatedAt =
        previous.purchasePriceUpdatedAt || next.purchasePriceUpdatedAt;
      next.purchasePriceReceivedAt =
        previous.purchasePriceReceivedAt || next.purchasePriceReceivedAt;
      next.purchasePriceSourceDatabase =
        previous.purchasePriceSourceDatabase || next.purchasePriceSourceDatabase;
    }

    return next;
  });
}

export function normalizeProductNameForMatch(value) {
  return cleanText(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[x×*]/g, "х")
    .replace(/[^a-zа-я0-9]+/giu, "");
}

function normalizeWordToken(value) {
  const synonyms = {
    мешок: "пакет",
    мешки: "пакет",
    мешков: "пакет",
    пульверизатор: "распылител",
    распылитель: "распылител",
    мусорный: "мусор",
    мусорные: "мусор",
    мусора: "мусор",
  };
  if (synonyms[value]) return synonyms[value];
  if (value.length <= 5) return value;
  return value
    .replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ов|ев|ей|ам|ям|ах|ях|ом|ем|ка|ки|ку|ке|ок|ек|а|я|ы|и|у|ю|е|о)$/u, "")
    .slice(0, 12);
}

function tokenList(value) {
  return cleanText(value)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[x×*]/g, " х ")
    .replace(/(литров|литра|литр)/giu, " л ")
    .replace(/(миллилитров|миллилитра|миллилитр)/giu, " мл ")
    .replace(/(микрон|микрона|микронов)/giu, " мкм ")
    .replace(/(?<=\d)(?=[a-zа-я])/giu, " ")
    .replace(/(?<=[a-zа-я])(?=\d)/giu, " ")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !STOP_WORDS.has(item))
    .map((item) => (/^\d+(?:[.,]\d+)?$/u.test(item) ? item : normalizeWordToken(item)))
    .filter(Boolean);
}

function numericTokens(value) {
  return tokenList(value).filter((item) => /^\d+(?:[.,]\d+)?$/u.test(item));
}

function wordTokens(value) {
  return tokenList(value).filter((item) => !/^\d+(?:[.,]\d+)?$/u.test(item));
}

function overlapRatio(source, target) {
  if (!source.length) return 1;
  const targetSet = new Set(target);
  return source.filter((item) => targetSet.has(item)).length / source.length;
}

function productCandidateScore(query, item) {
  const normalizedQuery = normalizeProductNameForMatch(query);
  const normalizedName = normalizeProductNameForMatch(item.name);

  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedQuery === normalizedName) return 1;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
    return 0.96;
  }

  const queryWords = wordTokens(query);
  const itemWords = wordTokens(item.name);
  const queryNumbers = numericTokens(query);
  const itemNumbers = numericTokens(item.name);
  const wordCoverage = overlapRatio(queryWords, itemWords);
  const numberCoverage = overlapRatio(queryNumbers, itemNumbers);

  if (queryNumbers.length >= 2 && numberCoverage < 0.6) return 0;
  if (queryWords.length >= 2 && wordCoverage < 0.45) return 0;

  return Math.min(0.95, wordCoverage * 0.62 + numberCoverage * 0.33 + 0.05);
}

function pushIndex(map, key, item) {
  if (!key) return;
  const bucket = map.get(key) || [];
  bucket.push(item);
  map.set(key, bucket);
}

function uniqueCandidate(candidates) {
  const unique = new Map();
  for (const item of candidates || []) {
    unique.set(item.id, item);
  }
  return unique.size === 1 ? [...unique.values()][0] : null;
}

function exactRelevantProductIds(products, oneCProducts) {
  const sourceProducts = Array.isArray(products) ? products : [];
  const sourceOneC = normalizeOneCProducts(oneCProducts);
  const requiredIds = new Set();
  const requiredCodes = new Set();
  const requiredNames = new Set();

  sourceProducts.forEach((product) => {
    const oneCId = cleanText(product.oneCId);
    if (oneCId) requiredIds.add(oneCId);

    const codeCandidates = [
      product.oneCMatchCode,
      product.oneCCode,
      /^(?!cl-)/i.test(cleanText(product.code)) ? product.code : "",
    ];
    codeCandidates.forEach((value) => {
      const key = cleanText(value).toLocaleLowerCase("ru-RU");
      if (key) requiredCodes.add(key);
    });

    const nameCandidates = [product.oneCMatchName, product.oneCName, product.name];
    nameCandidates.forEach((value) => {
      const key = normalizeProductNameForMatch(value);
      if (key) requiredNames.add(key);
    });
  });

  return new Set(
    sourceOneC
      .filter((item) => {
        if (requiredIds.has(item.id)) return true;
        if (requiredCodes.has(cleanText(item.code).toLocaleLowerCase("ru-RU"))) return true;
        return requiredNames.has(normalizeProductNameForMatch(item.name));
      })
      .map((item) => item.id)
  );
}

export function buildOneCProductCandidates(
  products,
  oneCProducts,
  { maxPerProduct = 12, minimumScore = 0.52 } = {}
) {
  const sourceProducts = Array.isArray(products) ? products : [];
  const sourceOneC = normalizeOneCProducts(oneCProducts);
  const linkedIds = new Set(
    sourceProducts.map((product) => cleanText(product.oneCId)).filter(Boolean)
  );
  const result = {};

  for (const product of sourceProducts) {
    if (cleanText(product.oneCId)) continue;

    const explicitCode = cleanText(product.oneCMatchCode || product.oneCCode)
      .toLocaleLowerCase("ru-RU");
    const query = cleanText(
      product.oneCSearchQuery ||
        product.oneCMatchName ||
        product.oneCName ||
        product.name
    );

    const scored = [];
    for (const item of sourceOneC) {
      if (linkedIds.has(item.id)) continue;
      const itemCode = cleanText(item.code).toLocaleLowerCase("ru-RU");

      if (explicitCode && itemCode === explicitCode) {
        scored.push({ ...item, score: 1, reason: "code" });
        continue;
      }

      const score = productCandidateScore(query, item);
      if (score >= minimumScore) {
        scored.push({ ...item, score, reason: score >= 0.95 ? "name" : "similar" });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
    if (scored.length) {
      result[String(product.id)] = scored.slice(0, maxPerProduct);
    }
  }

  return result;
}

export function selectRelevantOneCProducts(products, oneCProducts, candidateMap = null) {
  const sourceOneC = normalizeOneCProducts(oneCProducts);
  const requiredIds = exactRelevantProductIds(products, sourceOneC);
  const candidates = candidateMap || buildOneCProductCandidates(products, sourceOneC);

  for (const items of Object.values(candidates || {})) {
    for (const item of Array.isArray(items) ? items : []) {
      if (item?.id) requiredIds.add(String(item.id));
    }
  }

  return sourceOneC.filter((item) => requiredIds.has(item.id));
}

export function autoLinkCloverProducts(products, oneCProducts, now = new Date().toISOString()) {
  const sourceProducts = Array.isArray(products) ? products : [];
  const sourceOneC = normalizeOneCProducts(oneCProducts);
  const byId = new Map(sourceOneC.map((item) => [item.id, item]));
  const byCode = new Map();
  const byName = new Map();

  sourceOneC.forEach((item) => {
    pushIndex(byCode, cleanText(item.code).toLocaleLowerCase("ru-RU"), item);
    pushIndex(byName, normalizeProductNameForMatch(item.name), item);
  });

  const report = {
    cloverTotal: sourceProducts.length,
    oneCTotal: sourceOneC.length,
    linked: 0,
    autoLinked: 0,
    preserved: 0,
    stale: 0,
    ambiguous: 0,
    unmatched: 0,
    newlyLinked: 0,
  };

  let changed = false;
  const usedOneCIds = new Set(
    sourceProducts
      .map((product) => cleanText(product.oneCId))
      .filter(Boolean)
  );

  const updatedProducts = sourceProducts.map((product) => {
    const existingId = cleanText(product.oneCId);

    if (existingId) {
      const catalogItem = byId.get(existingId);
      report.linked += 1;
      report.preserved += 1;

      if (!catalogItem) {
        report.stale += 1;
        return product;
      }

      const enriched = {
        ...product,
        oneCId: catalogItem.id,
        oneCCode: catalogItem.code,
        oneCName: catalogItem.name,
        oneCMatchCode: product.oneCMatchCode || catalogItem.code,
        oneCMatchName: product.oneCMatchName || catalogItem.name,
        oneCSearchQuery: "",
        oneCLinkMode: product.oneCLinkMode || "manual",
        oneCLinkedAt: product.oneCLinkedAt || now,
        // Артикул только из 1С (не CL-…).
        code: catalogItem.code || "",
      };

      if (ONE_C_PRODUCT_FIELDS.some((field) => enriched[field] !== product[field])) {
        changed = true;
      }

      return enriched;
    }

    const matchStages = [];
    const explicitCode = cleanText(product.oneCMatchCode || product.oneCCode)
      .toLocaleLowerCase("ru-RU");
    const internalCode = cleanText(product.code);
    const safeInternalCode = /^(?!cl-)/i.test(internalCode)
      ? internalCode.toLocaleLowerCase("ru-RU")
      : "";
    const explicitName = normalizeProductNameForMatch(
      product.oneCMatchName || product.oneCName
    );
    const displayName = normalizeProductNameForMatch(product.name);

    if (explicitCode) matchStages.push(byCode.get(explicitCode) || []);
    if (safeInternalCode && safeInternalCode !== explicitCode) {
      matchStages.push(byCode.get(safeInternalCode) || []);
    }
    if (explicitName) matchStages.push(byName.get(explicitName) || []);
    if (displayName && displayName !== explicitName) {
      matchStages.push(byName.get(displayName) || []);
    }

    let candidate = null;
    let ambiguous = false;
    for (const stage of matchStages) {
      if (!stage.length) continue;
      candidate = uniqueCandidate(stage);
      if (!candidate) ambiguous = true;
      break;
    }

    if (candidate && !usedOneCIds.has(candidate.id)) {
      usedOneCIds.add(candidate.id);
      report.linked += 1;
      report.autoLinked += 1;
      report.newlyLinked += 1;
      changed = true;

      return {
        ...product,
        oneCId: candidate.id,
        oneCCode: candidate.code,
        oneCName: candidate.name,
        oneCMatchCode: product.oneCMatchCode || candidate.code,
        oneCMatchName: product.oneCMatchName || candidate.name,
        oneCSearchQuery: "",
        oneCLinkMode: "auto",
        oneCLinkedAt: now,
        code: candidate.code || "",
      };
    }

    if (ambiguous || (candidate && usedOneCIds.has(candidate.id))) {
      report.ambiguous += 1;
    } else {
      report.unmatched += 1;
    }

    return product;
  });

  return {
    products: updatedProducts,
    oneCProducts: sourceOneC,
    report,
    changed,
  };
}

export function linkCloverProduct(products, productId, rawOneCProduct, now = new Date().toISOString()) {
  const item = normalizeOneCProduct(rawOneCProduct);
  if (!item.id || !item.name) {
    throw new Error("Не удалось определить выбранную позицию 1С.");
  }

  const source = Array.isArray(products) ? products : [];
  const current = source.find((product) => String(product.id) === String(productId));
  if (!current) throw new Error("Товар Clover не найден.");

  const conflict = source.find(
    (product) =>
      String(product.id) !== String(productId) &&
      cleanText(product.oneCId) === item.id
  );
  if (conflict) {
    throw new Error(`Позиция 1С уже связана с товаром «${conflict.name}».`);
  }

  return source.map((product) =>
    String(product.id) === String(productId)
      ? {
          ...product,
          oneCId: item.id,
          oneCCode: item.code,
          oneCName: item.name,
          oneCMatchCode: item.code,
          oneCMatchName: item.name,
          oneCSearchQuery: "",
          oneCSearchRequestedAt: "",
          oneCLinkMode: "manual",
          oneCLinkedAt: now,
          code: item.code || "",
        }
      : product
  );
}

function nextCloverProductId(products) {
  return Math.max(0, ...(Array.isArray(products) ? products : []).map((item) => Number(item.id) || 0)) + 1;
}

/** Плейсхолдеры — не считаются «настоящей» категорией для обучения/копирования. */
export const PLACEHOLDER_PRODUCT_CATEGORIES = new Set(["Из 1С", "Новые товары", ""]);

const CATEGORY_KEYWORD_RULES = [
  {
    category: "Спецодежда, обувь и средства защиты",
    patterns: [/перчатк/u, /нитрил/u, /латекс/u, /винилов/u, /спецодежд/u, /\bсиз\b/u],
  },
  {
    category: "Пленка",
    patterns: [/пленк/u, /плёнк/u, /стрейч/u, /stretch/u, /пергамент/u, /вакуумн/u],
  },
  {
    category: "Пакеты и сумки",
    patterns: [/пакет/u, /мешк/u, /сумк/u],
  },
  {
    category: "Уборочный инвентарь и оборудование",
    patterns: [
      /салфетк/u,
      /швабр/u,
      /\bмоп\b/u,
      /щетк/u,
      /губк/u,
      /ведр/u,
      /пипидастр/u,
      /совк/u,
      /распылител/u,
      /пульверизатор/u,
      /тряпк/u,
      /полотер/u,
      /диспенсер/u,
    ],
  },
  {
    category: "Контейнеры",
    patterns: [/контейнер/u],
  },
  {
    category: "Лотки и подложки",
    patterns: [/лоток/u, /подложк/u],
  },
  {
    category: "Упаковочные материалы",
    patterns: [
      /банк[аиуы]/u,
      /крышк/u,
      /бутылк/u,
      /oneclick/u,
      /стаканчик/u,
      /коробк/u,
    ],
  },
  {
    category: "Одноразовая посуда",
    patterns: [/трубочк/u, /вилк/u, /ложк/u, /тарелк/u, /зубочист/u, /шпател/u, /стакан/u],
  },
  {
    category: "Принадлежности для касс и торговли",
    patterns: [/кассов/u, /лент.*кас/u],
  },
  {
    category: "Бумага офисная",
    patterns: [/\bа4\b/u, /бумаг.*офис/u, /офисн.*бумаг/u],
  },
  {
    category: "Канцелярские товары",
    patterns: [/лент/u, /бумаг/u, /ручк/u, /степлер/u, /ножниц/u],
  },
  {
    category: "Химия профессиональная",
    patterns: [/профессионал.*хим/u, /хим.*профессион/u],
  },
  {
    category: "Химия бытовая",
    patterns: [
      /белизна/u,
      /санокс/u,
      /хелп/u,
      /моющ/u,
      /чистящ/u,
      /дезинф/u,
      /средство для/u,
      /химия/u,
    ],
  },
  {
    category: "Гигиеническая продукция",
    patterns: [/полотн/u, /вафельн/u, /текстил/u, /полотенц/u, /тряпк[аи] для пола/u, /гигиен/u],
  },
  {
    category: "Оборудование для туалетных комнат",
    patterns: [/туалетн/u, /диспенсер.*бумаг/u, /мыльниц/u],
  },
  {
    category: "Посуда и столовые приборы",
    patterns: [/столов.*прибор/u, /посуд/u],
  },
  {
    category: "Кухонные принадлежности",
    patterns: [/кухон/u],
  },
  {
    category: "Барные аксессуары и товары для сервировки",
    patterns: [/барн/u, /сервировк/u],
  },
];

function isUsableCategory(category) {
  const value = cleanText(category);
  return Boolean(value) && !PLACEHOLDER_PRODUCT_CATEGORIES.has(value);
}

function inferCategoryByKeywords(name) {
  const text = cleanText(name).toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  if (!text) return "";

  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.category;
    }
  }
  return "";
}

/**
 * Определяет категорию Clover по названию: похожий товар в каталоге,
 * иначе ключевые слова, иначе «Новые товары» (не «Из 1С»).
 */
export function inferCloverProductCategory(
  name,
  products = [],
  { minimumScore = 0.52, fallback = "Новые товары" } = {}
) {
  const query = cleanText(name);
  if (!query) return fallback;

  let best = null;
  for (const product of Array.isArray(products) ? products : []) {
    if (!isUsableCategory(product?.category)) continue;
    const score = productCandidateScore(query, { name: product.name });
    if (score < minimumScore) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        cleanText(product.category).localeCompare(best.category, "ru") < 0)
    ) {
      best = { category: cleanText(product.category), score };
    }
  }
  if (best) return best.category;

  const byKeywords = inferCategoryByKeywords(query);
  if (byKeywords) return byKeywords;

  return fallback;
}

/** Переназначает категорию у товаров с плейсхолдером «Из 1С» / пустой. */
export function applyInferredCategories(products) {
  const source = Array.isArray(products) ? products : [];
  let changed = 0;
  const next = source.map((product) => {
    const current = cleanText(product?.category);
    if (current && current !== "Из 1С") return product;
    const inferred = inferCloverProductCategory(product?.name, source);
    if (inferred === current) return product;
    changed += 1;
    return { ...product, category: inferred };
  });
  return { products: next, changed };
}

/**
 * Нормализация имени для анти-дублей: регистр, ё→е, без хвоста фасовки.
 */
export function normalizeProductNameKey(name) {
  return cleanText(name)
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/g, "")
    .replace(/\s*\(\d+\s*(?:шт|штук)?\)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function productNameKeys(product = {}) {
  return [
    product.name,
    product.oneCName,
    product.oneCMatchName,
  ]
    .map((value) => normalizeProductNameKey(value))
    .filter(Boolean);
}

function productCodeKeys(product = {}) {
  return [product.oneCCode, product.oneCMatchCode, product.code]
    .map((value) => cleanText(value).toLowerCase())
    .filter((value) => value && !isInternalCloverArticle(value));
}

/**
 * Ищет уже существующий товар Clover для позиции 1С / Excel:
 * 1) oneCId, 2) код/артикул, 3) имя 1С или preferredName (Excel).
 * Так повторный импорт и матрица нового клиента не плодят дубли каталога.
 *
 * @param {object} [options]
 * @param {string} [options.preferredName] — имя из Excel / матрицы
 */
export function findExistingCloverProductForOneC(
  products,
  rawOneCProduct,
  options = {}
) {
  const item = normalizeOneCProduct(rawOneCProduct);
  const source = Array.isArray(products) ? products : [];
  const preferredName = cleanText(options?.preferredName);
  if (!item.id && !item.code && !item.name && !preferredName) return null;

  if (item.id) {
    const byOneCId = source.find(
      (product) => cleanText(product.oneCId) === item.id
    );
    if (byOneCId) return byOneCId;
  }

  const codeKeys = new Set(
    [item.code, cleanText(rawOneCProduct?.code)]
      .map((value) => cleanText(value).toLowerCase())
      .filter(Boolean)
  );
  if (codeKeys.size) {
    const byCode = source.find((product) =>
      productCodeKeys(product).some((code) => codeKeys.has(code))
    );
    if (byCode) return byCode;
  }

  const nameKeys = new Set(
    [preferredName, item.name, cleanText(rawOneCProduct?.name)]
      .map((value) => normalizeProductNameKey(value))
      .filter(Boolean)
  );
  if (nameKeys.size) {
    // Сначала свободные (без oneCId) или с тем же oneCId — безопаснее для линка.
    const ranked = source
      .map((product, index) => {
        const names = productNameKeys(product);
        if (!names.some((name) => nameKeys.has(name))) return null;
        const linked = cleanText(product.oneCId);
        const linkRank =
          !linked ? 0 : linked === item.id ? 0 : 2;
        return { product, index, linkRank };
      })
      .filter(Boolean)
      .sort((a, b) => a.linkRank - b.linkRank || a.index - b.index);
    if (ranked[0]) return ranked[0].product;
  }

  return null;
}

function withOneCLinkOnProduct(product, item, now) {
  const next = { ...product };
  if (!cleanText(next.oneCId)) next.oneCId = item.id;
  if (item.code) {
    next.oneCCode = item.code;
    next.code = item.code;
    if (!cleanText(next.oneCMatchCode)) next.oneCMatchCode = item.code;
  } else if (isInternalCloverArticle(next.code)) {
    next.code = "";
  }
  if (!cleanText(next.oneCName)) next.oneCName = item.name;
  if (!cleanText(next.oneCMatchName)) next.oneCMatchName = item.name;
  if (!cleanText(next.oneCLinkMode)) next.oneCLinkMode = "manual-from-catalog";
  if (!cleanText(next.oneCLinkedAt)) next.oneCLinkedAt = now;
  return next;
}

/**
 * Создаёт товар Clover из позиции каталога 1С или возвращает уже связанный.
 * Не дублирует oneCId / код / точное имя: при существующей связи переиспользует товар.
 * Категория: авто по похожим товарам / ключевым словам (не «Из 1С»).
 *
 * @param {object} [options]
 * @param {string} [options.preferredName] — имя как в матрице/Excel; для нового товара
 *   важнее названия 1С. Уже существующий товар Clover своё имя не меняет.
 * @param {boolean} [options.showOnStorefront] — сразу показать на витрине сайта.
 */
export function createOrReuseCloverProductFromOneC(
  products,
  rawOneCProduct,
  now = new Date().toISOString(),
  options = {}
) {
  const item = normalizeOneCProduct(rawOneCProduct);
  if (!item.id || !item.name) {
    throw new Error("Не удалось определить выбранную позицию 1С.");
  }

  const preferredName = cleanText(options?.preferredName);
  const wantStorefront = options?.showOnStorefront === true;

  const source = Array.isArray(products) ? products : [];
  const existing = findExistingCloverProductForOneC(source, item, {
    preferredName,
  });
  if (existing) {
    let product = withOneCLinkOnProduct(existing, item, now);
    // Имя Clover/матрицы не перетираем названием 1С.
    const current = cleanText(product.category);
    if (!current || current === "Из 1С") {
      const category = inferCloverProductCategory(product.name || item.name, source);
      if (category !== current) {
        product = { ...product, category };
      }
    }
    if (wantStorefront && product.showOnStorefront !== true) {
      product = { ...product, showOnStorefront: true };
    }
    return {
      products: source.map((entry) =>
        String(entry.id) === String(existing.id) ? product : entry
      ),
      product,
      created: false,
    };
  }

  const id = nextCloverProductId(source);
  const displayName = preferredName || item.name;
  const product = {
    id,
    category: inferCloverProductCategory(displayName, source),
    name: displayName,
    code: item.code || "",
    oneCId: item.id,
    oneCCode: item.code,
    oneCName: item.name,
    oneCMatchCode: item.code,
    oneCMatchName: item.name,
    oneCSearchQuery: "",
    oneCSearchRequestedAt: "",
    oneCLinkMode: "manual-from-catalog",
    oneCLinkedAt: now,
    active: true,
    showOnStorefront: wantStorefront,
    pieceSize: 1,
    pieceOrderMultiple: 1,
    packSize: 1,
    bundleSize: 1,
    boxSize: 1,
    pairSize: 1,
    rollSize: 1,
    pricePiece: 0,
    pricePack: 0,
    priceBundle: 0,
    priceBox: 0,
    pricePair: 0,
    priceRoll: 0,
    saleUnits: ["piece"],
  };

  return {
    products: [product, ...source],
    product,
    created: true,
  };
}

/** Добавляет productId в матрицу клиента; pending → selected. */
export function addProductIdToClientMatrix(clientLinks, clientId, productId) {
  const links = clientLinks && typeof clientLinks === "object" ? { ...clientLinks } : {};
  const key = String(clientId || "").trim();
  if (!key) throw new Error("Не указан клиент Clover.");

  const current = links[key] && typeof links[key] === "object" ? links[key] : {};
  const matrixProductIds = Array.isArray(current.matrixProductIds)
    ? current.matrixProductIds.map(String)
    : [];
  const id = String(productId);
  const alreadyInMatrix = matrixProductIds.includes(id);
  const nextIds = alreadyInMatrix ? matrixProductIds : [...matrixProductIds, id];

  let matrixMode = cleanText(current.matrixMode) || "pending";
  if (matrixMode === "pending" || !matrixMode) {
    matrixMode = "selected";
  }

  const nextLink = {
    ...current,
    matrixMode,
    matrixProductIds:
      matrixMode === "all"
        ? Array.isArray(current.matrixProductIds)
          ? current.matrixProductIds
          : []
        : nextIds.map((value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) && String(numeric) === String(value)
              ? numeric
              : value;
          }),
  };

  links[key] = nextLink;
  return {
    clientLinks: links,
    clientLink: nextLink,
    addedToMatrix: !alreadyInMatrix && (matrixMode === "selected" || matrixMode === "pending"),
    alreadyInMatrix,
  };
}

export function mergeProductsPreservingOneCLinks(incomingProducts, storedProducts) {
  const storedById = new Map(
    (Array.isArray(storedProducts) ? storedProducts : []).map((product) => [
      String(product.id),
      product,
    ])
  );

  return (Array.isArray(incomingProducts) ? incomingProducts : []).map((incoming) => {
    const stored = storedById.get(String(incoming.id));
    if (!stored) return incoming;

    let merged = { ...incoming };
    for (const field of ["oneCMatchCode", "oneCMatchName", "oneCSearchQuery", "oneCSearchRequestedAt"]) {
      if (!(field in incoming) && stored[field] !== undefined) {
        merged[field] = stored[field];
      }
    }

    const incomingMode = cleanText(incoming.oneCLinkMode);
    const incomingId = cleanText(incoming.oneCId);
    const storedId = cleanText(stored.oneCId);

    if (!incomingMode && !incomingId && storedId) {
      merged = {
        ...merged,
        ...Object.fromEntries(
          ONE_C_PRODUCT_FIELDS.map((field) => [field, stored[field] ?? ""])
        ),
      };
    }

    return merged;
  });
}

export function buildOneCProductsSummary(products, oneCProducts, meta = {}) {
  const sourceProducts = Array.isArray(products) ? products : [];
  const sourceOneC = normalizeOneCProducts(oneCProducts);
  const catalogIds = new Set(sourceOneC.map((item) => item.id));

  let linked = 0;
  let autoLinked = 0;
  let manualLinked = 0;
  let stale = 0;

  sourceProducts.forEach((product) => {
    const oneCId = cleanText(product.oneCId);
    if (!oneCId) return;
    linked += 1;
    if (product.oneCLinkMode === "auto") autoLinked += 1;
    else manualLinked += 1;
    if (!catalogIds.has(oneCId)) stale += 1;
  });

  const candidateMap = meta.candidateMap || {};
  const candidateProducts = Object.values(candidateMap).filter(
    (items) => Array.isArray(items) && items.length
  ).length;

  const pricedProducts = sourceOneC.filter((item) =>
    [
      item.purchasePrice,
      item.purchasePricePiece,
      item.purchasePricePack,
      item.purchasePriceBundle,
    ].some((value) => value !== null && value !== undefined && value !== "")
  ).length;

  return {
    receivedAt: meta.receivedAt || "",
    lastAutoLinkAt: meta.lastAutoLinkAt || "",
    oneCTotal: sourceOneC.length,
    pricedProducts,
    cloverTotal: sourceProducts.length,
    linked,
    autoLinked,
    manualLinked,
    stale,
    unmatched: Math.max(0, sourceProducts.length - linked),
    candidateProducts,
    lastReport: meta.lastReport || null,
  };
}

/**
 * Сопоставление строк импорта (Excel) с номенклатурой 1С.
 * Приоритет: код → точное имя → нечёткое совпадение.
 */
export function matchOneCImportRows(
  rows,
  oneCProducts,
  { maxCandidates = 8, minimumScore = 0.52 } = {}
) {
  const catalog = normalizeOneCProducts(oneCProducts);
  const byCode = new Map();
  const byExactName = new Map();

  for (const item of catalog) {
    const code = cleanText(item.code).toLocaleLowerCase("ru-RU");
    if (code && !byCode.has(code)) byCode.set(code, item);
    const nameKey = normalizeProductNameForMatch(item.name);
    if (nameKey && !byExactName.has(nameKey)) byExactName.set(nameKey, item);
  }

  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const name = cleanText(row?.name ?? row?.title ?? row?.product);
    const rawCode = cleanText(row?.code ?? row?.article ?? row?.sku);
    const codeKey = rawCode.toLocaleLowerCase("ru-RU");
    const nameKey = normalizeProductNameForMatch(name);

    if (!name && !rawCode) {
      return {
        rowIndex: index,
        name: "",
        code: "",
        status: "empty",
        score: 0,
        match: null,
        candidates: [],
      };
    }

    const codeHit = codeKey ? byCode.get(codeKey) || null : null;
    const exactHit = nameKey ? byExactName.get(nameKey) || null : null;

    const scored = catalog
      .map((item) => ({
        item,
        score: name ? productCandidateScore(name, item) : 0,
      }))
      .filter((entry) => entry.score >= minimumScore)
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(a.item.name || "").localeCompare(String(b.item.name || ""), "ru")
      );

    const candidateMap = new Map();
    const pushCandidate = (item, score) => {
      if (!item?.id) return;
      const key = String(item.id);
      const prev = candidateMap.get(key);
      if (!prev || score > prev.score) {
        candidateMap.set(key, {
          id: item.id,
          name: item.name,
          code: item.code || "",
          score,
          cloverLink: item.cloverLink || null,
        });
      }
    };

    if (codeHit) pushCandidate(codeHit, 1);
    if (exactHit) pushCandidate(exactHit, 1);
    for (const entry of scored.slice(0, maxCandidates)) {
      pushCandidate(entry.item, entry.score);
    }

    const candidates = [...candidateMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCandidates);

    let match = null;
    let status = "miss";
    let score = 0;

    if (exactHit) {
      match = exactHit;
      status = "exact";
      score = 1;
    } else if (codeHit) {
      match = codeHit;
      status = "code";
      score = 1;
    } else if (candidates[0]) {
      match = catalog.find((item) => String(item.id) === String(candidates[0].id)) || null;
      score = candidates[0].score;
      status = score >= 0.96 ? "exact" : "fuzzy";
    }

    return {
      rowIndex: index,
      name,
      code: rawCode,
      status,
      score,
      match: match
        ? {
            id: match.id,
            name: match.name,
            code: match.code || "",
            cloverLink: match.cloverLink || null,
          }
        : null,
      candidates,
    };
  });
}
