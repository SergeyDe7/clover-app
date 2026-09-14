import { DEFAULT_LOCALE } from "../i18n/languageRegistry.js";
import {
  PUBLIC_CANONICAL_ORIGIN,
  describeNoindexPublicRoute,
  isIndexablePublicSearch,
  isOperationalPublicPath,
  normalizePublicPathname,
  publicAbsoluteUrl,
  publicPathForLocale,
  stripPublicLocalePrefix,
} from "../i18n/publicLocaleRouting.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceOrInsert(html, pattern, markup) {
  if (pattern.test(html)) return html.replace(pattern, markup);
  return html.replace("</head>", `    ${markup}\n  </head>`);
}

function upsertNamedMeta(html, name, content) {
  const pattern = new RegExp(
    `<meta\\s+[^>]*name=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i"
  );
  return replaceOrInsert(
    html,
    pattern,
    `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`
  );
}

function upsertPropertyMeta(html, property, content) {
  const pattern = new RegExp(
    `<meta\\s+[^>]*property=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i"
  );
  return replaceOrInsert(
    html,
    pattern,
    `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`
  );
}

function canonicalSpellingRedirect(pathname, search, manifest) {
  let candidate =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.replace(/\/+$/, "")
      : pathname;
  for (const locale of manifest.enabledLanguages || []) {
    const prefix = `/${locale}`;
    if (candidate.toLowerCase() === prefix) {
      candidate = `${prefix}/`;
      break;
    }
    if (
      candidate.toLowerCase().startsWith(`${prefix}/`) &&
      !candidate.startsWith(`${prefix}/`)
    ) {
      candidate = `${prefix}${candidate.slice(prefix.length)}`;
      break;
    }
  }
  if (manifest.routes[candidate] && candidate !== pathname) {
    return `${candidate}${search}`;
  }
  return "";
}

function lookupPublicRouteRecord(manifest, requestPathname, parsed) {
  if (manifest.routes?.[requestPathname]) return manifest.routes[requestPathname];
  const locale = parsed.locale || DEFAULT_LOCALE;
  return manifest.routes?.[publicPathForLocale(parsed.pathname, locale)] || null;
}

