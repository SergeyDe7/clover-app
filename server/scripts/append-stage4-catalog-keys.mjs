/**
 * One-shot helper used during Stage 4 Task 1 to append catalog + seed keys.
 * Safe to re-run: skips keys that already exist.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const catalogPath = path.join(root, "src/shared/i18n/uiCatalog.js");
const seedPath = path.join(root, "server/src/i18n/uiTranslationSeed.js");

const ENTRIES = [
  ["admin.glossary.context.generic", "Все поля товара", { en: "All product fields", uz: "Barcha mahsulot maydonlari", ky: "Бардык товар талаалары", tg: "Ҳамаи майдонҳои маҳсулот", "zh-CN": "全部商品字段", ar: "كل حقول المنتج" }],
  ["admin.glossary.context.name", "Название", { en: "Name", uz: "Nomi", ky: "Аталышы", tg: "Ном", "zh-CN": "名称", ar: "الاسم" }],
  ["admin.glossary.context.description", "Описание", { en: "Description", uz: "Tavsif", ky: "Сүрөттөмө", tg: "Тавсиф", "zh-CN": "描述", ar: "الوصف" }],
  ["admin.glossary.context.composition", "Состав", { en: "Composition", uz: "Tarkib", ky: "Курам", tg: "Таркиб", "zh-CN": "成分", ar: "التركيب" }],
  ["admin.glossary.context.characteristics", "Характеристики", { en: "Characteristics", uz: "Xususiyatlar", ky: "Мүнөздөмөлөр", tg: "Хусусиятҳо", "zh-CN": "规格", ar: "الخصائص" }],
  ["admin.languages.loadMore", "Показать ещё", { en: "Load more", uz: "Yana yuklash", ky: "Дагы жүктөө", tg: "Бештар бор кардан", "zh-CN": "加载更多", ar: "تحميل المزيد" }],
];

function catalogBlock(key, sourceRu) {
  return `  {
    "key": ${JSON.stringify(key)},
    "sourceRu": ${JSON.stringify(sourceRu)},
    "namespace": "ui",
    "surface": "admin",
    "critical": true
  }`;
}

function seedBlock(key, translations) {
  const lines = Object.entries(translations)
    .map(([locale, value]) => `    ${JSON.stringify(locale)}: ${JSON.stringify(value)}`)
    .join(",\n");
  return `  ${JSON.stringify(key)}: {\n${lines}\n  }`;
}

let catalog = readFileSync(catalogPath, "utf8");
let seed = readFileSync(seedPath, "utf8");
const added = [];

for (const [key, sourceRu, translations] of ENTRIES) {
  if (catalog.includes(`"key": "${key}"`)) continue;
  const block = catalogBlock(key, sourceRu);
  catalog = catalog.replace(
    /\n\];\n\nexport const UI_CATALOG/,
    `,\n${block}\n];\n\nexport const UI_CATALOG`
  );
  if (!seed.includes(`${JSON.stringify(key)}:`)) {
    seed = seed.replace(
      /\n\};\n\nexport const SEED_EXACT_RU_ALLOWLIST/,
      `,\n${seedBlock(key, translations)}\n};\n\nexport const SEED_EXACT_RU_ALLOWLIST`
    );
  }
  added.push(key);
}

writeFileSync(catalogPath, catalog);
writeFileSync(seedPath, seed);
console.log(`STAGE4_CATALOG_ADDED=${added.length}`);
console.log(added.join("\n"));
