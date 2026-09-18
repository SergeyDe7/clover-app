/**
 * Security Stage 3 Package 2 — redaction, safe 1C errors, audit access.
 *
 * Behavioral tests against live contracts. Harness crashes are not RED.
 * Fixture-only: mocked 1C fetch, captured stderr writer, synthetic PII.
 * Tests do not print marker strings in assertion messages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  executeClientRegistration,
} from "../src/authIssuance.js";
import {
  createOneCDraft,
  previewOneCCatalog,
  testOneCConnection,
} from "../src/oneC.js";
import {
  ONEC_PUBLIC_MESSAGE,
  isOutboundOneCPublicError,
  presentUnhandledOneCError,
  toPublicOneCError,
} from "../src/oneCPublicError.js";
import { runOneCClaimRequeueTick } from "../src/onecClaimRequeue.js";
import { sendPushToSubscriptions } from "../src/push.js";
import { logCaughtError, logSafe, redactValue, setSafeLogWriter } from "../src/safeLog.js";
import { applyStaffRoutePolicy } from "../src/staffPolicy.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

const MARKER_TOKEN = "sec3pkg2tok";
const MARKER_EMAIL = "pii.user@example.invalid";
const MARKER_PHONE = "+70005553535";
const MARKER_PATH = "/hs/internal/debug/token-dump";
const MARKER_RE = /sec3pkg2tok|pii\.user@example\.invalid|\+70005553535|token-dump/u;

function leakBlob() {
  return `SQL ${MARKER_PATH} token=${MARKER_TOKEN} email=${MARKER_EMAIL} phone=${MARKER_PHONE}\r\nINFO fake-severity\u001b[31m`;
}

function normalizeSourceNewlines(text) {
  return String(text).replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

function readRepoSource(relativePath) {
  const normalized = normalizeSourceNewlines(
    readFileSync(path.join(repositoryRoot, relativePath), "utf8")
  );
  assert.ok(normalized.length > 0, `${relativePath} is empty`);
  return normalized;
}

function dumpValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      status: value.status,
      payload: value.payload,
      correlationId: value.correlationId,
      cause: value.cause instanceof Error
        ? { name: value.cause.name, message: value.cause.message }
        : value.cause,
    };
  }
  return value;
}

function assertNoMarker(value, label) {
  const blob = typeof value === "string" ? value : JSON.stringify(dumpValue(value));
  assert.equal(MARKER_RE.test(blob), false, `${label} leaked upstream marker`);
}

function jsonResponse(value, status = 500) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
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

const REAL_ENV = {
  ONEC_BASE_URL: "https://onec.example.invalid",
  ONEC_USERNAME: "fixture-user",
  ONEC_PASSWORD: "synthetic-password-fixture-only",
  ONEC_API_KEY: "synthetic-api-key-fixture-only",
  ONEC_WRITE_ENABLED: "true",
};

function leakingFetch() {
  return jsonResponse({
    ok: false,
    error: leakBlob(),
    message: leakBlob(),
    email: MARKER_EMAIL,
  }, 500);
}

async function expectSanitizedReject(fn) {
  await assert.rejects(fn, (error) => {
    assert.equal(error?.code, "ONEC_UPSTREAM_ERROR");
    assert.equal(error?.message, ONEC_PUBLIC_MESSAGE.ONEC_UPSTREAM_ERROR);
    assert.equal(error?.payload, undefined);
    assertNoMarker(error, "thrown error");
    const presented = toPublicOneCError(error);
    assert.equal(presented.httpStatus, 502);
    assert.equal(presented.body.code, "ONEC_UPSTREAM_ERROR");
    assert.match(String(presented.body.correlationId || ""), /^[0-9a-f-]{36}$/iu);
    assertNoMarker(presented, "public presentation");
    return true;
  });
}

test("isolation: suite stays off production paths", () => {
  assert.notEqual(repositoryRoot, "/opt/clover/clover-app");
});

test("SEC3-006: raw upstream marker is absent from thrown 1C errors", async () => {
  const fetchImpl = leakingFetch;
  await withEnv(REAL_ENV, async () => {
    await expectSanitizedReject(
      () => testOneCConnection({ mode: "real" }, { env: process.env, fetchImpl })
    );
    await expectSanitizedReject(
      () => previewOneCCatalog({ mode: "real" }, "products", 5, {
        env: process.env,
        fetchImpl,
      })
    );
    await expectSanitizedReject(
      () => createOneCDraft(
        { mode: "real", allowDraftCreation: true },
        { cloverId: "fixture-order" },
        { env: process.env, fetchImpl }
      )
    );
  });
});

test("SEC3-006: HTTP/order/audit presentation omit raw upstream text", async () => {
  const fetchImpl = leakingFetch;
  await withEnv(REAL_ENV, async () => {
    let thrown;
    try {
      await createOneCDraft(
        { mode: "real", allowDraftCreation: true },
        { cloverId: "fixture-order" },
        { env: process.env, fetchImpl }
      );
    } catch (error) {
      thrown = error;
    }
    const presented = toPublicOneCError(thrown);
    const apiBody = presented.body;
    const orderExchange = {
      status: "error",
      message: presented.exchangeMessage,
      code: presented.body.code,
      correlationId: presented.body.correlationId,
    };
    const auditDetails = {
      orderId: "order-1",
      orderNumber: "1001",
      ...presented.auditDetails,
    };
    assertNoMarker(apiBody, "api body");
    assertNoMarker(orderExchange, "order exchange");
    assertNoMarker(auditDetails, "audit details");
    assert.equal(apiBody.code, "ONEC_UPSTREAM_ERROR");
    assert.equal(presented.httpStatus, 502);
    assert.equal(Object.hasOwn(auditDetails, "message"), false);
  });
});

test("SEC3-006: Package 1 policy errors keep stable codes", async () => {
  await withEnv({
    ONEC_BASE_URL: undefined,
  }, async () => {
    await assert.rejects(
      () => testOneCConnection({ mode: "real" }, {
        env: process.env,
        fetchImpl: leakingFetch,
      }),
      (error) => {
        assert.equal(error?.code, "ONEC_TRUSTED_ORIGIN_REQUIRED");
        assertNoMarker(error, "policy error");
        const presented = toPublicOneCError(error);
        assert.equal(presented.body.code, "ONEC_TRUSTED_ORIGIN_REQUIRED");
        return true;
      }
    );
  });
});

test("SEC3-006: simulation success is unchanged", async () => {
  const result = await testOneCConnection({ mode: "simulation" });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "simulation");
});

test("SEC3-007: PII and nested secrets are redacted or omitted", () => {
  const redacted = redactValue({
    event: "x",
    email: MARKER_EMAIL,
    phone: MARKER_PHONE,
    password: "synthetic-secret",
    token: MARKER_TOKEN,
    nested: { authorization: "Bearer abc", ok: true },
    endpoint: `https://push.example.invalid/${MARKER_TOKEN}`,
    headers: { authorization: "Bearer abc" },
    url: `https://mail.example.invalid/${MARKER_EMAIL}`,
  });
  assert.equal(redacted.email, "[redacted]");
  assert.equal(redacted.phone, "[redacted]");
  assert.equal(redacted.password, "[redacted]");
  assert.equal(redacted.token, "[redacted]");
  assert.equal(redacted.nested.authorization, "[redacted]");
  assert.equal(redacted.nested.ok, true);
  assert.equal(redacted.endpoint, "[redacted]");
  assert.equal(redacted.headers, "[redacted]");
  assert.equal(redacted.url, "[redacted]");
  assertNoMarker(redacted, "redacted object");
});

test("SEC3-007: nested/cyclic Error does not break the logger", () => {
  const boom = new Error(leakBlob());
  boom.code = "X";
  const cyclic = { boom };
  cyclic.self = cyclic;
  cyclic.child = [boom, cyclic];
  const redacted = redactValue(cyclic);
  assert.equal(redacted.self, "[cyclic]");
  assert.equal(redacted.boom.name, "Error");
  assert.equal(Object.hasOwn(redacted.boom, "message"), false);
  assertNoMarker(redacted, "cyclic redact");
});

test("SEC3-007: CR/LF/ANSI collapse to one structured record", () => {
  const lines = [];
  setSafeLogWriter((line) => lines.push(line));
  try {
    logSafe("error\nfake-level", {
      event: `onec.fail\nERROR spoofed\r\n${MARKER_EMAIL}`,
      code: "ONEC_UPSTREAM_ERROR",
      correlationId: "00000000-0000-4000-8000-000000000001",
      email: MARKER_EMAIL,
      message: leakBlob(),
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes("\n"), false);
    assert.equal(lines[0].includes("\r"), false);
    const record = JSON.parse(lines[0]);
    assert.equal(record.level, "error");
    assert.equal(record.event, "invalid.event");
    assert.equal(record.code, "ONEC_UPSTREAM_ERROR");
    assert.equal(Object.hasOwn(record, "email"), false);
    assert.equal(Object.hasOwn(record, "message"), false);
    assertNoMarker(record, "log record");
    assert.match(String(record.ts), /^\d{4}-\d{2}-\d{2}T/u);
  } finally {
    setSafeLogWriter(null);
  }
});

test("SEC3-007: live auth mail failure does not log Error/PII", async () => {
  const lines = [];
  setSafeLogWriter((line) => lines.push(line));
  try {
    const mailError = new Error(leakBlob());
    mailError.to = MARKER_EMAIL;
    const issued = await executeClientRegistration({
      email: MARKER_EMAIL,
      password: "fixture-password",
      companyName: "ACME",
      contactName: "Anna",
      phone: MARKER_PHONE,
      req: { socket: { remoteAddress: "198.51.100.10" } },
    }, {
      env: {
        APP_PUBLIC_URL: "https://public.example.invalid",
        CABINET_PATH: "/lk",
      },
      findUserByEmail: () => null,
      hashPassword: async () => "hash",
      createUser: (payload) => ({ id: "user-1", email: payload.email, role: "client" }),
      createPlainToken: () => "plain-token-fixture",
      tokenHash: (value) => `hashed:${value}`,
      createAuthToken: () => {},
      verificationEmail: ({ verifyUrl }) => ({ subject: "v", text: verifyUrl, html: verifyUrl }),
      sendCloverMail: async () => {
        throw mailError;
      },
      writeAudit: () => {},
      queueManagerNotification: () => {},
      publicMailStatus: () => ({ configured: false }),
    });
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.event, "auth.mail.verification");
    assert.equal(issued.status, 201);
    assert.equal(issued.body.ok, true);
    assertNoMarker(record, "auth mail log");
    assertNoMarker(lines[0], "auth mail line");
  } finally {
    setSafeLogWriter(null);
  }
});

test("SEC3-007: 1C failure logging omits upstream body", async () => {
  const lines = [];
  setSafeLogWriter((line) => lines.push(line));
  try {
    await withEnv(REAL_ENV, async () => {
      try {
        await testOneCConnection({ mode: "real" }, {
          env: process.env,
          fetchImpl: leakingFetch,
        });
      } catch (error) {
        const { logOneCFailure } = await import("../src/oneCPublicError.js");
        logOneCFailure("onec.connection.test", error, { route: "/api/admin/one-c/test" });
      }
    });
    assert.ok(lines.length >= 1);
    for (const line of lines) {
      assert.equal(line.includes("\n"), false);
      assertNoMarker(line, "1C failure log");
    }
  } finally {
    setSafeLogWriter(null);
  }
});

test("audit access: unauthenticated and client are denied by live policy", () => {
  const client = applyStaffRoutePolicy({
    method: "GET",
    route: { path: "/api/admin/audit" },
    user: { role: "client", id: "c1" },
  });
  assert.equal(client.allow, false);

  const serverSource = readRepoSource("server/src/server.js");
  const crlfSnippet = 'app.get(\r\n  "/api/admin/audit"';
  assert.equal(
    normalizeSourceNewlines(crlfSnippet).includes('app.get(\n  "/api/admin/audit"'),
    true
  );
  assert.equal(
    normalizeSourceNewlines('app.get(\r\n  "/api/other"').includes('app.get(\n  "/api/admin/audit"'),
    false
  );
  assert.equal(
    serverSource.includes('app.get(\n  "/api/admin/audit-missing-probe"'),
    false
  );
  const start = serverSource.indexOf('app.get(\n  "/api/admin/audit"');
  assert.ok(start >= 0, "audit route source snippet must still be found after LF/CRLF normalization");
  const slice = serverSource.slice(start, start + 400);
  assert.match(slice, /authRequired/u);
  assert.match(slice, /roleRequired\("manager"\)/u);
  assert.doesNotMatch(slice, /express\.static/u);
});

test("audit access: manager without feature is denied; admin/manager with audit allowed", () => {
  const restricted = applyStaffRoutePolicy({
    method: "GET",
    route: { path: "/api/admin/audit" },
    user: {
      role: "manager",
      permissions: { tabs: ["orders"], manageStaff: false },
    },
  });
  assert.equal(restricted.allow, false);
  assert.equal(restricted.code, "FEATURE_FORBIDDEN");

  const allowed = applyStaffRoutePolicy({
    method: "GET",
    route: { path: "/api/admin/audit" },
    user: {
      role: "manager",
      permissions: { tabs: ["audit"], manageStaff: false },
    },
  });
  assert.equal(allowed.allow, true);

  const admin = applyStaffRoutePolicy({
    method: "GET",
    route: { path: "/api/admin/audit" },
    user: { role: "admin" },
  });
  assert.equal(admin.allow, true);
});

test("audit actor/action/timestamp are server-owned in live writers", () => {
  const serverSource = readRepoSource("server/src/server.js");
  const fnStart = serverSource.indexOf("function auditFromRequest");
  assert.ok(fnStart >= 0, "auditFromRequest must remain locatable after LF/CRLF normalization");
  const fn = serverSource.slice(fnStart, fnStart + 700);
  assert.match(fn, /userId: req\.user\?\.id/u);
  assert.match(fn, /userEmail: req\.user\?\.email/u);
  assert.match(fn, /userRole: req\.user\?\.role/u);
  assert.doesNotMatch(fn, /req\.body\?\.action/u);
  assert.doesNotMatch(fn, /req\.body\?\.createdAt/u);

  const dbSource = readRepoSource("server/src/db.js");
  assert.match(dbSource, /created_at\s*\n\s*\)\s*\n\s*VALUES \(\?, \?, \?, \?, \?, \?, \?\)/u);
  assert.match(dbSource, /now\(\)/u);
});

test("log injection: UI does not render raw upstream message or HTML", () => {
  const auditSource = readRepoSource("src/screens/manager/ManagerAudit.jsx");
  assert.doesNotMatch(auditSource, /dangerouslySetInnerHTML/u);
  assert.doesNotMatch(auditSource, /details\.message/u);
  assert.match(auditSource, /details\.code/u);
  const serverSource = readRepoSource("server/src/server.js");
  const auditStart = serverSource.indexOf("/api/admin/audit");
  const resetStart = serverSource.indexOf("/api/admin/reset");
  assert.ok(auditStart >= 0 && resetStart > auditStart);
  assert.doesNotMatch(
    serverSource.slice(auditStart, resetStart),
    /<script/u
  );
});

test("live 1C handlers wire public error helper instead of error.message", () => {
  const serverSource = readRepoSource("server/src/server.js");
  for (const route of [
    "/api/admin/one-c/test",
    "/api/admin/one-c/preview/:type",
    "/api/admin/one-c/orders/:orderId/draft",
  ]) {
    const start = serverSource.indexOf(`"${route}"`);
    assert.ok(start >= 0, route);
    const slice = serverSource.slice(start, start + 5000);
    assert.match(slice, /logOneCFailure/u);
    assert.doesNotMatch(slice, /error: error\.message/u);
  }
  assert.match(serverSource, /logSafe\("error"/u);
  const middlewareStart = serverSource.indexOf("app.use((error, req, res, _next)");
  const middlewareEnd = serverSource.indexOf("initializeLocalizationCatalog();");
  const middleware = serverSource.slice(middlewareStart, middlewareEnd);
  assert.ok(middlewareStart > 0 && middlewareEnd > middlewareStart);
  assert.match(middleware, /logSafe\("error"/u);
  assert.match(middleware, /presentUnhandledOneCError/u);
  assert.doesNotMatch(middleware, /startsWith\("ONEC_"\)/u);
  assert.doesNotMatch(middleware, /console\.error\(error\)/u);
});

test("SEC3-006: HTTP 200 ok:false maps to client 400", async () => {
  const fetchImpl = () => jsonResponse({
    ok: false,
    error: leakBlob(),
    message: leakBlob(),
  }, 200);
  await withEnv(REAL_ENV, async () => {
    await assert.rejects(
      () => createOneCDraft(
        { mode: "real", allowDraftCreation: true },
        { cloverId: "fixture-order" },
        { env: process.env, fetchImpl }
      ),
      (error) => {
        assert.equal(error?.code, "ONEC_UPSTREAM_ERROR");
        assert.equal(error?.payload, undefined);
        assertNoMarker(error, "ok:false throw");
        const presented = toPublicOneCError(error);
        assert.equal(presented.httpStatus, 400);
        assert.equal(presented.body.code, "ONEC_UPSTREAM_ERROR");
        assertNoMarker(presented, "ok:false public");
        return true;
      }
    );
  });
});

test("C3: inbound ONEC_AUTH_* through middleware keeps own status/code", () => {
  const authError = new Error("Требуется ключ обмена 1С.");
  authError.code = "ONEC_AUTH_REQUIRED";
  authError.status = 401;
  assert.equal(isOutboundOneCPublicError(authError), false);
  const presented = presentUnhandledOneCError(authError);
  assert.equal(presented, null);
  assert.equal(authError.status, 401);
  assert.equal(authError.code, "ONEC_AUTH_REQUIRED");
  assert.equal(authError.message, "Требуется ключ обмена 1С.");

  const configError = new Error("ONEC contour credential config invalid");
  configError.code = "ONEC_CONFIG_INVALID";
  configError.status = 503;
  assert.equal(presentUnhandledOneCError(configError), null);

  const outbound = new Error(ONEC_PUBLIC_MESSAGE.ONEC_UPSTREAM_ERROR);
  outbound.code = "ONEC_UPSTREAM_ERROR";
  outbound.status = 500;
  const outboundPresented = presentUnhandledOneCError(outbound);
  assert.equal(outboundPresented?.httpStatus, 502);
  assert.equal(outboundPresented?.body.code, "ONEC_UPSTREAM_ERROR");
});

test("SEC3-007: logCaughtError omits Error fields, stack, email, transport", () => {
  const lines = [];
  setSafeLogWriter((line) => lines.push(line));
  try {
    const boom = new Error(leakBlob());
    boom.stack = `Error: ${leakBlob()}\n    at send (${MARKER_PATH}:1:1)`;
    boom.code = "EENVELOPE";
    boom.statusCode = 502;
    boom.to = MARKER_EMAIL;
    boom.endpoint = `https://push.example.invalid/${MARKER_TOKEN}`;
    boom.headers = { authorization: "Bearer abc" };
    const cyclic = { boom };
    cyclic.self = cyclic;
    boom.cause = cyclic;
    const record = logCaughtError("mail.reconciliation", boom, {
      component: "mail",
      httpStatus: 502,
    });
    assert.equal(record.event, "mail.reconciliation");
    assert.equal(record.code, "EENVELOPE");
    assert.equal(record.status, 502);
    assert.equal(record.httpStatus, 502);
    assert.equal(record.component, "mail");
    assert.equal(Object.hasOwn(record, "message"), false);
    assert.equal(Object.hasOwn(record, "stack"), false);
    assert.equal(Object.hasOwn(record, "endpoint"), false);
    assert.equal(Object.hasOwn(record, "headers"), false);
    assert.equal(Object.hasOwn(record, "to"), false);
    assert.equal(lines.length, 1);
    assertNoMarker(record, "caught error record");
    assertNoMarker(lines[0], "caught error line");
  } finally {
    setSafeLogWriter(null);
  }
});

test("SEC3-007: push failure logs allowlist only and keeps send result", async () => {
  const lines = [];
  setSafeLogWriter((line) => lines.push(line));
  try {
    const boom = new Error(leakBlob());
    boom.statusCode = 500;
    boom.endpoint = `https://push.example.invalid/${MARKER_TOKEN}`;
    boom.headers = { authorization: "Bearer abc" };
    const result = await sendPushToSubscriptions([
      {
        userId: "user-1",
        endpoint: `https://push.example.invalid/${MARKER_TOKEN}`,
        subscription: { endpoint: `https://push.example.invalid/${MARKER_TOKEN}` },
      },
    ], { title: "t" }, {
      webpush: {
        sendNotification: async () => {
          throw boom;
        },
      },
    });
    assert.equal(result.enabled, true);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.event, "push.send");
    assert.equal(record.component, "push");
    assertNoMarker(record, "push log");
    assertNoMarker(lines[0], "push line");
  } finally {
    setSafeLogWriter(null);
  }
});

test("SEC3-007: claim requeue failure is swallowed without Error dump", () => {
  const lines = [];
  setSafeLogWriter((line) => lines.push(line));
  try {
    const boom = new Error(leakBlob());
    boom.code = "SQLITE_ERROR";
    const released = runOneCClaimRequeueTick({
      releaseExpiredOneCClaims: () => {
        throw boom;
      },
    });
    assert.equal(released, 0);
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.event, "onec.claim.requeue");
    assert.equal(record.code, "SQLITE_ERROR");
    assert.equal(Object.hasOwn(record, "message"), false);
    assertNoMarker(record, "claim log");
    assertNoMarker(lines[0], "claim line");
  } finally {
    setSafeLogWriter(null);
  }
});

test("SEC3-007: logger does not throw on cyclic extra fields", () => {
  const lines = [];
  setSafeLogWriter((line) => lines.push(line));
  try {
    const extra = { event: "http.public.site", code: "X", component: "public" };
    extra.self = extra;
    const record = logSafe("error", extra);
    assert.equal(record.event, "http.public.site");
    assert.equal(lines.length, 1);
    JSON.parse(lines[0]);
  } finally {
    setSafeLogWriter(null);
  }
});

test("SEC3-007: leftover production dumps are wired to logSafe", () => {
  const serverSource = readRepoSource("server/src/server.js");
  const dbSource = readRepoSource("server/src/db.js");
  const pushSource = readRepoSource("server/src/push.js");
  assert.doesNotMatch(serverSource, /console\.error\(\s*error\s*\)/u);
  assert.doesNotMatch(serverSource, /console\.error\([^;]*error\?\.message/u);
  assert.doesNotMatch(serverSource, /console\.error\([^;]*mailError/u);
  assert.doesNotMatch(pushSource, /console\.error\(/u);
  assert.doesNotMatch(dbSource, /Создан менеджер \$\{email\}/u);
  assert.match(dbSource, /event: "db.seed.manager"/u);
  assert.match(serverSource, /logCaughtError\("mail.reconciliation"/u);
  assert.match(serverSource, /logCaughtError\("mail.approval"/u);
  assert.match(serverSource, /logCaughtError\("push.reconciliation"/u);
  assert.match(serverSource, /runOneCClaimRequeueTick/u);
});
