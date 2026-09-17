import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  boundedResponseLimit,
  readBoundedResponse,
} from "./outboundResponse.js";

export const DEFAULT_ONE_C_CONFIG = {
  mode: "simulation",
  baseUrl: "",
  healthPath: "/hs/clover/v1/health",
  clientsPath: "/hs/clover/v1/clients",
  productsPath: "/hs/clover/v1/products",
  draftOrderPath: "/hs/clover/v1/orders/draft",
  username: "",
  timeoutMs: 10000,
  allowDraftCreation: false,
  updatedAt: "",
};

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePath(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (!raw) return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function policyError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function enabled(value) {
  return /^(?:1|true|yes|on)$/iu.test(String(value || "").trim());
}

function hostnameWithoutBrackets(value) {
  return String(value || "").replace(/^\[|\]$/gu, "").split("%")[0].toLowerCase();
}

function hasC0OrDel(value) {
  for (const ch of String(value || "")) {
    const code = ch.codePointAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isRfc1918Ipv4Literal(hostname) {
  const host = hostnameWithoutBrackets(hostname);
  if (isIP(host) !== 4) return false;
  const parts = host.split(".").map(Number);
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isLoopbackLiteral(hostname) {
  const host = hostnameWithoutBrackets(hostname);
  if (host === "::1") return true;
  if (host.startsWith("::ffff:")) {
    return isLoopbackLiteral(host.slice("::ffff:".length));
  }
  if (isIP(host) === 4) {
    return host.split(".").map(Number)[0] === 127;
  }
  return false;
}

function isProvenNonProductionRuntime(env = {}) {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "development" || nodeEnv === "test";
}

function isTrustedInsecureHttpLiteral(hostname, env = {}) {
  if (isRfc1918Ipv4Literal(hostname)) return true;
  return (
    enabled(env.ONEC_ALLOW_DEV_INSECURE_LOOPBACK) &&
    isProvenNonProductionRuntime(env) &&
    isLoopbackLiteral(hostname)
  );
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw);
  } catch {
    const error = new Error("Адрес 1С должен начинаться с http:// или https://.");
    error.code = "ONEC_TRUSTED_ORIGIN_INVALID";
    throw error;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    const error = new Error("Для подключения к 1С разрешены только HTTP и HTTPS.");
    error.code = "ONEC_TRUSTED_ORIGIN_INVALID";
    throw error;
  }

  if (url.username || url.password) {
    const error = new Error("Не указывайте логин и пароль внутри адреса 1С.");
    error.code = "ONEC_TRUSTED_ORIGIN_INVALID";
    throw error;
  }

  return trimSlash(url.toString());
}

export function resolveTrustedOneCOrigin(env = process.env, { warn } = {}) {
  const raw = String(env.ONEC_BASE_URL || "").trim();
  if (!raw) {
    throw policyError(
      "ONEC_TRUSTED_ORIGIN_REQUIRED",
      "Не заполнен адрес опубликованной базы 1С."
    );
  }
  if (hasC0OrDel(raw)) {
    throw policyError(
      "ONEC_TRUSTED_ORIGIN_INVALID",
      "Адрес 1С настроен некорректно."
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw policyError(
      "ONEC_TRUSTED_ORIGIN_INVALID",
      "Адрес 1С настроен некорректно."
    );
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.includes("..") ||
    url.pathname.includes("//")
  ) {
    throw policyError(
      "ONEC_TRUSTED_ORIGIN_INVALID",
      "Адрес 1С настроен некорректно."
    );
  }

  if (url.protocol === "http:") {
    if (!enabled(env.ONEC_ALLOW_INSECURE_HTTP)) {
      throw policyError(
        "ONEC_INSECURE_HTTP_DISABLED",
        "HTTP для 1С запрещён без явного серверного разрешения."
      );
    }
    if (!isTrustedInsecureHttpLiteral(url.hostname, env)) {
      throw policyError(
        "ONEC_INSECURE_HTTP_TARGET_INVALID",
        "Незащищённый HTTP к 1С разрешён только для доверенного частного литерала."
      );
    }
    warn?.(
      "ONEC_ALLOW_INSECURE_HTTP: исходящий HTTP к доверенному частному адресу 1С разрешён явно."
    );
  } else if (url.protocol !== "https:") {
    throw policyError(
      "ONEC_TRUSTED_ORIGIN_INVALID",
      "Для подключения к 1С разрешены только HTTP и HTTPS."
    );
  }

  return trimSlash(url.toString());
}

function assertSafeEndpointPath(value, fallback) {
  const raw = normalizePath(value, fallback);
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    raw.includes("..") ||
    /%2e/iu.test(raw) ||
    hasC0OrDel(raw)
  ) {
    throw policyError(
      "ONEC_ENDPOINT_PATH_INVALID",
      "Путь HTTP-сервиса 1С настроен некорректно.",
      500
    );
  }
  return raw;
}

export function sanitizeOneCConfig(value = {}) {
  const mode = value?.mode === "real" ? "real" : "simulation";
  const baseUrl = value?.baseUrl ? normalizeBaseUrl(value.baseUrl) : "";
  const timeoutMs = Math.min(
    30000,
    Math.max(3000, Number(value?.timeoutMs) || 10000)
  );

  return {
    ...DEFAULT_ONE_C_CONFIG,
    mode,
    baseUrl,
    healthPath: normalizePath(value?.healthPath, DEFAULT_ONE_C_CONFIG.healthPath),
    clientsPath: normalizePath(value?.clientsPath, DEFAULT_ONE_C_CONFIG.clientsPath),
    productsPath: normalizePath(value?.productsPath, DEFAULT_ONE_C_CONFIG.productsPath),
    draftOrderPath: normalizePath(value?.draftOrderPath, DEFAULT_ONE_C_CONFIG.draftOrderPath),
    username: String(value?.username || "").trim(),
    timeoutMs,
    allowDraftCreation: Boolean(value?.allowDraftCreation),
    updatedAt: new Date().toISOString(),
  };
}

export function resolveOneCRuntimeConfig(publicConfig = {}, env = process.env) {
  const stored = sanitizeOneCConfig(publicConfig);
  const envBaseUrl = String(env.ONEC_BASE_URL || "").trim();
  const baseUrl = envBaseUrl ? normalizeBaseUrl(envBaseUrl) : stored.baseUrl;
  const username = String(env.ONEC_USERNAME || stored.username || "").trim();
  const password = String(env.ONEC_PASSWORD || "");
  // OUTBOUND only (Clover → 1C). Does not authorize inbound /api/one-c/*
  // multi-contour routes. Inbound uses ONEC_TEST_EXCHANGE_API_KEY /
  // ONEC_VLAVKA_EXCHANGE_API_KEY (see oneCContourAuth.js).
  const apiKey = String(env.ONEC_API_KEY || "");
  const envWriteEnabled = ["1", "true", "yes", "on"].includes(
    String(env.ONEC_WRITE_ENABLED || "").toLowerCase()
  );

  return {
    ...stored,
    baseUrl,
    username,
    password,
    apiKey,
    writeEnabled: stored.allowDraftCreation && envWriteEnabled,
    secretConfigured: Boolean(password || apiKey),
    baseUrlFromEnv: Boolean(envBaseUrl),
    usernameFromEnv: Boolean(env.ONEC_USERNAME),
    mode: stored.mode === "real" ? "real" : "simulation",
  };
}

export function publicOneCStatus(publicConfig = {}) {
  const runtime = resolveOneCRuntimeConfig(publicConfig);
  return {
    config: {
      mode: runtime.mode,
      baseUrl: runtime.baseUrl,
      healthPath: runtime.healthPath,
      clientsPath: runtime.clientsPath,
      productsPath: runtime.productsPath,
      draftOrderPath: runtime.draftOrderPath,
      username: runtime.username,
      timeoutMs: runtime.timeoutMs,
      allowDraftCreation: runtime.allowDraftCreation,
      updatedAt: runtime.updatedAt,
    },
    runtime: {
      secretConfigured: runtime.secretConfigured,
      writeEnabled: runtime.writeEnabled,
      baseUrlFromEnv: runtime.baseUrlFromEnv,
      usernameFromEnv: runtime.usernameFromEnv,
      readyForRead: runtime.mode === "simulation" || Boolean(runtime.baseUrlFromEnv),
      readyForWrite:
        runtime.mode === "simulation" ||
        Boolean(runtime.baseUrlFromEnv && runtime.secretConfigured && runtime.writeEnabled),
    },
  };
}

function buildUrl(baseUrl, endpointPath, query = {}) {
  const safePath = assertSafeEndpointPath(endpointPath);
  const base = trimSlash(baseUrl);
  const url = new URL(`${base}${safePath}`);
  if (!String(url.href).startsWith(`${base}/`) && url.href !== `${base}${safePath}`) {
    throw policyError(
      "ONEC_ENDPOINT_PATH_INVALID",
      "Путь HTTP-сервиса 1С настроен некорректно.",
      500
    );
  }
  if (url.origin !== new URL(base).origin) {
    throw policyError(
      "ONEC_ENDPOINT_PATH_INVALID",
      "Путь HTTP-сервиса 1С настроен некорректно.",
      500
    );
  }
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function buildOneCAuthHeaders(config) {
  const headers = {
    Accept: "application/json",
  };

  // Send both credentials when available. Existing 1C publications can keep
  // using HTTP Basic auth, while the Clover extension can additionally check
  // the private X-Clover-Key header.
  if (config.apiKey) {
    headers["X-Clover-Key"] = config.apiKey;
  }
  if (config.username || config.password) {
    headers.Authorization = `Basic ${Buffer.from(
      `${config.username || ""}:${config.password || ""}`,
      "utf8"
    ).toString("base64")}`;
  }

  return headers;
}

async function requestJson(config, endpointPath, options = {}, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const trustedBase = resolveTrustedOneCOrigin(env, { warn: deps.warn });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const maxBytes = boundedResponseLimit(env.ONEC_MAX_RESPONSE_BYTES, {
    fallback: 2 * 1024 * 1024,
    minimum: 1024,
    maximum: 16 * 1024 * 1024,
  });

  try {
    const response = await fetchImpl(
      buildUrl(trustedBase, endpointPath, options.query),
      {
        method: options.method || "GET",
        headers: {
          ...buildOneCAuthHeaders(config),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        redirect: "manual",
      }
    );

    const status = Number(response.status) || 0;
    if (status >= 300 && status < 400) {
      try {
        if (typeof response.body?.cancel === "function") {
          await response.body.cancel();
        }
      } catch {
        // Best effort after a redirect denial.
      }
      throw policyError(
        "ONEC_REDIRECT_DENIED",
        "Перенаправление ответа 1С отклонено.",
        502
      );
    }

    const buffer = await readBoundedResponse(response, {
      maxBytes,
      signal: controller.signal,
      // Node fetch decompresses; Content-Length is the compressed size.
      enforceContentLength: false,
    });
    const text = buffer.toString("utf8");
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const message =
        payload?.error ||
        payload?.message ||
        `1С вернула HTTP ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `1С не ответила за ${Math.round(config.timeoutMs / 1000)} секунд.`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function testOneCConnection(publicConfig = {}, deps = {}) {
  const env = deps.env || process.env;
  const config = resolveOneCRuntimeConfig(publicConfig, env);

  if (config.mode === "simulation") {
    return {
      ok: true,
      mode: "simulation",
      service: "Clover 1C simulator",
      configuration: "УНФ 1.6",
      platform: "8.3.13+",
      database: "Без подключения к рабочей базе",
      checkedAt: new Date().toISOString(),
    };
  }

  const payload = await requestJson(config, config.healthPath, {}, deps);
  return {
    ok: payload?.ok !== false,
    mode: "real",
    service: payload?.service || "Clover HTTP service",
    configuration: payload?.configuration || "1С:УНФ",
    platform: payload?.platform || "",
    database: payload?.database || "",
    extensionVersion: payload?.extensionVersion || payload?.version || "",
    checkedAt: new Date().toISOString(),
    raw: payload,
  };
}

function simulatedClients(limit) {
  const items = [
    {
      id: "SIM-CLIENT-001",
      name: "Восточная лавка",
      inn: "",
      code: "000000001",
    },
    {
      id: "SIM-CLIENT-002",
      name: "ООО КЛЕВЕР",
      inn: "",
      code: "000000002",
    },
  ];
  return items.slice(0, limit);
}

function simulatedProducts(limit) {
  const items = [
    {
      id: "SIM-PRODUCT-001",
      name: "Перчатки нитриловые черные XL (100 шт.)",
      article: "CL-0001",
      code: "000000001",
      unit: "пач",
    },
    {
      id: "SIM-PRODUCT-002",
      name: "Банка суповая 500 мл Перинт (50/400)",
      article: "CL-0002",
      code: "000000002",
      unit: "шт",
    },
  ];
  return items.slice(0, limit);
}

export async function previewOneCCatalog(publicConfig, type, limit = 20, deps = {}) {
  const env = deps.env || process.env;
  const config = resolveOneCRuntimeConfig(publicConfig, env);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  if (config.mode === "simulation") {
    return {
      ok: true,
      mode: "simulation",
      type,
      count: type === "clients" ? simulatedClients(safeLimit).length : simulatedProducts(safeLimit).length,
      items:
        type === "clients"
          ? simulatedClients(safeLimit)
          : simulatedProducts(safeLimit),
      readOnly: true,
    };
  }

  const catalogPath = type === "clients" ? config.clientsPath : config.productsPath;
  const payload = await requestJson(config, catalogPath, {
    query: { limit: safeLimit },
  }, deps);
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    ok: payload?.ok !== false,
    mode: "real",
    type,
    count: items.length,
    items,
    readOnly: true,
    raw: payload,
  };
}

export async function createOneCDraft(publicConfig, orderPayload, deps = {}) {
  const env = deps.env || process.env;
  const config = resolveOneCRuntimeConfig(publicConfig, env);

  if (config.mode === "simulation") {
    const stamp = Date.now();
    return {
      ok: true,
      mode: "simulation",
      duplicate: false,
      posted: false,
      documentId: `SIM-DRAFT-${randomUUID()}`,
      documentNumber: `SIM-${String(stamp).slice(-8)}`,
      documentDate: new Date().toISOString(),
      message:
        "Безопасный черновик создан в симуляторе. Рабочая база 1С не изменялась.",
    };
  }

  if (!config.writeEnabled) {
    throw new Error(
      "Создание черновиков в рабочей 1С заблокировано. Для включения нужны расширение, резервная копия и ONEC_WRITE_ENABLED=true в server/.env."
    );
  }

  if (!config.secretConfigured) {
    throw new Error("Не настроен пароль или API-ключ для подключения к 1С.");
  }

  const payload = await requestJson(config, config.draftOrderPath, {
    method: "POST",
    body: {
      ...orderPayload,
      target: {
        configuration: "Управление нашей фирмой 1.6",
        document: "ЗаказПокупателя",
        conduct: false,
      },
    },
  }, deps);

  if (payload?.ok === false) {
    throw new Error(payload?.error || "1С не создала черновик заказа.");
  }

  return {
    ok: true,
    mode: "real",
    duplicate: Boolean(payload?.duplicate),
    posted: Boolean(payload?.posted),
    documentId: String(payload?.documentId || payload?.ref || ""),
    documentNumber: String(payload?.documentNumber || payload?.number || ""),
    documentDate: payload?.documentDate || payload?.date || "",
    message:
      payload?.message ||
      "Непроведённый черновик заказа создан в 1С.",
    raw: payload,
  };
}
