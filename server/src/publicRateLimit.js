/**
 * Security Stage 4 Package B — bounded in-memory public rate limits.
 *
 * Keys are HMAC-SHA256(subject). Raw email/phone/token/PII are never stored.
 * Store is process-local: restart and multi-process remain explicit residuals.
 * Production SQLite persistence is not enabled (would need a separate DB change).
 *
 * Residuals:
 * - Unique-subject spray when the store is at maxEntries is fail-open
 *   (`tracked=false`, `capacity=true`) and is not persisted. That spray is
 *   not a global block and does not evict live buckets.
 * - Clearing or replacing the anonymous client cookie starts a new bucket.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RATE_LIMIT_KEY_VERSION = String(process.env.RATE_LIMIT_KEY_VERSION || "1");
export const ANONYMOUS_CLIENT_COOKIE = "clover_rl_client";

export const PUBLIC_RATE_LIMIT_POLICIES = Object.freeze({
  login: Object.freeze({ max: 20, windowMs: 10 * 60 * 1000 }),
  register: Object.freeze({ max: 8, windowMs: 10 * 60 * 1000 }),
  forgotPassword: Object.freeze({ max: 5, windowMs: 15 * 60 * 1000 }),
  resendVerification: Object.freeze({ max: 5, windowMs: 15 * 60 * 1000 }),
  verifyEmail: Object.freeze({ max: 8, windowMs: 10 * 60 * 1000 }),
  resetPassword: Object.freeze({ max: 8, windowMs: 10 * 60 * 1000 }),
  passkeyAuthOptions: Object.freeze({ max: 10, windowMs: 10 * 60 * 1000 }),
  passkeyAuthVerify: Object.freeze({ max: 10, windowMs: 10 * 60 * 1000 }),
  guestOrder: Object.freeze({ max: 6, windowMs: 10 * 60 * 1000 }),
});

const DEFAULT_MAX_ENTRIES = 10_000;
const PRUNE_EVERY_MS = 60_000;
const PRUNE_BUDGET = 32;

function readMaxEntries(env = process.env) {
  const raw = Number(env.CLOVER_RATE_LIMIT_MAX_ENTRIES);
  if (Number.isInteger(raw) && raw >= 8 && raw <= 100_000) return raw;
  return DEFAULT_MAX_ENTRIES;
}

export function normalizeRateLimitEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeRateLimitPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("8") && digits.length >= 11) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.startsWith("7") && digits.length >= 11) {
    return digits.slice(0, 11);
  }
  if (digits.startsWith("9") && digits.length >= 10) {
    return `7${digits.slice(0, 10)}`;
  }
  return digits;
}

export function normalizeRateLimitSubject(scope, value) {
  if (scope === "guestOrder") return normalizeRateLimitPhone(value);
  if (scope === "login" || scope === "register" || scope === "forgotPassword" || scope === "resendVerification") {
    return normalizeRateLimitEmail(value);
  }
  if (scope === "passkeyAuthOptions") {
    const email = normalizeRateLimitEmail(value);
    if (email.includes("@")) return email;
    const raw = String(value || "").trim().toLowerCase();
    if (/^anon:[0-9a-f]{32}$/.test(raw)) return raw;
    throw new Error("passkey_options_subject_required");
  }
  if (scope === "passkeyAuthVerify") {
    const email = normalizeRateLimitEmail(value);
    if (email.includes("@")) return email;
    return String(value || "").trim();
  }
  return String(value || "").trim();
}

export function hashRateLimitSubject({ secret, version = RATE_LIMIT_KEY_VERSION, scope, subject }) {
  const material = String(secret || "");
  if (material.length < 32) {
    throw new Error("rate_limit_secret_required");
  }
  return createHmac("sha256", material)
    .update(`rl:v${String(version || "1")}:${String(scope || "")}:${String(subject || "")}`)
    .digest("hex");
}

function hmacAnonymousClient(id, secret) {
  return createHmac("sha256", String(secret)).update(`rlc:v1:${id}`).digest();
}

export function createAnonymousClientId() {
  return randomBytes(16).toString("hex");
}

export function encodeAnonymousClientCookie(id, secret) {
  return `${id}.${hmacAnonymousClient(id, secret).toString("hex")}`;
}

export function decodeAnonymousClientCookie(raw, secret) {
  const text = String(raw || "").trim();
  const dot = text.indexOf(".");
  if (dot <= 0) return null;
  const id = text.slice(0, dot).toLowerCase();
  const sig = text.slice(dot + 1).toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  let provided;
  try {
    provided = Buffer.from(sig, "hex");
  } catch {
    return null;
  }
  const expected = hmacAnonymousClient(id, secret);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  return id;
}

export function readCookieValue(cookieHeader, name) {
  for (const part of String(cookieHeader || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return "";
}

export function buildAnonymousClientCookieHeader(id, secret, { secure = false } = {}) {
  const parts = [
    `${ANONYMOUS_CLIENT_COOKIE}=${encodeAnonymousClientCookie(id, secret)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function resolveAnonymousRateLimitClient({
  cookieHeader,
  secret,
  secure = false,
} = {}) {
  const existing = decodeAnonymousClientCookie(
    readCookieValue(cookieHeader, ANONYMOUS_CLIENT_COOKIE),
    secret
  );
  if (existing) {
    return { id: existing, issued: false, cookie: null };
  }
  const id = createAnonymousClientId();
  return {
    id,
    issued: true,
    cookie: buildAnonymousClientCookieHeader(id, secret, { secure }),
  };
}

export function createBoundedRateLimitStore({
  maxEntries = DEFAULT_MAX_ENTRIES,
  now = () => Date.now(),
} = {}) {
  const map = new Map();
  let lastPruneAt = 0;
  let cursor = null;

  function isExpired(entry, current) {
    return !entry || current - entry.startedAt > entry.windowMs;
  }

  function pruneExpiredBudgeted(current = now(), budget = PRUNE_BUDGET) {
    if (map.size === 0 || budget <= 0) return { removed: 0, inspected: 0 };
    if (!cursor) cursor = map.keys();
    let removed = 0;
    let inspected = 0;
    while (inspected < budget) {
      const next = cursor.next();
      if (next.done) {
        cursor = null;
        break;
      }
      inspected += 1;
      const key = next.value;
      const entry = map.get(key);
      if (isExpired(entry, current)) {
        map.delete(key);
        removed += 1;
      }
    }
    return { removed, inspected };
  }

  function pruneExpired(current = now()) {
    let removed = 0;
    for (const [key, entry] of map) {
      if (isExpired(entry, current)) {
        map.delete(key);
        removed += 1;
      }
    }
    cursor = null;
    lastPruneAt = current;
    return removed;
  }

  function maybePrune(current) {
    if (current - lastPruneAt < PRUNE_EVERY_MS) return { removed: 0, inspected: 0 };
    const result = pruneExpiredBudgeted(current, PRUNE_BUDGET);
    lastPruneAt = current;
    return result;
  }

  return {
    size() {
      return map.size;
    },
    pruneExpired,
    delete(key) {
      map.delete(key);
    },
    consume(key, { max, windowMs }) {
      const current = now();
      let inspected = maybePrune(current).inspected;
      const existing = map.get(key);
      if (existing && !isExpired(existing, current)) {
        existing.count += 1;
        existing.max = max;
        const allowed = existing.count <= max;
        const remainingMs = existing.windowMs - (current - existing.startedAt);
        const retryAfterSeconds = allowed || remainingMs <= 0
          ? 0
          : Math.ceil(remainingMs / 1000);
        return {
          allowed,
          retryAfterSeconds,
          count: existing.count,
          tracked: true,
          capacity: false,
          inspected,
        };
      }
      if (existing) map.delete(key);
      if (map.size >= maxEntries) {
        inspected += pruneExpiredBudgeted(current, PRUNE_BUDGET).inspected;
      }
      if (map.size >= maxEntries) {
        return {
          allowed: true,
          retryAfterSeconds: 0,
          count: 0,
          tracked: false,
          capacity: true,
          inspected,
        };
      }
      map.set(key, {
        count: 1,
        startedAt: current,
        windowMs,
        max,
      });
      return {
        allowed: true,
        retryAfterSeconds: 0,
        count: 1,
        tracked: true,
        capacity: false,
        inspected,
      };
    },
  };
}

let sharedStore = null;

export function getPublicRateLimitStore(env = process.env) {
  if (!sharedStore) {
    sharedStore = createBoundedRateLimitStore({
      maxEntries: readMaxEntries(env),
    });
  }
  return sharedStore;
}

export function resetPublicRateLimitStoreForTests() {
  sharedStore = null;
}

export function consumePublicRateLimit({
  scope,
  subject,
  secret,
  version = RATE_LIMIT_KEY_VERSION,
  store = getPublicRateLimitStore(),
}) {
  const policy = PUBLIC_RATE_LIMIT_POLICIES[scope];
  if (!policy) {
    throw new Error(`unknown_rate_limit_scope:${scope}`);
  }
  const normalized = normalizeRateLimitSubject(scope, subject);
  const key = hashRateLimitSubject({
    secret,
    version,
    scope,
    subject: normalized,
  });
  return store.consume(key, policy);
}

export function resetPublicRateLimit({
  scope,
  subject,
  secret,
  version = RATE_LIMIT_KEY_VERSION,
  store = getPublicRateLimitStore(),
}) {
  const normalized = normalizeRateLimitSubject(scope, subject);
  if (!normalized) return;
  store.delete(hashRateLimitSubject({
    secret,
    version,
    scope,
    subject: normalized,
  }));
}

export function sendPublicRateLimited(res, decision = {}) {
  const retryAfter = Number(decision.retryAfterSeconds) || 0;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  if (retryAfter > 0) {
    res.setHeader("Retry-After", String(retryAfter));
  }
  return res.status(429).json({
    error: "Слишком много попыток. Попробуйте позже.",
    code: "AUTH_RATE_LIMITED",
  });
}

export function enforcePublicRateLimit(res, { scope, subject, secret }) {
  const decision = consumePublicRateLimit({ scope, subject, secret });
  if (decision.allowed) return false;
  sendPublicRateLimited(res, decision);
  return true;
}
