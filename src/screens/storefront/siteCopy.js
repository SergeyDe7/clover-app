/** Тексты главной витрины. Пустые настройки в админке показывают этот fallback. */
export const STOREFRONT_HERO_TITLE =
  "Хозтовары, упаковка и химия для HoReCa";

export const STOREFRONT_HERO_LEAD =
  "Компания КЛЕВЕР поставляет расходные материалы для кафе, ресторанов и отелей: одноразовую посуду, упаковку, бытовую химию и хозяйственные товары. Заказывайте с сайта без регистрации — или через личный кабинет.";

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
