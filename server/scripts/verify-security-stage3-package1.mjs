/**
 * Security Stage 3 Package 1 — behavioral RED/GREEN against live contracts.
 *
 * Each finding calls an existing public function (or a 1:1 extract of one).
 * Module-not-found, syntax errors, and harness crashes are not RED.
 * Fixture-only: temp SQLite, mocked fetch/https, synthetic secrets.
 * No production env, DB, 1C, email, Telegram, MAX, or Web Push.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  allowDevelopmentAuthLinks,
  publicBaseUrl,
  publicCabinetUrl,
} from "../src/authUrlPolicy.js";
import {
  previewOneCCatalog,
  resolveOneCRuntimeConfig,
  sanitizeOneCConfig,
  testOneCConnection,
} from "../src/oneC.js";
import { downloadBinary } from "../src/productEnrichment.js";
import { upsertPushSubscriptionRecord } from "../src/pushSubscriptionOwnership.js";

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
