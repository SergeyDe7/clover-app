/**
 * SEO-001 — write dist/sitemap.xml from live app_state (runtime freshness).
 *
 * Safety contract:
 * - Never throws into product/settings write paths.
 * - Scheduled via setImmediate so it runs AFTER the current DB transaction
 *   (if any) has committed/rolled back — not inside BEGIN…COMMIT.
 * - Coalesces multiple schedules in one event-loop turn into one write.
 * - Skips rewrite when the public URL set is unchanged (prices/stock/enrichment).
 * - Atomic rename: failed write leaves the previous sitemap intact.
 * - Disable with CLOVER_SITEMAP_RUNTIME_WRITE=0.
 */
import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGlobalState } from "./db.js";
import { DEFAULT_PRODUCTS, DEFAULT_SETTINGS } from "./defaults.js";
import {
  listPublicSitemapProducts,
  collectSitemapIndexSets,
  buildSitemapEntries,
  renderSitemapXml,
} from "../../src/shared/sitemap/sitemapContract.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

let refreshScheduled = false;
let refreshReason = "";

export function defaultSitemapOutPath() {
  return (
    process.env.SITEMAP_OUT || path.join(projectRoot, "dist/sitemap.xml")
  );
}

function oneCByIdMap(oneCProducts) {
  const map = new Map();
  for (const item of Array.isArray(oneCProducts) ? oneCProducts : []) {
    const id = String(item?.id || "").trim();
    if (id) map.set(id, item);
  }
  return map;
}

/** Stable fingerprint of sitemap URL set (products + taxonomy), not prices/copy. */
export function publicSitemapUrlSetKey(
  products,
  { storefrontShowOnlyLinked = true, oneCById = null } = {}
) {
  const publicProducts = listPublicSitemapProducts(products, {
    storefrontShowOnlyLinked,
    oneCById,
  });
  const sets = collectSitemapIndexSets(publicProducts);
  return JSON.stringify({
    products: sets.productCodes,
    categories: sets.categories,
    subcategories: sets.subcategories.map(
      (s) => `${s.category}\0${s.subcategory}`
    ),
  });
}

function currentLinkedAndOneC() {
  const settings = getGlobalState("settings", DEFAULT_SETTINGS);
  const oneCProducts = getGlobalState("oneCProducts", []);
  return {
    linked: settings.storefrontShowOnlyLinked !== false,
    oneCById: oneCByIdMap(oneCProducts),
  };
}

/**
 * True when public sitemap locs would change between two product lists.
 */
export function publicSitemapUrlSetChanged(beforeProducts, afterProducts) {
  const { linked, oneCById } = currentLinkedAndOneC();
  const opts = { storefrontShowOnlyLinked: linked, oneCById };
  return (
    publicSitemapUrlSetKey(beforeProducts, opts) !==
    publicSitemapUrlSetKey(afterProducts, opts)
  );
}

/**
 * Rebuild sitemap artifact from current in-memory catalog (sync, best-effort).
 * Prefer scheduleSitemapRefresh / scheduleSitemapRefreshIfUrlSetChanged from
 * business write paths.
 */
export function regenerateSitemapArtifact(reason = "") {
  if (process.env.CLOVER_SITEMAP_RUNTIME_WRITE === "0") {
    return { skipped: true, reason: "disabled" };
  }
  const outPath = defaultSitemapOutPath();
  const outDir = path.dirname(outPath);
  if (!existsSync(outDir) && !process.env.SITEMAP_OUT) {
    return { skipped: true, reason: "dist-missing" };
  }
  const tmpPath = `${outPath}.${process.pid}.tmp`;
  try {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const settings = getGlobalState("settings", DEFAULT_SETTINGS);
    const oneCProducts = getGlobalState("oneCProducts", []);
    const publicProducts = listPublicSitemapProducts(products, {
      storefrontShowOnlyLinked: settings.storefrontShowOnlyLinked !== false,
      oneCById: oneCByIdMap(oneCProducts),
    });
    const sets = collectSitemapIndexSets(publicProducts);
    const locs = buildSitemapEntries({
      categories: sets.categories,
      subcategories: sets.subcategories,
      productCodes: sets.productCodes,
    });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(tmpPath, renderSitemapXml(locs));
    renameSync(tmpPath, outPath);
    return {
      ok: true,
      total: locs.length,
      reason: reason || "catalog",
      out: outPath,
    };
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // ignore tmp cleanup failure
    }
    console.error(
      `[sitemap] runtime regenerate failed (${reason || "catalog"}):`,
      error
    );
    return { ok: false, error: String(error?.message || error) };
  }
}

/**
 * Coalesce refresh onto the next event-loop turn (after open transactions).
 */
export function scheduleSitemapRefresh(reason = "") {
  if (process.env.CLOVER_SITEMAP_RUNTIME_WRITE === "0") {
    return { skipped: true, reason: "disabled" };
  }
  refreshReason = reason || refreshReason || "catalog";
  if (refreshScheduled) {
    return { scheduled: true, coalesced: true };
  }
  refreshScheduled = true;
  setImmediate(() => {
    const why = refreshReason || "catalog";
    refreshScheduled = false;
    refreshReason = "";
    regenerateSitemapArtifact(why);
  });
  return { scheduled: true, coalesced: false };
}

/**
 * Schedule refresh only when the public URL set changed.
 * Price/stock/enrichment-only product writes → no sitemap I/O.
 */
export function scheduleSitemapRefreshIfUrlSetChanged(
  beforeProducts,
  afterProducts,
  reason = ""
) {
  if (!publicSitemapUrlSetChanged(beforeProducts, afterProducts)) {
    return { skipped: true, reason: "url-set-unchanged" };
  }
  return scheduleSitemapRefresh(reason || "url-set-changed");
}
