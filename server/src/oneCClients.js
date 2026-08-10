function cleanText(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return cleanText(value).toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

function digits(value) {
  return cleanText(value).replace(/\D+/g, "");
}

function normalizeName(value) {
  return lower(value)
    .replace(/\b(ооо|оао|ао|ип|зао)\b/giu, " ")
    .replace(/[^a-zа-я0-9]+/giu, "")
    .trim();
}

function uniqueCandidate(items) {
  const unique = new Map();
  for (const item of items || []) unique.set(item.id, item);
  return unique.size === 1 ? [...unique.values()][0] : null;
}

function pushIndex(map, key, item) {
  if (!key) return;
  const bucket = map.get(key) || [];
  bucket.push(item);
  map.set(key, bucket);
}

/** Поля вида цен для clientLink — 1С (договор) источник истины по виду, не по режиму наценки. */
function priceTypeFieldsFromOneCClient(item = {}, current = {}) {
  const priceTypeId = cleanText(item.priceTypeId);
  // Пустой вид из 1С не затирает уже выбранный в Clover (пока расширение не догрузило поле).
  if (!priceTypeId) return {};
  const keepMarkup =
    String(current.defaultPricingMode || "").trim() === "purchase_markup" ||
    Number(current.defaultMarkupPercent) > 0;
  return {
    oneCPriceTypeId: priceTypeId,
    oneCPriceTypeName: cleanText(item.priceTypeName) || cleanText(item.priceTypeCode),
    // Не сбрасываем «закупка/категория + %» при выгрузке контрагентов.
    defaultPricingMode: keepMarkup ? "purchase_markup" : "one_c_price_type",
  };
}

export function normalizeOneCClient(item = {}) {
  return {
    id: cleanText(item.id ?? item.oneCId ?? item.ref),
    code: cleanText(item.code ?? item.oneCCode),
    name: cleanText(item.name ?? item.presentation ?? item.description),
    inn: cleanText(item.inn ?? item.INN ?? item.taxId),
    phone: cleanText(item.phone ?? item.telephone),
    email: cleanText(item.email ?? item.mail),
    // Вид цен с договора контрагента в 1С (источник истины для Clover).
    priceTypeId: cleanText(
      item.priceTypeId ??
        item.oneCPriceTypeId ??
        item.видЦенId ??
        item.ВидЦенId ??
        (item.priceType && typeof item.priceType === "object"
          ? item.priceType.id ?? item.priceType.ref
          : item.priceType)
    ),
    priceTypeName: cleanText(
      item.priceTypeName ??
        item.oneCPriceTypeName ??
        item.видЦен ??
        item.ВидЦен ??
        (item.priceType && typeof item.priceType === "object"
          ? item.priceType.name ?? item.priceType.presentation
          : "")
    ),
    priceTypeCode: cleanText(
      item.priceTypeCode ??
        (item.priceType && typeof item.priceType === "object" ? item.priceType.code : "")
    ),
  };
}

export function normalizeOneCClients(items) {
  const unique = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeOneCClient(raw);
    if (!item.id || !item.name) continue;
    unique.set(item.id, item);
  }
  return [...unique.values()];
}

function clientSearchValues(client, link = {}) {
  return {
    id: cleanText(link.oneCId),
    code: lower(link.oneCMatchCode || link.oneCCode),
    name: normalizeName(link.oneCMatchName || link.oneCName || client.companyName),
    inn: digits(link.oneCMatchInn || link.oneCInn || client.inn),
    phone: digits(link.oneCMatchPhone || client.phone),
    email: lower(link.oneCMatchEmail || client.email),
  };
}

function nameScore(source, target) {
  const a = normalizeName(source);
  const b = normalizeName(target);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const sourceWords = lower(source).split(/[^a-zа-я0-9]+/u).filter((word) => word.length >= 3);
  const targetSet = new Set(lower(target).split(/[^a-zа-я0-9]+/u).filter(Boolean));
  if (!sourceWords.length) return 0;
  return sourceWords.filter((word) => targetSet.has(word)).length / sourceWords.length;
}

