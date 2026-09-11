/**
 * Storefront-save obsolete upload cleanup — best-effort after DB commit.
 * Server-only. No DB / Express / sitemap / localization imports.
 *
 * Qualification of which URLs are obsolete remains with the caller.
 * This helper only attempts deletion per item and never aborts the batch.
 */

/**
 * @param {Iterable<string>} obsoleteUrls
 * @param {{
 *   deleteUrl?: (url: string) => void,
 *   log?: (message: string, detail?: unknown) => void,
 * }} [options]
 * @returns {{ attempted: number, failed: number, failures: Array<{ url: string, message: string }> }}
 */
export function cleanupObsoleteStorefrontUploads(obsoleteUrls, options = {}) {
  const deleteUrl =
    typeof options.deleteUrl === "function" ? options.deleteUrl : null;
  const log = typeof options.log === "function" ? options.log : null;
  const list = Array.isArray(obsoleteUrls)
    ? obsoleteUrls
    : obsoleteUrls && typeof obsoleteUrls[Symbol.iterator] === "function"
      ? [...obsoleteUrls]
      : [];

  let attempted = 0;
  let failed = 0;
  const failures = [];

  for (const raw of list) {
    const url = String(raw || "").trim();
    if (!url) continue;
    if (!deleteUrl) continue;
    attempted += 1;
    try {
      deleteUrl(url);
    } catch (error) {
      failed += 1;
      const message = String(error?.message || error || "cleanup failed");
      failures.push({ url, message });
      if (log) {
        // Logical URL only — never absolute filesystem paths.
        log(`[storefront-upload-cleanup] failed for ${url}: ${message}`);
      }
    }
  }

  return { attempted, failed, failures };
}

/**
 * Build the same obsolete URL list the storefront PUT path historically deleted,
 * without performing deletion.
 */
export function collectObsoleteStorefrontUploadUrls(current, next, helpers = {}) {
  const heroSlideUploadUrls =
    typeof helpers.heroSlideUploadUrls === "function"
      ? helpers.heroSlideUploadUrls
      : () => [];
  const promotionUploadUrls =
    typeof helpers.promotionUploadUrls === "function"
      ? helpers.promotionUploadUrls
      : () => [];

  const urls = [];
  if (
    current?.storefrontContactMapImageUrl &&
    current.storefrontContactMapImageUrl !== next?.storefrontContactMapImageUrl
  ) {
    urls.push(current.storefrontContactMapImageUrl);
  }
  const nextHeroUploads = new Set(heroSlideUploadUrls(next?.storefrontHeroSlides));
  for (const imageUrl of heroSlideUploadUrls(current?.storefrontHeroSlides)) {
    if (!nextHeroUploads.has(imageUrl)) urls.push(imageUrl);
  }
  const nextPromoUploads = new Set(promotionUploadUrls(next?.storefrontPromotions));
  for (const imageUrl of promotionUploadUrls(current?.storefrontPromotions)) {
    if (!nextPromoUploads.has(imageUrl)) urls.push(imageUrl);
  }
  return urls;
}
