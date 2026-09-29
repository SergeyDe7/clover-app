import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import express from "express";
import {
  denyPrivateUploadNamespace,
  inspectUploadRequestPath,
} from "../src/uploadPathPolicy.js";
import {
  LEGACY_CLIENT_DATA_KEYS,
  LEGACY_CLIENT_OWNER_KEY,
  clearStorageKeys,
  legacyClientProfileMatchesUser,
  legacyStorageBelongsTo,
  userDraftStorageKey,
} from "../../src/shared/browserStorageSecurity.js";
import {
  API_TOKEN_KEY,
  clearSessionToken,
  readSessionToken,
  writeSessionToken,
} from "../../src/shared/sessionTokenStorage.js";
import {
  consumePublicRateLimit,
  createBoundedRateLimitStore,
} from "../src/publicRateLimit.js";
import {
  resolvePublicCatalogClientSubject,
  resolvePublicCatalogTrustedProxyIps,
} from "../src/publicCatalogGuard.js";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "clover-security-stage10d-"));
const privateDirectory = path.join(fixtureRoot, "reconciliation");
mkdirSync(privateDirectory, { recursive: true });
writeFileSync(path.join(privateDirectory, "secret.pdf"), "private-act", "utf8");
writeFileSync(path.join(fixtureRoot, "public.png"), "public-image", "utf8");

after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

test("SEC10D-PWA-001 upload path policy blocks encoded and separator aliases", () => {
  for (const value of [
    "/reconciliation/secret.pdf",
    "/reconciliation%2Fsecret.pdf",
    "//reconciliation/secret.pdf",
    "/reconciliation%5Csecret.pdf",
    "/ReConCiLiAtIoN/secret.pdf",
    "/x/../reconciliation/secret.pdf",
    "/%E0%A4%A",
  ]) {
    const result = inspectUploadRequestPath(value);
    assert.equal(
      !result.valid || result.privateNamespace,
      true,
      `${value} must be rejected before express.static`
    );
  }
  assert.deepEqual(inspectUploadRequestPath("/public.png"), {
    valid: true,
    privateNamespace: false,
    normalizedPath: "/public.png",
  });
});

