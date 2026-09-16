/**
 * SEC-001: Strict 1C TEST / VLAVKA inbound credential ↔ contour binding.
 *
 * Inbound authority: authenticated credential → server-owned contour.
 * Requested database never chooses authority.
 *
 * ONEC_API_KEY remains outbound-only (Clover → 1C) unless an explicit single-contour
 * legacy inbound flag is set (OFF by default).
 *
 * Contour keys are required only for contours present in the active allowlist.
 * VLAVKA-only (prod + ALLOWED=VLAVKA) does not require ONEC_TEST_EXCHANGE_API_KEY.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import {
  TEST_DATABASE_NAME,
  isProdExchangeEnabled,
  normalizeOneCDatabaseName,
  parseAllowedOneCDatabases,
} from "./oneCPriceSync.js";

export const ONEC_CONTOUR_TEST = TEST_DATABASE_NAME;
export const ONEC_CONTOUR_VLAVKA = "VLAVKA";
export const ONEC_CONTOURS = Object.freeze([ONEC_CONTOUR_TEST, ONEC_CONTOUR_VLAVKA]);

const MIN_KEY_LEN = 24;

/** Strict loopback only — never LAN/host NIC addresses. */
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);

function clean(value) {
  return String(value ?? "").trim();
}

function isPlaceholderSecret(value) {
  return /^(?:change[_-]?me(?:[_-].*)?|secret|development-secret|clover-local-development-secret-change-before-production)$/i.test(
    clean(value)
  );
}

function normalizeRemoteAddress(value) {
  return String(value || "")
    .replace(/^::ffff:/, "")
    .split("%")[0];
}

function isLoopbackAddress(value) {
  return LOOPBACK_ADDRESSES.has(normalizeRemoteAddress(value));
}

function isProductionRuntime(env = process.env) {
  return String(env.NODE_ENV || "").toLowerCase() === "production";
}

function digestKey(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest();
}

function secureDigestEqual(leftDigest, rightDigest) {
  if (
    !Buffer.isBuffer(leftDigest) ||
    !Buffer.isBuffer(rightDigest) ||
    leftDigest.length !== rightDigest.length
  ) {
    return false;
  }
  return timingSafeEqual(leftDigest, rightDigest);
}

export function isValidExchangeCredential(value) {
  const key = clean(value);
  return key.length >= MIN_KEY_LEN && !isPlaceholderSecret(key);
}

/** Allowlist for a given env object (does not leak process.env into unit tests). */
function allowedDatabasesForEnv(env) {
  return parseAllowedOneCDatabases(
    env.ONEC_ALLOWED_DATABASES,
    isProdExchangeEnabled(env.ONEC_PROD_EXCHANGE_ENABLED)
  );
}

