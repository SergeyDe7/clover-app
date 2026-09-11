/** Server-owned Stage 5.2-B AUTO SEO metadata seeds. Initial draft quality: AUTO_INITIAL_DRAFT. */

import { TARGET_INTERNAL_LOCALES } from "../../../src/shared/i18n/languageRegistry.js";
import { listSeoCatalogEntries } from "../../../src/shared/i18n/seoCatalog.js";

function seedKey(entityId, fieldKey) {
  return `${String(entityId || "")}\0${String(fieldKey || "")}`;
}

/**
 * Faithful AUTO_INITIAL_DRAFT translations of canonical RU SEO fields only.
 * Preserve `{label}` / `{code}` placeholders exactly.
 * Brand «КЛЕВЕР» kept as КЛЕВЕР (established storefront brand spelling).
 */
const SEEDS = {
  [seedKey("catalog", "descriptionTemplate")]: {
    en: "Catalog “{label}”: household goods, packaging and consumables for HoReCa. Order without registration on the КЛЕВЕР website.",
    uz: "Katalog “{label}”: HoReCa uchun maishiy tovarlar, qadoqlash va sarflanuvchi materiallar. КЛЕВЕР saytida ro‘yxatdan o‘tmasdan buyurtma bering.",
    ky: "Каталог «{label}»: HoReCa үчүн үй чарба товарлары, таңгак жана керектелүүчү материалдар. КЛЕВЕР сайтында катталуусуз заказ кылыңыз.",
    tg: "Каталог «{label}»: молҳои хонагӣ, бастабандӣ ва масрафӣ барои HoReCa. Фармоиш бе қайд дар сомонаи КЛЕВЕР.",
    "zh-CN": "目录「{label}」：面向 HoReCa 的日用品、包装与耗材。可在 КЛЕВЕР 网站免注册下单。",
    ar: "كتالوج «{label}»: سلع منزلية وتغليف ومستلزمات لـ HoReCa. اطلب دون تسجيل على موقع КЛЕВЕР.",
  },
  [seedKey("product", "titleTemplate")]: {
    en: "Product {code} | КЛЕВЕР",
    uz: "Mahsulot {code} | КЛЕВЕР",
    ky: "Товар {code} | КЛЕВЕР",
    tg: "Мол {code} | КЛЕВЕР",
    "zh-CN": "商品 {code} | КЛЕВЕР",
    ar: "منتج {code} | КЛЕВЕР",
  },
  [seedKey("cart", "title")]: {
    en: "Cart | КЛЕВЕР",
    uz: "Savat | КЛЕВЕР",
    ky: "Себет | КЛЕВЕР",
    tg: "Сабад | КЛЕВЕР",
    "zh-CN": "购物车 | КЛЕВЕР",
    ar: "السلة | КЛЕВЕР",
  },
  [seedKey("cart", "description")]: {
    en: "Order cart on the КЛЕВЕР company website.",
    uz: "КЛЕВЕР kompaniyasi saytidagi buyurtma savati.",
    ky: "КЛЕВЕР компаниясынын сайтындагы заказ себети.",
    tg: "Сабади фармоиш дар сомонаи ширкати КЛЕВЕР.",
    "zh-CN": "КЛЕВЕР 公司网站上的订单购物车。",
    ar: "سلة الطلب على موقع شركة КЛЕВЕР.",
  },
  [seedKey("checkout", "title")]: {
    en: "Checkout | КЛЕВЕР",
    uz: "Buyurtmani rasmiylashtirish | КЛЕВЕР",
    ky: "Заказды тариздөө | КЛЕВЕР",
    tg: "Барасмиятдарории фармоиш | КЛЕВЕР",
    "zh-CN": "下单结算 | КЛЕВЕР",
    ar: "إتمام الطلب | КЛЕВЕР",
  },
  [seedKey("checkout", "description")]: {
    en: "Checkout for household goods and packaging for HoReCa.",
    uz: "HoReCa uchun maishiy tovarlar va qadoqlash buyurtmasini rasmiylashtirish.",
    ky: "HoReCa үчүн үй чарба товарларын жана таңгакты заказ кылуу.",
    tg: "Барасмиятдарории фармоиши молҳои хонагӣ ва бастабандӣ барои HoReCa.",
    "zh-CN": "面向 HoReCa 的日用品与包装下单结算。",
    ar: "إتمام طلب السلع المنزلية والتغليف لـ HoReCa.",
  },
  [seedKey("contacts", "title")]: {
    en: "Contacts | КЛЕВЕР",
    uz: "Kontaktlar | КЛЕВЕР",
    ky: "Байланыштар | КЛЕВЕР",
    tg: "Тамос | КЛЕВЕР",
    "zh-CN": "联系方式 | КЛЕВЕР",
    ar: "جهات الاتصال | КЛЕВЕР",
  },
  [seedKey("contacts", "description")]: {
    en: "КЛЕВЕР company contacts: address, phone and directions map.",
    uz: "КЛЕВЕР kompaniyasi kontaktlari: manzil, telefon va yo‘l xaritasi.",
    ky: "КЛЕВЕР компаниясынын байланыштары: дарек, телефон жана жол картасы.",
    tg: "Тамосоти ширкати КЛЕВЕР: суроға, телефон ва харитаи роҳ.",
    "zh-CN": "КЛЕВЕР 公司联系方式：地址、电话与路线地图。",
    ar: "جهات اتصال شركة КЛЕВЕР: العنوان والهاتف وخريطة الوصول.",
  },
  [seedKey("aktsii", "title")]: {
    en: "Promotions | КЛЕВЕР",
    uz: "Aksiyalar | КЛЕВЕР",
    ky: "Акциялар | КЛЕВЕР",
    tg: "Аксияҳо | КЛЕВЕР",
    "zh-CN": "促销活动 | КЛЕВЕР",
    ar: "العروض | КЛЕВЕР",
  },
  [seedKey("aktsii", "description")]: {
    en: "Promotions and special offers from КЛЕВЕР for HoReCa. Current informational materials on clover-spb.ru.",
    uz: "HoReCa uchun КЛЕВЕР kompaniyasining aksiyalari va maxsus takliflari. Dolzarb axborot materiallari clover-spb.ru saytida.",
    ky: "HoReCa үчүн КЛЕВЕР компаниясынын акциялары жана атайын сунуштары. Учурдагы маалымат материалдары clover-spb.ru сайтында.",
    tg: "Аксияҳо ва пешниҳодҳои махсуси ширкати КЛЕВЕР барои HoReCa. Маводҳои иттилоотии ҷорӣ дар clover-spb.ru.",
    "zh-CN": "КЛЕВЕР 面向 HoReCa 的促销与特惠。最新资讯详见 clover-spb.ru。",
    ar: "عروض وعروض خاصة من КЛЕВЕР لـ HoReCa. المواد الإعلامية الحالية على clover-spb.ru.",
  },
};