test("SEC10D-PWA-002 live static mount never serves reconciliation aliases", async () => {
  const app = express();
  app.use("/uploads", denyPrivateUploadNamespace, express.static(fixtureRoot));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    for (const suffix of [
      "/uploads/reconciliation/secret.pdf",
      "/uploads/reconciliation%2Fsecret.pdf",
      "/uploads//reconciliation/secret.pdf",
      "/uploads/reconciliation%5Csecret.pdf",
      "/uploads/ReConCiLiAtIoN/secret.pdf",
    ]) {
      const response = await fetch(`${base}${suffix}`);
      assert.equal(response.status, 404, `${suffix} must stay private`);
    }
    const publicResponse = await fetch(`${base}/uploads/public.png`);
    assert.equal(publicResponse.status, 200);
    assert.equal(await publicResponse.text(), "public-image");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("SEC10D-PWA-003 order drafts are isolated by authenticated account", () => {
  const accountA = userDraftStorageKey("client-a");
  const accountB = userDraftStorageKey("client-b");
  assert.ok(accountA);
  assert.notEqual(accountA, accountB);
  const storage = memoryStorage();
  storage.setItem(accountA, JSON.stringify({ address: "A private address" }));
  assert.equal(storage.getItem(accountB), null);
  assert.equal(userDraftStorageKey(""), "");
});

test("SEC10D-PWA-004 legacy client data is fail-closed and cleaned only after owned migration", () => {
  const storage = memoryStorage({
    "clover-client-profile": JSON.stringify({ companyName: "A" }),
    "clover-addresses": JSON.stringify([{ address: "A private address" }]),
  });
  assert.equal(
    legacyStorageBelongsTo(storage, LEGACY_CLIENT_OWNER_KEY, "client-a"),
    false,
    "unowned legacy data must not be assigned to the next login"
  );
  storage.setItem(LEGACY_CLIENT_OWNER_KEY, "client-a");
  assert.equal(legacyStorageBelongsTo(storage, LEGACY_CLIENT_OWNER_KEY, "client-a"), true);
  assert.equal(legacyStorageBelongsTo(storage, LEGACY_CLIENT_OWNER_KEY, "client-b"), false);
  assert.equal(
    legacyClientProfileMatchesUser(
      { email: " Owner@Example.COM " },
      { email: "owner@example.com" }
    ),
    true,
    "matching authenticated email keeps the real upgrade path reachable"
  );
  assert.equal(
    legacyClientProfileMatchesUser(
      { email: "owner@example.com" },
      { email: "other@example.com" }
    ),
    false,
    "legacy PII must not migrate to another account"
  );
  clearStorageKeys(storage, [...LEGACY_CLIENT_DATA_KEYS, LEGACY_CLIENT_OWNER_KEY]);
  for (const key of [...LEGACY_CLIENT_DATA_KEYS, LEGACY_CLIENT_OWNER_KEY]) {
    assert.equal(storage.getItem(key), null, `${key} must be removed after successful migration`);
  }
});

test("SEC10D-ABUSE-005 changing login subjects cannot bypass the client limit", () => {
  const secret = "s".repeat(32);
  const store = createBoundedRateLimitStore({ maxEntries: 64, now: () => 1000 });
  const trusted = resolvePublicCatalogTrustedProxyIps("192.0.2.10");
  const directSubject = resolvePublicCatalogClientSubject({
    socket: { remoteAddress: "198.51.100.8" },
    headers: { "x-real-ip": "203.0.113.99" },
  }, trusted);
  assert.equal(directSubject, "ip:198.51.100.8", "untrusted peer must not spoof X-Real-IP");

  const proxiedSubject = resolvePublicCatalogClientSubject({
    socket: { remoteAddress: "192.0.2.10" },
    headers: { "x-real-ip": "203.0.113.9" },
  }, trusted);
  assert.equal(proxiedSubject, "ip:203.0.113.9");

  let decision;
  for (let index = 0; index < 61; index += 1) {
    decision = consumePublicRateLimit({
      scope: "loginClient",
      subject: proxiedSubject,
      secret,
      store,
    });
  }
  assert.equal(decision.allowed, false);
  assert.ok(decision.retryAfterSeconds > 0);
});

test("SEC10D-ABUSE-006 security client bucket fails closed at capacity", () => {
  const secret = "s".repeat(32);
  const store = createBoundedRateLimitStore({
    maxEntries: 8,
    now: () => 1000,
    failClosedOnCapacity: true,
  });
  for (let index = 0; index < 8; index += 1) {
    const decision = consumePublicRateLimit({
      scope: "guestOrderClient",
      subject: `ip:192.0.2.${index}`,
      secret,
      store,
    });
    assert.equal(decision.allowed, true);
  }
  const overflow = consumePublicRateLimit({
    scope: "guestOrderClient",
    subject: "ip:192.0.2.250",
    secret,
    store,
  });
  assert.equal(overflow.allowed, false);
  assert.equal(overflow.capacity, true);
  assert.ok(overflow.retryAfterSeconds > 0);
});

test("SEC10D-PWA-007 bearer token is session-scoped and legacy localStorage is retired", () => {
  const local = memoryStorage({ [API_TOKEN_KEY]: "legacy-token" });
  const session = memoryStorage();
  assert.equal(readSessionToken({ sessionStorage: session, localStorage: local }), "legacy-token");
  assert.equal(local.getItem(API_TOKEN_KEY), null);
  assert.equal(session.getItem(API_TOKEN_KEY), "legacy-token");

  assert.equal(writeSessionToken("current-token", { sessionStorage: session, localStorage: local }), true);
  assert.equal(session.getItem(API_TOKEN_KEY), "current-token");
  assert.equal(local.getItem(API_TOKEN_KEY), null);

  clearSessionToken({ sessionStorage: session, localStorage: local });
  assert.equal(session.getItem(API_TOKEN_KEY), null);
  assert.equal(local.getItem(API_TOKEN_KEY), null);

  const rejectedSession = {
    getItem() { return null; },
    setItem() { throw new Error("storage disabled"); },
    removeItem() {},
  };
  const fallbackLocal = memoryStorage({ [API_TOKEN_KEY]: "keep-until-migrated" });
  assert.equal(
    readSessionToken({ sessionStorage: rejectedSession, localStorage: fallbackLocal }),
    "keep-until-migrated"
  );
  assert.equal(
    fallbackLocal.getItem(API_TOKEN_KEY),
    "keep-until-migrated",
    "failed session write must not silently lose the active login"
  );
});

test("SEC10D-ABUSE-008 sensitive routes wire both client and subject defenses", () => {
  const serverSource = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  for (const marker of [
    'rejectPublicClientAbuseLimit(req, res, "registerClient")',
    'rejectPublicClientAbuseLimit(req, res, "verifyEmailClient")',
    'rejectPublicClientAbuseLimit(req, res, "resendVerificationClient")',
    'rejectPublicClientAbuseLimit(req, res, "forgotPasswordClient")',
    'rejectPublicClientAbuseLimit(req, res, "resetPasswordClient")',
    'rejectPublicClientAbuseLimit(req, res, "guestOrderClient")',
    'rejectPublicClientAbuseLimit(req, res, "loginClient")',
    'rejectPublicClientAbuseLimit(req, res, "passkeyAuthOptionsClient")',
    'rejectPublicClientAbuseLimit(req, res, "passkeyAuthVerifyClient")',
  ]) {
    assert.ok(serverSource.includes(marker), `${marker} must remain wired before side effects`);
  }
  const resetRouteStart = serverSource.indexOf('app.post("/api/auth/reset-password"');
  const resetRouteEnd = serverSource.indexOf('app.post("/api/auth/login"', resetRouteStart);
  const resetRoute = serverSource.slice(resetRouteStart, resetRouteEnd);
  assert.ok(
    resetRoute.indexOf('"resetPasswordClient"') < resetRoute.indexOf("hashPassword(input.password)"),
    "client limiter must run before expensive password hashing"
  );
  const publicOrderStart = serverSource.indexOf('app.post("/api/public/orders"');
  const publicOrderEnd = serverSource.indexOf("function liveAuthIssuanceDeps", publicOrderStart);
  const publicOrder = serverSource.slice(publicOrderStart, publicOrderEnd);
  assert.match(publicOrder, /setNoStore\(res\)/);
  assert.match(
    publicOrder,
    /error:\s*status >= 500\s*\?\s*"Не удалось оформить заказ\."\s*:\s*error\?\.message/
  );
  assert.doesNotMatch(publicOrder, /error:\s*error\?\.message\s*\|\|/);

  const productRouteStart = serverSource.indexOf('app.get("/api/public/catalog/:code"');
  const productRouteEnd = serverSource.indexOf('/** Гостевой заказ', productRouteStart);
  assert.ok(
    serverSource.slice(productRouteStart, productRouteEnd).includes("rejectPublicCatalogReadLimit(req, res)"),
    "catalog detail must share the catalog read limiter"
  );
});

test("SEC10D-PWA-009 resource CSP is enforced and inline event attributes are blocked", () => {
  const headers = readFileSync(
    new URL("../../ops/security-stage6/package-b/nginx/clover-security-headers.conf", import.meta.url),
    "utf8"
  );
  assert.match(headers, /Content-Security-Policy\s+"default-src 'self'/);
  assert.doesNotMatch(headers, /Content-Security-Policy-Report-Only/);
  assert.match(headers, /script-src-attr 'none'/);
  assert.match(headers, /worker-src 'self'/);
  assert.match(headers, /connect-src 'self' https:\/\/mc\.yandex\.ru https:\/\/mc\.yandex\.com/);

  const offline = readFileSync(new URL("../../public/offline.html", import.meta.url), "utf8");
  assert.doesNotMatch(offline, /\son[a-z]+\s*=/i);
  assert.match(offline, /addEventListener\("click"/);
});
