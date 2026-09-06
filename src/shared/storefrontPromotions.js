function newPromotionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const STOREFRONT_PROMO_IMAGE_RE =
  /^\/uploads\/storefront-promo-[A-Za-z0-9._-]+$/;

export const STOREFRONT_MAX_PROMOTIONS = 50;

export const PROMO_STATUS = {
  ACTIVE: "active",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  DISABLED: "disabled",
};

export const PROMO_STATUS_LABEL = {
  [PROMO_STATUS.ACTIVE]: "Активна",
  [PROMO_STATUS.SCHEDULED]: "Запланирована",
  [PROMO_STATUS.COMPLETED]: "Завершена",
  [PROMO_STATUS.DISABLED]: "Выключена",
};

const DANGEROUS_LINK_SCHEME_RE =
  /^(javascript|data|file|vbscript|blob|about|mailto|tel):/i;

function parseOptionalIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseSortOrder(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(9999, Math.max(0, Math.round(num)));
}

export function normalizePromotionImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!STOREFRONT_PROMO_IMAGE_RE.test(raw)) return "";
  return raw;
}

/**
 * Informational promo links only:
 * - relative site paths starting with a single /
 * - https URLs
 * Rejects javascript:/data:/file: and other dangerous schemes.
 */
export function normalizePromotionLink(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (DANGEROUS_LINK_SCHEME_RE.test(raw)) return "";
  if (/^https?:\/\//i.test(raw) && !/^https:\/\//i.test(raw)) return "";

  if (/^https:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") return "";
      if (url.username || url.password) return "";
      return url.toString();
    } catch {
      return "";
    }
  }

  // Protocol-relative and other schemes
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  raw = raw.replace(/^\/vitrina(?=\/|$)/, "") || "/";
  if (!raw.startsWith("/")) {
    // Treat bare relative segments as site paths
    if (/[?#\s]/.test(raw) || raw.includes("..")) return "";
    raw = `/${raw}`;
  }
  if (raw.includes("\\") || raw.includes("..")) return "";
  if (raw.length > 500) return "";
  return raw;
}

export function promotionStatus(promo, now = new Date()) {
  const enabled = promo?.enabled === true;
  if (!enabled) return PROMO_STATUS.DISABLED;

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startsAt = promo?.startsAt ? new Date(promo.startsAt).getTime() : null;
  const endsAt = promo?.endsAt ? new Date(promo.endsAt).getTime() : null;

  if (startsAt != null && !Number.isNaN(startsAt) && nowMs < startsAt) {
    return PROMO_STATUS.SCHEDULED;
  }
  if (endsAt != null && !Number.isNaN(endsAt) && nowMs > endsAt) {
    return PROMO_STATUS.COMPLETED;
  }
  return PROMO_STATUS.ACTIVE;
}

export function isPromotionActive(promo, now = new Date()) {
  return promotionStatus(promo, now) === PROMO_STATUS.ACTIVE;
}

function normalizeOnePromotion(item, index = 0) {
  if (!item || typeof item !== "object") return null;
  const title = String(item.title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (!title) return null;

  const id = String(item.id || "").trim() || newPromotionId();
  const startsAt = parseOptionalIso(item.startsAt);
  const endsAt = parseOptionalIso(item.endsAt);
  if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    // Keep both; admin can fix. Status logic still works.
  }

  return {
    id,
    enabled: item.enabled === true,
    showOnHome: item.showOnHome === true,
    imageUrl: normalizePromotionImageUrl(item.imageUrl),
    title,
    shortText: String(item.shortText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280),
    fullDescription: String(item.fullDescription || "")
      .trim()
      .slice(0, 8000),
    link: normalizePromotionLink(item.link),
    buttonText: String(item.buttonText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40),
    startsAt,
    endsAt,
    sortOrder: parseSortOrder(item.sortOrder, index),
  };
}

export function normalizeStorefrontPromotions(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const promo = normalizeOnePromotion(list[i], i);
    if (!promo) continue;
    if (seen.has(promo.id)) continue;
    seen.add(promo.id);
    out.push(promo);
    if (out.length >= STOREFRONT_MAX_PROMOTIONS) break;
  }
  return out.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title, "ru");
  });
}

function toPublicPromotion(promo, now) {
  const status = promotionStatus(promo, now);
  return {
    id: promo.id,
    title: promo.title,
    shortText: promo.shortText,
    fullDescription: promo.fullDescription,
    imageUrl: promo.imageUrl,
    link: promo.link,
    buttonText: promo.buttonText,
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    sortOrder: promo.sortOrder,
    showOnHome: promo.showOnHome === true,
    status,
    statusLabel: PROMO_STATUS_LABEL[status],
  };
}

export function listActivePromotions(promotions, now = new Date()) {
  return normalizeStorefrontPromotions(promotions)
    .filter((promo) => isPromotionActive(promo, now))
    .map((promo) => toPublicPromotion(promo, now));
}

export function listHomePromotions(promotions, now = new Date()) {
  return listActivePromotions(promotions, now).filter(
    (promo) => promo.showOnHome === true
  );
}

export function listAdminPromotions(promotions, now = new Date()) {
  return normalizeStorefrontPromotions(promotions).map((promo) => {
    const status = promotionStatus(promo, now);
    return {
      ...promo,
      status,
      statusLabel: PROMO_STATUS_LABEL[status],
    };
  });
}

export function promotionUploadUrls(promotions) {
  return normalizeStorefrontPromotions(promotions)
    .map((promo) => promo.imageUrl)
    .filter((url) => url.startsWith("/uploads/storefront-promo-"));
}
