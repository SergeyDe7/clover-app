#!/usr/bin/env node
/**
 * Классификация 191 fallback /magazin/product/... → /catalog
 * Группы: exact_product | confident_category | not_found
 * Ничего не активирует. Запуск: node ops/seo/classify-magazin-fallback.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAGAZIN_FOLDER_TO_PATH } from "./magazinRedirectMap.js";
import { assignCloverTaxonomy } from "../../src/screens/storefront/productGroups.js";
import {
  CATEGORY_SLUG_BY_NAME,
  SUBCATEGORY_SLUG_BY_NAME,
  buildStorefrontPath,
  listCategorySlugEntries,
  slugifyStorefrontLabel,
} from "../../src/screens/storefront/storefrontSlugs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://clover-spb.ru";
const API = process.env.CLOVER_API_BASE || "http://127.0.0.1:4100";

/** Латинские фрагменты slug → путь каталога (уверенные эвристики). */
const SLUG_FRAGMENT_TO_PATH = [
  [/zhiroudal|udaleniya-zhira|anti-zhir|grill-max/i, "/catalog/himiya-chistyashchie-sredstva/zhiroudaliteli"],
  [/dlya-santehnik|adrilan|domestos|sanoks/i, "/catalog/himiya-chistyashchie-sredstva/dlya-santehniki"],
  [/gubk|mochalk|scour/i, "/catalog/hozyajstvennye-tovary/gubki-dlya-posudy"],
  [/dlya-posud|mytya-posud|adriol|fairy|posudomoech|pmm|opolaskivatel.*pmm/i, "/catalog/himiya-chistyashchie-sredstva/dlya-mytya-posudy"],
  [/posudomoech|pmm|dlya-pmm/i, "/catalog/himiya-chistyashchie-sredstva/dlya-posudomoechnyh-mashin"],
  [/dlya-okon|stekol|zerkal|mytya-stekol/i, "/catalog/himiya-chistyashchie-sredstva/dlya-okon"],
  [/dlya-pol|mytya-pol|polov-i-sten/i, "/catalog/himiya-chistyashchie-sredstva/dlya-polov"],
  [/dezinf|antisept|septo|zdravdez/i, "/catalog/himiya-chistyashchie-sredstva/dlya-dezinfekcii"],
  [/belizna|otbeliv/i, "/catalog/himiya-chistyashchie-sredstva/prochee"],
  [/osvezhitel|vozduha|gold-wind/i, "/catalog/himiya-chistyashchie-sredstva/prochee"],
  [/stiraln|poroshok|pemolyuks|viksan/i, "/catalog/himiya-chistyashchie-sredstva/poroshki"],
  [/\bmylo\b|mylо|zhidkoe-mylo/i, "/catalog/himiya-chistyashchie-sredstva/mylo"],
  [/universal|dlya-mebeli|ochistitel/i, "/catalog/himiya-chistyashchie-sredstva/universalnye"],
  [/sredstvo-dlya|help-sredstvo|akvalon|prosept|himitek|nika-2/i, "/catalog/himiya-chistyashchie-sredstva/prochee"],

  [/tualetn|tualet-bum|tualetnaya-bumaga/i, "/catalog/bumazhnaya-produkciya/tualetnaya-bumaga"],
  [/polotenc|polotence|polotenca|hpp|mikrofib|vafeln/i, "/catalog/bumazhnaya-produkciya/bumazhnye-polotenca"],
  [/salfetk|salvetk|vlazhn/i, "/catalog/bumazhnaya-produkciya/salfetki"],

  [/stakan|rukav-dlya/i, "/catalog/odnorazovaya-posuda/stakany"],
  [/kontejner|rakushk|opsalad|banochk/i, "/catalog/odnorazovaya-posuda/kontejnery"],
  [/lanch-boks|lanchboks|lanсh/i, "/catalog/odnorazovaya-posuda/lanch-boksy"],
  [/kryshka.*kont|kryshka-k-kont|kryshka-dlya-kont/i, "/catalog/odnorazovaya-posuda/kontejnery"],
  [/korob.*kapkej|korob-karton|eco-cake|pirozhn|kapkeyk/i, "/catalog/odnorazovaya-posuda/dlya-konditerskih-izdelij"],
  [/lenta-kassovaya|kassovaya-lenta/i, "/catalog/kancelyarskie-tovary"],
  [/dlya-plit|adriel.*plit|grill|zhir.*plit/i, "/catalog/himiya-chistyashchie-sredstva/zhiroudaliteli"],
  [/picc|pizza|korobk.*pic/i, "/catalog/odnorazovaya-posuda/korobki-dlya-piccy"],
  [/sousnik/i, "/catalog/odnorazovaya-posuda/sousniki"],
  [/tarel|misk|kremank/i, "/catalog/odnorazovaya-posuda/tarelki-miski"],
  [/vilka|lozhk|nabor.*pribor|pribory|razmeshivatel|zubochist|shpatel/i, "/catalog/odnorazovaya-posuda/stolovye-pribory"],
  [/sushi|roll|vok|lapsh|palochki-dlya-edy/i, "/catalog/odnorazovaya-posuda/dlya-sushi-i-lapshi"],
  [/butylk|bulytk|flakon/i, "/catalog/odnorazovaya-posuda/butylki"],
  [/lotok|podlozhk/i, "/catalog/odnorazovaya-posuda/lotki"],
  [/konditersk|tartalet|kapkeyk|eco-fast-food|eco-pillow|eco-tabox|bumazhnaya-upakov|fast-food-box/i, "/catalog/odnorazovaya-posuda/bumazhnaya-upakovka"],
  [/konditer|tartalet|muffin|keks/i, "/catalog/odnorazovaya-posuda/dlya-konditerskih-izdelij"],
  [/zapajk|spk|pod-zapaj/i, "/catalog/odnorazovaya-posuda/kontejnery-pod-zapajku"],
  [/alyum|formа-alyum|forma-alyum|formy-alyum/i, "/catalog/odnorazovaya-posuda/formy-alyuminievye"],
  [/vedr/i, "/catalog/odnorazovaya-posuda/vedra"],
  [/derzhatel-dlya.*stakan|stakanoderzhatel/i, "/catalog/odnorazovaya-posuda/stakany"],

  [/folga|pergament|strejch|plenka-pish|pishchevaya-plenka/i, "/catalog/hozyajstvennye-tovary/folga-plenka-pergament"],
  [/plenka-pod-zapaj|zapaich/i, "/catalog/hozyajstvennye-tovary/plenka-pod-zapajku"],
  [/perchatk|nitriл|lateks|vinilov|nitril/i, "/catalog/hozyajstvennye-tovary/perchatki"],
  [/halat|shapochk|bahil|bakhil|maska-med|narukavnik|naborodnik|pilotk|fartuk|specodezhd|spec-odezhd|laboratorn/i, "/catalog/hozyajstvennye-tovary/odnorazovaya-odezhda"],
  [/meshok-dlya-musora|musor.*paket|paket.*musor/i, "/catalog/hozyajstvennye-tovary/meshki-dlya-musora"],
  [/shvabr|schetk|shchetk|venik|vantuz|sovok|ersh-dlya/i, "/catalog/hozyajstvennye-tovary/shvabry-schetki"],
  [/mop|tryap|polotno|hpp-|mikrofib|pad-ruchn/i, "/catalog/hozyajstvennye-tovary/tryapki-mopy-polotenca"],
  [/raspylitel|pulverizator|opryskivatel|lovushka-muh/i, "/catalog/hozyajstvennye-tovary/prochee"],

  [/paket-maj|pakety-maj|majka/i, "/catalog/pakety-upakovochnye-materialy/pakety-majki"],
  [/fasovochn|fasovochnyj-paket/i, "/catalog/pakety-upakovochnye-materialy/pakety-fasovochnye"],
  [/vakuumn.*paket|vakuum/i, "/catalog/pakety-upakovochnye-materialy/pakety-vakuumnye"],
  [/bumazhn.*paket|kraft.*paket|paket-s-ruchk|ugolok-bumazhn/i, "/catalog/pakety-upakovochnye-materialy/bumazhnye-pakety-bez-ruchki"],
  [/shpagat|verevk|lenta-kley/i, "/catalog/pakety-upakovochnye-materialy/prochee"],
  [/konditerskij-meshok|meshok-konditer/i, "/catalog/pakety-upakovochnye-materialy/prochee"],

  [/trubochk|koktejl|pika-|barn|shampur|shashlyk/i, "/catalog/barnye-aksessuary"],
  [/bloknot|bumaga-a4|kalkulyator|marker|skrepk|stepler|kancely|lotok-bumag|nakladnaya|etiket-lenta|etiket-pistolet|pistolyet.*etiket|termoetiket/i, "/catalog/kancelyarskie-tovary"],
  [/mister-proper|proper-univ|moyushchee-sr/i, "/catalog/himiya-chistyashchie-sredstva/universalnye"],
  [/shumanit|antizhir|bagi/i, "/catalog/himiya-chistyashchie-sredstva/zhiroudaliteli"],
  [/airwick|freshmatic|mennyj-ballon|aerosol-osvezh/i, "/catalog/himiya-chistyashchie-sredstva/prochee"],
  [/\bnozh\b|nozh-/i, "/catalog/odnorazovaya-posuda/stolovye-pribory"],
  [/paket-pvd|pvd-s-zamkom|zip-lock/i, "/catalog/pakety-upakovochnye-materialy/pakety-fasovochnye"],
  [/paket-s-kr-ruch|kraft.*ruch|paket-kraft/i, "/catalog/pakety-upakovochnye-materialy/bumazhnye-pakety-s-ruchkoj"],
  [/perednik|fartuk/i, "/catalog/hozyajstvennye-tovary/odnorazovaya-odezhda"],
  [/restorannyj-schet|schet-restoran/i, "/catalog/kancelyarskie-tovary"],
  [/salatnik|salatnitsa/i, "/catalog/odnorazovaya-posuda/tarelki-miski"],
];

