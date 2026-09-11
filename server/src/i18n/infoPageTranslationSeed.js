/** Server-owned Stage 5.2-A AUTO InfoPage seeds. Initial draft quality: AUTO_INITIAL_DRAFT. */

import { TARGET_INTERNAL_LOCALES } from "../../../src/shared/i18n/languageRegistry.js";
import {
  INFO_PAGE_FIELD_KEYS,
  listInfoPageCatalogEntries,
} from "../../../src/shared/i18n/infoPageCatalog.js";

function seedKey(slug, fieldKey) {
  return `${String(slug || "")}\0${String(fieldKey || "")}`;
}

/**
 * Faithful AUTO_INITIAL_DRAFT translations of canonical RU registry fields only.
 * No new factual/legal/commercial claims beyond the Russian source.
 */
const SEEDS = {
  [seedKey("about", "heading")]: {
    en: "About us",
    uz: "Biz haqimizda",
    ky: "Биз жөнүндө",
    tg: "Дар бораи мо",
    "zh-CN": "关于我们",
    ar: "من نحن",
  },
  [seedKey("about", "title")]: {
    en: "About us",
    uz: "Biz haqimizda",
    ky: "Биз жөнүндө",
    tg: "Дар бораи мо",
    "zh-CN": "关于我们",
    ar: "من نحن",
  },
  [seedKey("about", "description")]: {
    en: "OOO “KLEVER” — production and supply of household goods and household chemicals in Saint Petersburg since 2015.",
    uz: "OOO “KLEVER” — 2015-yildan buyon Sankt-Peterburgda maishiy tovarlar va maishiy kimyo ishlab chiqarish va yetkazib berish.",
    ky: "ООО «КЛЕВЕР» — 2015-жылдан бери Санкт-Петербургда үй чарба товарларын жана турмуш-тиричилик химиясын өндүрүү жана жеткирүү.",
    tg: "ООО «КЛЕВЕР» — истеҳсол ва таъмини молҳои хонагӣ ва кимиёи рӯзгор дар Санкт-Петербург аз соли 2015.",
    "zh-CN": "ООО «КЛЕВЕР» — 自2015年起在圣彼得堡生产并供应家居用品与日用化学品。",
    ar: "شركة ذات مسؤولية محدودة «كليفّر» — إنتاج وتوريد السلع المنزلية والمواد الكيميائية المنزلية في سانت بطرسبرغ منذ عام 2015.",
  },

  [seedKey("delivery", "heading")]: {
    en: "Delivery",
    uz: "Yetkazib berish",
    ky: "Жеткирүү",
    tg: "Расондан",
    "zh-CN": "配送",
    ar: "التوصيل",
  },
  [seedKey("delivery", "title")]: {
    en: "Delivery",
    uz: "Yetkazib berish",
    ky: "Жеткирүү",
    tg: "Расондан",
    "zh-CN": "配送",
    ar: "التوصيل",
  },
  [seedKey("delivery", "description")]: {
    en: "KLEVER delivery across Saint Petersburg: order acceptance and delivery schedule, courier delivery and pickup.",
    uz: "KLEVER yetkazib berish Sankt-Peterburg bo‘ylab: buyurtmalarni qabul qilish va yetkazib berish jadvali, kuryer va o‘zi olib ketish.",
    ky: "КЛЕВЕР жеткирүүсү Санкт-Петербург боюнча: буйрутмаларды кабыл алуу жана жеткирүү графиги, курьер жана өзү алып кетүү.",
    tg: "Расондани КЛЕВЕР дар Санкт-Петербург: ҷадвали қабул ва расондани фармоишҳо, расондани курьерӣ ва худгирӣ.",
    "zh-CN": "КЛЕВЕР在圣彼得堡的配送：接单与配送时间表、快递配送与自提。",
    ar: "توصيل كليفّر في سانت بطرسبرغ: جدول استلام وتسليم الطلبات، التوصيل بالساعي والاستلام الذاتي.",
  },

  [seedKey("payment", "heading")]: {
    en: "Payment",
    uz: "To‘lov",
    ky: "Төлөм",
    tg: "Пардохт",
    "zh-CN": "付款",
    ar: "الدفع",
  },
  [seedKey("payment", "title")]: {
    en: "Payment",
    uz: "To‘lov",
    ky: "Төлөм",
    tg: "Пардохт",
    "zh-CN": "付款",
    ar: "الدفع",
  },
  [seedKey("payment", "description")]: {
    en: "Paying for orders at KLEVER: non-cash payment by invoice for organizations and individual entrepreneurs.",
    uz: "KLEVER kompaniyasida buyurtmalar uchun to‘lov: tashkilotlar va yakka tartibdagi tadbirkorlar uchun hisob-faktura bo‘yicha naqdussiz hisob-kitob.",
    ky: "КЛЕВЕР компаниясында буйрутмалар үчүн төлөм: уюмдар жана жеке ишкерлер үчүн эсеп боюнча накд эмес эсептешүү.",
    tg: "Пардохти фармоишҳо дар ширкати КЛЕВЕР: ҳисоббаробаркунии ғайринақдӣ тибқи ҳисобнома барои ташкилотҳо ва соҳибкорони инфиродӣ.",
    "zh-CN": "在КЛЕВЕР支付订单：面向机构与个体经营者的按账单非现金结算。",
    ar: "دفع الطلبات لدى كليفّر: تسوية غير نقدية بموجب فاتورة للمؤسسات ورجال الأعمال الأفراد.",
  },

  [seedKey("returns", "heading")]: {
    en: "Return terms",
    uz: "Qaytarish shartlari",
    ky: "Кайтаруу шарттары",
    tg: "Шартҳои бозгардонӣ",
    "zh-CN": "退货条件",
    ar: "شروط الإرجاع",
  },
  [seedKey("returns", "title")]: {
    en: "Return terms",
    uz: "Qaytarish shartlari",
    ky: "Кайтаруу шарттары",
    tg: "Шартҳои бозгардонӣ",
    "zh-CN": "退货条件",
    ar: "شروط الإرجاع",
  },
  [seedKey("returns", "description")]: {
    en: "Exchange and return terms at KLEVER: when goods may be returned and what is required.",
    uz: "KLEVER kompaniyasida tovarni almashtirish va qaytarish shartlari: tovar qachon qaytarilishi mumkin va buning uchun nima kerak.",
    ky: "КЛЕВЕР компаниясында товарды алмаштыруу жана кайтаруу шарттары: товар качан кайтарылууга жатат жана бул үчүн эмне керек.",
    tg: "Шартҳои иваз ва бозгардонии мол дар ширкати КЛЕВЕР: кай мол бозгардонида мешавад ва барои ин чӣ лозим аст.",
    "zh-CN": "КЛЕВЕР的换货与退货条件：商品何时可退以及需要什么。",
    ar: "شروط الاستبدال والإرجاع لدى كليفّر: متى يمكن إرجاع البضاعة وما المطلوب لذلك.",
  },

  [seedKey("wholesale", "heading")]: {
    en: "For wholesalers",
    uz: "Ulgurji xaridorlarga",
    ky: "Дүң сатуучуларга",
    tg: "Барои оптовикон",
    "zh-CN": "面向批发商",
    ar: "للجملة",
  },
  [seedKey("wholesale", "title")]: {
    en: "For wholesalers",
    uz: "Ulgurji xaridorlarga",
    ky: "Дүң сатуучуларга",
    tg: "Барои оптовикон",
    "zh-CN": "面向批发商",
    ar: "للجملة",
  },
  [seedKey("wholesale", "description")]: {
    en: "Wholesale supply of household goods and household chemicals from KLEVER: special prices and flexible terms.",
    uz: "KLEVER kompaniyasidan maishiy tovarlar va maishiy kimyo ulgurji yetkazib berish: maxsus narxlar va moslashuvchan shartlar.",
    ky: "КЛЕВЕР компаниясынан үй чарба товарлары жана турмуш-тиричилик химиясынын дүң жеткирүүлөрү: атайын баалар жана ийкемдүү шарттар.",
    tg: "Таъминҳои оптовии молҳои хонагӣ ва кимиёи рӯзгор аз ширкати КЛЕВЕР: нархҳои махсус ва шартҳои чандир.",
    "zh-CN": "КЛЕВЕР的家居用品与日用化学品批发供应：特价与灵活条件。",
    ar: "التوريد بالجملة للسلع المنزلية والمواد الكيميائية المنزلية من كليفّر: أسعار خاصة وشروط مرنة.",
  },

  [seedKey("privacy-policy", "heading")]: {
    en: "Personal data processing policy",
    uz: "Shaxsiy ma’lumotlarni qayta ishlash siyosati",
    ky: "Жеке маалыматтарды иштетүү саясаты",
    tg: "Сиёсати коркарди маълумоти шахсӣ",
    "zh-CN": "个人数据处理政策",
    ar: "سياسة معالجة البيانات الشخصية",
  },
  [seedKey("privacy-policy", "title")]: {
    en: "Personal data processing policy",
    uz: "Shaxsiy ma’lumotlarni qayta ishlash siyosati",
    ky: "Жеке маалыматтарды иштетүү саясаты",
    tg: "Сиёсати коркарди маълумоти шахсӣ",
    "zh-CN": "个人数据处理政策",
    ar: "سياسة معالجة البيانات الشخصية",
  },
  [seedKey("privacy-policy", "description")]: {
    en: "Policy on processing and protecting personal data of users of the KLEVER company website.",
    uz: "KLEVER kompaniyasi sayti foydalanuvchilarining shaxsiy ma’lumotlarini qayta ishlash va himoya qilish siyosati.",
    ky: "КЛЕВЕР компаниясынын сайтынын колдонуучуларынын жеке маалыматтарын иштетүү жана коргоо саясаты.",
    tg: "Сиёсати коркард ва ҳифзи маълумоти шахсии истифодабарандагони сомонаи ширкати КЛЕВЕР.",
    "zh-CN": "КЛЕВЕР公司网站用户个人数据处理与保护政策。",
    ar: "سياسة معالجة وحماية البيانات الشخصية لمستخدمي موقع شركة كليفّر.",
  },

  [seedKey("personal-data-consent", "heading")]: {
    en: "Consent to personal data processing",
    uz: "Shaxsiy ma’lumotlarni qayta ishlashga rozilik",
    ky: "Жеке маалыматтарды иштетүүгө макулдук",
    tg: "Розигӣ ба коркарди маълумоти шахсӣ",
    "zh-CN": "个人数据处理同意书",
    ar: "الموافقة على معالجة البيانات الشخصية",
  },
  [seedKey("personal-data-consent", "title")]: {
    en: "Consent to personal data processing",
    uz: "Shaxsiy ma’lumotlarni qayta ishlashga rozilik",
    ky: "Жеке маалыматтарды иштетүүгө макулдук",
    tg: "Розигӣ ба коркарди маълумоти шахсӣ",
    "zh-CN": "个人数据处理同意书",
    ar: "الموافقة على معالجة البيانات الشخصية",
  },
  [seedKey("personal-data-consent", "description")]: {
    en: "Consent text for processing personal data of users of the KLEVER company website.",
    uz: "KLEVER kompaniyasi sayti foydalanuvchilarining shaxsiy ma’lumotlarini qayta ishlashga rozilik matni.",
    ky: "КЛЕВЕР компаниясынын сайтынын колдонуучуларынын жеке маалыматтарын иштетүүгө макулдук тексти.",
    tg: "Матни розигӣ ба коркарди маълумоти шахсии истифодабарандагони сомонаи ширкати КЛЕВЕР.",
    "zh-CN": "КЛЕВЕР公司网站用户个人数据处理同意文本。",
    ar: "نص الموافقة على معالجة البيانات الشخصية لمستخدمي موقع شركة كليفّر.",
  },
};