export function buildOneCClientCandidates(
  clients,
  clientLinks,
  oneCClients,
  { maxPerClient = 10 } = {}
) {
  const sourceClients = Array.isArray(clients) ? clients : [];
  const sourceOneC = normalizeOneCClients(oneCClients);
  const links = clientLinks && typeof clientLinks === "object" ? clientLinks : {};
  const usedIds = new Set(
    Object.values(links).map((link) => cleanText(link?.oneCId)).filter(Boolean)
  );
  const result = {};

  for (const client of sourceClients) {
    const link = links[client.id] || {};
    if (cleanText(link.oneCId)) continue;
    const values = clientSearchValues(client, link);
    const candidates = [];

    for (const item of sourceOneC) {
      if (usedIds.has(item.id)) continue;
      let score = 0;
      let reason = "similar";

      if (values.inn && digits(item.inn) === values.inn) {
        score = 1;
        reason = "inn";
      } else if (values.email && lower(item.email) === values.email) {
        score = 0.99;
        reason = "email";
      } else if (values.phone && digits(item.phone) === values.phone) {
        score = 0.98;
        reason = "phone";
      } else if (values.code && lower(item.code) === values.code) {
        score = 0.97;
        reason = "code";
      } else {
        score = nameScore(link.oneCSearchQuery || client.companyName, item.name);
        reason = score >= 0.9 ? "name" : "similar";
      }

      if (score >= 0.58) candidates.push({ ...item, score, reason });
    }

    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
    if (candidates.length) result[String(client.id)] = candidates.slice(0, maxPerClient);
  }

  return result;
}

export function selectRelevantOneCClients(clients, clientLinks, oneCClients, candidateMap = null) {
  const sourceClients = Array.isArray(clients) ? clients : [];
  const sourceOneC = normalizeOneCClients(oneCClients);
  const links = clientLinks && typeof clientLinks === "object" ? clientLinks : {};
  const required = new Set();

  for (const client of sourceClients) {
    const values = clientSearchValues(client, links[client.id] || {});
    for (const item of sourceOneC) {
      if (values.id && item.id === values.id) required.add(item.id);
      if (values.inn && digits(item.inn) === values.inn) required.add(item.id);
      if (values.email && lower(item.email) === values.email) required.add(item.id);
      if (values.phone && digits(item.phone) === values.phone) required.add(item.id);
      if (values.code && lower(item.code) === values.code) required.add(item.id);
      if (values.name && normalizeName(item.name) === values.name) required.add(item.id);
    }
  }

  const candidates = candidateMap || buildOneCClientCandidates(sourceClients, links, sourceOneC);
  for (const items of Object.values(candidates)) {
    for (const item of Array.isArray(items) ? items : []) {
      if (item?.id) required.add(String(item.id));
    }
  }

  return sourceOneC.filter((item) => required.has(item.id));
}

