/**
 * SEO-тексты карточек товара витрины (SSR + клиент).
 * Не влияет на цены, корзину и заказы.
 */

function truncate(text, max = 160) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

/**
 * Уникальный meta description: кастомный текст или составной fallback
 * (название + категория + артикул + цена).
 */
export function buildStorefrontProductDescription(product) {
  const custom = String(
    product?.details?.description || product?.description || ""
  ).trim();
  if (custom) return truncate(custom, 160);

  const name = String(product?.name || "Товар").trim();
  const category = String(product?.category || "").trim();
  const subcategory = String(product?.subcategory || "").trim();
  const code = String(product?.code || "").trim();
  const price =
    Number(product?.prices?.piece) ||
    Number(product?.prices?.pack) ||
    Number(product?.prices?.box) ||
    0;

  const taxonomy = [category, subcategory].filter(Boolean).join(", ");
  let text = taxonomy ? `${name} — ${taxonomy}.` : `${name}.`;
  if (code) text += ` Артикул ${code}.`;
  if (price > 0) text += ` Цена от ${price.toFixed(2)} ₽.`;
  text += " Заказ на clover-spb.ru без регистрации.";
  return truncate(text, 160);
}

export function buildStorefrontProductBodyText(product) {
  const custom = String(
    product?.details?.description || product?.description || ""
  ).trim();
  if (custom) return custom;
  return buildStorefrontProductDescription(product);
}
