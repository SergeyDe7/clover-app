import { PRODUCT_TRANSLATION_FIELDS, productFieldSource } from "./productLocalization.js";
import { sourceHash } from "./sourceHash.js";
import {
  exactTranslationTargetInternal,
  toPublicLocaleCode,
} from "./languageRegistry.js";

function asCells(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return {};
  return snapshot;
}

function currentFieldSourceHash(product, field) {
  const sourceRu = productFieldSource(product, field);
  return sourceRu ? sourceHash(sourceRu) : "";
}

/**
 * Public/client display value. STALE MANUAL/AUTO never overlay canonical RU.
 * Admin workspace may still show stale stored values for review.
 */
export function publicCellDisplayValue(cell, currentSourceHash) {
  if (!cell || typeof cell !== "object") return "";
  const expected = String(currentSourceHash || "");
  const manual = String(cell.manualValue || "").trim();
  if (manual) {
    if (String(cell.manualSourceHash || "") === expected && expected) {
      return String(cell.manualValue || "");
    }
    return "";
  }
  const auto = String(cell.autoValue || "").trim();
  if (auto && String(cell.autoSourceHash || "") === expected && expected) {
    return String(cell.autoValue || "");
  }
  return "";
}

/**
 * Pure display overlay. Does not read DB or mutate the canonical product.
 * `fieldCells` is an already-loaded map of field -> stored cell including hashes.
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
    const translated = publicCellDisplayValue(cells[field], currentFieldSourceHash(product, field));
    if (!translated) continue;
    if (field === "name") overlay.name = translated;
    else details[field] = translated;
  }
  overlay.storefrontDetails = details;
  return overlay;
}