function humanizeSlug(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/\b(\d+)l\b/gi, "$1 л")
    .replace(/\b(\d+)ml\b/gi, "$1 мл")
    .replace(/\b(\d+)sm\b/gi, "$1 см")
    .replace(/\b(\d+)mm\b/gi, "$1 мм")
    .replace(/\b(\d+)m\b/gi, "$1 м")
    .replace(/\b(\d+)g\b/gi, "$1 г")
    .replace(/\b(\d+)sht\b/gi, "$1 шт")
    .replace(/\b(\d+)up\b/gi, "$1 уп")
    .replace(/\bpet\b/gi, "ПЭТ")
    .replace(/\bops\b/gi, "ОПС");
}

function normalizeCompact(value) {
  return slugifyStorefrontLabel(String(value || "").replace(/-/g, " ")).replace(/-/g, "");
}

function tokenSet(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .split(/-+/)
      .filter((t) => t.length > 2)
  );
}

function scoreProductMatch(oldSlug, product) {
  const oldNorm = normalizeCompact(oldSlug);
  const nameNorm = normalizeCompact(product.name);
  const codeNorm = normalizeCompact(product.code);
  const nameSlug = slugifyStorefrontLabel(product.name);

  if (!oldNorm) return { score: 0, reason: "" };
  if (oldNorm === nameNorm || oldNorm === codeNorm) {
    return { score: 100, reason: "slug=name|code" };
  }
  if (nameNorm.includes(oldNorm) || oldNorm.includes(nameNorm)) {
    return { score: 88, reason: "substring name" };
  }

  const oldTokens = tokenSet(oldSlug);
  const nameTokens = tokenSet(nameSlug);
  const codeTokens = tokenSet(product.code);
  let hit = 0;
  for (const t of oldTokens) {
    if (nameTokens.has(t) || codeTokens.has(t)) hit += 1;
  }
  if (!oldTokens.size) return { score: 0, reason: "" };
  const ratio = hit / oldTokens.size;

  if (ratio >= 0.75 && hit >= 3) return { score: 78 + hit, reason: `tokens ${hit}/${oldTokens.size}` };
  if (ratio >= 0.62 && hit >= 5) return { score: 74 + hit, reason: `tokens ${hit}/${oldTokens.size}` };
  if (ratio >= 0.55 && hit >= 5) return { score: 68 + hit, reason: `tokens ${hit}/${oldTokens.size}` };

  const slugLower = String(oldSlug || "").toLowerCase();
  const nameSlugLower = nameSlug.toLowerCase();
  const brandHits = [
    "bloknot",
    "shumanit",
    "shpagat",
    "tork",
    "pemolyuks",
    "sanoks",
    "focus",
    "unicum",
    "airwick",
    "marker",
    "vilka",
    "lozhka",
    "salfetki",
    "salfetka",
  ].filter((b) => slugLower.includes(b) && nameSlugLower.includes(b));
  if (brandHits.length >= 2) {
    return { score: 84, reason: `brand:${brandHits.join("+")}` };
  }
  if (brandHits.length === 1 && brandHits[0].length >= 5) {
    return { score: 76, reason: `brand:${brandHits[0]}` };
  }

  const matchedAnchors = [...oldTokens].filter(
    (t) => t.length >= 5 && nameSlug.includes(t)
  );
  if (matchedAnchors.length >= 3) {
    return { score: 80 + matchedAnchors.length, reason: `anchor:${matchedAnchors.slice(0, 3).join("+")}` };
  }

  return { score: 0, reason: "" };
}

