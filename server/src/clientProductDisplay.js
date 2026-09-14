/**
 * Authenticated client cabinet: display-only product name overlays from
 * product_translations. Canonical product.name stays Russian for order lines.
 * Provider disabled does not block reads (same as storefront projection).
 */
import { readLocalizationSettings } from "./localizationStore.js";
import { buildProductTranslationCellMap } from "./productLocalizationStore.js";
import { projectLocalizedProductDisplay } from "../../src/shared/i18n/productDisplayProjection.js";
import { canonicalProductId } from "../../src/shared/i18n/productLocalization.js";
import {
  exactTranslationTargetInternal,
  toPublicLocaleCode,
} from "../../src/shared/i18n/languageRegistry.js";

function resolveDisplayLanguage(language) {
  const requested = String(language || "").trim();
  if (!requested || requested === "ru") return null;
  const internal = exactTranslationTargetInternal(requested);
  if (!internal) return null;
  return toPublicLocaleCode(internal);
}

/**
 * Build id → displayName for products that have a non-stale MANUAL/AUTO name.
 * Missing/stale → omitted (UI falls back to canonical RU name).
 */
export function buildClientProductDisplayNameMap(products, language) {
  const publicCode = resolveDisplayLanguage(language);
  if (!publicCode) return {};

  const settings = readLocalizationSettings();
  const enabled = Array.isArray(settings.enabledLanguages)
    ? settings.enabledLanguages
    : ["ru"];
  if (!enabled.includes(publicCode)) return {};

  const list = Array.isArray(products) ? products : [];
  const cellMap = buildProductTranslationCellMap(publicCode);
  const out = Object.create(null);

  for (const product of list) {
    const id = canonicalProductId(product?.id);
    if (!id) continue;
    const cells = cellMap.get(id) || {};
    const projected = projectLocalizedProductDisplay(
      product,
      publicCode,
      enabled,
      cells
    );
    const displayName = String(projected?.name || "").trim();
    const canonical = String(product?.name || "").trim();
    if (displayName && displayName !== canonical) {
      out[id] = displayName;
    }
  }
  return out;
}

export function attachClientProductDisplayNames(products, language) {
  const list = Array.isArray(products) ? products : [];
  const map = buildClientProductDisplayNameMap(list, language);
  if (!Object.keys(map).length) {
    return list.map((product) => {
      if (!product || typeof product !== "object") return product;
      if (!product.displayName) return product;
      const { displayName: _drop, ...rest } = product;
      return rest;
    });
  }
  return list.map((product) => {
    if (!product || typeof product !== "object") return product;
    const id = canonicalProductId(product.id);
    const displayName = id ? map[id] : "";
    if (!displayName) {
      if (!product.displayName) return product;
      const { displayName: _drop, ...rest } = product;
      return rest;
    }
    return { ...product, displayName };
  });
}
