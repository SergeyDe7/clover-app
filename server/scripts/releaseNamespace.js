import { randomBytes } from "node:crypto";

export const RELEASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;
export const FORBIDDEN_RELEASE_MARK = /r403u/i;
export const BUILD_TAG_RE = /^ui-([A-Za-z0-9][A-Za-z0-9_-]{2,31})$/;
export const NAMESPACED_ASSET_RE = /^\/(assets|fonts)\/([^/]+)\/[^/]+/;
export const PUBLIC_LOCALE_ROUTES_PLACEHOLDER = "%CLOVER_PUBLIC_LOCALE_ROUTES%";
export const PUBLIC_LOCALE_STAMPS = Object.freeze(["enabled", "disabled"]);

const JS_ABS_ASSET_RE =
  /["'`](\/(?:assets|fonts)\/[^"'`?#]+)(?:[?#][^"'`]*)?["'`]/g;
const JS_BARE_ASSET_RE = /["']((?:assets|fonts)\/[^"'`?#]+)["']/g;
const JS_RELATIVE_FILE_RE = /["'](\.\/[^"'`?#]+\.(?:js|css))["']/g;

export function assertValidReleaseId(releaseId) {
  const id = String(releaseId || "").trim();
  if (!RELEASE_ID_RE.test(id)) {
    throw new Error(`invalid release namespace: ${id || "(empty)"}`);
  }
  if (FORBIDDEN_RELEASE_MARK.test(id)) {
    throw new Error("recovery suffix is not a permanent release namespace");
  }
  return id;
}

export function createReleaseId({
  env = process.env,
  now = Date.now,
  bytes = randomBytes,
} = {}) {
  const forced = String(env.CLOVER_UI_RELEASE_ID || "").trim();
  if (forced) return assertValidReleaseId(forced);
  const date = new Date(now()).toISOString().slice(0, 10).replace(/-/g, "");
  const rand = bytes(6)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "x")
    .slice(0, 8);
  return assertValidReleaseId(`${date}${rand}`);
}

export function buildTagFromReleaseId(releaseId) {
  return `ui-${assertValidReleaseId(releaseId)}`;
}

export function releaseIdFromBuildTag(tag) {
  const match = String(tag || "").trim().match(BUILD_TAG_RE);
  return match ? assertValidReleaseId(match[1]) : "";
}

