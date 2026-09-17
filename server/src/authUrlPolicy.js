function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 503;
  return error;
}

function enabled(value) {
  return /^(?:1|true|yes|on)$/iu.test(String(value || "").trim());
}

function hostnameWithoutBrackets(value) {
  return String(value || "").replace(/^\[|\]$/gu, "").toLowerCase();
}

function isLoopbackHostname(value) {
  const hostname = hostnameWithoutBrackets(value);
  if (hostname === "localhost" || hostname === "::1") return true;
  const parts = hostname.split(".").map(Number);
  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 127
  );
}

function isLoopbackAddress(value) {
  const address = String(value || "").trim().toLowerCase();
  if (address === "::1") return true;
  if (address.startsWith("::ffff:")) {
    return isLoopbackHostname(address.slice("::ffff:".length));
  }
  return isLoopbackHostname(address);
}

function hasC0OrDel(value) {
  for (const ch of String(value || "")) {
    const code = ch.codePointAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function resolveCanonicalAuthOrigin(env = process.env) {
  const raw = String(env.APP_PUBLIC_URL || "").trim();
  if (!raw) {
    throw policyError(
      "AUTH_PUBLIC_URL_REQUIRED",
      "Публичный адрес Clover не настроен."
    );
  }
  if (hasC0OrDel(raw) || raw.includes("\\")) {
    throw policyError(
      "AUTH_PUBLIC_URL_INVALID",
      "Публичный адрес Clover настроен некорректно."
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw policyError(
      "AUTH_PUBLIC_URL_INVALID",
      "Публичный адрес Clover настроен некорректно."
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw policyError(
      "AUTH_PUBLIC_URL_INVALID",
      "Публичный адрес Clover настроен некорректно."
    );
  }

  if (url.protocol !== "https:") {
    const loopbackDevelopment =
      url.protocol === "http:" &&
      isLoopbackHostname(url.hostname) &&
      enabled(env.ALLOW_DEV_AUTH_LINKS);
    if (!loopbackDevelopment) {
      throw policyError(
        "AUTH_PUBLIC_URL_HTTPS_REQUIRED",
        "Публичный адрес Clover должен использовать HTTPS."
      );
    }
  }

  return url.origin;
}

export function buildCanonicalCabinetUrl(env = process.env) {
  const origin = resolveCanonicalAuthOrigin(env);
  const rawPath = String(env.CABINET_PATH || "/lk").trim();
  if (
    !rawPath.startsWith("/") ||
    rawPath.startsWith("//") ||
    hasC0OrDel(rawPath) ||
    rawPath.includes("\\") ||
    rawPath.includes("?") ||
    rawPath.includes("#")
  ) {
    throw policyError(
      "AUTH_CABINET_PATH_INVALID",
      "Путь личного кабинета настроен некорректно."
    );
  }
  const cabinetPath = rawPath.replace(/\/+$/u, "") || "/";
  return cabinetPath === "/" ? origin : `${origin}${cabinetPath}`;
}

export function developmentAuthLinksAllowed(
  env = process.env,
  remoteAddress = ""
) {
  if (!enabled(env.ALLOW_DEV_AUTH_LINKS) || !isLoopbackAddress(remoteAddress)) {
    return false;
  }
  try {
    const origin = new URL(resolveCanonicalAuthOrigin(env));
    return isLoopbackHostname(origin.hostname);
  } catch {
    return false;
  }
}

export function publicBaseUrl(_req, env = process.env) {
  return resolveCanonicalAuthOrigin(env);
}

export function publicCabinetUrl(_req, env = process.env) {
  return buildCanonicalCabinetUrl(env);
}

export function allowDevelopmentAuthLinks(req, env = process.env) {
  return developmentAuthLinksAllowed(env, req?.socket?.remoteAddress || "");
}

export {
  isLoopbackAddress,
  isLoopbackHostname,
};
