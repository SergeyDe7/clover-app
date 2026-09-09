import { PRODUCT_TRANSLATION_FIELDS } from "./productLocalization.js";
import {
  exactTranslationTargetInternal,
  toPublicLocaleCode,
} from "./languageRegistry.js";

function asCells(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return {};
  return snapshot;
}

function cellValue(cell) {
  if (!cell || typeof cell !== "object") return "";
  const manual = String(cell.manualValue || "").trim();
  if (manual) return String(cell.manualValue || "");
  const auto = String(cell.autoValue || "").trim();
  if (auto) return String(cell.autoValue || "");
  return String(cell.value || "").trim();
}

/**
 * Pure display overlay. Does not read DB or mutate the canonical product.
 * `fieldCells` is an already-loaded map of field -> stored/derived cell.
 */
export function projectLocalizedProductDisplay(
  product,
  language,
  enabledLanguages = ["ru"],
  fieldCells = {}
) {
  if (!product || typeof product !== "object") return product;
  const requested = String(language || "").trim();
  if (!requested || requested === "ru") return product;
  const internal = exactTranslationTargetInternal(requested);
  if (!internal) return product;
  const publicCode = toPublicLocaleCode(internal);
  const enabled = Array.isArray(enabledLanguages) ? enabledLanguages : ["ru"];
  if (!enabled.includes(publicCode)) return product;

  const overlay = { ...product };
  const details =
    product.storefrontDetails && typeof product.storefrontDetails === "object"
      ? { ...product.storefrontDetails }
      : { description: "", composition: "", characteristics: "" };
  const cells = asCells(fieldCells);
  for (const field of PRODUCT_TRANSLATION_FIELDS) {
    const translated = cellValue(cells[field]);
    if (!translated) continue;
    if (field === "name") overlay.name = translated;
    else details[field] = translated;
  }
  overlay.storefrontDetails = details;
  return overlay;
}