function pathFromTaxonomy(category, subcategory) {
  if (!category) return null;
  const route = { name: "catalog", category, subcategory: subcategory || "" };
  return buildStorefrontPath(route);
}

function slugAnchorHits(oldSlug, product) {
  const slugTokens = tokenSet(oldSlug);
  const nameSlugTokens = tokenSet(slugifyStorefrontLabel(product.name));
  const significant = [...slugTokens].filter(
    (t) => t.length >= 4 && !/^\d+$/.test(t) && !["dlya", "sht", "upak", "prozrach", "belyj", "chernyj", "kruglyj"].includes(t)
  );
  let hits = 0;
  for (const t of significant) {
    if (nameSlugTokens.has(t)) hits += 1;
  }
  return { hits, significant: significant.length };
}

const PRODUCT_TYPE_TOKENS = [
  "kontejner",
  "stakan",
  "bloknot",
  "folga",
  "shpagat",
  "polotenca",
  "polotence",
  "salfetki",
  "sousnik",
  "paket",
  "perchatki",
  "shumanit",
  "korobka",
  "lanchboks",
  "tarel",
  "vilka",
  "lozhka",
  "nozh",
  "butylka",
  "forma",
  "vedro",
  "tryapka",
  "shvabra",
  "gubka",
  "halat",
  "perednik",
];