export function autoLinkCloverClients(clients, clientLinks, oneCClients, now = new Date().toISOString()) {
  const sourceClients = Array.isArray(clients) ? clients : [];
  const sourceOneC = normalizeOneCClients(oneCClients);
  const links = clientLinks && typeof clientLinks === "object" ? clientLinks : {};
  const byId = new Map(sourceOneC.map((item) => [item.id, item]));
  const indexes = {
    inn: new Map(),
    email: new Map(),
    phone: new Map(),
    code: new Map(),
    name: new Map(),
  };

  for (const item of sourceOneC) {
    pushIndex(indexes.inn, digits(item.inn), item);
    pushIndex(indexes.email, lower(item.email), item);
    pushIndex(indexes.phone, digits(item.phone), item);
    pushIndex(indexes.code, lower(item.code), item);
    pushIndex(indexes.name, normalizeName(item.name), item);
  }

  const usedIds = new Set(Object.values(links).map((link) => cleanText(link?.oneCId)).filter(Boolean));
  const nextLinks = { ...links };
  const report = {
    cloverTotal: sourceClients.length,
    oneCTotal: sourceOneC.length,
    linked: 0,
    preserved: 0,
    autoLinked: 0,
    ambiguous: 0,
    unmatched: 0,
    newlyLinked: 0,
  };
  let changed = false;

  for (const client of sourceClients) {
    const current = { ...(links[client.id] || {}) };
    const existingId = cleanText(current.oneCId);
    if (existingId) {
      report.linked += 1;
      report.preserved += 1;
      const item = byId.get(existingId);
      if (item) {
        const enriched = {
          ...current,
          matched1C: true,
          oneCId: item.id,
          oneCCode: item.code,
          oneCName: item.name,
          oneCInn: item.inn,
          oneCLinkMode: current.oneCLinkMode || "manual",
          oneCLinkedAt: current.oneCLinkedAt || now,
          ...priceTypeFieldsFromOneCClient(item, current),
        };
        if (JSON.stringify(enriched) !== JSON.stringify(current)) changed = true;
        nextLinks[client.id] = enriched;
      }
      continue;
    }

    const values = clientSearchValues(client, current);
    const stages = [
      values.inn ? indexes.inn.get(values.inn) || [] : [],
      values.email ? indexes.email.get(values.email) || [] : [],
      values.phone ? indexes.phone.get(values.phone) || [] : [],
      values.code ? indexes.code.get(values.code) || [] : [],
      values.name ? indexes.name.get(values.name) || [] : [],
    ];

    let candidate = null;
    let ambiguous = false;
    for (const stage of stages) {
      if (!stage.length) continue;
      candidate = uniqueCandidate(stage);
      if (!candidate) ambiguous = true;
      break;
    }

    if (candidate && !usedIds.has(candidate.id)) {
      usedIds.add(candidate.id);
      nextLinks[client.id] = {
        ...current,
        matched1C: true,
        oneCId: candidate.id,
        oneCCode: candidate.code,
        oneCName: candidate.name,
        oneCInn: candidate.inn,
        oneCMatchName: current.oneCMatchName || candidate.name,
        oneCMatchInn: current.oneCMatchInn || candidate.inn,
        oneCLinkMode: "auto",
        oneCLinkedAt: now,
        ...priceTypeFieldsFromOneCClient(candidate, current),
      };
      changed = true;
      report.linked += 1;
      report.autoLinked += 1;
      report.newlyLinked += 1;
    } else if (ambiguous || (candidate && usedIds.has(candidate.id))) {
      report.ambiguous += 1;
    } else {
      report.unmatched += 1;
    }
  }

  return { clientLinks: nextLinks, oneCClients: sourceOneC, report, changed };
}

export function linkCloverClient(clientLinks, clientId, rawOneCClient, now = new Date().toISOString()) {
  const item = normalizeOneCClient(rawOneCClient);
  if (!item.id || !item.name) throw new Error("Не удалось определить контрагента 1С.");
  const links = clientLinks && typeof clientLinks === "object" ? clientLinks : {};
  const conflict = Object.entries(links).find(
    ([id, link]) => String(id) !== String(clientId) && cleanText(link?.oneCId) === item.id
  );
  if (conflict) throw new Error("Этот контрагент 1С уже связан с другим клиентом Clover.");

  return {
    ...links,
    [clientId]: {
      ...(links[clientId] || {}),
      matched1C: true,
      oneCId: item.id,
      oneCCode: item.code,
      oneCName: item.name,
      oneCInn: item.inn,
      oneCMatchName: item.name,
      oneCMatchInn: item.inn,
      oneCLinkMode: "manual",
      oneCLinkedAt: now,
      ...priceTypeFieldsFromOneCClient(item, links[clientId] || {}),
    },
  };
}

