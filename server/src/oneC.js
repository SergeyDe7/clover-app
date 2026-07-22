import { randomUUID } from "node:crypto";

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

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Адрес 1С должен начинаться с http:// или https://.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Для подключения к 1С разрешены только HTTP и HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("Не указывайте логин и пароль внутри адреса 1С.");
  }

  return trimSlash(url.toString());
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

export function resolveOneCRuntimeConfig(publicConfig = {}) {
  const stored = sanitizeOneCConfig(publicConfig);
  const envBaseUrl = String(process.env.ONEC_BASE_URL || "").trim();
  const baseUrl = envBaseUrl ? normalizeBaseUrl(envBaseUrl) : stored.baseUrl;
  const username = String(process.env.ONEC_USERNAME || stored.username || "").trim();
  const password = String(process.env.ONEC_PASSWORD || "");
  const apiKey = String(process.env.ONEC_API_KEY || "");
  const envWriteEnabled = ["1", "true", "yes", "on"].includes(
    String(process.env.ONEC_WRITE_ENABLED || "").toLowerCase()
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
    usernameFromEnv: Boolean(process.env.ONEC_USERNAME),
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
      readyForRead: runtime.mode === "simulation" || Boolean(runtime.baseUrl),
      readyForWrite:
        runtime.mode === "simulation" ||
        Boolean(runtime.baseUrl && runtime.secretConfigured && runtime.writeEnabled),
    },
  };
}

function buildUrl(baseUrl, endpointPath, query = {}) {
  const url = new URL(`${trimSlash(baseUrl)}${normalizePath(endpointPath)}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function authHeaders(config) {
  const headers = {
    Accept: "application/json",
  };

  if (config.apiKey) {
    headers["X-Clover-Key"] = config.apiKey;
  } else if (config.username || config.password) {
    headers.Authorization = `Basic ${Buffer.from(
      `${config.username || ""}:${config.password || ""}`,
      "utf8"
    ).toString("base64")}`;
  }

  return headers;
}

async function requestJson(config, endpointPath, options = {}) {
  if (!config.baseUrl) {
    throw new Error("Не заполнен адрес опубликованной базы 1С.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(
      buildUrl(config.baseUrl, endpointPath, options.query),
      {
        method: options.method || "GET",
        headers: {
          ...authHeaders(config),
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      }
    );

    const text = await response.text();
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
        `1С не ответила за ${Math.round(config.timeoutMs / 1000)} секунд.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function testOneCConnection(publicConfig = {}) {
  const config = resolveOneCRuntimeConfig(publicConfig);

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

  const payload = await requestJson(config, config.healthPath);
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

export async function previewOneCCatalog(publicConfig, type, limit = 20) {
  const config = resolveOneCRuntimeConfig(publicConfig);
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

  const path = type === "clients" ? config.clientsPath : config.productsPath;
  const payload = await requestJson(config, path, {
    query: { limit: safeLimit },
  });
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

export async function createOneCDraft(publicConfig, orderPayload) {
  const config = resolveOneCRuntimeConfig(publicConfig);

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
  });

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