function assertCompleteSeeds() {
  const entries = listSeoCatalogEntries();
  if (entries.length !== 10) {
    throw new Error(`SEO seed catalog size mismatch: ${entries.length}`);
  }
  for (const entry of entries) {
    const bag = SEEDS[seedKey(entry.entityId, entry.fieldKey)];
    if (!bag) {
      throw new Error(`Missing SEO seed bag for ${entry.entityId}/${entry.fieldKey}`);
    }
    for (const locale of TARGET_INTERNAL_LOCALES) {
      const value = bag[locale];
      if (!value || !String(value).trim()) {
        throw new Error(`Missing SEO seed ${entry.entityId}/${entry.fieldKey}/${locale}`);
      }
      if (entry.sourceRu.includes("{label}") && !String(value).includes("{label}")) {
        throw new Error(`SEO seed lost {label}: ${entry.entityId}/${entry.fieldKey}/${locale}`);
      }
      if (entry.sourceRu.includes("{code}") && !String(value).includes("{code}")) {
        throw new Error(`SEO seed lost {code}: ${entry.entityId}/${entry.fieldKey}/${locale}`);
      }
    }
  }
}

assertCompleteSeeds();

export function hasSeoSeed(entityId, fieldKey) {
  return Boolean(SEEDS[seedKey(entityId, fieldKey)]);
}

export function getSeoSeedTranslation(entityId, fieldKey, locale) {
  const bag = SEEDS[seedKey(entityId, fieldKey)];
  if (!bag) {
    throw new Error(`Unknown SEO seed: ${entityId}/${fieldKey}`);
  }
  const value = bag[locale];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing SEO seed locale: ${entityId}/${fieldKey}/${locale}`);
  }
  return String(value);
}

export function listSeoSeedKeys() {
  return listSeoCatalogEntries().map((entry) => ({
    entityId: entry.entityId,
    fieldKey: entry.fieldKey,
  }));
}
