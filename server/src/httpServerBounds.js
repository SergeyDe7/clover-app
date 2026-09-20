/**
 * Security Stage 4 Package C — explicit HTTP server resource bounds.
 *
 * Values are taken from Node 24.18.0 semantics (this machine):
 * - requestTimeout default 300000 (whole request)
 * - headersTimeout default 60000 (complete headers)
 * - keepAliveTimeout default 5000
 * - timeout default 0 (no inactivity limit) — we set a finite inactivity timeout
 * - maxConnections default undefined/Infinity
 * - maxRequestsPerSocket default 0 (unlimited)
 *
 * Production defaults stay long enough for Package A 24mb bulk and 1C
 * poll/claim/ACK. Short test values require NODE_ENV=test AND
 * CLOVER_HTTP_TEST_BOUNDS=1 so they cannot leak into production.
 *
 * Release-gate: PREPARE/PROMOTE of this package is forbidden while
 * production is still on 71cf5b5. Production must first contain 18d4c3b
 * or a separate unmixed release must be approved.
 *
 * Residuals: CDN/provider volumetric DDoS is out of scope. Nginx is not
 * the application guard — these bounds apply to the isolated Node listener.
 */
export const PRODUCTION_HTTP_SERVER_BOUNDS = Object.freeze({
  headersTimeout: 60_000,
  requestTimeout: 300_000,
  timeout: 120_000,
  keepAliveTimeout: 5_000,
  maxConnections: 512,
  maxRequestsPerSocket: 1_000,
});

function integerEnv(env, name, fallback, { min, max }) {
  if (!Object.prototype.hasOwnProperty.call(env, name)) return fallback;
  const raw = Number(env[name]);
  if (!Number.isInteger(raw) || raw < min || raw > max) {
    throw new Error(`invalid_${name}`);
  }
  return raw;
}

export function isHttpTestBoundsEnabled(env = process.env) {
  return env.NODE_ENV === "test" && String(env.CLOVER_HTTP_TEST_BOUNDS || "") === "1";
}

export function readHttpServerBounds(env = process.env) {
  const base = { ...PRODUCTION_HTTP_SERVER_BOUNDS };
  if (!isHttpTestBoundsEnabled(env)) return Object.freeze(base);
  const next = {
    headersTimeout: integerEnv(env, "CLOVER_HTTP_HEADERS_TIMEOUT_MS", 400, { min: 50, max: 5_000 }),
    requestTimeout: integerEnv(env, "CLOVER_HTTP_REQUEST_TIMEOUT_MS", 800, { min: 100, max: 10_000 }),
    timeout: integerEnv(env, "CLOVER_HTTP_SOCKET_TIMEOUT_MS", 600, { min: 50, max: 10_000 }),
    keepAliveTimeout: integerEnv(env, "CLOVER_HTTP_KEEPALIVE_TIMEOUT_MS", 150, { min: 20, max: 2_000 }),
    maxConnections: integerEnv(env, "CLOVER_HTTP_MAX_CONNECTIONS", 8, { min: 1, max: 64 }),
    maxRequestsPerSocket: integerEnv(env, "CLOVER_HTTP_MAX_REQUESTS_PER_SOCKET", 4, { min: 1, max: 32 }),
  };
  if (next.headersTimeout <= next.keepAliveTimeout) {
    throw new Error("headersTimeout_must_exceed_keepAliveTimeout");
  }
  if (next.requestTimeout < next.headersTimeout) {
    throw new Error("requestTimeout_must_cover_headersTimeout");
  }
  return Object.freeze(next);
}

export function applyHttpServerBounds(server, bounds = readHttpServerBounds()) {
  if (!server || typeof server !== "object") {
    throw new Error("http_server_required");
  }
  server.headersTimeout = bounds.headersTimeout;
  server.requestTimeout = bounds.requestTimeout;
  server.timeout = bounds.timeout;
  server.keepAliveTimeout = bounds.keepAliveTimeout;
  server.maxConnections = bounds.maxConnections;
  if (typeof server.maxRequestsPerSocket === "number" || "maxRequestsPerSocket" in server) {
    server.maxRequestsPerSocket = bounds.maxRequestsPerSocket;
  }
  return bounds;
}