function productTypeConsistent(oldSlug, product) {
  const slug = String(oldSlug || "").toLowerCase();
  const nameSlug = slugifyStorefrontLabel(product?.name || "").toLowerCase();
  for (const token of PRODUCT_TYPE_TOKENS) {
    if (slug.includes(token) && !nameSlug.includes(token)) return false;
  }
  return true;
}

function isExactProductMatch(oldSlug, product, score, margin, reason) {
  if (!product || !productTypeConsistent(oldSlug, product)) return false;
  if (score >= 100 || reason === "slug=name|code") return true;
  if (score >= 88 && reason === "substring name" && margin >= 10) return true;
  if (reason.startsWith("brand:") && score >= 76 && margin >= 5) return true;
  const { hits, significant } = slugAnchorHits(oldSlug, product);
  if (score >= 76 && margin >= 18 && hits >= 4 && significant >= 5) return true;
  if (score >= 80 && margin >= 12 && hits >= 5) return true;
  return false;
}

function scoreCategoryMatch(oldSlug) {
  const slug = String(oldSlug || "").toLowerCase();
  const candidates = [];

  for (const [pattern, catalogPath] of SLUG_FRAGMENT_TO_PATH) {
    if (!pattern.test(slug)) continue;
    if (/dlya-posud|mytya-posud/.test(pattern.source) && /gubk|mochalk/.test(slug)) continue;
    if (/kontejner|rakushk|spk|zapajk/.test(pattern.source) && /lanch-boks|lanchboks/.test(slug)) continue;
    if (/konditer|kapkeyk|eco-cake|pirozhn/.test(pattern.source) && /kontejner|rakushk/.test(slug)) continue;
    if (/butylk|bulytk|flakon/.test(pattern.source) && /stakan|lotok/.test(slug)) continue;
    let score = 85;
    if (/gubk|mochalk/.test(pattern.source)) score = 92;
    else if (/lanch-boks|lanchboks|lotok|stakan/.test(pattern.source)) score = 90;
    candidates.push({ path: catalogPath, score, reason: `keyword:${pattern}` });
  }

  for (const [folderSlug, catalogPath] of Object.entries(MAGAZIN_FOLDER_TO_PATH)) {
    const folderNorm = folderSlug.replace(/-/g, "");
    const slugNorm = slug.replace(/-/g, "");
    if (folderSlug.length >= 5 && slug.includes(folderSlug)) {
      candidates.push({ path: catalogPath, score: 90, reason: `folder:${folderSlug}` });
    }
    const parts = folderSlug.split("-").filter((p) => p.length >= 4);
    const hits = parts.filter((p) => slug.includes(p)).length;
    if (parts.length >= 2 && hits >= 2) {
      candidates.push({ path: catalogPath, score: 75 + hits, reason: `folder-parts:${folderSlug}` });
    }
  }

  for (const entry of listCategorySlugEntries()) {
    for (const child of entry.children) {
      if (child.slug.length >= 5 && slug.includes(child.slug)) {
        candidates.push({
          path: `/catalog/${entry.slug}/${child.slug}`,
          score: 82,
          reason: `subslug:${child.slug}`,
        });
      }
    }
  }

  const human = humanizeSlug(oldSlug);
  const assigned = assignCloverTaxonomy(human);
  if (assigned.category && assigned.category !== "Прочее") {
    const taxPath = pathFromTaxonomy(assigned.category, assigned.subcategory);
    if (taxPath) {
      candidates.push({
        path: taxPath,
        score: assigned.subcategory ? 70 : 55,
        reason: `taxonomy:${assigned.category}/${assigned.subcategory || ""}`,
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function classifyEntry(oldSlug, storeProducts) {
  const oldUrl = `/magazin/product/${oldSlug}`;

  let bestProduct = null;
  let bestProductScore = 0;
  let bestProductReason = "";
  let secondProductScore = 0;

  for (const product of storeProducts) {
    const { score, reason } = scoreProductMatch(oldSlug, product);
    if (score > bestProductScore) {
      secondProductScore = bestProductScore;
      bestProductScore = score;
      bestProduct = product;
      bestProductReason = reason;
    } else if (score > secondProductScore) {
      secondProductScore = score;
    }
  }

  const margin = bestProductScore - secondProductScore;
  const exactProduct =
    bestProduct &&
    isExactProductMatch(
      oldSlug,
      bestProduct,
      bestProductScore,
      margin,
      bestProductReason
    );

  if (exactProduct) {
    return {
      group: "exact_product",
      oldUrl,
      oldSlug,
      target: `${ORIGIN}/product/${encodeURIComponent(bestProduct.code)}`,
      productCode: bestProduct.code,
      productName: bestProduct.name,
      score: bestProductScore,
      reason: bestProductReason,
      margin,
    };
  }

  const cat = scoreCategoryMatch(oldSlug);
  if (cat && cat.score >= 55) {
    return {
      group: "confident_category",
      oldUrl,
      oldSlug,
      target: `${ORIGIN}${cat.path}`,
      categoryPath: cat.path,
      score: cat.score,
      reason: cat.reason,
      productHint: bestProduct
        ? { code: bestProduct.code, name: bestProduct.name, score: bestProductScore }
        : null,
    };
  }

  return {
    group: "not_found",
    oldUrl,
    oldSlug,
    target: `${ORIGIN}/catalog`,
    score: Math.max(bestProductScore, cat?.score || 0),
    reason: cat
      ? `weak-category:${cat.score}/${cat.reason}`
      : bestProduct
        ? `weak-product:${bestProductScore}/${bestProductReason}`
        : "no signal",
    productHint: bestProduct
      ? { code: bestProduct.code, name: bestProduct.name, score: bestProductScore }
      : null,
    categoryHint: cat || null,
  };
}

async function main() {
  const map = JSON.parse(
    fs.readFileSync(path.join(__dirname, "magazin-301-map.json"), "utf8")
  );
  const fallbackSlugs = Object.entries(map.products)
    .filter(([, target]) => target === `${ORIGIN}/catalog`)
    .map(([from]) => from.replace("/magazin/product/", ""));

  const catalog = await fetch(`${API}/api/public/catalog`).then((r) => r.json());
  const storeProducts = catalog.products || [];

  const results = fallbackSlugs.map((slug) => classifyEntry(slug, storeProducts));
  const groups = {
    exact_product: results.filter((r) => r.group === "exact_product"),
    confident_category: results.filter((r) => r.group === "confident_category"),
    not_found: results.filter((r) => r.group === "not_found"),
  };

  const out = {
    generatedAt: new Date().toISOString(),
    inputFallbackCount: fallbackSlugs.length,
    counts: {
      exact_product: groups.exact_product.length,
      confident_category: groups.confident_category.length,
      not_found: groups.not_found.length,
    },
    groups,
  };

  fs.writeFileSync(
    path.join(__dirname, "magazin-fallback-classified.json"),
    JSON.stringify(out, null, 2)
  );

  const md = [
    "# Классификация 191 fallback product URL",
    "",
    `| Группа | Кол-во |`,
    `|--------|-------:|`,
    `| Точный товар | ${out.counts.exact_product} |`,
    `| Уверенная категория/подкатегория | ${out.counts.confident_category} |`,
    `| Не найдено | ${out.counts.not_found} |`,
    "",
  ];
  fs.writeFileSync(path.join(__dirname, "magazin-fallback-classified.md"), md.join("\n"));

  console.log(JSON.stringify(out.counts, null, 2));
  for (const [name, items] of Object.entries(groups)) {
    console.log(`\n=== ${name} (${items.length}) ===`);
    for (const item of items.slice(0, 10)) {
      console.log(`- ${item.oldSlug}`);
      console.log(`  → ${item.target}`);
      if (item.productName) console.log(`  (${item.productName}, score=${item.score})`);
      else console.log(`  (${item.reason}, score=${item.score})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
