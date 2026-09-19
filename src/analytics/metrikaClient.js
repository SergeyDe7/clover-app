import {
  ANALYTICS_ORDER_DEDUPE_STORAGE_KEY,
  METRIKA_GOAL_IDS,
  METRIKA_GOALS,
  METRIKA_INIT_OPTIONS,
  YANDEX_METRIKA_COUNTER_ID,
  resolveMetrikaTagSrc,
} from "./metrikaConfig.js";
import { readAnalyticsConsent } from "./metrikaConsent.js";
import { evaluateAnalyticsGate } from "./metrikaScope.js";
import { buildAnalyticsHit, payloadContainsSensitiveLeak } from "./metrikaUrl.js";

const SCRIPT_MARK = "data-clover-yandex-metrika";

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function readDedupeSet(storage) {
  if (!storage?.getItem) return new Set();
  try {
    const raw = JSON.parse(storage.getItem(ANALYTICS_ORDER_DEDUPE_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(-50) : []);
  } catch {
    return new Set();
  }
}

function writeDedupeSet(storage, set) {
  if (!storage?.setItem) return;
  try {
    storage.setItem(ANALYTICS_ORDER_DEDUPE_STORAGE_KEY, JSON.stringify([...set].slice(-50)));
  } catch {
    /* ignore */
  }
}

function hashLocalDedupeKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `o:${(hash >>> 0).toString(16)}`;
}

function disableCounterFlag(win, counterId, disabled) {
  if (!win) return;
  try {
    win[`disableYaCounter${counterId}`] = Boolean(disabled);
  } catch {
    /* ignore */
  }
}

