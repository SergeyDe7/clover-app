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
  ["shared.unit.piece", "штука", { en: "piece", uz: "dona", ky: "даана", tg: "дона", "zh-CN": "件", ar: "قطعة" }],
  ["shared.unit.pieceShort", "шт.", { en: "pc.", uz: "dona", ky: "д.", tg: "д.", "zh-CN": "件", ar: "ق." }],
  ["shared.unit.pair", "пара", { en: "pair", uz: "juft", ky: "жуп", tg: "ҷуфт", "zh-CN": "双", ar: "زوج" }],
  ["shared.unit.pairShort", "пар.", { en: "pr.", uz: "juft", ky: "ж.", tg: "ҷ.", "zh-CN": "双", ar: "ز." }],
  ["shared.unit.meter", "метр", { en: "meter", uz: "metr", ky: "метр", tg: "метр", "zh-CN": "米", ar: "متر" }],
  ["shared.unit.meterShort", "м", { en: "m", uz: "m", ky: "м", tg: "м", "zh-CN": "米", ar: "م" }],
  ["shared.unit.roll", "рулон", { en: "roll", uz: "rulon", ky: "рулон", tg: "рулон", "zh-CN": "卷", ar: "لفة" }],
  ["shared.unit.rollShort", "рул.", { en: "rl.", uz: "rul.", ky: "рул.", tg: "рул.", "zh-CN": "卷", ar: "لف." }],
  ["shared.unit.pack", "упаковка", { en: "pack", uz: "qadoq", ky: "пакет", tg: "баста", "zh-CN": "包装", ar: "عبوة" }],
  ["shared.unit.packShort", "уп.", { en: "pk.", uz: "up.", ky: "уп.", tg: "уп.", "zh-CN": "包", ar: "عب." }],
  ["shared.unit.bundle", "пачка", { en: "bundle", uz: "bog‘lam", ky: "боо", tg: "баста", "zh-CN": "捆", ar: "ربطة" }],
  ["shared.unit.bundleShort", "пач.", { en: "bd.", uz: "bog‘.", ky: "боо", tg: "б.", "zh-CN": "捆", ar: "رب." }],
  ["shared.unit.box", "коробка", { en: "box", uz: "quti", ky: "куту", tg: "қуттӣ", "zh-CN": "箱", ar: "صندوق" }],
  ["shared.unit.boxShort", "кор.", { en: "bx.", uz: "quti", ky: "кут.", tg: "қут.", "zh-CN": "箱", ar: "ص." }],
  ["admin.languages.view.products", "Товары", { en: "Products", uz: "Mahsulotlar", ky: "Товарлар", tg: "Маҳсулот", "zh-CN": "商品", ar: "المنتجات" }],
  ["admin.productTranslations.title", "Переводы", { en: "Translations", uz: "Tarjimalar", ky: "Котормолор", tg: "Тарҷумаҳо", "zh-CN": "翻译", ar: "الترجمات" }],
  ["admin.productTranslations.lead", "Русский текст остаётся источником. Переводы только для витрины.", { en: "Russian remains the source. Translations are display-only.", uz: "Ruscha manba bo‘lib qoladi. Tarjimalar faqat ko‘rsatish uchun.", ky: "Орусча булак бойдон калат. Котормолор көрсөтүү үчүн гана.", tg: "Русӣ манбаъ мемонад. Тарҷумаҳо танҳо барои намоиш.", "zh-CN": "俄语仍是原文。翻译仅用于展示。", ar: "تبقى الروسية المصدر. الترجمات للعرض فقط." }],
  ["admin.productTranslations.field.name", "Название", { en: "Name", uz: "Nomi", ky: "Аталышы", tg: "Ном", "zh-CN": "名称", ar: "الاسم" }],
  ["admin.productTranslations.field.description", "Описание", { en: "Description", uz: "Tavsif", ky: "Сүрөттөмө", tg: "Тавсиф", "zh-CN": "描述", ar: "الوصف" }],
  ["admin.productTranslations.field.composition", "Состав", { en: "Composition", uz: "Tarkib", ky: "Курам", tg: "Таркиб", "zh-CN": "成分", ar: "التركيب" }],
  ["admin.productTranslations.field.characteristics", "Характеристики", { en: "Characteristics", uz: "Xususiyatlar", ky: "Мүнөздөмөлөр", tg: "Хусусиятҳо", "zh-CN": "规格", ar: "الخصائص" }],
  ["admin.productTranslations.staleWarning", "Русский источник изменился. Проверьте перевод.", { en: "The Russian source changed. Review this translation.", uz: "Ruscha manba o‘zgardi. Tarjimani tekshiring.", ky: "Орусча булак өзгөрдү. Котормону текшериңиз.", tg: "Манбаи русӣ тағйир ёфт. Тарҷумаро санҷед.", "zh-CN": "俄语原文已更改。请核对翻译。", ar: "تغير المصدر الروسي. راجع الترجمة." }],
  ["admin.productTranslations.returnToAuto", "Вернуть к AUTO", { en: "Return to AUTO", uz: "AUTO ga qaytarish", ky: "AUTO'го кайтаруу", tg: "Бозгашт ба AUTO", "zh-CN": "恢复为 AUTO", ar: "العودة إلى AUTO" }],
  ["admin.glossary.add", "Добавить в словарь", { en: "Add to glossary", uz: "Lug‘atga qo‘shish", ky: "Сөздүккө кошуу", tg: "Ба луғат илова кунед", "zh-CN": "添加到词典", ar: "إضافة إلى المعجم" }],
  ["admin.glossary.delete", "Удалить", { en: "Delete", uz: "O‘chirish", ky: "Өчүрүү", tg: "Нест кардан", "zh-CN": "删除", ar: "حذف" }],
  ["admin.glossary.source", "Русская фраза", { en: "Russian phrase", uz: "Ruscha ibora", ky: "Орусча фраза", tg: "Ибораи русӣ", "zh-CN": "俄语短语", ar: "العبارة الروسية" }],
  ["admin.glossary.target", "Перевод", { en: "Translation", uz: "Tarjima", ky: "Котормо", tg: "Тарҷума", "zh-CN": "译文", ar: "الترجمة" }],
  ["admin.glossary.context", "Контекст", { en: "Context", uz: "Kontekst", ky: "Контекст", tg: "Контекст", "zh-CN": "语境", ar: "السياق" }],
  ["admin.glossary.protected", "Защищённый термин", { en: "Protected term", uz: "Himoyalangan atama", ky: "Корголгон термин", tg: "Истилоҳи ҳифзшуда", "zh-CN": "受保护术语", ar: "مصطلح محمي" }],
  ["admin.glossary.empty", "В словаре пока нет записей.", { en: "The glossary is empty.", uz: "Lug‘at hozircha bo‘sh.", ky: "Сөздүктө жазуу жок.", tg: "Луғат ҳоло холӣ аст.", "zh-CN": "词典暂无条目。", ar: "المعجم فارغ." }],
  ["admin.glossary.saved", "Запись словаря сохранена.", { en: "Glossary entry saved.", uz: "Lug‘at yozuvi saqlandi.", ky: "Сөздүк жазуусу сакталды.", tg: "Сабти луғат нигоҳ дошта шуд.", "zh-CN": "词典条目已保存。", ar: "تم حفظ مدخل المعجم." }],
  ["admin.glossary.deleted", "Запись словаря удалена.", { en: "Glossary entry deleted.", uz: "Lug‘at yozuvi o‘chirildi.", ky: "Сөздүк жазуусу өчүрүлдү.", tg: "Сабти луғат нест карда шуд.", "zh-CN": "词典条目已删除。", ar: "تم حذف مدخل المعجم." }],
  ["admin.glossary.saveFailed", "Не удалось сохранить словарь.", { en: "Could not save the glossary.", uz: "Lug‘atni saqlab bo‘lmadi.", ky: "Сөздүктү сактоо мүмкүн болбоду.", tg: "Луғатро нигоҳ доштан нашуд.", "zh-CN": "无法保存词典。", ar: "تعذر حفظ المعجم." }],
  ["admin.glossary.confirmDelete", "Удалить эту запись словаря?", { en: "Delete this glossary entry?", uz: "Bu lug‘at yozuvi o‘chirilsinmi?", ky: "Бул сөздүк жазуусу өчүрүлсүнбү?", tg: "Ин сабти луғат нест карда шавад?", "zh-CN": "删除这条词典记录？", ar: "حذف مدخل المعجم هذا؟" }],
  ["admin.productTranslations.sourceStale", "Русский источник изменился. Черновик сохранён — обновите экран и проверьте текст.", { en: "The Russian source changed. Your draft is kept — reload and review it.", uz: "Ruscha manba o‘zgardi. Qoralama saqlanadi — yangilang va tekshiring.", ky: "Орусча булак өзгөрдү. Долбоор сакталды — экранды жаңыртып текшериңиз.", tg: "Манбаи русӣ тағйир ёфт. Лоиҳа нигоҳ дошта шуд — навсозӣ кунед ва санҷед.", "zh-CN": "俄语原文已更改。草稿已保留，请刷新后核对。", ar: "تغير المصدر الروسي. تم الاحتفاظ بالمسودة — حدّث الصفحة وراجعها." }],
  ["admin.productTranslations.notApplicable", "Нет русского источника — перевод не создаётся.", { en: "No Russian source — translation is not applicable.", uz: "Ruscha manba yo‘q — tarjima yaratilmaydi.", ky: "Орусча булак жок — котормо түзүлбөйт.", tg: "Манбаи русӣ нест — тарҷума сохта намешавад.", "zh-CN": "没有俄语原文，不可创建翻译。", ar: "لا يوجد مصدر روسي — لا تُنشأ ترجمة." }],
  ["admin.glossary.edit", "Изменить", { en: "Edit", uz: "Tahrirlash", ky: "Оңдоо", tg: "Таҳрир", "zh-CN": "编辑", ar: "تعديل" }],
  ["admin.glossary.cancel", "Отмена", { en: "Cancel", uz: "Bekor qilish", ky: "Жокко чыгаруу", tg: "Бекор кардан", "zh-CN": "取消", ar: "إلغاء" }],
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
