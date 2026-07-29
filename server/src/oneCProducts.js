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

  return {
    id: cleanText(item.id ?? item.oneCId ?? item.ref),
    code: cleanText(item.code ?? item.oneCCode),
    name: cleanText(item.name ?? item.presentation ?? item.description),
    purchasePrice,
    purchasePricePiece: firstNumeric(item.purchasePricePiece, item.costPricePiece, prices.piece),
    purchasePricePack: firstNumeric(item.purchasePricePack, item.costPricePack, prices.pack),
    purchasePriceBundle: firstNumeric(item.purchasePriceBundle, item.costPriceBundle, prices.bundle),
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
        }
      : product
  );
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
