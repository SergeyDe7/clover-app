import {
  STOREFRONT_INFO_PAGES,
  STOREFRONT_INFO_SLUGS,
  findStorefrontInfoPage,
} from "../screens/storefront/pages/infoPages.js";
import { STOREFRONT_INFO_CONTENT } from "../screens/storefront/pages/infoPageContent.js";

export { STOREFRONT_INFO_PAGES, STOREFRONT_INFO_SLUGS, findStorefrontInfoPage };

export const STOREFRONT_LEGAL_INFO_SLUGS = [
  "privacy-policy",
  "personal-data-consent",
];

export const STOREFRONT_INFO_PUBLIC_ORIGIN = "https://clover-spb.ru";

export const STOREFRONT_INFO_LIMITS = {
  heading: 160,
  title: 180,
  description: 500,
  blockText: 8000,
  listItem: 500,
  listItems: 40,
  blocks: 40,
  routeLabel: 80,
};

const BLOCK_TYPES = new Set(["lead", "p", "h2", "list", "route"]);
const SAFE_NAMED_ROUTES = new Set(["home", "catalog", "contacts", "aktsii", "cart"]);

function clipText(value, max) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\0/g, "")
    .trim()
    .slice(0, max);
}

function isIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const date = new Date(raw);
  return !Number.isNaN(date.getTime());
}

export function storefrontInfoPageUrl(slug) {
  const key = String(slug || "").trim();
  if (!STOREFRONT_INFO_SLUGS.includes(key)) return "";
  return `${STOREFRONT_INFO_PUBLIC_ORIGIN}/${key}`;
}

export function isStorefrontLegalInfoSlug(slug) {
  return STOREFRONT_LEGAL_INFO_SLUGS.includes(String(slug || "").trim());
}

export function normalizeStorefrontInfoRoute(route) {
  if (route === "home" || route === "catalog" || route === "contacts") {
    return { name: route };
  }
  if (!route || typeof route !== "object") return null;
  const name = String(route.name || "").trim();
  if (name === "info") {
    const slug = String(route.slug || "").trim().toLowerCase();
    if (!STOREFRONT_INFO_SLUGS.includes(slug)) return null;
    return { name: "info", slug };
  }
  if (SAFE_NAMED_ROUTES.has(name)) return { name };
  return null;
}

export function normalizeStorefrontInfoBlock(block) {
  if (!block || typeof block !== "object") return null;
  const type = String(block.type || "").trim();
  if (!BLOCK_TYPES.has(type)) return null;

  if (type === "list") {
    const raw = Array.isArray(block.items) ? block.items : [];
    const items = [];
    for (const item of raw) {
      const text = clipText(item, STOREFRONT_INFO_LIMITS.listItem);
      if (!text) continue;
      items.push(text);
      if (items.length >= STOREFRONT_INFO_LIMITS.listItems) break;
    }
    if (!items.length) return null;
    return { type: "list", items };
  }

  if (type === "route") {
    const nextRoute = normalizeStorefrontInfoRoute(block.route);
    const label = clipText(block.label, STOREFRONT_INFO_LIMITS.routeLabel);
    if (!nextRoute || !label) return null;
    return { type: "route", label, route: nextRoute };
  }

  const text = clipText(block.text, STOREFRONT_INFO_LIMITS.blockText);
  if (!text) return null;
  return { type, text };
}

export function normalizeStorefrontInfoBlocks(value) {
  const list = Array.isArray(value) ? value : [];
  const blocks = [];
  for (const item of list) {
    const block = normalizeStorefrontInfoBlock(item);
    if (!block) continue;
    blocks.push(block);
    if (blocks.length >= STOREFRONT_INFO_LIMITS.blocks) break;
  }
  return blocks;
}

function pageContentEqual(a, b) {
  return (
    String(a?.heading || "") === String(b?.heading || "") &&
    String(a?.title || "") === String(b?.title || "") &&
    String(a?.description || "") === String(b?.description || "") &&
    JSON.stringify(a?.blocks || []) === JSON.stringify(b?.blocks || [])
  );
}

function normalizeOneInfoPage(raw, { previous, now } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const heading = clipText(raw.heading, STOREFRONT_INFO_LIMITS.heading);
  const title = clipText(raw.title, STOREFRONT_INFO_LIMITS.title);
  const description = clipText(raw.description, STOREFRONT_INFO_LIMITS.description);
  const blocks = normalizeStorefrontInfoBlocks(raw.blocks);
  if (!heading && !title && !description && !blocks.length) return null;

  const next = { heading, title, description, blocks };
  const prev = previous && typeof previous === "object" ? previous : null;
  if (prev && pageContentEqual(prev, next) && isIsoDate(prev.updatedAt)) {
    next.updatedAt = new Date(prev.updatedAt).toISOString();
  } else {
    const stamp = now instanceof Date ? now : new Date();
    next.updatedAt = stamp.toISOString();
  }
  return next;
}