function assertCompleteSeedCorpus() {
  const entries = listInfoPageCatalogEntries();
  for (const entry of entries) {
    const row = SEEDS[seedKey(entry.entityId, entry.fieldKey)];
    if (!row) {
      throw new Error(`Missing info page seed row for ${entry.entityId}/${entry.fieldKey}`);
    }
    for (const locale of TARGET_INTERNAL_LOCALES) {
      const value = row[locale];
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(
          `Missing info page seed for ${entry.entityId}/${entry.fieldKey}/${locale}`
        );
      }
    }
  }
  for (const fieldKey of INFO_PAGE_FIELD_KEYS) {
    void fieldKey;
  }
}

assertCompleteSeedCorpus();

export function hasInfoPageSeed(slug, fieldKey) {
  const row = SEEDS[seedKey(slug, fieldKey)];
  if (!row) return false;
  return TARGET_INTERNAL_LOCALES.every(
    (locale) => typeof row[locale] === "string" && row[locale].trim() !== ""
  );
}

export function getInfoPageSeedTranslation(slug, fieldKey, internalLocale) {
  const row = SEEDS[seedKey(slug, fieldKey)];
  if (!row) return "";
  const value = row[String(internalLocale || "")];
  return typeof value === "string" ? value : "";
}

export function listInfoPageSeedKeys() {
  return Object.keys(SEEDS).sort();
}
