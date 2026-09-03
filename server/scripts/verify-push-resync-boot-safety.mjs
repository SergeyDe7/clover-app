/**
 * TDD verifier: push subscription resync boot-safety & lifecycle gates.
 * Exercises real pushSync.js under browser mocks (not grep-only).
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pushSyncSrcPath = path.join(root, "src/shared/pushSync.js");
const sharedPanelsPath = path.join(root, "src/shared/SharedPanels.jsx");
const appPath = path.join(root, "src/App.jsx");

const HINT =
  "Нажмите «Включить уведомления», чтобы восстановить push на этом устройстве.";

function activeTimeoutCount() {
  if (typeof process.getActiveResourcesInfo === "function") {
    return process.getActiveResourcesInfo().filter((x) => x === "Timeout").length;
  }
  return null;
}

function installBrowserGlobals({
  permission = "granted",
  readyPromise,
  subscription = null,
  subscribeImpl,
} = {}) {
  const listeners = new Map();
  const add = (target, type, fn) => {
    if (!listeners.has(target)) listeners.set(target, new Map());
    const byType = listeners.get(target);
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(fn);
  };
  const remove = (target, type, fn) => {
    listeners.get(target)?.get(type)?.delete(fn);
  };
  const dispatch = (target, type, event = {}) => {
    for (const fn of [...(listeners.get(target)?.get(type) || [])]) {
      fn(event);
    }
  };

  let requestPermissionCalls = 0;
  let subscribeCalls = 0;

  const pushManager = {
    getSubscription: async () => subscription,
    subscribe: async (...args) => {
      subscribeCalls += 1;
      if (subscribeImpl) return subscribeImpl(...args);
      const next = {
        endpoint: "https://push.example/sub-new",
        toJSON() {
          return { endpoint: this.endpoint, keys: { p256dh: "x", auth: "y" } };
        },
      };
      subscription = next;
      return next;
    },
  };

  const registration = { pushManager };

  const serviceWorker = {
    ready:
      readyPromise ||
      Promise.resolve(registration),
    addEventListener: (type, fn) => add(serviceWorker, type, fn),
    removeEventListener: (type, fn) => remove(serviceWorker, type, fn),
    _dispatch: (type, event) => dispatch(serviceWorker, type, event),
  };

  const Notification = {
    get permission() {
      return permission;
    },
    requestPermission: async () => {
      requestPermissionCalls += 1;
      return permission;
    },
  };

  const documentRef = {
    visibilityState: "visible",
    hidden: false,
    addEventListener: (type, fn) => add(documentRef, type, fn),
    removeEventListener: (type, fn) => remove(documentRef, type, fn),
    _dispatch: (type, event) => dispatch(documentRef, type, event),
  };

  const windowObj = {
    addEventListener: (type, fn) => add(windowObj, type, fn),
    removeEventListener: (type, fn) => remove(windowObj, type, fn),
    _dispatch: (type, event) => dispatch(windowObj, type, event),
    document: documentRef,
    Notification,
    PushManager: function PushManager() {},
  };

  globalThis.window = windowObj;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: documentRef,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: { serviceWorker },
  });
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    writable: true,
    value: Notification,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: () => "",
      setItem() {},
      removeItem() {},
    },
  });
  // pushSync reads Notification / navigator as globals (browser)
  globalThis.self = globalThis;

  return {
    windowObj,
    serviceWorker,
    documentRef,
    registration,
    get requestPermissionCalls() {
      return requestPermissionCalls;
    },
    get subscribeCalls() {
      return subscribeCalls;
    },
    setPermission(next) {
      permission = next;
    },
    setSubscription(next) {
      subscription = next;
    },
    listenerCount(target, type) {
      return listeners.get(target)?.get(type)?.size || 0;
    },
  };
}

async function loadPushSyncModule({
  getPushStatus,
  subscribePush,
  readyPromise,
  permission,
  subscription,
  subscribeImpl,
}) {
  const tmp = mkdtempSync(path.join(tmpdir(), "clover-push-resync-"));
  const mockApiPath = path.join(tmp, "serverApi-mock.mjs");
  const underTestPath = path.join(tmp, "pushSync.under-test.mjs");

  let subscribePushCalls = 0;
  const apiState = {
    getPushStatus:
      getPushStatus ||
      (async () => ({
        enabled: true,
        publicKey: "BOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        subscriptions: [],
      })),
    subscribePush: async (...args) => {
      subscribePushCalls += 1;
      if (subscribePush) return subscribePush(...args);
      return { ok: true };
    },
  };

  writeFileSync(
    mockApiPath,
    `export const api = {
  getPushStatus: (...a) => globalThis.__pushTestApi.getPushStatus(...a),
  subscribePush: (...a) => globalThis.__pushTestApi.subscribePush(...a),
};
`
  );

  const src = readFileSync(pushSyncSrcPath, "utf8").replace(
    /from\s+["']\.\.\/serverApi["']/,
    `from ${JSON.stringify(pathToFileURL(mockApiPath).href)}`
  );
  writeFileSync(underTestPath, src);

  const env = installBrowserGlobals({
    permission,
    readyPromise,
    subscription,
    subscribeImpl,
  });
  globalThis.__pushTestApi = apiState;

  try {
    const mod = await import(`${pathToFileURL(underTestPath).href}?t=${Date.now()}-${Math.random()}`);
    return {
      mod,
      env,
      get subscribePushCalls() {
        return subscribePushCalls;
      },
      cleanup: () => {
        try {
          rmSync(tmp, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      },
    };
  } catch (error) {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw error;
  }
}

function makeSub(endpoint = "https://push.example/existing") {
  return {
    endpoint,
    toJSON() {
      return { endpoint: this.endpoint, keys: { p256dh: "p", auth: "a" } };
    },
  };
}

async function testA_readyNeverResolves() {
  let pendingResolve;
  const forever = new Promise((resolve) => {
    pendingResolve = resolve;
  });
  const harness = await loadPushSyncModule({
    permission: "granted",
    readyPromise: forever,
    subscription: makeSub(),
  });
  let unhandled = null;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.on("unhandledRejection", onUnhandled);
  const abort = new AbortController();

  try {
    const timeoutsBefore = activeTimeoutCount();
    const started = Date.now();
    const result = await Promise.race([
      harness.mod.syncPushSubscription(),
      delay(9000, undefined, { signal: abort.signal }).then(
        () => ({ __stillPending: true }),
        () => ({ __aborted: true })
      ),
    ]);
    abort.abort();

    assert.equal(
      result?.__stillPending,
      undefined,
      "TEST A RED/expected after fix: syncPushSubscription must bound serviceWorker.ready (got hang)"
    );
    assert.notEqual(result?.__aborted, true, "TEST A: race aborted unexpectedly");
    assert.equal(result.synced, false);
    assert.match(String(result.reason || ""), /timeout|ready/i);
    assert.ok(Date.now() - started < 9000, "TEST A: took too long");

    await delay(30);
    const timeoutsAfter = activeTimeoutCount();
    if (timeoutsBefore != null && timeoutsAfter != null) {
      assert.ok(
        timeoutsAfter <= timeoutsBefore,
        `TEST A: dangling Timeout remains (before=${timeoutsBefore} after=${timeoutsAfter})`
      );
    }
    assert.equal(unhandled, null, "TEST A: unhandled rejection");
  } finally {
    abort.abort();
    process.off("unhandledRejection", onUnhandled);
    pendingResolve?.(harness.env.registration);
    harness.cleanup();
  }
  console.log("TEST A PASS: serviceWorker.ready timeout bounded + cleaned");
}

async function testB_subscribeOrUpsertRejects() {
  const harness = await loadPushSyncModule({
    permission: "granted",
    subscription: null,
    subscribeImpl: async () => {
      throw new Error("subscribe boom");
    },
  });
  let unhandled = null;
  const onUnhandled = (r) => {
    unhandled = r;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    let threw = false;
    let result;
    try {
      result = await harness.mod.syncPushSubscription();
    } catch {
      threw = true;
    }
    assert.equal(
      threw,
      false,
      "TEST B RED/expected after fix: syncPushSubscription must not throw into caller"
    );
    assert.equal(result.synced, false);
    assert.ok(result.reason, "structured failure reason required");
    await delay(20);
    assert.equal(unhandled, null, "TEST B: unhandled rejection");
  } finally {
    process.off("unhandledRejection", onUnhandled);
    harness.cleanup();
  }

  const harness2 = await loadPushSyncModule({
    permission: "granted",
    subscription: makeSub(),
    getPushStatus: async () => ({
      enabled: true,
      publicKey: "BOxx",
      subscriptions: [],
    }),
    subscribePush: async () => {
      throw new Error("upsert boom");
    },
  });
  process.on("unhandledRejection", onUnhandled);
  try {
    let threw = false;
    let result;
    try {
      result = await harness2.mod.syncPushSubscription();
    } catch {
      threw = true;
    }
    assert.equal(threw, false, "TEST B: upsert rejection must not throw");
    assert.equal(result.synced, false);
    await delay(20);
    assert.equal(unhandled, null);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    harness2.cleanup();
  }
  console.log("TEST B PASS: subscribe/upsert errors contained");
}

async function testC_existingSubscriptionReUpsert() {
  const existing = makeSub("https://push.example/already-there");
  const harness = await loadPushSyncModule({
    permission: "granted",
    subscription: existing,
    getPushStatus: async () => ({
      enabled: true,
      publicKey: "BOxx",
      // Server already has this endpoint — early-return bug skips upsert on main
      subscriptions: [{ endpoint: existing.endpoint, promotions: false }],
    }),
  });
  try {
    const result = await harness.mod.syncPushSubscription();
    assert.equal(result.synced, true, "TEST C: expected synced");
    assert.ok(
      harness.subscribePushCalls >= 1,
      "TEST C RED/expected after fix: existing subscription must still upsert to backend"
    );
  } finally {
    harness.cleanup();
  }
  console.log("TEST C PASS: existing subscription re-upserted");
}

async function testD_permissionSafety() {
  for (const permission of ["default", "denied"]) {
    const harness = await loadPushSyncModule({
      permission,
      subscription: null,
    });
    try {
      const result = await harness.mod.syncPushSubscription();
      assert.equal(result.synced, false);
      assert.equal(harness.env.requestPermissionCalls, 0, `TEST D: requestPermission called (${permission})`);
      assert.equal(harness.env.subscribeCalls, 0, `TEST D: subscribe called (${permission})`);
      assert.equal(harness.subscribePushCalls, 0, `TEST D: upsert called (${permission})`);
    } finally {
      harness.cleanup();
    }
  }
  console.log("TEST D PASS: lifecycle never prompts / subscribes without granted");
}

async function testE_singleFlight() {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let upsertStarts = 0;
  let concurrent = 0;
  let maxConcurrent = 0;

  const harness = await loadPushSyncModule({
    permission: "granted",
    subscription: makeSub(),
    getPushStatus: async () => ({
      enabled: true,
      publicKey: "BOxx",
      subscriptions: [],
    }),
    subscribePush: async () => {
      upsertStarts += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await gate;
      concurrent -= 1;
      return { ok: true };
    },
  });

  try {
    const p1 = harness.mod.syncPushSubscription();
    // Burst lifecycle-style triggers while first sync pending
    const p2 = harness.mod.syncPushSubscription();
    const p3 = harness.mod.syncPushSubscription();
    // Also via listeners if present
    const cleanup = harness.mod.installPushSyncListeners?.();
    harness.env.windowObj._dispatch("pageshow", { persisted: false });
    harness.env.windowObj._dispatch("online");
    harness.env.windowObj._dispatch("focus");
    harness.env.documentRef.visibilityState = "visible";
    harness.env.documentRef.hidden = false;
    harness.env.documentRef._dispatch("visibilitychange");

    await delay(30);
    release();
    const results = await Promise.all([p1, p2, p3]);
    assert.ok(results.every((r) => r && r.synced === true));
    assert.equal(
      upsertStarts,
      1,
      `TEST E RED/expected after fix: expected 1 upsert, got ${upsertStarts} (maxConcurrent=${maxConcurrent})`
    );
    assert.equal(maxConcurrent, 1, "TEST E: parallel upserts detected");
    cleanup?.();
  } finally {
    release?.();
    harness.cleanup();
  }
  console.log("TEST E PASS: single-flight coalesces burst");
}

async function testF_listenerCleanup() {
  const harness = await loadPushSyncModule({
    permission: "granted",
    subscription: makeSub(),
    getPushStatus: async () => ({
      enabled: true,
      publicKey: "BOxx",
      subscriptions: [{ endpoint: "https://push.example/existing" }],
    }),
  });
  try {
    assert.equal(typeof harness.mod.installPushSyncListeners, "function");
    const cleanup = harness.mod.installPushSyncListeners();
    for (const type of ["pageshow", "online", "focus"]) {
      assert.ok(
        harness.env.listenerCount(harness.env.windowObj, type) >= 1,
        `TEST F: missing window ${type} listener`
      );
    }
    assert.equal(
      harness.env.listenerCount(harness.env.windowObj, "visibilitychange"),
      0,
      "TEST F RED/expected after fix: visibilitychange must NOT be on window"
    );
    assert.ok(
      harness.env.listenerCount(harness.env.documentRef, "visibilitychange") >= 1,
      "TEST F RED/expected after fix: visibilitychange must be on document"
    );
    cleanup();
    for (const type of ["pageshow", "online", "focus"]) {
      assert.equal(
        harness.env.listenerCount(harness.env.windowObj, type),
        0,
        `TEST F: window ${type} listener not removed`
      );
    }
    assert.equal(
      harness.env.listenerCount(harness.env.documentRef, "visibilitychange"),
      0,
      "TEST F: document visibilitychange listener not removed"
    );
    const before = harness.subscribePushCalls;
    harness.env.windowObj._dispatch("pageshow");
    harness.env.windowObj._dispatch("online");
    harness.env.windowObj._dispatch("focus");
    harness.env.documentRef._dispatch("visibilitychange");
    await delay(30);
    assert.equal(
      harness.subscribePushCalls,
      before,
      "TEST F: events after cleanup started another sync"
    );
  } finally {
    harness.cleanup();
  }
  console.log("TEST F PASS: lifecycle listeners cleaned up (visibility on document)");
}

async function testG_restoreHintProductionDecision() {
  const panels = readFileSync(sharedPanelsPath, "utf8");
  assert.match(
    panels,
    /pushRestoreHintMessage\s*\(/,
    "TEST G RED/expected after fix: SharedPanels must call production pushRestoreHintMessage()"
  );
  assert.equal(
    panels.includes("function decideHint"),
    false,
    "TEST G: test-only decideHint must not live in SharedPanels"
  );

  const harness = await loadPushSyncModule({
    permission: "granted",
    subscription: makeSub("https://push.example/browser-only"),
  });
  try {
    assert.equal(
      typeof harness.mod.pushRestoreHintMessage,
      "function",
      "TEST G RED/expected after fix: pushRestoreHintMessage must be exported from pushSync"
    );
    const hint = harness.mod.pushRestoreHintMessage({
      syncReason: "ok",
      browserEndpoint: "https://push.example/browser-only",
      serverSubscriptions: [],
    });
    assert.equal(
      hint,
      HINT,
      "TEST G: production decision must return restore hint when browser endpoint missing on server"
    );
    assert.equal(
      harness.mod.pushRestoreHintMessage({
        syncReason: "registered",
        browserEndpoint: "https://push.example/browser-only",
        serverSubscriptions: [],
      }),
      null,
      "TEST G: registered sync must not show restore hint"
    );
    assert.equal(
      harness.mod.pushRestoreHintMessage({
        syncReason: "sync_error",
        browserEndpoint: "https://push.example/browser-only",
        serverSubscriptions: [{ endpoint: "https://push.example/browser-only" }],
      }),
      null,
      "TEST G: endpoint already on server → no hint"
    );
  } finally {
    harness.cleanup();
  }
  console.log("TEST G PASS: production restore-hint decision");
}

async function testH_malformedStatusNeverRejects() {
  const existing = makeSub("https://push.example/ok-sub");
  let call = 0;
  const harness = await loadPushSyncModule({
    permission: "granted",
    subscription: existing,
    getPushStatus: async () => {
      call += 1;
      if (call === 1) {
        return {
          enabled: true,
          publicKey: "BOxx",
          subscriptions: "not-an-array",
        };
      }
      return {
        enabled: true,
        publicKey: "BOxx",
        subscriptions: [{ endpoint: existing.endpoint }],
      };
    },
  });
  let unhandled = null;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    let threw = false;
    let first;
    try {
      first = await harness.mod.syncPushSubscription();
    } catch (error) {
      threw = true;
      first = error;
    }
    assert.equal(
      threw,
      false,
      "TEST H RED/expected after fix: malformed subscriptions must not reject Promise"
    );
    assert.equal(first?.synced, false);
    assert.ok(first?.reason, "TEST H: structured failure reason required");
    await delay(20);
    assert.equal(unhandled, null, "TEST H: unhandled rejection after malformed status");

    const second = await harness.mod.syncPushSubscription();
    assert.equal(
      second.synced,
      true,
      "TEST H RED/expected after fix: second sync after failure must run (single-flight cleared)"
    );
    assert.ok(harness.subscribePushCalls >= 1, "TEST H: second sync must upsert");
  } finally {
    process.off("unhandledRejection", onUnhandled);
    harness.cleanup();
  }
  console.log("TEST H PASS: malformed status contained + single-flight cleared");
}

function testAppFireAndForget() {
  const app = readFileSync(appPath, "utf8");
  assert.match(
    app,
    /syncPushSubscription/,
    "TEST App RED/expected after fix: App.jsx must call session syncPushSubscription"
  );
  assert.match(
    app,
    /installPushSyncListeners/,
    "TEST App RED/expected after fix: App.jsx must install push lifecycle listeners"
  );
  // Must not await sync in effect body in a blocking way like: await syncPushSubscription(
  assert.equal(
    /await\s+syncPushSubscription\s*\(/.test(app),
    false,
    "App must not await syncPushSubscription (fire-and-forget)"
  );
  console.log("TEST App structure PASS: fire-and-forget session hooks present");
}

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.error(`FAIL ${name}:`, error.message);
  }
}

await run("A_ready_timeout", testA_readyNeverResolves);
await run("B_error_containment", testB_subscribeOrUpsertRejects);
await run("C_reupsert", testC_existingSubscriptionReUpsert);
await run("D_permission", testD_permissionSafety);
await run("E_single_flight", testE_singleFlight);
await run("F_listener_cleanup", testF_listenerCleanup);
await run("G_restore_hint", testG_restoreHintProductionDecision);
await run("H_malformed_status", testH_malformedStatusNeverRejects);
await run("App_fire_and_forget", testAppFireAndForget);

const failed = results.filter((r) => !r.ok);
console.log(
  "verify-push-resync-boot-safety summary:",
  results.map((r) => `${r.name}=${r.ok ? "PASS" : "FAIL"}`).join(" ")
);
if (failed.length) {
  console.error("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
console.log("verify-push-resync-boot-safety: ok");