export function formatStorefrontDocumentTitle(title, brand = "КЛЕВЕР") {
  const raw = String(title || "").trim();
  if (!raw) return "";
  const escaped = String(brand || "КЛЕВЕР").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const suffix = new RegExp(`\\|\\s*${escaped}\\s*$`);
  if (raw === brand || suffix.test(raw)) return raw;
  return `${raw} | ${brand}`;
}

export function normalizeStorefrontInfoPages(value, { previous, now } = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const prev =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? previous
      : {};
  const out = {};
  for (const slug of STOREFRONT_INFO_SLUGS) {
    if (!Object.prototype.hasOwnProperty.call(input, slug)) continue;
    const page = normalizeOneInfoPage(input[slug], {
      previous: prev[slug],
      now,
    });
    if (page) out[slug] = page;
  }
  return out;
}

export function cloneStorefrontInfoPages(value) {
  return normalizeStorefrontInfoPages(value);
}

export function storefrontInfoPagesKey(value) {
  return JSON.stringify(normalizeStorefrontInfoPages(value));
}

export function resolveStorefrontInfoPage(slug, storedPages) {
  const registry = findStorefrontInfoPage(slug);
  if (!registry) return null;
  const stored =
    storedPages && typeof storedPages === "object" ? storedPages[registry.slug] : null;
  const heading = clipText(stored?.heading, STOREFRONT_INFO_LIMITS.heading);
  const title = clipText(stored?.title, STOREFRONT_INFO_LIMITS.title);
  const description = clipText(stored?.description, STOREFRONT_INFO_LIMITS.description);
  const blocks = normalizeStorefrontInfoBlocks(stored?.blocks);
  const fallbackBlocks = Array.isArray(STOREFRONT_INFO_CONTENT[registry.slug])
    ? STOREFRONT_INFO_CONTENT[registry.slug]
    : [];
  return {
    slug: registry.slug,
    heading: heading || registry.heading,
    title: title || registry.title,
    description: description || registry.description,
    blocks: blocks.length ? blocks : fallbackBlocks,
    updatedAt: isIsoDate(stored?.updatedAt)
      ? new Date(stored.updatedAt).toISOString()
      : null,
  };
}

function cloneEditorBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  return blocks.map((block) => {
    if (block?.type === "list") {
      return {
        type: "list",
        items: Array.isArray(block.items) ? block.items.map((item) => String(item)) : [""],
      };
    }
    if (block?.type === "route") {
      return {
        type: "route",
        label: block.label == null ? "" : String(block.label),
        route: { ...(block.route || { name: "contacts" }) },
      };
    }
    return {
      type: block?.type || "p",
      text: block?.text == null ? "" : String(block.text),
    };
  });
}

/** Live admin draft: keep exact input, including trailing spaces. Do not trim. */
export function readEditorStorefrontInfoPage(slug, pages) {
  const fallback = resolveStorefrontInfoPage(slug);
  if (!fallback) return null;
  const raw =
    pages && typeof pages === "object" && !Array.isArray(pages) ? pages[slug] : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      heading: fallback.heading,
      title: fallback.title,
      description: fallback.description,
      blocks: cloneEditorBlocks(fallback.blocks) || [],
      updatedAt: fallback.updatedAt,
    };
  }
  return {
    heading: raw.heading == null ? fallback.heading : String(raw.heading),
    title: raw.title == null ? fallback.title : String(raw.title),
    description: raw.description == null ? fallback.description : String(raw.description),
    blocks: cloneEditorBlocks(raw.blocks) || cloneEditorBlocks(fallback.blocks) || [],
    updatedAt: raw.updatedAt || fallback.updatedAt,
  };
}

export function applyEditorInfoPagesPatch(pages, slug, patch) {
  const current =
    pages && typeof pages === "object" && !Array.isArray(pages) ? { ...pages } : {};
  const view = readEditorStorefrontInfoPage(slug, current);
  const nextPage = { ...view, ...patch };
  return {
    ...current,
    [slug]: {
      heading: nextPage.heading,
      title: nextPage.title,
      description: nextPage.description,
      blocks: nextPage.blocks,
    },
  };
}