export function buildOneCClientsSummary(clients, clientLinks, oneCClients, meta = {}) {
  const sourceClients = Array.isArray(clients) ? clients : [];
  const links = clientLinks && typeof clientLinks === "object" ? clientLinks : {};
  const catalog = normalizeOneCClients(oneCClients);
  const catalogIds = new Set(catalog.map((item) => item.id));
  let linked = 0;
  let autoLinked = 0;
  let manualLinked = 0;
  let stale = 0;

  for (const client of sourceClients) {
    const link = links[client.id] || {};
    if (!cleanText(link.oneCId)) continue;
    linked += 1;
    if (link.oneCLinkMode === "auto") autoLinked += 1;
    else manualLinked += 1;
    if (!catalogIds.has(cleanText(link.oneCId))) stale += 1;
  }

  const candidateMap = meta.candidateMap || {};
  return {
    receivedAt: meta.receivedAt || "",
    oneCTotal: catalog.length,
    cloverTotal: sourceClients.length,
    linked,
    autoLinked,
    manualLinked,
    stale,
    unmatched: Math.max(0, sourceClients.length - linked),
    candidateClients: Object.values(candidateMap).filter((items) => Array.isArray(items) && items.length).length,
    lastReport: meta.lastReport || null,
  };
}

const ONE_C_CLIENT_LINK_FIELDS = [
  "matched1C",
  "oneCId",
  "oneCCode",
  "oneCName",
  "oneCInn",
  "oneCMatchCode",
  "oneCMatchName",
  "oneCMatchInn",
  "oneCMatchPhone",
  "oneCMatchEmail",
  "oneCSearchQuery",
  "oneCLinkMode",
  "oneCLinkedAt",
];

export function mergeClientLinksPreservingOneCLinks(incomingLinks, storedLinks) {
  const incoming = incomingLinks && typeof incomingLinks === "object" ? incomingLinks : {};
  const stored = storedLinks && typeof storedLinks === "object" ? storedLinks : {};
  const allIds = new Set([...Object.keys(stored), ...Object.keys(incoming)]);
  const result = {};

  for (const clientId of allIds) {
    const previous =
      stored[clientId] && typeof stored[clientId] === "object"
        ? stored[clientId]
        : {};
    // Клиент только в stored и отсутствует во входящей карте — не затираем матрицу.
    if (!Object.prototype.hasOwnProperty.call(incoming, clientId)) {
      result[clientId] = previous;
      continue;
    }

    const rawIncoming =
      incoming[clientId] && typeof incoming[clientId] === "object"
        ? incoming[clientId]
        : {};
    // Nested-merge: partial / пустые nested не затирают matrixProductIds и personalPrices.
    const next = { ...previous, ...rawIncoming };
    if (Object.prototype.hasOwnProperty.call(rawIncoming, "personalPrices")) {
      const prevPrices =
        previous.personalPrices &&
        typeof previous.personalPrices === "object" &&
        !Array.isArray(previous.personalPrices)
          ? previous.personalPrices
          : {};
      const incPrices =
        rawIncoming.personalPrices &&
        typeof rawIncoming.personalPrices === "object" &&
        !Array.isArray(rawIncoming.personalPrices)
          ? rawIncoming.personalPrices
          : {};
      next.personalPrices = { ...prevPrices, ...incPrices };
    }
    if (Object.prototype.hasOwnProperty.call(rawIncoming, "matrixProductIds")) {
      const incIds = Array.isArray(rawIncoming.matrixProductIds)
        ? rawIncoming.matrixProductIds
        : null;
      if (incIds === null) {
        next.matrixProductIds = Array.isArray(previous.matrixProductIds)
          ? previous.matrixProductIds
          : [];
      } else {
        // Явный массив с UI (в том числе []) — полный снимок матрицы, не partial.
        next.matrixProductIds = incIds;
      }
    }
    const incomingId = cleanText(next.oneCId);
    const storedId = cleanText(previous.oneCId);
    const explicitClear = next.oneCLinkMode === "manual-cleared";

    if (!explicitClear && !incomingId && storedId) {
      for (const field of ONE_C_CLIENT_LINK_FIELDS) {
        next[field] = previous[field] ?? next[field] ?? "";
      }
      next.matched1C = true;
    }

    result[clientId] = next;
  }

  return result;
}
