import { isIP } from "node:net";

export const PUBLIC_CATALOG_PAGE_DEFAULT = 60;
export const PUBLIC_CATALOG_PAGE_MAX = 60;

function boundedInteger(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function resolvePublicCatalogPage({ limit, offset } = {}) {
  return {
    limit: boundedInteger(limit, PUBLIC_CATALOG_PAGE_DEFAULT, {
      min: 1,
      max: PUBLIC_CATALOG_PAGE_MAX,
    }),
    offset: boundedInteger(offset, 0, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    }),
  };
}

export function paginatePublicCatalogProducts(products, pageInput = {}) {
  const list = Array.isArray(products) ? products : [];
  const { limit, offset } = resolvePublicCatalogPage(pageInput);
  const page = list.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    products: page,
    pagination: {
      limit,
      offset,
      total: list.length,
      hasMore: nextOffset < list.length,
      nextOffset: nextOffset < list.length ? nextOffset : null,
    },
  };
}

function normalizeIp(value) {
  let input = String(value || "").trim();
  if (input.startsWith("[") && input.includes("]")) {
    input = input.slice(1, input.indexOf("]"));
  }
  if (input.startsWith("::ffff:")) input = input.slice(7);
  const zone = input.indexOf("%");
  if (zone >= 0) input = input.slice(0, zone);
  return isIP(input) ? input.toLowerCase() : "";
}

function isLoopbackIp(value) {
  const ip = normalizeIp(value);
  return ip === "127.0.0.1" || ip === "::1";
}

export function resolvePublicCatalogTrustedProxyIps(value = "") {
  const trusted = new Set(["127.0.0.1", "::1"]);
  for (const candidate of String(value || "").split(",")) {
    const ip = normalizeIp(candidate);
    if (ip) trusted.add(ip);
  }
  return trusted;
}

/**
 * nginx overwrites X-Real-IP. Trust it only when the TCP peer is loopback;
 * a direct client can never select its own limiter bucket with a spoofed header.
 */
export function resolvePublicCatalogClientSubject(
  req = {},
  trustedProxyIps = resolvePublicCatalogTrustedProxyIps()
) {
  const socketIp = normalizeIp(req.socket?.remoteAddress);
  const trusted =
    trustedProxyIps instanceof Set
      ? trustedProxyIps
      : resolvePublicCatalogTrustedProxyIps(trustedProxyIps);
  if (isLoopbackIp(socketIp) || trusted.has(socketIp)) {
    const nginxIp = normalizeIp(req.headers?.["x-real-ip"]);
    if (nginxIp) return `ip:${nginxIp}`;
  }
  if (socketIp) return `ip:${socketIp}`;
  return "ip:unknown";
}