function escapeJsonLdForHtmlScript(jsonText) {
  return String(jsonText)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function localizeOrganizationJsonLd(raw, record) {
  try {
    const data = JSON.parse(raw);
    if (!data || data["@type"] !== "Organization") return raw;
    const next = { ...data };
    next.url = publicAbsoluteUrl("/", DEFAULT_LOCALE);
    if (record.organizationDescription) {
      next.description = record.organizationDescription;
    }
    return escapeJsonLdForHtmlScript(JSON.stringify(next));
  } catch {
    return raw;
  }
}

export function resolvePublicRouteRequest(manifest, rawUrl) {
  if (manifest?.infrastructureEnabled !== true) return { action: "pass" };
  const raw = String(rawUrl || "/");
  const pathPart = raw.split("?")[0];
  if (/%(?![0-9a-f]{2})/i.test(pathPart)) {
    return { action: "error", status: 400, reason: "malformed-encoding" };
  }
  let url;
  try {
    url = new URL(raw, PUBLIC_CANONICAL_ORIGIN);
  } catch {
    return { action: "error", status: 400, reason: "malformed-url" };
  }
  if (isOperationalPublicPath(url.pathname)) return { action: "pass" };

  const parsed = stripPublicLocalePrefix(url.pathname, {
    infrastructureEnabled: true,
  });
  if (!parsed.ok) {
    return { action: "error", status: 400, reason: parsed.reason };
  }
  if (parsed.locale && isOperationalPublicPath(parsed.pathname)) {
    return {
      action: "error",
      status: 404,
      reason: "locale-prefix-not-allowed",
    };
  }
  if (
    parsed.locale &&
    !(manifest.enabledLanguages || []).includes(parsed.locale)
  ) {
    return { action: "error", status: 404, reason: "unknown-or-unpublished" };
  }

  const redirect = canonicalSpellingRedirect(
    url.pathname,
    url.search,
    manifest
  );
  if (redirect) return { action: "redirect", status: 308, location: redirect };

  const record = lookupPublicRouteRecord(manifest, url.pathname, parsed);
  if (!record) {
    const noindex = describeNoindexPublicRoute(parsed.pathname, parsed.locale);
    if (noindex?.ok) {
      const locale = parsed.locale || DEFAULT_LOCALE;
      const allowPrefix = !["cart", "checkout"].includes(noindex.name);
      const publicPath = allowPrefix
        ? publicPathForLocale(parsed.pathname, locale)
        : normalizePublicPathname(parsed.pathname);
      const parentPath =
        noindex.name === "catalog"
          ? normalizeCatalogParent(parsed.pathname)
          : "";
      const home =
        manifest.routes?.[publicPathForLocale("/", locale)];
      const parent =
        (parentPath &&
          manifest.routes?.[publicPathForLocale(parentPath, locale)]) ||
        home;
      return {
        action: "render",
        status: 200,
        indexable: false,
        record: {
          ...(parent || {
            title: "",
            description: "",
            type: "website",
            ogLocale: "ru_RU",
          }),
          pathname: publicPath,
          locale,
          direction: locale === "ar" ? "rtl" : "ltr",
          canonical: `${PUBLIC_CANONICAL_ORIGIN}${publicPath}`,
          alternates: [],
          organizationDescription:
            home?.organizationDescription || home?.description || "",
        },
      };
    }
    if (noindex && noindex.ok === false) {
      return { action: "error", status: 404, reason: noindex.reason };
    }
    return { action: "error", status: 404, reason: "unknown-or-unpublished" };
  }
  const indexable = isIndexablePublicSearch(url.search);
  return { action: "render", status: 200, record, indexable };
}

function normalizeCatalogParent(pathname) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts[0] !== "catalog" || parts.length < 3) return "/catalog";
  return `/${parts.slice(0, 3).join("/")}`;
}

export function renderPublicRouteHtml(baseHtml, record, { indexable = true } = {}) {
  let html = String(baseHtml || "");
  const languageTag = record.locale === "zh" ? "zh-CN" : record.locale;
  html = html.replace(
    /<html\b[^>]*>/i,
    `<html lang="${escapeHtml(languageTag)}" dir="${record.direction === "rtl" ? "rtl" : "ltr"}">`
  );
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(record.title)}</title>`
  );
  html = upsertNamedMeta(html, "description", record.description);
  html = upsertNamedMeta(
    html,
    "robots",
    indexable ? "index,follow" : "noindex,follow"
  );
  html = upsertNamedMeta(html, "content-language", languageTag);
  html = upsertPropertyMeta(html, "og:title", record.title);
  html = upsertPropertyMeta(html, "og:description", record.description);
  html = upsertPropertyMeta(html, "og:url", record.canonical);
  html = upsertPropertyMeta(html, "og:type", record.type || "website");
  html = upsertPropertyMeta(html, "og:locale", record.ogLocale);
  html = upsertNamedMeta(html, "twitter:title", record.title);
  html = upsertNamedMeta(html, "twitter:description", record.description);

  html = html.replace(
    /<link\s+[^>]*rel=["'](?:canonical|alternate)["'][^>]*>\s*/gi,
    ""
  );
  const links = [
    `<link rel="canonical" href="${escapeHtml(record.canonical)}" />`,
  ];
  if (indexable) {
    for (const alternate of record.alternates || []) {
      links.push(
        `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" />`
      );
    }
  }
  html = html.replace("</head>", `    ${links.join("\n    ")}\n  </head>`);
  html = html.replace(
    /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/i,
    (_full, open, raw, close) => `${open}${localizeOrganizationJsonLd(raw, record)}${close}`
  );
  return html;
}

export function canonicalPublicPathForRequest(pathname, locale) {
  const parsed = stripPublicLocalePrefix(pathname, {
    infrastructureEnabled: true,
  });
  if (!parsed.ok) return "";
  return publicPathForLocale(parsed.pathname, locale);
}