export function extractBuildTag(html) {
  const match = String(html || "").match(
    /<meta\s+[^>]*name=["']clover-ui-build["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  return match ? match[1].trim() : "";
}

/** Independent of HTML: same contract as isPublicLocaleRoutesEnabledFromEnv (`1` → enabled). */
export function expectedLocaleStampFromEnv(env = process.env) {
  return String(env?.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED || "").trim() === "1"
    ? "enabled"
    : "disabled";
}

export function resolveExpectedLocaleStamp(expectedLocaleStamp, env = process.env) {
  const explicit = String(expectedLocaleStamp || "").trim();
  if (PUBLIC_LOCALE_STAMPS.includes(explicit)) return explicit;
  return expectedLocaleStampFromEnv(env);
}

export function extractLocaleStamp(html) {
  const source = String(html || "");
  const named = source.match(
    /<meta\s+[^>]*name=["']clover-public-locale-routes["'][^>]*>/i
  );
  if (named) {
    const content = named[0].match(/content=["']([^"']*)["']/i);
    if (content) return content[1].trim();
  }
  const reversed = source.match(
    /<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']clover-public-locale-routes["'][^>]*>/i
  );
  return reversed ? reversed[1].trim() : "";
}

export function pathReleaseId(assetPath) {
  const match = String(assetPath || "").split("?")[0].match(NAMESPACED_ASSET_RE);
  return match ? match[2] : "";
}

export function isNamespacedPath(assetPath, releaseId) {
  return pathReleaseId(assetPath) === assertValidReleaseId(releaseId);
}

export function namespacedPublicPath(releaseId, kind, fileName) {
  const id = assertValidReleaseId(releaseId);
  const kindName = kind === "fonts" ? "fonts" : "assets";
  const file = String(fileName || "").replace(/^\/+/, "").replace(/^.*\//, "");
  return `/${kindName}/${id}/${file}`;
}

export function rewriteFontPublicUrls(source, releaseId) {
  const id = assertValidReleaseId(releaseId);
  return String(source || "").replace(
    /(\/fonts\/)(?![A-Za-z0-9][A-Za-z0-9_-]{2,31}\/)([^"'?\s)]+)/g,
    (_all, prefix, file) => {
      if (file.startsWith(`${id}/`)) return `${prefix}${file}`;
      return `${prefix}${id}/${file}`;
    }
  );
}

export function extractJsReferencedPaths(js, { fromAssetPath = "" } = {}) {
  const paths = [];
  const seen = new Set();
  const add = (assetPath) => {
    const normalized = String(assetPath || "").split("?")[0];
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    paths.push(normalized);
  };
  const source = String(js || "");
  JS_ABS_ASSET_RE.lastIndex = 0;
  let match;
  while ((match = JS_ABS_ASSET_RE.exec(source))) add(match[1]);
  JS_BARE_ASSET_RE.lastIndex = 0;
  let bare;
  while ((bare = JS_BARE_ASSET_RE.exec(source))) {
    add(`/${bare[1]}`);
  }
  const fromDir = String(fromAssetPath || "").replace(/\/[^/]+$/, "");
  if (fromDir.startsWith("/assets/") || fromDir.startsWith("/fonts/")) {
    JS_RELATIVE_FILE_RE.lastIndex = 0;
    let rel;
    while ((rel = JS_RELATIVE_FILE_RE.exec(source))) {
      add(`${fromDir}/${rel[1].slice(2)}`);
    }
  }
  return paths;
}

export function namespaceFailures({
  html,
  assets,
  jsRefs = [],
  swSource = "",
  expectedLocaleStamp,
  env = process.env,
}) {
  const failures = [];
  const tag = extractBuildTag(html);
  let releaseId;
  try {
    releaseId = releaseIdFromBuildTag(tag);
  } catch (error) {
    failures.push(String(error.message || error));
    return { ok: false, releaseId: "", tag, failures };
  }
  if (!releaseId) {
    failures.push("HTML is missing a namespaced clover-ui-build tag");
    return { ok: false, releaseId: "", tag, failures };
  }
  const all = [...assets, ...jsRefs];
  if (!all.some((item) => item.startsWith("/assets/") && item.endsWith(".js"))) {
    failures.push("namespace graph has no /assets/<release>/*.js entry");
  }
  if (!all.some((item) => item.endsWith(".css"))) {
    failures.push("namespace graph has no stylesheet");
  }
  for (const assetPath of all) {
    if (!assetPath.startsWith("/assets/") && !assetPath.startsWith("/fonts/")) continue;
    if (assetPath.includes("..") || assetPath.includes("./")) {
      failures.push(`${assetPath} escapes release namespace ${releaseId}`);
      continue;
    }
    const found = pathReleaseId(assetPath);
    if (found !== releaseId) {
      failures.push(`${assetPath} is outside release namespace ${releaseId}`);
    }
  }
  if (swSource) {
    const expectedCache = `clover-shell-${tag}`;
    if (!swSource.includes(expectedCache)) {
      failures.push(`sw.js CACHE_NAME must be ${expectedCache}`);
    }
    if (FORBIDDEN_RELEASE_MARK.test(swSource)) {
      failures.push("sw.js must not contain the temporary recovery suffix");
    }
  }
  const htmlSource = String(html || "");
  if (htmlSource.includes(PUBLIC_LOCALE_ROUTES_PLACEHOLDER)) {
    failures.push("locale HTML stamp is still the build placeholder");
  }
  const expected = resolveExpectedLocaleStamp(expectedLocaleStamp, env);
  const actual = extractLocaleStamp(htmlSource);
  if (actual === PUBLIC_LOCALE_ROUTES_PLACEHOLDER) {
    if (!failures.some((item) => item.includes("build placeholder"))) {
      failures.push("locale HTML stamp is still the build placeholder");
    }
  } else if (actual !== expected) {
    failures.push(
      `locale HTML stamp ${actual || "(missing)"} does not match expected ${expected}`
    );
  }
  return { ok: failures.length === 0, releaseId, tag, failures };
}
