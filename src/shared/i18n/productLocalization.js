/** Display-only product translation field contract. */

export const PRODUCT_TRANSLATION_FIELDS = Object.freeze([
  "name",
  "description",
  "composition",
  "characteristics",
]);

export const PRODUCT_TRANSLATION_NAMESPACE = "product";

export function canonicalProductId(value) {
  return String(value ?? "").trim();
}

export function isProductTranslationField(value) {
  return PRODUCT_TRANSLATION_FIELDS.includes(String(value || ""));
}

export function productFieldSource(product, field) {
  if (!product || !isProductTranslationField(field)) return "";
  if (field === "name") return String(product.name || "").trim();
  const details =
    product.storefrontDetails && typeof product.storefrontDetails === "object"
      ? product.storefrontDetails
      : {};
  return String(details[field] || "").trim();
}

export function productTranslationRowId(productId, field) {
  return `product:${canonicalProductId(productId)}:${field}`;
}

export function parseProductTranslationRowId(id) {
  const raw = String(id || "");
  const match = raw.match(/^product:(.+):(name|description|composition|characteristics)$/);
  if (!match) return null;
  return { productId: match[1], field: match[2] };
}

export function normalizeGlossaryPhrase(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
