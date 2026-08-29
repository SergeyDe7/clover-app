/** Сортировка каталога: крышки сразу после «своего» контейнера/банки/лотка. */

function normalizeName(value = "") {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");
}

/** Убирает префикс поставщика: «ВЫШНИЙ В. - Крышка…», «1406 Н / Борт…». */
function productTitleCore(name = "") {
  return normalizeName(name)
    .replace(/^[\s"'«»]+/, "")
    .replace(/^[^—-]{0,48}[-—]\s+/, "")
    .replace(/^[0-9a-zа-яё .]{0,24}\s+\/\s+/, "")
    .trim();
}

function extractVolumeMl(name = "") {
  const match = normalizeName(name).match(/(\d{2,4})\s*мл/u);
  return match ? match[1] : "";
}

function normalizePackSpec(raw = "") {
  return String(raw || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/шт\.?/g, "")
    .replace(/\s+/g, "")
    .replace(/,+/g, "/");
}

function isLidArticleReference(raw = "") {
  const n = normalizeName(raw);
  return /^(?:крышка\s*)?арт(?:[\s.:]|$)|^арт(?:[\s.:]|$)/u.test(n);
}

/** Последняя «упаковочная» группа в скобках: (50/300), (50шт/300шт). Пропускает (крышка арт. …). */
export function extractParenthesesSpec(name = "") {
  const matches = String(name || "").match(/\(([^)]+)\)/g);
  if (!matches?.length) return "";
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const raw = matches[i].replace(/^\(|\)$/g, "");
    if (isLidArticleReference(raw)) continue;
    const spec = normalizePackSpec(raw);
    if (spec) return spec;
  }
  return "";
}

function usesFamilyOnlyGrouping(family = "", spec = "") {
  return Boolean(family) && !spec && /^oneclick:/u.test(family);
}

function isIntegratedPack(name = "") {
  return (
    /контейнер.*с крышкой/u.test(name) ||
    /тортница.*\+.*крышк/u.test(name) ||
    /дно \+ .*крышк/u.test(name) ||
    /с пластик\.?крышкой/u.test(name)
  );
}

function extractShakerBrand(name = "") {
  if (/veggo/u.test(name)) return "veggo";
  if (/(?:^|[\s(/-])стp(?:[\s),./-]|$)|(?:^|[\s(/-])stp(?:[\s),./-]|$)/u.test(name)) {
    return "stp";
  }
  if (/юф/u.test(name)) return "yuf";
  return "other";
}

function extractDiameterCode(name = "") {
  const match = normalizeName(name).match(/d(\d{2,3})/);
  return match ? match[1] : "";
}

function extractPaperContainerFamily(name = "") {
  const n = normalizeName(name);
  if (/oneclick|round\s*bowl|opsalad/u.test(n)) return "";
  const ml = extractVolumeMl(name);
  const d = extractDiameterCode(name);
  if (!ml || !d) return "";
  const isPaperBase =
    /контейнер бумажный|контейнер.*без крышки/u.test(n) && !/с крышкой/u.test(n);
  const isPaperLid =
    /крышк/u.test(n) &&
    /контейнер/u.test(n) &&
    (new RegExp(`${ml}\\s*мл|${ml}мл`, "u").test(n) || new RegExp(`d${d}\\b`, "u").test(n));
  if (isPaperBase || isPaperLid) return `paper:${ml}:d${d}`;
  return "";
}

