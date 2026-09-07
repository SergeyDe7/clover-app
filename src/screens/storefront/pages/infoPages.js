/**
 * Метаданные публичных информационных страниц витрины.
 *
 * Slug'и служат целями 301-редиректов со старого домена cloverspb.ru, поэтому
 * менять их нельзя без обновления docs/seo-migration/cloverspb-production-map.csv.
 * Тексты страниц лежат в infoPageContent.js и грузятся только вместе со страницей.
 */

export const STOREFRONT_INFO_PAGES = [
  {
    slug: "about",
    heading: "О нас",
    title: "О нас",
    description:
      "ООО «КЛЕВЕР» — производство и поставка хозяйственных товаров и бытовой химии в Санкт-Петербурге с 2015 года.",
  },
  {
    slug: "delivery",
    heading: "Доставка",
    title: "Доставка",
    description:
      "Доставка КЛЕВЕР по Санкт-Петербургу: график приёма и доставки заказов, доставка курьером и самовывоз.",
  },
  {
    slug: "payment",
    heading: "Оплата",
    title: "Оплата",
    description:
      "Оплата заказов в компании КЛЕВЕР: безналичный расчёт по счёту для организаций и индивидуальных предпринимателей.",
  },
  {
    slug: "returns",
    heading: "Условия возврата",
    title: "Условия возврата",
    description:
      "Условия обмена и возврата товара в компании КЛЕВЕР: когда товар подлежит возврату и что для этого нужно.",
  },
  {
    slug: "wholesale",
    heading: "Оптовикам",
    title: "Оптовикам",
    description:
      "Оптовые поставки хозяйственных товаров и бытовой химии от компании КЛЕВЕР: специальные цены и гибкие условия работы.",
  },
  {
    slug: "privacy-policy",
    heading: "Политика обработки персональных данных",
    title: "Политика обработки персональных данных",
    description:
      "Политика обработки и защиты персональных данных пользователей сайта компании КЛЕВЕР.",
  },
  {
    slug: "personal-data-consent",
    heading: "Согласие на обработку персональных данных",
    title: "Согласие на обработку персональных данных",
    description:
      "Текст согласия на обработку персональных данных пользователей сайта компании КЛЕВЕР.",
  },
];

export const STOREFRONT_INFO_SLUGS = STOREFRONT_INFO_PAGES.map(
  (page) => page.slug
);

export function findStorefrontInfoPage(slug) {
  const key = String(slug || "").toLowerCase();
  return STOREFRONT_INFO_PAGES.find((page) => page.slug === key) || null;
}