export function loadOneCContourCredentialConfig(env = process.env) {
  const errors = [];
  const identities = [];
  const prodEnabled = isProdExchangeEnabled(env.ONEC_PROD_EXCHANGE_ENABLED);
  const allowed = allowedDatabasesForEnv(env);
  const allowTest = allowed.includes(ONEC_CONTOUR_TEST);
  const allowVlavka = allowed.includes(ONEC_CONTOUR_VLAVKA);

  const testKey = clean(env.ONEC_TEST_EXCHANGE_API_KEY);
  const vlavkaKey = clean(env.ONEC_VLAVKA_EXCHANGE_API_KEY);
  const outboundOrLegacyKey = clean(env.ONEC_API_KEY);
  const legacyContour = normalizeOneCDatabaseName(
    env.ONEC_LEGACY_INBOUND_KEY_CONTOUR || ""
  );

  if (testKey) {
    if (!isValidExchangeCredential(testKey)) {
      errors.push("ONEC_TEST_EXCHANGE_API_KEY is malformed or too short");
    } else {
      identities.push({
        contour: ONEC_CONTOUR_TEST,
        credentialId: "test-exchange",
        digest: digestKey(testKey),
      });
    }
  }

  if (vlavkaKey) {
    if (!isValidExchangeCredential(vlavkaKey)) {
      errors.push("ONEC_VLAVKA_EXCHANGE_API_KEY is malformed or too short");
    } else {
      identities.push({
        contour: ONEC_CONTOUR_VLAVKA,
        credentialId: "vlavka-exchange",
        digest: digestKey(vlavkaKey),
      });
    }
  }

  // Explicit single-contour legacy inbound only (OFF by default).
  if (legacyContour) {
    if (!ONEC_CONTOURS.includes(legacyContour)) {
      errors.push("ONEC_LEGACY_INBOUND_KEY_CONTOUR must be TEST or VLAVKA");
    } else if (prodEnabled || allowVlavka) {
      errors.push(
        "ONEC_LEGACY_INBOUND_KEY_CONTOUR is forbidden when production/VLAVKA exchange is enabled"
      );
    } else if (!isValidExchangeCredential(outboundOrLegacyKey)) {
      errors.push(
        "ONEC_LEGACY_INBOUND_KEY_CONTOUR requires a valid ONEC_API_KEY (≥24, non-placeholder)"
      );
    } else if (identities.some((item) => item.contour === legacyContour)) {
      // Prefer dedicated exchange key; do not register duplicate contour identity.
    } else {
      identities.push({
        contour: legacyContour,
        credentialId: "legacy-inbound",
        digest: digestKey(outboundOrLegacyKey),
      });
    }
  }

  if (legacyContour && !allowed.includes(legacyContour)) {
    errors.push(
      "ONEC_LEGACY_INBOUND_KEY_CONTOUR must be in the active allowlist"
    );
  }

  // Detect identical TEST/VLAVKA secrets when both are configured.
  if (
    isValidExchangeCredential(testKey) &&
    isValidExchangeCredential(vlavkaKey) &&
    secureDigestEqual(digestKey(testKey), digestKey(vlavkaKey))
  ) {
    errors.push("TEST and VLAVKA exchange credentials must be distinct");
  }

  // Same digest registered under multiple contours.
  const byDigest = new Map();
  for (const identity of identities) {
    const hex = identity.digest.toString("hex");
    if (byDigest.has(hex) && byDigest.get(hex) !== identity.contour) {
      errors.push("one credential must not authenticate multiple contours");
    }
    byDigest.set(hex, identity.contour);
  }

  const hasTest = identities.some((item) => item.contour === ONEC_CONTOUR_TEST);
  const hasVlavka = identities.some(
    (item) => item.contour === ONEC_CONTOUR_VLAVKA
  );

  // Require a dedicated inbound key only for each allowlisted contour.
  if (allowTest && !hasTest) {
    // TEST-only non-prod may start without inbound keys (routes return 401).
    if (prodEnabled || allowVlavka || allowed.length !== 1) {
      errors.push("ONEC_TEST_EXCHANGE_API_KEY is required");
    }
  }
  if (allowVlavka && !hasVlavka) {
    errors.push("ONEC_VLAVKA_EXCHANGE_API_KEY is required");
  }

  const allowLocalRaw =
    String(env.ONEC_ALLOW_LOCAL_WITHOUT_KEY || "false").toLowerCase() ===
    "true";
  let localBypassAllowed = false;
  if (allowLocalRaw) {
    if (
      isProductionRuntime(env) ||
      prodEnabled ||
      allowVlavka ||
      allowed.length !== 1 ||
      !allowTest
    ) {
      errors.push(
        "ONEC_ALLOW_LOCAL_WITHOUT_KEY is only allowed for TEST-only non-production configuration"
      );
    } else {
      localBypassAllowed = true;
    }
  }

  return {
    identities,
    errors,
    localBypassAllowed,
    legacyInboundContour: legacyContour || "",
    prodEnabled,
    allowedDatabases: allowed,
  };
}

export function assertOneCContourAuthConfig(env = process.env) {
  const config = loadOneCContourCredentialConfig(env);
  if (config.errors.length) {
    const error = new Error(
      `ONEC contour credential config invalid: ${config.errors.join("; ")}`
    );
    error.code = "ONEC_CONFIG_INVALID";
    error.details = config.errors;
    throw error;
  }
  return config;
}

/**
 * Extract contour sources; reject conflicts.
 * @returns {{ contour: string, errorCode?: string, status?: number, error?: string }}
 */
export function resolveRequestedOneCContour(req = {}) {
  const header = normalizeOneCDatabaseName(req.headers?.["x-clover-database"]);
  const body = normalizeOneCDatabaseName(req.body?.database);
  const query = normalizeOneCDatabaseName(req.query?.database);
  const present = [header, body, query].filter(Boolean);
  if (present.length >= 2) {
    const unique = new Set(present);
    if (unique.size > 1) {
      return {
        contour: "",
        status: 400,
        errorCode: "ONEC_CONTOUR_CONFLICT",
        error: "Conflicting 1C contour sources in the request.",
      };
    }
  }
  const contour = present[0] || "";
  if (contour && !ONEC_CONTOURS.includes(contour)) {
    return {
      contour: "",
      status: 400,
      errorCode: "ONEC_CONTOUR_CONFLICT",
      error: "Unknown 1C contour.",
    };
  }
  return { contour };
}