/** Ключ семейства: K-144, ИП-409с4, OneClick 800, лоток 5 секций… */
export function extractProductFamilyKey(name = "") {
  const n = normalizeName(name);

  if (/5\s*[-]?\s*секц/u.test(n) && /лоток|крышк/u.test(n)) {
    return "lotok:5sect";
  }

  let match = n.match(/(?:^|[\s(/-])(?:к|k)[- ]?\s*(\d{2,4})/u);
  if (match) return `k:${match[1]}`;

  match = n.match(/(?:^|[\s(/-])ип\s*[-]?\s*([\da-zа-яё]+)/u);
  if (match) return `ip:${match[1]}`;

  match = n.match(/(?:^|[\s(/-])спк\s*[-]?\s*(\d+)/u);
  if (match) return `spk:${match[1]}`;

  match = n.match(/(?:^|[\s(/-])прмс\s*[-]?\s*(\d{2,4})/u);
  if (match) return `prms:${match[1]}`;

  if (/форм(?:а|ы)?\s+алюмин|крышк.*алюмин.*форм/u.test(n)) {
    const vol = extractVolumeMl(n);
    return vol ? `alform:${vol}` : "alform:generic";
  }

  if (/стакан.*шейкера/u.test(n) && !/(?:^|\s)крышк/u.test(n)) {
    const ml = extractVolumeMl(n);
    const brand = extractShakerBrand(n);
    return ml ? `shaker:${ml}:${brand}` : `shaker:${brand}`;
  }

  match = n.match(/(?:^|[\s(/-])oneclick\s*(\d+)/u);
  if (match) {
    const sect = /2\s*[-]?\s*секц/u.test(n) ? ":2sect" : "";
    return `oneclick:${match[1]}${sect}`;
  }

  if (/round\s*bowl/u.test(n) && /контейнер|крышк|дно/u.test(n)) {
    const spec = extractParenthesesSpec(name);
    if (spec) return `roundbowl:spec:${spec}`;
  }

  const paperFamily = extractPaperContainerFamily(name);
  if (paperFamily) return paperFamily;

  match = n.match(/(?:^|[\s(/-])opsalad\s*(\d+)/u);
  if (match) return `opsalad:${match[1]}`;

  match = n.match(/(?:^|[\s(/-])ук\s*[-]?\s*(\d+[\w/-]*)/u);
  if (match) return `uk:${match[1]}`;

  match = n.match(/(?:^|[\s(/-])(?:с|c)[- ]?(\d+[\w/]*)/u);
  if (match && /суши|контейнер|крышк/u.test(n)) return `sushi:${match[1]}`;

  return "";
}

export function isProductLid(product = {}) {
  const name = normalizeName(product?.name);
  const core = productTitleCore(product?.name);
  if (isIntegratedPack(name)) return false;
  if (/^контейнер/u.test(core) || /^лоток/u.test(core) || /^банка/u.test(core)) {
    return false;
  }
  if (/^форма алюмин/u.test(core)) return false;
  if (/^прмс/u.test(core)) return false;
  if (/^спк\s*\d+/u.test(core) && /(?:^|\s)дно(?:\s|\(|$)/u.test(core)) return false;

  if (/^крышк/u.test(core)) return true;
  if (/^ип[-\s]/u.test(core) && /(?:^|\s)крышк/u.test(core)) return true;
  if (/^спк\s*\d+/u.test(core) && /(?:^|\s)крышк/u.test(core)) return true;
  if (/(?:^|\s)крышк/u.test(core) && !/(?:^|\s)дно(?:\s|\(|$)/u.test(core)) return true;

  return false;
}

export function isProductContainerOrBank(product = {}) {
  const name = normalizeName(product?.name);
  const core = productTitleCore(product?.name);
  if (isProductLid(product)) return false;
  if (isIntegratedPack(name)) return false;

  if (
    /^контейнер|^банка|^банки|^банок|^борт|^лоток|^подложк|^eco rcont|^к-\d+|^прмс|^форма алюмин/u.test(
      core
    )
  ) {
    return true;
  }
  if (/^спк\s*\d+/u.test(core) && !/(?:^|\s)крышк/u.test(core)) return true;
  if (/стакан.*шейкера/u.test(name) && !/(?:^|\s)крышк/u.test(core)) return true;
  if (/^ип[-\s]/u.test(core) && /(?:^|\s)дно(?:\s|\(|$)/u.test(core)) return true;
  if (/^ипр[-\s]/u.test(core)) return true;
  if (/(?:^|\s)дно(?:\s|\(|$)/u.test(name) && /лоток|контейнер|round bowl|oneclick|ук-|спк|(?:^|[\s])к-\d+|прмс/u.test(name)) {
    return true;
  }
  return /контейнер|банка супов|банка \d/u.test(name);
}

function significantNumbers(name = "") {
  const nums = new Set();
  for (const match of String(name || "").matchAll(/(\d{2,4})/g)) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n >= 100) nums.add(n);
  }
  return nums;
}

function sharedNumbers(a = "", b = "") {
  const left = significantNumbers(a);
  let score = 0;
  for (const n of significantNumbers(b)) {
    if (left.has(n)) score += 1;
  }
  return score;
}

function variantTokens(name = "") {
  const tokens = [];
  if (/взлп|vzlp/u.test(name)) tokens.push("vzlp");
  if (/(?:^|[\s(/-])стp(?:[\s),./-]|$)|(?:^|[\s(/-])stp(?:[\s),./-]|$)/u.test(name)) {
    tokens.push("stp");
  }
  if (/д[- ]?полимер/u.test(name)) tokens.push("dp");
  return tokens;
}

function sharedVariantBonus(a = "", b = "") {
  const left = variantTokens(a);
  const right = variantTokens(b);
  let score = 0;
  for (const token of left) {
    if (right.includes(token)) score += 40;
    else score -= 20;
  }
  return score;
}

function sharedVolumeBonus(lid = {}, parent = {}) {
  const lidVol = extractVolumeMl(lid.name);
  const parentVol = extractVolumeMl(parent.name);
  if (lidVol && parentVol && lidVol === parentVol) return 80;
  if (lidVol && parentVol && lidVol !== parentVol) return -25;
  return 0;
}

/** Насколько крышка относится к контейнеру/банке (0 = не связаны). */
export function lidParentMatchScore(lid = {}, parent = {}) {
  if (!isProductLid(lid) || !isProductContainerOrBank(parent)) return 0;

  const lidName = normalizeName(lid.name);
  const parentName = normalizeName(parent.name);

  if (/шейкера/u.test(lidName) && !/шейкера/u.test(parentName)) return 0;
  if (/oneclick/u.test(lidName) && !/oneclick/u.test(parentName)) return 0;
  if (/oneclick/u.test(parentName) && !/oneclick/u.test(lidName)) return 0;
  if (/round bowl/u.test(lidName) && !/round bowl/u.test(parentName)) return 0;
  if (/round bowl/u.test(parentName) && !/round bowl/u.test(lidName)) return 0;
  if (/чаше/u.test(lidName) && /контейнер/u.test(parentName)) return 0;
  if (/алюмин.*форм/u.test(lidName) && !/форм.*алюмин/u.test(parentName)) return 0;
  if (/прмс/u.test(lidName) && !/прмс/u.test(parentName)) return 0;
  if (/5\s*[-]?\s*секц/u.test(lidName) && !/5\s*[-]?\s*секц/u.test(parentName)) return 0;
  if (/лоток/u.test(lidName) && !/лоток/u.test(parentName)) return 0;
  if (/банк/u.test(lidName) && !/банк/u.test(parentName)) return 0;

  let score = 0;

  const lidFamily = extractProductFamilyKey(lid.name);
  const parentFamily = extractProductFamilyKey(parent.name);
  if (lidFamily && parentFamily) {
    if (lidFamily === parentFamily) score += 120;
    else if (lidFamily.startsWith("prms:") && parentFamily.startsWith("prms:")) score += 90;
    else if (/прмс/u.test(lidName) && /прмс/u.test(parentName)) score += 90;
    else if (lidFamily.startsWith("alform:") && parentFamily.startsWith("alform:")) score += 90;
    else if (lidFamily.startsWith("shaker:") && parentFamily.startsWith("shaker:")) score += 40;
    else if (lidFamily.startsWith("paper:") && parentFamily.startsWith("paper:")) score += 120;
    else if (lidFamily.startsWith("roundbowl:spec:") && parentFamily.startsWith("roundbowl:spec:")) {
      score += 120;
    }
  }

  const lidSpec = extractParenthesesSpec(lid.name);
  const parentSpec = extractParenthesesSpec(parent.name);
  if (lidSpec && parentSpec && lidSpec === parentSpec) score += 100;

  score += sharedNumbers(lid.name, parent.name) * 28;
  score += sharedVariantBonus(lidName, parentName);
  score += sharedVolumeBonus(lid, parent);

  if (/перинт/u.test(lidName) && /перинт/u.test(parentName)) score += 36;
  if (/oneclick/u.test(lidName) && /oneclick/u.test(parentName)) score += 36;
  if (/smartpack/u.test(lidName) && /smartpack/u.test(parentName)) score += 28;
  if (/round bowl/u.test(lidName) && /round bowl/u.test(parentName)) score += 32;
  if (/прмс/u.test(lidName) && /прмс/u.test(parentName)) score += 70;
  if (/алюмин.*форм/u.test(lidName) && /форм.*алюмин/u.test(parentName)) score += 70;
  if (/шейкера/u.test(lidName) && /шейкера/u.test(parentName)) score += 55;

  if (/контейнер/u.test(lidName) && /контейнер/u.test(parentName)) score += 18;
  if (/банк/u.test(lidName) && /банк/u.test(parentName)) score += 18;
  if (/лоток/u.test(lidName) && /лоток/u.test(parentName)) score += 24;

  if (/2\s*секц/u.test(lidName) && /2\s*секц/u.test(parentName)) score += 22;
  if (/2\s*секц/u.test(lidName) && !/2\s*секц/u.test(parentName)) score -= 45;
  if (/2\s*секц/u.test(parentName) && !/2\s*секц/u.test(lidName)) score -= 45;
  if (/5\s*[-]?\s*секц/u.test(lidName) && /5\s*[-]?\s*секц/u.test(parentName)) score += 40;

  const shakerBrandL = extractShakerBrand(lidName);
  const shakerBrandP = extractShakerBrand(parentName);
  if (shakerBrandL !== "other" && shakerBrandL === shakerBrandP) score += 45;

  for (const token of ["крафт", "черн", "бел", "прозрач"]) {
    const inLid = lidName.includes(token);
    const inParent = parentName.includes(token);
    if (inLid && inParent) score += 14;
    else if (inLid !== inParent) score -= 10;
  }

  return score;
}

const MIN_LID_PARENT_SCORE = 50;

function compareProductName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""), "ru", {
    sensitivity: "base",
    numeric: true,
  });
}

function groupSortKey(item) {
  const family = extractProductFamilyKey(item?.name);
  const spec = extractParenthesesSpec(item?.name);
  const base = isProductContainerOrBank(item);
  const lid = isProductLid(item);
  const familyOnly = usesFamilyOnlyGrouping(family, spec);
  if (family && (spec || familyOnly) && (base || lid)) {
    return {
      mode: "family",
      block: familyOnly ? `${family}\0` : `${family}\0${spec}`,
      family,
      spec,
      kind: base ? 0 : 1,
      name: String(item?.name || ""),
    };
  }
  return {
    mode: "plain",
    block: "",
    family: "",
    spec: "",
    kind: 2,
    name: String(item?.name || ""),
  };
}

function buildFamilyBlockAnchors(products = []) {
  const anchors = new Map();
  for (const item of products) {
    const meta = groupSortKey(item);
    if (meta.mode !== "family") continue;
    const current = anchors.get(meta.block);
    if (meta.kind === 0) {
      if (!current || meta.name.localeCompare(current, "ru", { numeric: true }) < 0) {
        anchors.set(meta.block, meta.name);
      }
    } else if (!current) {
      anchors.set(meta.block, meta.name);
    }
  }
  return anchors;
}

function compareGrouped(a, b, anchors = new Map()) {
  const left = groupSortKey(a);
  const right = groupSortKey(b);

  const leftAnchor =
    left.mode === "family" ? anchors.get(left.block) || left.name : left.name;
  const rightAnchor =
    right.mode === "family" ? anchors.get(right.block) || right.name : right.name;

  const anchorCmp = leftAnchor.localeCompare(rightAnchor, "ru", {
    sensitivity: "base",
    numeric: true,
  });
  if (anchorCmp) return anchorCmp;

  if (left.mode === "family" && right.mode === "family" && left.block === right.block) {
    if (left.kind !== right.kind) return left.kind - right.kind;
    return left.name.localeCompare(right.name, "ru", { sensitivity: "base", numeric: true });
  }

  return left.name.localeCompare(right.name, "ru", { sensitivity: "base", numeric: true });
}

/**
 * Стабильная сортировка: семейство+артикул → контейнеры → крышки; fallback — score matching.
 */
export function sortProductsWithLidsGrouped(products = []) {
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  if (list.length < 2) return list;

  const byId = new Map(list.map((item) => [String(item.id), item]));
  const anchors = buildFamilyBlockAnchors(list);

  const hasFamilyBaseInBlock = (block) =>
    list.some((item) => {
      const meta = groupSortKey(item);
      return meta.mode === "family" && meta.block === block && isProductContainerOrBank(item);
    });

  const containers = list.filter(isProductContainerOrBank);
  const lidToParent = new Map();

  for (const lid of list.filter(isProductLid)) {
    const lidMeta = groupSortKey(lid);
    if (lidMeta.mode === "family" && hasFamilyBaseInBlock(lidMeta.block)) continue;
    let bestParentId = "";
    let bestScore = 0;
    for (const parent of containers) {
      const score = lidParentMatchScore(lid, parent);
      if (score > bestScore) {
        bestScore = score;
        bestParentId = String(parent.id);
      }
    }
    if (bestParentId && bestScore >= MIN_LID_PARENT_SCORE) {
      lidToParent.set(String(lid.id), bestParentId);
    }
  }

  const parentToLids = new Map();
  for (const [lidId, parentId] of lidToParent.entries()) {
    if (!parentToLids.has(parentId)) parentToLids.set(parentId, []);
    parentToLids.get(parentId).push(lidId);
  }
  for (const lidIds of parentToLids.values()) {
    lidIds.sort((leftId, rightId) =>
      compareProductName(byId.get(leftId), byId.get(rightId))
    );
  }

  const baseSorted = [...list].sort((left, right) => compareGrouped(left, right, anchors));
  const emitted = new Set();
  const result = [];

  for (const item of baseSorted) {
    const id = String(item.id);
    if (emitted.has(id)) continue;
    if (isProductLid(item) && lidToParent.has(id)) continue;

    result.push(item);
    emitted.add(id);

    if (isProductContainerOrBank(item)) {
      for (const lidId of parentToLids.get(id) || []) {
        if (emitted.has(lidId)) continue;
        const lid = byId.get(lidId);
        if (!lid) continue;
        result.push(lid);
        emitted.add(lidId);
      }
    }
  }

  for (const item of baseSorted) {
    const id = String(item.id);
    if (!emitted.has(id)) {
      result.push(item);
      emitted.add(id);
    }
  }

  return result;
}