export function createMetrikaRuntime(deps = {}) {
  const getWindow = deps.getWindow || (() => (typeof window !== "undefined" ? window : null));
  const getDocument = deps.getDocument || (() => (typeof document !== "undefined" ? document : null));
  const getEnv = deps.getEnv || (() => ({}));
  const getStorage =
    deps.getStorage ||
    (() =>
      safeCall(() => getWindow()?.localStorage) || null);
  const getSessionStorage =
    deps.getSessionStorage ||
    (() =>
      safeCall(() => getWindow()?.sessionStorage) || null);

  let initialized = false;
  let lastHitKey = "";
  const calls = [];
  const network = [];

  function locationState(locationLike) {
    const win = getWindow();
    const loc = locationLike || win?.location || {};
    return {
      hostname: loc.hostname || "",
      pathname: loc.pathname || "/",
      search: loc.search || "",
      hash: loc.hash || "",
      href: loc.href || "",
      referrer: locationLike?.referrer ?? win?.document?.referrer ?? "",
    };
  }

  function currentGate(locationLike) {
    const loc = locationState(locationLike);
    return {
      loc,
      gate: evaluateAnalyticsGate({
        env: getEnv() || {},
        hostname: loc.hostname,
        pathname: loc.pathname,
        consentStorage: getStorage(),
      }),
    };
  }

  function record(entry) {
    if (payloadContainsSensitiveLeak(entry)) {
      return { ok: false, reason: "sensitive-payload" };
    }
    calls.push(entry);
    if (calls.length > 40) calls.splice(0, calls.length - 40);
    return { ok: true, entry };
  }

  function ensureStub(win) {
    if (typeof win.ym === "function") return;
    const ym = function ymStub() {
      ym.a = ym.a || [];
      ym.a.push(arguments);
    };
    ym.a = [];
    ym.l = Date.now();
    win.ym = ym;
  }

  function loadTag(doc) {
    if (!doc?.createElement || !doc.head) return;
    if (doc.querySelector(`script[${SCRIPT_MARK}]`)) return;
    const src = resolveMetrikaTagSrc(getEnv() || {});
    const script = doc.createElement("script");
    script.async = true;
    script.src = src;
    script.setAttribute(SCRIPT_MARK, "1");
    script.onerror = () => undefined;
    doc.head.appendChild(script);
    network.push({ kind: "script", src });
  }

  function invokeYm(counterId, method, ...args) {
    const win = getWindow();
    if (!win || typeof win.ym !== "function") return;
    network.push({ kind: "ym", method: String(method || "") });
    win.ym(counterId, method, ...args);
  }

  function teardown() {
    const win = getWindow();
    const doc = getDocument();
    if (initialized) {
      safeCall(() => invokeYm(YANDEX_METRIKA_COUNTER_ID, "destruct"));
    }
    initialized = false;
    lastHitKey = "";
    disableCounterFlag(win, YANDEX_METRIKA_COUNTER_ID, true);
    if (doc?.querySelectorAll) {
      for (const node of doc.querySelectorAll(`script[${SCRIPT_MARK}]`)) {
        safeCall(() => node.remove());
      }
    }
    return { ok: true, active: false };
  }

  function prepare(locationLike) {
    return safeCall(() => {
      const { loc, gate } = currentGate(locationLike);
      if (!gate.allowed) {
        teardown();
        return { ok: true, active: false, reasons: gate.reasons };
      }
      const win = getWindow();
      const doc = getDocument();
      if (!win || !doc) return { ok: false, active: false, reasons: ["no-window"] };
      disableCounterFlag(win, YANDEX_METRIKA_COUNTER_ID, false);
      if (!initialized) {
        ensureStub(win);
        loadTag(doc);
        invokeYm(YANDEX_METRIKA_COUNTER_ID, "init", { ...METRIKA_INIT_OPTIONS });
        initialized = true;
        record({
          type: "init",
          counterId: YANDEX_METRIKA_COUNTER_ID,
          options: { ...METRIKA_INIT_OPTIONS },
          host: loc.hostname,
          path: loc.pathname,
        });
      }
      return { ok: true, active: true, reasons: [] };
    }) || { ok: false, active: false, reasons: ["prepare-error"] };
  }

  function trackPageview(locationLike, title) {
    return safeCall(() => {
      const prepared = prepare(locationLike);
      if (!prepared.active) return { ok: true, skipped: true, reasons: prepared.reasons };
      const { loc } = currentGate(locationLike);
      const win = getWindow();
      const hit = buildAnalyticsHit(
        loc,
        title || win?.document?.title || ""
      );
      if (hit.key === lastHitKey) {
        return { ok: true, skipped: true, reasons: ["duplicate-hit"] };
      }
      const outbound = {
        type: "hit",
        counterId: YANDEX_METRIKA_COUNTER_ID,
        url: hit.url,
        title: hit.title,
        referer: hit.referer,
      };
      if (payloadContainsSensitiveLeak(outbound)) {
        return { ok: false, reason: "sensitive-payload" };
      }
      lastHitKey = hit.key;
      invokeYm(YANDEX_METRIKA_COUNTER_ID, "hit", hit.url, {
        title: hit.title,
        referer: hit.referer,
      });
      record(outbound);
      return { ok: true, hit };
    }) || { ok: true, skipped: true, reasons: ["hit-error"] };
  }

  function reachGoal(name, localDedupeKey) {
    return safeCall(() => {
      if (!METRIKA_GOAL_IDS.includes(name)) {
        return { ok: false, reason: "unknown-goal" };
      }
      const prepared = prepare();
      if (!prepared.active) return { ok: true, skipped: true, reasons: prepared.reasons };
      if (name === METRIKA_GOALS.ORDER_SUBMITTED) {
        const token = hashLocalDedupeKey(localDedupeKey);
        if (token) {
          const seen = readDedupeSet(getSessionStorage());
          if (seen.has(token)) {
            return { ok: true, skipped: true, reasons: ["order-deduped"] };
          }
          seen.add(token);
          writeDedupeSet(getSessionStorage(), seen);
        }
      }
      const outbound = {
        type: "reachGoal",
        counterId: YANDEX_METRIKA_COUNTER_ID,
        goal: name,
      };
      if (payloadContainsSensitiveLeak(outbound)) {
        return { ok: false, reason: "sensitive-payload" };
      }
      invokeYm(YANDEX_METRIKA_COUNTER_ID, "reachGoal", name);
      record(outbound);
      return { ok: true, goal: name };
    }) || { ok: true, skipped: true, reasons: ["goal-error"] };
  }

  return {
    prepare,
    teardown,
    trackPageview,
    reachGoal,
    isInitialized: () => initialized,
    getCalls: () => calls.slice(),
    getNetwork: () => network.slice(),
    resetCalls: () => {
      calls.length = 0;
      network.length = 0;
    },
    consentState: () => readAnalyticsConsent(getStorage()),
  };
}
