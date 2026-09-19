/**
 * Localized info-page body blocks (AUTO_INITIAL_DRAFT).
 * Canonical source: src/screens/storefront/pages/infoPageContent.js (RU).
 *
 * Legal pages (privacy-policy, personal-data-consent): translations are NOT
 * legally certified — legalReviewVerified=false.
 * Returns terms also require owner review — ownerReviewRequired=true.
 */

import { exactTranslationTargetInternal, toPublicLocaleCode } from "../../../src/shared/i18n/languageRegistry.js";
import { LEGAL_INFO_PAGE_BODIES } from "./legalInfoPageBodyTranslations.js";

const CONTACTS = { name: "contacts" };

/** @type {Record<string, Record<string, Array<object>>>} */
const BODY = {
  returns: {
    en: [
      {
        type: "lead",
        text: "We value every customer and are ready to accommodate you. If a product does not suit you for any reason, or you want to exchange it, we are ready to do so.",
      },
      {
        type: "p",
        text: "Goods may be exchanged or returned if the original packaging, box and saleable condition remain intact.",
      },
      { type: "route", route: CONTACTS, label: "Contact us" },
    ],
    uz: [
      {
        type: "lead",
        text: "Biz har bir mijozni qadrlaymiz va yordam berishga tayyormiz. Agar biror sababga ko‘ra tovar sizga mos kelmasa yoki uni almashtirmoqchi bo‘lsangiz, biz buni qilishga tayyormiz.",
      },
      {
        type: "p",
        text: "Agar qadoq, quti va tovarning tashqi ko‘rinishi saqlangan bo‘lsa, tovarni almashtirish yoki qaytarish mumkin.",
      },
      { type: "route", route: CONTACTS, label: "Biz bilan bog‘laning" },
    ],
    ky: [
      {
        type: "lead",
        text: "Биз ар бир кардарды баалайбыз жана жардам берүүгө даярбыз. Эгер кандайдыр бир себептен товар сизге туура келбесе же аны алмаштыргыңыз келсе, биз муну жасоого даярбыз.",
      },
      {
        type: "p",
        text: "Эгер таңгак, куту жана товардын сатууга жарактуу көрүнүшү сакталса, товарды алмаштырууга же кайтарууга болот.",
      },
      { type: "route", route: CONTACTS, label: "Биз менен байланышыңыз" },
    ],
    tg: [
      {
        type: "lead",
        text: "Мо ҳар як муштариро қадр мекунем ва омодаем кӯмак расонем. Агар бо ягон сабаб мол ба шумо мувофиқ наояд ё хоҳед онро иваз кунед, мо омодаем ин корро иҷро кунем.",
      },
      {
        type: "p",
        text: "Агар баста, қуттӣ ва зоҳири мол нигоҳ дошта шуда бошанд, молро иваз кардан ё баргардондан мумкин аст.",
      },
      { type: "route", route: CONTACTS, label: "Бо мо тамос гиред" },
    ],
    "zh-CN": [
      {
        type: "lead",
        text: "我们珍视每位客户，并愿意为您提供帮助。若商品因任何原因不合适，或您希望换货，我们愿意办理。",
      },
      {
        type: "p",
        text: "在原包装、纸箱完整且保持可售外观的前提下，商品可以换货或退货。",
      },
      { type: "route", route: CONTACTS, label: "联系我们" },
    ],
    ar: [
      {
        type: "lead",
        text: "نُقدّر كل عميل ونحن مستعدون لمساعدته. إذا لم يناسبك المنتج لأي سبب، أو رغبت في استبداله، فنحن مستعدون لذلك.",
      },
      {
        type: "p",
        text: "يمكن استبدال البضاعة أو إرجاعها إذا بقيت العبوة والعلبة والمظهر القابل للبيع سليمة.",
      },
      { type: "route", route: CONTACTS, label: "تواصل معنا" },
    ],
  },

  wholesale: {
    en: [
      {
        type: "lead",
        text: "We offer special prices and flexible terms for wholesale customers.",
      },
      {
        type: "p",
        text: "To discuss cooperation terms and receive a price list, contact us using whichever method is most convenient for you.",
      },
      { type: "route", route: CONTACTS, label: "Contact us" },
    ],
    uz: [
      {
        type: "lead",
        text: "Ulgurji mijozlar uchun maxsus narxlar va moslashuvchan shartlarni taklif qilamiz.",
      },
      {
        type: "p",
        text: "Hamkorlik shartlarini muhokama qilish va narxlar ro‘yxatini olish uchun qulay usulda biz bilan bog‘laning.",
      },
      { type: "route", route: CONTACTS, label: "Biz bilan bog‘laning" },
    ],
    ky: [
      {
        type: "lead",
        text: "Биз дүң кардарлар үчүн атайын баалар жана ийкемдүү шарттарды сунуштайбыз.",
      },
      {
        type: "p",
        text: "Кызматташуу шарттарын талкуулап, баа тизмесин алуу үчүн ыңгайлуу жол менен биз менен байланышыңыз.",
      },
      { type: "route", route: CONTACTS, label: "Биз менен байланышыңыз" },
    ],
    tg: [
      {
        type: "lead",
        text: "Мо ба харидорони яклухт нархҳои махсус ва шартҳои мувофиқ пешниҳод мекунем.",
      },
      {
        type: "p",
        text: "Барои муҳокимаи шартҳои ҳамкорӣ ва гирифтани рӯйхати нархҳо бо роҳи қулай бо мо тамос гиред.",
      },
      { type: "route", route: CONTACTS, label: "Бо мо тамос гиред" },
    ],
    "zh-CN": [
      {
        type: "lead",
        text: "我们为批发客户提供特价与灵活合作条件。",
      },
      {
        type: "p",
        text: "如需讨论合作条件并获取价目表，请通过您方便的方式联系我们。",
      },
      { type: "route", route: CONTACTS, label: "联系我们" },
    ],
    ar: [
      {
        type: "lead",
        text: "نقدم أسعاراً خاصة وشروطاً مرنة لعملاء الجملة.",
      },
      {
        type: "p",
        text: "لمناقشة شروط التعاون والحصول على قائمة الأسعار، تواصل معنا بالطريقة المناسبة لك.",
      },
      { type: "route", route: CONTACTS, label: "تواصل معنا" },
    ],
  },

  ...LEGAL_INFO_PAGE_BODIES
};

/** Pages whose body translations need owner / legal review. */
export const INFO_BODY_REVIEW_FLAGS = Object.freeze({
  returns: {
    legalReviewVerified: false,
    ownerReviewRequired: true,
    note: "Return/exchange terms — owner must verify before treating as binding.",
  },
  "privacy-policy": {
    legalReviewVerified: false,
    ownerReviewRequired: true,
    note: "AUTO draft aligned with RU 2026-09-19 requisites/storage rewrite; not a certified legal translation.",
  },
  "personal-data-consent": {
    legalReviewVerified: false,
    ownerReviewRequired: true,
    note: "AUTO draft aligned with RU 2026-09-19 consent rewrite; not a certified legal translation.",
  },
});

export function getInfoPageBodyBlocks(slug, language) {
  const key = String(slug || "").trim();
  const row = BODY[key];
  if (!row) return null;
  const internal = exactTranslationTargetInternal(language);
  if (!internal) return null;
  const blocks = row[internal];
  return Array.isArray(blocks) && blocks.length ? blocks : null;
}

export function listInfoPageBodySlugs() {
  return Object.keys(BODY).sort();
}

export function infoBodyPublicLocale(language) {
  return toPublicLocaleCode(language) || "";
}
