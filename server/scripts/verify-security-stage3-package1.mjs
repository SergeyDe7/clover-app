/**
 * Security Stage 3 Package 1 — behavioral RED/GREEN against live contracts.
 *
 * Each finding calls an existing public function (or a 1:1 extract of one).
 * Module-not-found, syntax errors, and harness crashes are not RED.
 * Fixture-only: temp SQLite, mocked fetch/https, synthetic secrets.
 * No production env, DB, 1C, email, Telegram, MAX, or Web Push.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import {
  executeClientRegistration,
  executeForgotPassword,
  executeResendVerification,
} from "../src/authIssuance.js";
import {
  allowDevelopmentAuthLinks,
  publicBaseUrl,
  publicCabinetUrl,
} from "../src/authUrlPolicy.js";
import {
  createOneCDraft,
  previewOneCCatalog,
  resolveOneCRuntimeConfig,
  resolveTrustedOneCOrigin,
  sanitizeOneCConfig,
  testOneCConnection,
} from "../src/oneC.js";
import { readBoundedResponse } from "../src/outboundResponse.js";
import { downloadBinary } from "../src/productEnrichment.js";
import { upsertPushSubscriptionRecord } from "../src/pushSubscriptionOwnership.js";
import { resetPasswordEmail, verificationEmail } from "../src/mailer.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const WORKTREE_DATA = path.resolve(repositoryRoot, "server/data");

function rejectUnsafePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
  if (resolved === WORKTREE_DATA || resolved.startsWith(`${WORKTREE_DATA}${path.sep}`)) {
    throw new Error(`Refusing worktree DB path: ${resolved}`);
  }
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

async function expectCodeAsync(fn, code) {
  await assert.rejects(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function withEnv(patch, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return Promise.resolve(result).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function withFetch(impl, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  const restore = () => {
    globalThis.fetch = previous;
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return Promise.resolve(result).finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status || 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function imageResponse(bytes = 2048) {
  return new Response(Buffer.alloc(bytes, 1), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes),
    },
  });
}

function spoofedRequest(host = "evil.example.invalid") {
  return {
    protocol: "http",
    hostname: host,
    get(name) {
      return String(name).toLowerCase() === "host" ? host : "";
    },
    socket: { remoteAddress: "198.51.100.10" },
  };
}

function loopbackRequest() {
  return {
    protocol: "http",
    hostname: "127.0.0.1",
    get(name) {
      return String(name).toLowerCase() === "host" ? "127.0.0.1:5273" : "";
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function nodeResponse({ statusCode = 200, headers = {}, chunks = [] } = {}) {
  const response = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
  response.statusCode = statusCode;
  response.headers = headers;
  return response;
}

function createAuthSpies({ existingUser = null } = {}) {
  const calls = {
    findUserByEmail: [],
    createUser: [],
    createAuthToken: [],
    sendCloverMail: [],
    hashPassword: [],
    writeAudit: [],
    queueManagerNotification: [],
  };
  const deps = {
    env: {
      APP_PUBLIC_URL: "https://public.example.invalid",
      CABINET_PATH: "/lk",
    },
    findUserByEmail(email) {
      calls.findUserByEmail.push(email);
      return existingUser;
    },
    async hashPassword(password) {
      calls.hashPassword.push(password);
      return "hash-fixture";
    },
    createUser(payload) {
      calls.createUser.push(payload);
      return { id: "user-1", email: payload.email, role: "client" };
    },
    createPlainToken() {
      return "plain-token-fixture";
    },
    tokenHash(value) {
      return `hashed:${value}`;
    },
    createAuthToken(payload) {
      calls.createAuthToken.push(payload);
    },
    verificationEmail({ verifyUrl, companyName }) {
      return { subject: "verify", text: `${companyName}:${verifyUrl}`, html: verifyUrl };
    },
    resetPasswordEmail({ resetUrl }) {
      return { subject: "reset", text: resetUrl, html: resetUrl };
    },
    async sendCloverMail(payload) {
      calls.sendCloverMail.push(payload);
      return { sent: true };
    },
    writeAudit(payload) {
      calls.writeAudit.push(payload);
    },
    queueManagerNotification(payload) {
      calls.queueManagerNotification.push(payload);
    },
    getClientState() {
      return { profile: { companyName: "ACME" } };
    },
    isClientRole() {
      return true;
    },
    publicMailStatus() {
      return { configured: false };
    },
  };
  return { calls, deps };
}

function requestFactory(responseBuilder, observations = {}) {
  return (options, callback) => {
    observations.calls = (observations.calls || 0) + 1;
    observations.options = options;
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.destroy = (error) => {
      observations.destroyed = (observations.destroyed || 0) + 1;
      if (error) queueMicrotask(() => request.emit("error", error));
    };
    request.end = () => {
      queueMicrotask(() => callback(responseBuilder(options)));
    };
    return request;
  };
}

test("isolation: suite stays off production paths", () => {
  assert.notEqual(repositoryRoot, "/opt/clover/clover-app");
});

test("SEC3-001: missing APP_PUBLIC_URL is rejected instead of Host fallback", () => {
  // Baseline (unsafe): publicBaseUrl returns http://evil.example.invalid from req Host.
  // Required control: AUTH_PUBLIC_URL_REQUIRED; Host is ignored.
  const req = spoofedRequest();
  expectCode(
    () => publicBaseUrl(req, {}),
    "AUTH_PUBLIC_URL_REQUIRED"
  );
  expectCode(
    () => publicCabinetUrl(req, {}),
    "AUTH_PUBLIC_URL_REQUIRED"
  );
});

test("SEC3-001: request Host cannot override the canonical HTTPS origin", () => {
  const env = {
    APP_PUBLIC_URL: "https://public.example.invalid",
    CABINET_PATH: "/lk",
  };
  const req = spoofedRequest("attacker.example.invalid");
  assert.equal(publicBaseUrl(req, env), "https://public.example.invalid");
  assert.equal(publicCabinetUrl(req, env), "https://public.example.invalid/lk");
  assert.doesNotMatch(publicCabinetUrl(req, env), /attacker/u);
});

test("SEC3-001: public origin must be HTTPS without credentials or extra path", () => {
  expectCode(
    () => publicBaseUrl(spoofedRequest(), { APP_PUBLIC_URL: "http://public.example.invalid" }),
    "AUTH_PUBLIC_URL_HTTPS_REQUIRED"
  );
  for (const configured of [
    "https://user:pass@public.example.invalid",
    "https://public.example.invalid/path",
    "https://public.example.invalid/?query=1",
    "https://public.example.invalid/#fragment",
  ]) {
    expectCode(
      () => publicBaseUrl(spoofedRequest(), { APP_PUBLIC_URL: configured }),
      "AUTH_PUBLIC_URL_INVALID"
    );
  }
});

test("SEC3-001: development auth links are opt-in and loopback-only", () => {
  // Baseline (unsafe): ALLOW_DEV_AUTH_LINKS defaults to true for loopback Host.
  assert.equal(allowDevelopmentAuthLinks(loopbackRequest(), {}), false);
  assert.equal(
    allowDevelopmentAuthLinks(spoofedRequest(), { ALLOW_DEV_AUTH_LINKS: "true" }),
    false
  );
  const dev = {
    APP_PUBLIC_URL: "http://127.0.0.1:5273",
    ALLOW_DEV_AUTH_LINKS: "true",
    CABINET_PATH: "/lk",
  };
  assert.equal(publicBaseUrl(loopbackRequest(), dev), "http://127.0.0.1:5273");
  assert.equal(allowDevelopmentAuthLinks(loopbackRequest(), dev), true);
  assert.equal(allowDevelopmentAuthLinks(spoofedRequest(), dev), false);
});

test("SEC3-002: outbound 1C uses only env-owned origin, not request baseUrl", async () => {
  // Baseline (unsafe): missing ONEC_BASE_URL falls back to request/stored baseUrl.
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ ok: true, items: [] });
  };
  await withEnv({
    ONEC_BASE_URL: undefined,
    ONEC_USERNAME: "fixture-user",
    ONEC_PASSWORD: "synthetic-password-fixture-only",
    ONEC_API_KEY: "synthetic-api-key-fixture-only",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => previewOneCCatalog(
        {
          mode: "real",
          baseUrl: "http://127.0.0.1:9",
          productsPath: "/hs/clover/v1/products",
        },
        "products",
        20,
        { env: process.env, fetchImpl }
      ),
      "ONEC_TRUSTED_ORIGIN_REQUIRED"
    );
  }));
  assert.equal(calls.length, 0);
});

test("SEC3-002: request baseUrl cannot redirect the env-owned origin", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), redirect: options?.redirect });
    return jsonResponse({ ok: true, items: [] });
  };
  await withEnv({
    ONEC_BASE_URL: "https://onec.example.invalid",
    ONEC_USERNAME: "fixture-user",
    ONEC_PASSWORD: "synthetic-password-fixture-only",
    ONEC_API_KEY: "synthetic-api-key-fixture-only",
  }, () => withFetch(fetchImpl, async () => {
    const result = await previewOneCCatalog(
      {
        mode: "real",
        baseUrl: "http://127.0.0.1:9",
        productsPath: "/hs/clover/v1/products",
      },
      "products",
      20,
      { env: process.env, fetchImpl }
    );
    assert.equal(result.ok, true);
  }));
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).origin, "https://onec.example.invalid");
  assert.equal(calls[0].redirect, "manual");
});

test("SEC3-002: credentials-in-URL and path escape are rejected before fetch", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("unreachable");
  };
  await withEnv({
    ONEC_BASE_URL: "https://user:pass@onec.example.invalid",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl }),
      "ONEC_TRUSTED_ORIGIN_INVALID"
    );
  }));
  await withEnv({
    ONEC_BASE_URL: "https://onec.example.invalid",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => previewOneCCatalog(
        { mode: "real", productsPath: "/%2e%2e/admin" },
        "products",
        20,
        { env: process.env, fetchImpl }
      ),
      "ONEC_ENDPOINT_PATH_INVALID"
    );
  }));
  assert.equal(fetchCalls, 0);
});

test("SEC3-002: 1C redirects are denied without a second credentialed request", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), redirect: options?.redirect });
    return new Response("", {
      status: 302,
      headers: { Location: "http://127.0.0.1/internal" },
    });
  };
  await withEnv({
    ONEC_BASE_URL: "https://onec.example.invalid",
    ONEC_USERNAME: "fixture-user",
    ONEC_PASSWORD: "synthetic-password-fixture-only",
    ONEC_API_KEY: "synthetic-api-key-fixture-only",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl }),
      "ONEC_REDIRECT_DENIED"
    );
  }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].redirect, "manual");
});

test("SEC3-003: insecure 1C HTTP requires explicit private-literal opt-in", async () => {
  // Baseline (unsafe): sanitize/normalize accepts any http:// target and fetches it.
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return jsonResponse({ ok: true });
  };
  const stored = sanitizeOneCConfig({
    mode: "real",
    baseUrl: "http://10.20.30.40:8080",
  });
  assert.equal(stored.mode, "real");

  await withEnv({
    ONEC_BASE_URL: "http://10.20.30.40:8080",
    ONEC_ALLOW_INSECURE_HTTP: undefined,
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl }),
      "ONEC_INSECURE_HTTP_DISABLED"
    );
  }));

  await withEnv({
    ONEC_BASE_URL: "http://public.example.invalid",
    ONEC_ALLOW_INSECURE_HTTP: "true",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl }),
      "ONEC_INSECURE_HTTP_TARGET_INVALID"
    );
  }));

  await withEnv({
    ONEC_BASE_URL: "http://10.20.30.40:8080",
    ONEC_ALLOW_INSECURE_HTTP: "true",
    ONEC_USERNAME: "fixture-user",
    ONEC_PASSWORD: "synthetic-password-fixture-only",
    ONEC_API_KEY: "synthetic-api-key-fixture-only",
  }, () => withFetch(fetchImpl, async () => {
    const result = await testOneCConnection(
      { mode: "real", baseUrl: "http://10.20.30.41:8080" },
      { env: process.env, fetchImpl }
    );
    assert.equal(result.ok, true);
  }));
  assert.equal(fetchCalls, 1);
});

test("SEC3-002/003: simulation mode never performs outbound work", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("simulation performed fetch");
  };
  await withEnv({
    ONEC_BASE_URL: "http://10.20.30.40:8080",
    ONEC_ALLOW_INSECURE_HTTP: "true",
  }, () => withFetch(fetchImpl, async () => {
    const status = resolveOneCRuntimeConfig({ mode: "simulation" }, process.env);
    assert.equal(status.mode, "simulation");
    await testOneCConnection({ mode: "simulation" }, { env: process.env, fetchImpl });
    await previewOneCCatalog({ mode: "simulation" }, "products", 5, {
      env: process.env,
      fetchImpl,
    });
  }));
  assert.equal(fetchCalls, 0);
});

test("SEC3-005: 1C responses are bounded before text()/JSON parse", async () => {
  // Baseline (unsafe): requestJson awaits response.text() with no byte limit.
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 12) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(1024).fill(65));
    },
  });
  const fetchImpl = async () => new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "20480",
    },
  });
  await withEnv({
    ONEC_BASE_URL: "https://onec.example.invalid",
    ONEC_MAX_RESPONSE_BYTES: "4096",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl }),
      "UPSTREAM_RESPONSE_TOO_LARGE"
    );
  }));
  assert.ok(pulled <= 1, `expected Content-Length reject before body read, pulled=${pulled}`);
});

test("SEC3-004: remote image fetch denies private/credentialed targets before network", async () => {
  // Baseline (unsafe): downloadBinary(fetch, redirect:follow) accepts http://127.0.0.1.
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return imageResponse();
  };
  const imageDeps = {
    lookup: async () => {
      throw new Error("DNS must not run for literal denials");
    },
    httpsRequest: requestFactory(() => {
      throw new Error("HTTPS must not run for literal denials");
    }),
  };
  await withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => downloadBinary("https://user:pass@image.example.invalid/a.jpg", 15000, imageDeps),
      "REMOTE_IMAGE_URL_DENIED"
    );
    await expectCodeAsync(
      () => downloadBinary("http://127.0.0.1/a.jpg", 15000, imageDeps),
      "REMOTE_IMAGE_URL_DENIED"
    );
    await expectCodeAsync(
      () => downloadBinary("https://127.0.0.1/a.jpg", 15000, imageDeps),
      "REMOTE_IMAGE_ADDRESS_DENIED"
    );
    await expectCodeAsync(
      () => downloadBinary("https://[2002:a9fe:a9fe::1]/a.jpg", 15000, imageDeps),
      "REMOTE_IMAGE_ADDRESS_DENIED"
    );
  });
  assert.equal(fetchCalls, 0);
});

test("SEC3-004: mixed DNS and redirects are denied; public HTTPS is DNS-pinned", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return imageResponse();
  };
  await withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => downloadBinary("https://image.example.invalid/a.jpg", 15000, {
        lookup: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
        httpsRequest: requestFactory(() => {
          throw new Error("mixed DNS must not connect");
        }),
      }),
      "REMOTE_IMAGE_ADDRESS_DENIED"
    );

    const redirectObservations = {};
    await expectCodeAsync(
      () => downloadBinary("https://image.example.invalid/a.jpg", 15000, {
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        httpsRequest: requestFactory(
          () => nodeResponse({
            statusCode: 302,
            headers: { location: "http://127.0.0.1/internal" },
          }),
          redirectObservations
        ),
      }),
      "REMOTE_IMAGE_REDIRECT_DENIED"
    );
    assert.equal(redirectObservations.calls, 1);

    const observations = {};
    const result = await downloadBinary("https://image.example.invalid/a.jpg", 15000, {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      httpsRequest: requestFactory(
        () => nodeResponse({
          headers: {
            "content-type": "image/jpeg",
            "content-length": "2048",
          },
          chunks: [Buffer.alloc(2048, 1)],
        }),
        observations
      ),
      maxBytes: 4096,
    });
    assert.equal(result.buffer.length, 2048);
    const pinned = [];
    observations.options.lookup("image.example.invalid", {}, (_error, address, family) => {
      pinned.push({ address, family });
    });
    assert.deepEqual(pinned, [{ address: "93.184.216.34", family: 4 }]);
    let allForm;
    observations.options.lookup("image.example.invalid", { all: true }, (_error, result) => {
      allForm = result;
    });
    assert.deepEqual(allForm, [{ address: "93.184.216.34", family: 4 }]);
    assert.equal(observations.options.servername, "image.example.invalid");

    await assert.rejects(
      () => downloadBinary("https://image.example.invalid/a.jpg", 15000, {
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        httpsRequest: requestFactory(() => nodeResponse({
          headers: { "content-length": "2048" },
          chunks: [Buffer.alloc(2048, 1)],
        })),
        maxBytes: 4096,
      }),
      /не является изображением/u
    );
  });
  assert.equal(fetchCalls, 0);
});

test("SEC3-005: remote image streams stop after the byte limit", async () => {
  // Baseline (unsafe): arrayBuffer() reads the whole body, then checks 8 MiB.
  const fetchImpl = async () => new Response(Buffer.alloc(24, 1), {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
  await withFetch(fetchImpl, () => expectCodeAsync(
    () => downloadBinary("https://image.example.invalid/a.jpg", 15000, {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      httpsRequest: requestFactory(() => nodeResponse({
        headers: { "content-type": "image/jpeg" },
        chunks: [Buffer.alloc(1024), Buffer.alloc(1024), Buffer.alloc(1)],
      })),
      maxBytes: 2048,
    }),
    "UPSTREAM_RESPONSE_TOO_LARGE"
  ));
});

test("SEC3-010: push endpoint ownership is not reassigned on conflict", () => {
  // Baseline (unsafe): ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id.
  const temp = mkdtempSync(path.join(tmpdir(), "clover-sec3-push-"));
  const databasePath = path.join(temp, "push.sqlite");
  rejectUnsafePath(databasePath);
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      CREATE TABLE push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        subscription_json TEXT NOT NULL,
        order_events INTEGER NOT NULL DEFAULT 1,
        promotions INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT
    `);
    const endpoint = "https://push.example.invalid/subscription/fixture";
    const first = upsertPushSubscriptionRecord(database, {
      userId: "user-a",
      subscription: {
        endpoint,
        keys: { p256dh: "fixture-a", auth: "fixture-a" },
      },
      preferences: { promotions: false },
      id: "subscription-a",
      timestamp: "2026-09-17T00:00:00.000Z",
    });
    const repeated = upsertPushSubscriptionRecord(database, {
      userId: "user-a",
      subscription: {
        endpoint,
        keys: { p256dh: "fixture-b", auth: "fixture-b" },
      },
      preferences: { promotions: true },
      id: "unused-id",
      timestamp: "2026-09-17T00:01:00.000Z",
    });
    assert.equal(first.id, "subscription-a");
    assert.equal(repeated.id, first.id);
    const beforeConflict = database.prepare(
      "SELECT user_id, subscription_json FROM push_subscriptions WHERE endpoint = ?"
    ).get(endpoint);

    expectCode(
      () => upsertPushSubscriptionRecord(database, {
        userId: "user-b",
        subscription: {
          endpoint,
          keys: { p256dh: "fixture-c", auth: "fixture-c" },
        },
        preferences: { promotions: false },
        id: "subscription-b",
        timestamp: "2026-09-17T00:02:00.000Z",
      }),
      "PUSH_ENDPOINT_OWNERSHIP_CONFLICT"
    );

    const afterConflict = database.prepare(
      "SELECT user_id, subscription_json FROM push_subscriptions WHERE endpoint = ?"
    ).get(endpoint);
    assert.deepEqual(afterConflict, beforeConflict);
    assert.equal(afterConflict.user_id, "user-a");
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get().count,
      1
    );
  } finally {
    database.close();
    rmSync(temp, { recursive: true, force: true });
  }
});

test("SEC3-001 live handlers wire orchestration instead of inline token writes", () => {
  const serverSource = readFileSync(path.join(repositoryRoot, "server/src/server.js"), "utf8");
  assert.match(serverSource, /liveAuthIssuanceDeps\(\)/u);
  const routes = [
    ["/api/auth/register", "executeClientRegistration("],
    ["/api/auth/resend-verification", "executeResendVerification("],
    ["/api/auth/forgot-password", "executeForgotPassword("],
  ];
  for (const [route, call] of routes) {
    const start = serverSource.indexOf(`app.post("${route}"`);
    assert.ok(start >= 0, route);
    const next = serverSource.indexOf("\napp.post(\"", start + 10);
    const slice = serverSource.slice(start, next === -1 ? undefined : next);
    assert.ok(slice.includes(call), `${route} must call ${call}`);
    assert.doesNotMatch(slice, /createAuthToken\(/u);
    assert.doesNotMatch(slice, /createUser\(/u);
    assert.doesNotMatch(slice, /sendCloverMail\(/u);
    assert.doesNotMatch(slice, /req\.get\(["']host["']\)/u);
    assert.doesNotMatch(slice, /X-Forwarded-Host/iu);
  }
});

test("SEC3-001 missing or invalid APP_PUBLIC_URL does not persist user, token, or mail", async () => {
  const registerInput = {
    email: "client@example.invalid",
    password: "fixture-password",
    companyName: "ACME",
    contactName: "Anna",
    phone: "+70000000000",
    req: spoofedRequest(),
  };
  const existing = {
    id: "user-existing",
    email: "client@example.invalid",
    role: "client",
    email_verified: 0,
  };

  for (const env of [
    {},
    { APP_PUBLIC_URL: "http://public.example.invalid" },
    { APP_PUBLIC_URL: "https://evil.example.invalid/path" },
  ]) {
    const registerSpies = createAuthSpies();
    registerSpies.deps.env = env;
    await expectCodeAsync(
      () => executeClientRegistration(registerInput, registerSpies.deps),
      env.APP_PUBLIC_URL ? (
        String(env.APP_PUBLIC_URL).startsWith("http://")
          ? "AUTH_PUBLIC_URL_HTTPS_REQUIRED"
          : "AUTH_PUBLIC_URL_INVALID"
      ) : "AUTH_PUBLIC_URL_REQUIRED"
    );
    assert.equal(registerSpies.calls.createUser.length, 0);
    assert.equal(registerSpies.calls.createAuthToken.length, 0);
    assert.equal(registerSpies.calls.sendCloverMail.length, 0);
    assert.equal(registerSpies.calls.hashPassword.length, 0);

    const resendSpies = createAuthSpies({ existingUser: existing });
    resendSpies.deps.env = env;
    await expectCodeAsync(
      () => executeResendVerification(
        { email: existing.email, req: spoofedRequest() },
        resendSpies.deps
      ),
      env.APP_PUBLIC_URL ? (
        String(env.APP_PUBLIC_URL).startsWith("http://")
          ? "AUTH_PUBLIC_URL_HTTPS_REQUIRED"
          : "AUTH_PUBLIC_URL_INVALID"
      ) : "AUTH_PUBLIC_URL_REQUIRED"
    );
    assert.equal(resendSpies.calls.createAuthToken.length, 0);
    assert.equal(resendSpies.calls.sendCloverMail.length, 0);
    assert.equal(resendSpies.calls.findUserByEmail.length, 0);

    const forgotSpies = createAuthSpies({ existingUser: existing });
    forgotSpies.deps.env = env;
    await expectCodeAsync(
      () => executeForgotPassword(
        { email: existing.email, req: spoofedRequest() },
        forgotSpies.deps
      ),
      env.APP_PUBLIC_URL ? (
        String(env.APP_PUBLIC_URL).startsWith("http://")
          ? "AUTH_PUBLIC_URL_HTTPS_REQUIRED"
          : "AUTH_PUBLIC_URL_INVALID"
      ) : "AUTH_PUBLIC_URL_REQUIRED"
    );
    assert.equal(forgotSpies.calls.createAuthToken.length, 0);
    assert.equal(forgotSpies.calls.sendCloverMail.length, 0);
    assert.equal(forgotSpies.calls.findUserByEmail.length, 0);
  }
});

test("SEC3-001 canonical HTTPS origin keeps register, resend, and forgot issuance", async () => {
  const req = spoofedRequest("attacker.example.invalid");
  const registerSpies = createAuthSpies();
  const registered = await executeClientRegistration({
    email: "client@example.invalid",
    password: "fixture-password",
    companyName: "ACME",
    contactName: "Anna",
    phone: "+70000000000",
    req,
  }, registerSpies.deps);
  assert.equal(registered.status, 201);
  assert.equal(registerSpies.calls.createUser.length, 1);
  assert.equal(registerSpies.calls.createAuthToken.length, 1);
  assert.equal(registerSpies.calls.sendCloverMail.length, 1);
  assert.equal(
    registerSpies.calls.createAuthToken[0].tokenHash,
    "hashed:plain-token-fixture"
  );
  assert.match(
    registerSpies.calls.sendCloverMail[0].text,
    /https:\/\/public\.example\.invalid\/lk\/\?verify=plain-token-fixture/u
  );
  assert.equal(registered.body.developmentLink, undefined);
  assert.doesNotMatch(JSON.stringify(registered.body), /plain-token-fixture|attacker/u);

  const resendSpies = createAuthSpies({
    existingUser: {
      id: "user-1",
      email: "client@example.invalid",
      role: "client",
      email_verified: 0,
    },
  });
  const resent = await executeResendVerification(
    { email: "client@example.invalid", req },
    resendSpies.deps
  );
  assert.equal(resent.status, 200);
  assert.equal(resendSpies.calls.createAuthToken.length, 1);
  assert.equal(resendSpies.calls.sendCloverMail.length, 1);
  assert.equal(resent.body.developmentLink, undefined);
  assert.doesNotMatch(JSON.stringify(resent.body), /plain-token-fixture|attacker/u);

  const forgotSpies = createAuthSpies({
    existingUser: {
      id: "user-1",
      email: "client@example.invalid",
      role: "client",
    },
  });
  const forgot = await executeForgotPassword(
    { email: "client@example.invalid", req },
    forgotSpies.deps
  );
  assert.equal(forgot.status, 200);
  assert.equal(forgotSpies.calls.createAuthToken.length, 1);
  assert.equal(forgotSpies.calls.sendCloverMail.length, 1);
  assert.match(
    forgotSpies.calls.sendCloverMail[0].text,
    /https:\/\/public\.example\.invalid\/lk\/\?reset=plain-token-fixture/u
  );
  assert.equal(forgot.body.developmentLink, undefined);
  assert.doesNotMatch(JSON.stringify(forgot.body), /plain-token-fixture|attacker/u);
});

test("SEC3-001 mailer boundary embeds the canonical URL only", () => {
  const verifyUrl = "https://public.example.invalid/lk/?verify=fixture-token";
  const message = verificationEmail({ companyName: "ACME", verifyUrl });
  assert.match(message.text, /https:\/\/public\.example\.invalid\/lk\/\?verify=fixture-token/u);
  assert.match(message.html, /href="https:\/\/public\.example\.invalid\/lk\/\?verify=fixture-token"/u);
  assert.doesNotMatch(message.text, /evil|Host|X-Forwarded/u);
  const reset = resetPasswordEmail({
    resetUrl: "https://public.example.invalid/lk/?reset=fixture-token",
  });
  assert.match(reset.text, /https:\/\/public\.example\.invalid\/lk\/\?reset=fixture-token/u);
});

test("SEC3-002 createOneCDraft uses the same env-owned requestJson path", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), redirect: options?.redirect });
    return jsonResponse({ ok: true, documentId: "DOC-1" });
  };
  await withEnv({
    ONEC_BASE_URL: undefined,
    ONEC_WRITE_ENABLED: "true",
    ONEC_USERNAME: "fixture-user",
    ONEC_PASSWORD: "synthetic-password-fixture-only",
    ONEC_API_KEY: "synthetic-api-key-fixture-only",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => createOneCDraft(
        { mode: "real", allowDraftCreation: true, baseUrl: "http://127.0.0.1:9" },
        { cloverId: "fixture-order" },
        { env: process.env, fetchImpl }
      ),
      "ONEC_TRUSTED_ORIGIN_REQUIRED"
    );
  }));
  assert.equal(calls.length, 0);

  await withEnv({
    ONEC_BASE_URL: "https://onec.example.invalid",
    ONEC_WRITE_ENABLED: "true",
    ONEC_USERNAME: "fixture-user",
    ONEC_PASSWORD: "synthetic-password-fixture-only",
    ONEC_API_KEY: "synthetic-api-key-fixture-only",
  }, () => withFetch(fetchImpl, async () => {
    const result = await createOneCDraft(
      { mode: "real", allowDraftCreation: true, baseUrl: "http://127.0.0.1:9" },
      { cloverId: "fixture-order" },
      { env: process.env, fetchImpl }
    );
    assert.equal(result.ok, true);
  }));
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).origin, "https://onec.example.invalid");
  assert.equal(calls[0].redirect, "manual");
});

test("SEC3-003 production HTTP exception is RFC1918 only; loopback needs a proven non-production gate", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return jsonResponse({ ok: true });
  };
  await withEnv({
    NODE_ENV: "test",
    ONEC_BASE_URL: "http://127.0.0.1:8080",
    ONEC_ALLOW_INSECURE_HTTP: "true",
    ONEC_ALLOW_DEV_INSECURE_LOOPBACK: undefined,
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl }),
      "ONEC_INSECURE_HTTP_TARGET_INVALID"
    );
  }));

  expectCode(
    () => resolveTrustedOneCOrigin({
      NODE_ENV: "production",
      ONEC_BASE_URL: "http://127.0.0.1:8080",
      ONEC_ALLOW_INSECURE_HTTP: "true",
      ONEC_ALLOW_DEV_INSECURE_LOOPBACK: "true",
    }),
    "ONEC_INSECURE_HTTP_TARGET_INVALID"
  );
  expectCode(
    () => resolveTrustedOneCOrigin({
      NODE_ENV: "",
      ONEC_BASE_URL: "http://127.0.0.1:8080",
      ONEC_ALLOW_INSECURE_HTTP: "true",
      ONEC_ALLOW_DEV_INSECURE_LOOPBACK: "true",
    }),
    "ONEC_INSECURE_HTTP_TARGET_INVALID"
  );
  assert.equal(
    resolveTrustedOneCOrigin({
      NODE_ENV: "production",
      ONEC_BASE_URL: "http://10.20.30.40:8080",
      ONEC_ALLOW_INSECURE_HTTP: "true",
    }),
    "http://10.20.30.40:8080"
  );

  await withEnv({
    NODE_ENV: "test",
    ONEC_BASE_URL: "http://127.0.0.1:8080",
    ONEC_ALLOW_INSECURE_HTTP: "true",
    ONEC_ALLOW_DEV_INSECURE_LOOPBACK: "true",
    ONEC_USERNAME: "fixture-user",
    ONEC_PASSWORD: "synthetic-password-fixture-only",
  }, () => withFetch(fetchImpl, async () => {
    const result = await testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl });
    assert.equal(result.ok, true);
  }));
  assert.equal(fetchCalls, 1);
});

test("SEC3-004 enrichment stores images only through downloadBinary", () => {
  const productSource = readFileSync(
    path.join(repositoryRoot, "server/src/productEnrichment.js"),
    "utf8"
  );
  assert.match(productSource, /const \{ buffer \} = await downloadBinary\(imageUrl\)/u);
  assert.doesNotMatch(productSource, /redirect:\s*["']follow["']/u);
  assert.doesNotMatch(productSource, /arrayBuffer\(\)/u);
});

test("SEC3-005 gzip Content-Length does not truncate a decompressed 1C body", async () => {
  const payload = JSON.stringify({ ok: true, service: "fixture" });
  const compressedLength = gzipSync(Buffer.from(payload)).length;
  const fetchImpl = async () => new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(compressedLength),
      "Content-Encoding": "gzip",
    },
  });
  await withEnv({
    ONEC_BASE_URL: "https://onec.example.invalid",
  }, () => withFetch(fetchImpl, async () => {
    const result = await testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl });
    assert.equal(result.ok, true);
  }));
});

test("SEC3-005 oversized decompressed stream is aborted despite a small Content-Length", async () => {
  let pulled = 0;
  let cancelled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 8) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(1024).fill(65));
    },
    cancel() {
      cancelled += 1;
    },
  });
  await assert.rejects(
    () => readBoundedResponse(
      {
        headers: {
          "content-length": "54",
          "content-encoding": "gzip",
        },
        body: stream,
      },
      { maxBytes: 2048, enforceContentLength: false }
    ),
    (error) => error?.code === "UPSTREAM_RESPONSE_TOO_LARGE"
  );
  assert.ok(pulled <= 3, `expected abort after decompressed limit, pulled=${pulled}`);
  assert.ok(cancelled >= 1, "oversized stream must be cancelled");

  let livePulled = 0;
  const liveStream = new ReadableStream({
    pull(controller) {
      livePulled += 1;
      if (livePulled > 8) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(1024).fill(123));
    },
  });
  const fetchImpl = async () => new Response(liveStream, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "54",
    },
  });
  await withEnv({
    ONEC_BASE_URL: "https://onec.example.invalid",
    ONEC_MAX_RESPONSE_BYTES: "2048",
  }, () => withFetch(fetchImpl, async () => {
    await expectCodeAsync(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl }),
      "UPSTREAM_RESPONSE_TOO_LARGE"
    );
  }));
  assert.ok(livePulled <= 4, `1C path must stop the decompressed stream, pulled=${livePulled}`);
});

test("SEC3-004 Node 22 https.request lookup uses {all:true} and honors the connect-time pin", async () => {
  assert.match(process.version, /^v22\./u);
  const seen = [];
  await new Promise((resolve) => {
    const req = httpsRequest({
      hostname: "image.example.invalid",
      port: 1,
      path: "/",
      method: "GET",
      servername: "image.example.invalid",
      lookup(hostname, options, callback) {
        seen.push({
          hostname,
          all: Boolean(options?.all),
          family: options?.family,
        });
        if (options?.all) {
          callback(null, [{ address: "203.0.113.10", family: 4 }]);
          return;
        }
        callback(null, "203.0.113.10", 4);
      },
    }, (response) => {
      response.resume();
      resolve();
    });
    req.on("error", () => resolve());
    req.setTimeout(2000, () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
  assert.ok(seen.length >= 1, "Node 22 must invoke options.lookup at connect time");
  assert.equal(seen[0].all, true);
  assert.equal(seen[0].hostname, "image.example.invalid");

  let scalarError = "";
  await new Promise((resolve) => {
    const req = httpsRequest({
      hostname: "image.example.invalid",
      port: 1,
      path: "/",
      method: "GET",
      lookup(_hostname, _options, callback) {
        callback(null, "203.0.113.10", 4);
      },
    }, (response) => {
      response.resume();
      resolve();
    });
    req.on("error", (error) => {
      scalarError = String(error?.code || error?.message || "");
      resolve();
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
  assert.match(scalarError, /ERR_INVALID_IP_ADDRESS|undefined/u);
});

test("SEC3-010 production db.js wrapper still delegates to the ownership helper", () => {
  const dbSource = readFileSync(path.join(repositoryRoot, "server/src/db.js"), "utf8");
  assert.match(dbSource, /upsertPushSubscriptionRecord\(db,/u);
  assert.doesNotMatch(dbSource, /user_id\s*=\s*excluded\.user_id/u);
});