export function extractOneCAuthCredentials(req = {}) {
  const headerKey = clean(req.headers?.["x-clover-key"]);
  const auth = String(req.headers?.authorization || "");
  const bearer = auth.startsWith("Bearer ") ? clean(auth.slice(7)) : "";
  if (headerKey && bearer && headerKey !== bearer) {
    return {
      supplied: "",
      status: 400,
      errorCode: "ONEC_AUTH_DENIED",
      error: "Conflicting 1C credentials in Authorization and X-Clover-Key.",
    };
  }
  return { supplied: headerKey || bearer || "" };
}

/**
 * Constant-time match against all configured inbound identities.
 */
export function matchOneCContourCredential(supplied, identities) {
  const suppliedDigest = digestKey(supplied);
  let matched = null;
  // Always scan every identity (no early return) for timing uniformity.
  for (const identity of identities) {
    const ok = secureDigestEqual(suppliedDigest, identity.digest);
    if (ok && !matched) matched = identity;
  }
  // Also compare against a dummy digest when empty list to keep work non-zero.
  if (!identities.length) {
    secureDigestEqual(suppliedDigest, digestKey(""));
  }
  return matched;
}

export function createOneCAuthMiddleware({
  env = process.env,
  writeAudit = () => {},
} = {}) {
  return function oneCAuthRequired(req, res, next) {
    let config;
    try {
      config = assertOneCContourAuthConfig(env);
    } catch (_error) {
      writeAudit({
        action: "one-c.auth.denied",
        details: { ip: req.ip || "", mode: "config-invalid" },
      });
      return res.status(503).json({
        error: "1C exchange credentials are not configured safely.",
        code: "ONEC_CONFIG_INVALID",
      });
    }

    const creds = extractOneCAuthCredentials(req);
    if (creds.error) {
      writeAudit({
        action: "one-c.auth.denied",
        details: { ip: req.ip || "", mode: "header-conflict" },
      });
      return res.status(creds.status).json({
        error: creds.error,
        code: creds.errorCode,
      });
    }

    if (creds.supplied) {
      const matched = matchOneCContourCredential(
        creds.supplied,
        config.identities
      );
      // Non-allowlisted contour identity → same 401 as unknown (no contour oracle).
      if (!matched || !config.allowedDatabases.includes(matched.contour)) {
        writeAudit({
          action: "one-c.auth.denied",
          details: { ip: req.ip || "", mode: "api-key" },
        });
        return res.status(401).json({
          error: "Неверный ключ обмена Clover.",
          code: "ONEC_AUTH_REQUIRED",
        });
      }
      req.oneCAuth = {
        contour: matched.contour,
        credentialId: matched.credentialId,
      };
      return next();
    }

    // Local bypass: TEST-only, strict loopback, non-prod, explicit flag.
    const remoteAddress = req.socket?.remoteAddress || req.ip;
    if (config.localBypassAllowed && isLoopbackAddress(remoteAddress)) {
      req.oneCAuth = {
        contour: ONEC_CONTOUR_TEST,
        credentialId: "local-bypass",
      };
      return next();
    }

    writeAudit({
      action: "one-c.auth.denied",
      details: { ip: req.ip || "", mode: "key-required" },
    });
    return res.status(401).json({
      error: "Требуется ключ обмена 1С.",
      code: "ONEC_AUTH_REQUIRED",
    });
  };
}

/**
 * Resolve operation contour from authenticated identity + optional request contour.
 * Never lets request contour choose authority.
 */
export function authorizeOneCContour(req, res, {
  isAllowedDatabase = (value) =>
    parseAllowedOneCDatabases().includes(normalizeOneCDatabaseName(value)),
} = {}) {
  const auth = req.oneCAuth;
  if (!auth?.contour) {
    res.status(401).json({
      error: "Требуется ключ обмена 1С.",
      code: "ONEC_AUTH_REQUIRED",
    });
    return null;
  }

  const requested = resolveRequestedOneCContour(req);
  if (requested.error) {
    res.status(requested.status).json({
      error: requested.error,
      code: requested.errorCode,
    });
    return null;
  }

  // Missing request contour → use authenticated contour (never a hidden default).
  const contour = requested.contour || auth.contour;

  if (requested.contour && requested.contour !== auth.contour) {
    res.status(403).json({
      error: "Ключ обмена не соответствует запрошенному контуру 1С.",
      code: "ONEC_CONTOUR_MISMATCH",
    });
    return null;
  }

  if (contour !== auth.contour) {
    res.status(403).json({
      error: "Ключ обмена не соответствует контуру операции.",
      code: "ONEC_CONTOUR_MISMATCH",
    });
    return null;
  }

  if (!isAllowedDatabase(contour)) {
    // No allowlist / prodEnabled disclosure in auth responses.
    res.status(403).json({
      error: "Этот обмен запрещён для указанного контура 1С.",
      code: "ONEC_AUTH_DENIED",
    });
    return null;
  }

  req.oneCContour = contour;
  return contour;
}
