import {
  isOperationalPublicPath,
  stripPublicLocalePrefix,
} from "../shared/i18n/publicLocaleRouting.js";
import {
  LOCAL_DEV_HOSTS,
  PRODUCTION_ANALYTICS_HOSTS,
  isMetrikaTestMode,
  readMetrikaCounterId,
  readMetrikaEnvFlag,
  YANDEX_METRIKA_COUNTER_ID,
} from "./metrikaConfig.js";
import { hasAnalyticsConsent } from "./metrikaConsent.js";

const PREVIEW_PREFIX = "/vitrina";

function pathnameOnly(pathname = "/") {
  const raw = String(pathname || "/") || "/";
  return raw.split("?")[0].split("#")[0] || "/";
}

export function normalizeAnalyticsHost(hostname = "") {
  return String(hostname || "")
    .trim()
    .replace(/\.$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

export function isLocalAnalyticsHost(hostname = "") {
  const host = normalizeAnalyticsHost(hostname);
  return LOCAL_DEV_HOSTS.includes(host);
}

export function isProductionAnalyticsHost(hostname = "") {
  return PRODUCTION_ANALYTICS_HOSTS.includes(normalizeAnalyticsHost(hostname));
}

export function isStorefrontPreviewPath(pathname = "") {
  const path = pathnameOnly(pathname);
  return path === PREVIEW_PREFIX || path.startsWith(`${PREVIEW_PREFIX}/`);
}

export function isCabinetAnalyticsPath(pathname = "", cabinetPath = "/lk") {
  const path = pathnameOnly(pathname);
  const prefix = String(cabinetPath || "/lk").replace(/\/$/, "") || "/lk";
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Sensitive / operational surfaces: never load the tag here.
 * Hitting-only exclusion is not enough — callers must teardown on enter.
 */
function innerPublicPath(pathname) {
  const stripped = stripPublicLocalePrefix(pathname, {
    infrastructureEnabled: true,
  });
  return stripped.ok ? pathnameOnly(stripped.pathname) : pathname;
}

export function isExcludedAnalyticsPath(pathname = "", cabinetPath = "/lk") {
  const path = pathnameOnly(pathname);
  const inner = innerPublicPath(path);
  if (isCabinetAnalyticsPath(path, cabinetPath) || isCabinetAnalyticsPath(inner, cabinetPath)) {
    return true;
  }
  if (isStorefrontPreviewPath(path) || isStorefrontPreviewPath(inner)) return true;
  if (isOperationalPublicPath(path) || isOperationalPublicPath(inner)) return true;
  const first = inner.split("/").filter(Boolean)[0] || "";
  return ["login", "register", "reset", "reset-password", "forgot"].includes(first);
}

export function evaluateAnalyticsGate({
  env = {},
  hostname = "",
  pathname = "/",
  consentStorage = null,
  cabinetPath,
} = {}) {
  const resolvedCabinet =
    String(cabinetPath || env.VITE_CABINET_PATH || "/lk").replace(/\/$/, "") ||
    "/lk";
  const reasons = [];
  const enabled = readMetrikaEnvFlag(env);
  const counterId = readMetrikaCounterId(env);
  if (!enabled) reasons.push("flag-off");
  if (counterId !== YANDEX_METRIKA_COUNTER_ID) reasons.push("counter-mismatch");
  const testMode = isMetrikaTestMode(env);
  if (!testMode && isLocalAnalyticsHost(hostname)) reasons.push("local-host");
  if (!testMode && !isProductionAnalyticsHost(hostname)) reasons.push("non-production-host");
  if (isExcludedAnalyticsPath(pathname, resolvedCabinet)) reasons.push("excluded-path");
  if (!hasAnalyticsConsent(consentStorage)) reasons.push("consent-not-granted");
  return {
    allowed: reasons.length === 0,
    reasons,
    enabled,
    counterId,
  };
}
