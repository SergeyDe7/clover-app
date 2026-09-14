/** Тексты главной витрины. Пустые настройки в админке показывают этот fallback. */

const HERO_COPY = Object.freeze({
  ru: Object.freeze({
    title: "Хозтовары, упаковка и химия для HoReCa",
    lead:
      "Компания КЛЕВЕР поставляет расходные материалы для кафе, ресторанов и отелей: одноразовую посуду, упаковку, бытовую химию и хозяйственные товары. Заказывайте с сайта без регистрации — или через личный кабинет.",
  }),
  // Machine drafts from RU source (AUTO). Not native-speaker verified.
  en: Object.freeze({
    title: "Household goods, packaging and chemicals for HoReCa",
    lead:
      "КЛЕВЕР supplies consumables for cafés, restaurants and hotels: disposable tableware, packaging, household chemicals and household goods. Order from the site without registration — or via the client portal.",
  }),
  uz: Object.freeze({
    title: "HoReCa uchun maishiy tovarlar, qadoqlash va kimyoviy vositalar",
    lead:
      "КЛЕВЕР kafelar, restoranlar va mehmonxonalar uchun sarf materiallari yetkazib beradi: bir martalik idishlar, qadoqlash, maishiy kimyo va maishiy tovarlar. Saytdan ro‘yxatdan o‘tmasdan buyurtma bering — yoki shaxsiy kabinet orqali.",
  }),
  ky: Object.freeze({
    title: "HoReCa үчүн үй чарба товарлары, таңгактоо жана химия",
    lead:
      "КЛЕВЕР кафе, ресторан жана мейманканалар үчүн сарпталуучу материалдарды жеткирет: бир жолу колдонулуучу идиштер, таңгак, үй химиясы жана үй чарба товарлары. Сайттан каттоосуз заказ кылыңыз — же жеке кабинет аркылуу.",
  }),
  tg: Object.freeze({
    title: "Молҳои хонагӣ, бастабандӣ ва кимиё барои HoReCa",
    lead:
      "КЛЕВЕР барои қаҳвахонаҳо, тарабхонаҳо ва меҳмонхонаҳо маводи масрафӣ мерасонад: зарфҳои якмаротиба, бастабандӣ, кимиёи хонагӣ ва молҳои хонагӣ. Аз сайт бе бақайдгирӣ фармоиш диҳед — ё тавассути кабинети шахсӣ.",
  }),
  zh: Object.freeze({
    title: "面向 HoReCa 的日用品、包装与清洁化学品",
    lead:
      "КЛЕВЕР 为咖啡馆、餐厅和酒店供应耗材：一次性餐具、包装、家用化学品与日用品。可在网站免注册下单，也可通过客户柜下单。",
  }),
  ar: Object.freeze({
    title: "سلع منزلية وتغليف ومواد كيميائية لـ HoReCa",
    lead:
      "توفر КЛЕВЕР مستهلكات للمقاهي والمطاعم والفنادق: أوانٍ للاستخدام مرة واحدة، وتغليف، ومواد تنظيف، وسلع منزلية. اطلب من الموقع دون تسجيل — أو عبر بوابة العميل.",
  }),
});

export const STOREFRONT_HERO_TITLE = HERO_COPY.ru.title;
export const STOREFRONT_HERO_LEAD = HERO_COPY.ru.lead;

/** Localized default hero when CMS heroTitle/heroLead are empty. */
export function storefrontHeroCopy(locale = "ru") {
  const code = String(locale || "ru").trim() === "zh-CN" ? "zh" : String(locale || "ru").trim();
  return HERO_COPY[code] || HERO_COPY.ru;
}

/** Примеры слайдов баннера. Админ может заменить их своими картинками. */
export const STOREFRONT_DEFAULT_HERO_SLIDES = [
  {
    src: "/storefront/hero-horeca.png",
    alt: "Расходники для кафе и ресторанов",
  },
  {
    src: "/storefront/hero-packaging.webp",
    alt: "Упаковка и одноразовая посуда",
  },
  {
    src: "/storefront/hero-chemistry.webp",
    alt: "Химия и чистящие средства",
  },
];

export const STOREFRONT_DEFAULT_HERO_INTERVAL_SEC = 6;
export const STOREFRONT_MAX_HERO_SLIDES = 8;

/** Normalize slide href for hero navigation. First slide defaults to /install-app. */
export function resolveStorefrontHeroSlideHref(slide, index = 0) {
  const raw = String(slide?.href || "").trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) return raw;
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
  if (Number(index) === 0) return "/install-app";
  return "";
}
