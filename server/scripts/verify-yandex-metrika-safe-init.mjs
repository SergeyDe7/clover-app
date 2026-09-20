import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  ANALYTICS_CONSENT_DENIED,
  ANALYTICS_CONSENT_GRANTED,
  ANALYTICS_CONSENT_SCHEMA_VERSION,
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_CONSENT_UNSET,
  METRIKA_GOAL_IDS,
  METRIKA_GOALS,
  METRIKA_INIT_OPTIONS,
  YANDEX_METRIKA_COUNTER_ID,
  YANDEX_METRIKA_ENABLED_ENV,
  YANDEX_METRIKA_TAG_SRC,
  YANDEX_METRIKA_TEST_MODE_ENV,
  YANDEX_METRIKA_TEST_TAG_SRC,
  isMetrikaTestMode,
  resolveMetrikaTagSrc,
} from "../../src/analytics/metrikaConfig.js";
import {
  hasAnalyticsConsent,
  parseAnalyticsConsentRecord,
  readAnalyticsConsent,
  writeAnalyticsConsent,
} from "../../src/analytics/metrikaConsent.js";
import { createMetrikaRuntime } from "../../src/analytics/metrikaClient.js";
import {
  evaluateAnalyticsGate,
  isExcludedAnalyticsPath,
} from "../../src/analytics/metrikaScope.js";
import {
  buildAnalyticsHit,
  payloadContainsSensitiveLeak,
  sanitizeAnalyticsQueryValue,
  sanitizeAnalyticsUrl,
  sanitizeAnalyticsUrlDetails,
} from "../../src/analytics/metrikaUrl.js";

const src = (rel) => readFileSync(path.join(projectRoot, rel), "utf8");

function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

function createFakeDom({
  hostname = "clover-spb.ru",
  pathname = "/",
  search = "",
  hash = "",
  title = "Хозтовары | КЛЕВЕР",
  referrer = "",
} = {}) {
  const scripts = [];
  const location = {
    hostname,
    pathname,
    search,
    hash,
    get href() {
      return `https://${hostname}${pathname}${search}${hash}`;
    },
  };
  const doc = {
    title,
    referrer,
    head: {
      appendChild(node) {
        scripts.push(node);
        return node;
      },
    },
    createElement() {
      return {
        async: false,
        src: "",
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        onerror: null,
        remove() {
          const index = scripts.indexOf(this);
          if (index >= 0) scripts.splice(index, 1);
        },
      };
    },
    querySelector(selector) {
      if (String(selector).includes("data-clover-yandex-metrika")) {
        return scripts[0] || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (String(selector).includes("data-clover-yandex-metrika")) {
        return scripts.slice();
      }
      return [];
    },
  };
  const win = {
    location,
    document: doc,
    CustomEvent: class CustomEvent {
      constructor(type) {
        this.type = type;
      }
    },
    dispatchEvent() {},
  };
  return { win, doc, scripts, location };
}

function enabledEnv() {
  return { [YANDEX_METRIKA_ENABLED_ENV]: "1" };
}

function createLiveRuntime(dom, options = {}) {
  const consent = options.consentStorage || memoryStore();
  if (options.consent !== "denied") {
    writeAnalyticsConsent(consent, ANALYTICS_CONSENT_GRANTED, dom.win);
  }
  const session = options.sessionStorage || memoryStore();
  const runtime = createMetrikaRuntime({
    getWindow: () => dom.win,
    getDocument: () => dom.doc,
    getEnv: () => options.env || enabledEnv(),
    getStorage: () => consent,
    getSessionStorage: () => session,
  });
  return { runtime, consent, session };
}

function ymCalls(win) {
  return (win.ym?.a || []).map((args) => Array.from(args));
}

assert.equal(YANDEX_METRIKA_COUNTER_ID, 112814607);
assert.deepEqual(METRIKA_GOAL_IDS, [
  "order_submitted",
  "contact_phone_click",
  "contact_message_click",
]);
assert.equal(METRIKA_INIT_OPTIONS.defer, true);
assert.equal(METRIKA_INIT_OPTIONS.webvisor, false);
assert.equal(METRIKA_INIT_OPTIONS.clickmap, false);
assert.equal(METRIKA_INIT_OPTIONS.trackLinks, false);
assert.equal(METRIKA_INIT_OPTIONS.ecommerce, false);
assert.equal(METRIKA_INIT_OPTIONS.sendTitle, false);

assert.equal(
  evaluateAnalyticsGate({
    env: {},
    hostname: "clover-spb.ru",
    pathname: "/",
    consentStorage: memoryStore(),
  }).allowed,
  false,
  "default flag is OFF"
);

assert.ok(
  evaluateAnalyticsGate({
    env: enabledEnv(),
    hostname: "clover-spb.ru",
    pathname: "/",
    consentStorage: memoryStore(),
  }).reasons.includes("consent-not-granted")
);

const granted = memoryStore();
writeAnalyticsConsent(granted, ANALYTICS_CONSENT_GRANTED);
assert.equal(
  evaluateAnalyticsGate({
    env: enabledEnv(),
    hostname: "clover-spb.ru",
    pathname: "/",
    consentStorage: granted,
  }).allowed,
  true
);

for (const pathname of [
  "/lk",
  "/lk/orders",
  "/lk?reset=secret-token",
  "/admin",
  "/manager",
  "/auth/login",
  "/vitrina",
  "/vitrina/catalog",
  "/en/admin",
  "/en/lk",
  "/en/auth",
]) {
  assert.equal(isExcludedAnalyticsPath(pathname), true, pathname);
  assert.equal(
    evaluateAnalyticsGate({
      env: enabledEnv(),
      hostname: "clover-spb.ru",
      pathname,
      consentStorage: granted,
    }).allowed,
    false,
    pathname
  );
}

assert.equal(
  evaluateAnalyticsGate({
    env: enabledEnv(),
    hostname: "localhost",
    pathname: "/",
    consentStorage: granted,
  }).allowed,
  false
);

const leaky = sanitizeAnalyticsUrl(
  "https://clover-spb.ru/checkout?email=ivan@example.com&phone=%2B79210000000&reset=abc12345678&utm_source=yd&yclid=998877&comment=hello"
);
assert.equal(leaky, "https://clover-spb.ru/checkout?utm_source=yd&yclid=998877");
assert.equal(
  sanitizeAnalyticsUrl("https://clover-spb.ru/about#token=supersecret"),
  "https://clover-spb.ru/about"
);
assert.ok(!leaky.includes("ivan"));
assert.ok(!leaky.includes("7921"));
assert.ok(!leaky.includes("reset"));

const hit = buildAnalyticsHit(
  {
    pathname: "/contacts",
    search: "?utm_medium=cpc&email=hid@me.ru",
    hash: "#a",
    referrer: "https://clover-spb.ru/lk?reset=token12345678",
  },
  "Звоните +7 (921) 000-00-00 или hid@me.ru"
);
assert.equal(hit.url, "https://clover-spb.ru/contacts?utm_medium=cpc");
assert.equal(hit.referer, "");
assert.ok(!hit.title.includes("921"));
assert.ok(!hit.title.includes("@"));
assert.equal(payloadContainsSensitiveLeak(hit), false);

const offDom = createFakeDom();
const offRuntime = createMetrikaRuntime({
  getWindow: () => offDom.win,
  getDocument: () => offDom.doc,
  getEnv: () => ({}),
  getStorage: () => granted,
  getSessionStorage: () => memoryStore(),
});
assert.equal(offRuntime.prepare().active, false);
assert.equal(offDom.scripts.length, 0);
assert.equal(typeof offDom.win.ym, "undefined");

const liveDom = createFakeDom();
const { runtime } = createLiveRuntime(liveDom);
assert.equal(runtime.prepare().active, true);
assert.equal(runtime.prepare().active, true);
const inits = runtime.getCalls().filter((item) => item.type === "init");
assert.equal(inits.length, 1, "init once");
assert.equal(liveDom.scripts.length, 1);
assert.equal(liveDom.scripts[0].src, YANDEX_METRIKA_TAG_SRC);
assert.equal(liveDom.scripts[0].async, true);
assert.deepEqual(inits[0].options, { ...METRIKA_INIT_OPTIONS });

runtime.trackPageview();
runtime.trackPageview();
assert.equal(runtime.getCalls().filter((item) => item.type === "hit").length, 1);

liveDom.location.pathname = "/catalog";
runtime.trackPageview();
liveDom.location.pathname = "/en/catalog";
runtime.trackPageview();
liveDom.location.pathname = "/catalog";
runtime.trackPageview();
assert.equal(runtime.getCalls().filter((item) => item.type === "hit").length, 4);

liveDom.location.pathname = "/lk";
assert.equal(runtime.prepare().active, false);
assert.ok(ymCalls(liveDom.win).some((args) => args[1] === "destruct"));
assert.equal(liveDom.win.disableYaCounter112814607, true);
assert.equal(liveDom.scripts.length, 0);
assert.equal(runtime.isInitialized(), false);

liveDom.location.pathname = "/";
writeAnalyticsConsent(granted, ANALYTICS_CONSENT_DENIED, liveDom.win);
const deniedRuntime = createLiveRuntime(liveDom, { consent: "denied" });
assert.equal(deniedRuntime.runtime.prepare().active, false);

const goalDom = createFakeDom({ pathname: "/checkout" });
const liveGoals = createLiveRuntime(goalDom);
liveGoals.runtime.prepare();
assert.equal(liveGoals.runtime.reachGoal(METRIKA_GOALS.ORDER_SUBMITTED, "ORD-1").ok, true);
assert.equal(
  liveGoals.runtime.reachGoal(METRIKA_GOALS.ORDER_SUBMITTED, "ORD-1").reasons?.[0],
  "order-deduped"
);
assert.equal(liveGoals.runtime.reachGoal(METRIKA_GOALS.CONTACT_PHONE_CLICK).ok, true);
assert.equal(liveGoals.runtime.reachGoal(METRIKA_GOALS.CONTACT_MESSAGE_CLICK).ok, true);
const goalCalls = ymCalls(goalDom.win).filter((args) => args[1] === "reachGoal");
assert.deepEqual(
  goalCalls.map((args) => args[2]),
  ["order_submitted", "contact_phone_click", "contact_message_click"]
);
assert.ok(goalCalls.every((args) => args.length === 3), "goals carry no params or callback");
assert.ok(
  !JSON.stringify(liveGoals.runtime.getCalls()).includes("ORD-1"),
  "dedupe id stays local"
);

const brokenDom = createFakeDom();
const broken = createLiveRuntime(brokenDom);
broken.runtime.prepare();
brokenDom.win.ym = () => {
  throw new Error("metrika down");
};
assert.doesNotThrow(() => broken.runtime.trackPageview());
assert.doesNotThrow(() => broken.runtime.reachGoal(METRIKA_GOALS.ORDER_SUBMITTED, "x"));
assert.doesNotThrow(() => broken.runtime.teardown());

const checkout = src("src/screens/storefront/pages/CheckoutPage.jsx");
assert.match(checkout, /const result = await storefrontApi\.placeOrder\(/);
assert.match(checkout, /setDone\(order\)/);
assert.match(checkout, /trackOrderSubmitted\(order\?\.number \|\| order\?\.id \|\| "ok"\)/);
assert.doesNotMatch(checkout, /onClick=\{trackOrderSubmitted/);
assert.doesNotMatch(checkout, /await trackOrderSubmitted/);

const contacts = src("src/screens/storefront/pages/ContactsPage.jsx");
assert.match(contacts, /onClick=\{trackContactPhoneClick\}/);
assert.match(contacts, /onClick=\{trackContactMessageClick\}/);
assert.doesNotMatch(contacts, /trackContactPhoneClick[\s\S]*managerPhone/);
assert.doesNotMatch(contacts, /getTelegramLink|getMaxLink|whatsapp/i);

const clientOrder = src("src/screens/client/OrderEditor.jsx");
assert.doesNotMatch(clientOrder, /trackOrderSubmitted|metrikaBrowser/);
const managerContact = src("src/screens/client/ManagerContact.jsx");
assert.doesNotMatch(managerContact, /trackContactPhoneClick|trackContactMessageClick/);
assert.doesNotMatch(src("src/App.jsx"), /metrikaBrowser|YandexMetrikaRoot|trackOrderSubmitted/);

const html = src("index.html");
assert.doesNotMatch(html, /mc\.yandex\.ru|ym\(|112814607/);
assert.match(html, /clover-public-locale-routes/);

const productionEnv = src(".env.production");
assert.doesNotMatch(productionEnv, /VITE_YANDEX_METRIKA_ENABLED=1/);

const config = src("src/analytics/metrikaConfig.js");
assert.match(config, /webvisor: false/);
assert.match(config, /clickmap: false/);
assert.match(config, /ecommerce: false/);
assert.doesNotMatch(config, /webvisor:\s*true/);
assert.doesNotMatch(config, /clickmap:\s*true/);

const main = src("src/main.jsx");
assert.match(main, /<YandexMetrikaRoot active=\{storefront\} \/>/);

const storefront = src("src/screens/storefront/StorefrontApp.jsx");
assert.match(storefront, /trackStorefrontPageview\(\)/);
assert.match(storefront, /applyStorefrontDocumentMeta\(/);

const seo = src("src/screens/storefront/seo.js");
assert.match(seo, /export function applyStorefrontDocumentMeta/);
assert.match(seo, /document\.title = pageTitle/);
assert.match(seo, /upsertLink\("canonical", canonical\)/);

const localeFlag = src("src/shared/i18n/localeRoutesBuildFlag.js");
assert.match(localeFlag, /CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED/);
assert.match(localeFlag, /=== "1"/);

const contract = src("src/shared/publicSiteContract.js");
assert.match(contract, /PUBLIC_CANONICAL_ORIGIN = "https:\/\/clover-spb.ru"/);

const publicHtml = src("src/shared/sitemap/publicRouteHtml.js");
assert.match(publicHtml, /hreflang/);
assert.match(publicHtml, /canonical/);

assert.equal(readAnalyticsConsent(memoryStore()), ANALYTICS_CONSENT_UNSET);
assert.equal(hasAnalyticsConsent(memoryStore()), false);
const versioned = memoryStore();
writeAnalyticsConsent(versioned, ANALYTICS_CONSENT_GRANTED);
assert.match(versioned.getItem(ANALYTICS_CONSENT_STORAGE_KEY), /"version":1/);
assert.equal(JSON.parse(versioned.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).status, "granted");
const stale = parseAnalyticsConsentRecord(JSON.stringify({ version: 99, status: "granted" }));
assert.equal(stale.status, ANALYTICS_CONSENT_UNSET);
const legacy = parseAnalyticsConsentRecord("granted");
assert.equal(legacy.status, ANALYTICS_CONSENT_GRANTED);
assert.equal(legacy.version, ANALYTICS_CONSENT_SCHEMA_VERSION);

assert.equal(
  sanitizeAnalyticsQueryValue("utm_source", "ivan@example.com").ok,
  false
);
assert.equal(sanitizeAnalyticsQueryValue("utm_campaign", "Иван Иванов").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_content", "hello world").reason, "utm-charset");
assert.equal(sanitizeAnalyticsQueryValue("utm_source", "9211234567").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_campaign", "79210000000").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_source", "yd").ok, true);
assert.equal(sanitizeAnalyticsQueryValue("yclid", "123456789012345").ok, true);
const dirtyUtm = sanitizeAnalyticsUrlDetails(
  "https://clover-spb.ru/?utm_source=ivan@example.com&utm_medium=cpc&yclid=123456789012345"
);
assert.equal(dirtyUtm.url, "https://clover-spb.ru/?utm_medium=cpc&yclid=123456789012345");
assert.ok(dirtyUtm.dropped.some((item) => item.key === "utm_source" && item.reason === "email"));
assert.ok(dirtyUtm.kept.some((item) => item.key === "yclid"));

// Windows smoke FAIL 2026-09-19: unanchored PHONE_RE matched a substring of this yclid.
const WINDOWS_YCLID = "12345678901234567890";
assert.equal(sanitizeAnalyticsQueryValue("yclid", WINDOWS_YCLID).ok, true);
assert.equal(sanitizeAnalyticsQueryValue("yclid", WINDOWS_YCLID).value, WINDOWS_YCLID);
assert.equal(sanitizeAnalyticsQueryValue("ymclid", WINDOWS_YCLID).ok, true);
assert.equal(sanitizeAnalyticsQueryValue("ysclid", WINDOWS_YCLID).ok, true);
assert.equal(sanitizeAnalyticsQueryValue("gclid", WINDOWS_YCLID).ok, true);
assert.equal(sanitizeAnalyticsQueryValue("yclid", "123 456").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("yclid", "abc@def").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("gclid", "+79991234567").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("ymclid", "a".repeat(129)).reason, "click-id-charset");
assert.equal(sanitizeAnalyticsQueryValue("ysclid", "").reason, "empty");
assert.equal(sanitizeAnalyticsQueryValue("utm_source", "9211234567").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_campaign", "ok_campaign").ok, true);
const windowsAttribution = sanitizeAnalyticsUrlDetails(
  `/?utm_source=9211234567&utm_campaign=ok_campaign&yclid=${WINDOWS_YCLID}&email=user@example.com&phone=%2B79991234567`
);
assert.equal(
  windowsAttribution.url,
  `https://clover-spb.ru/?utm_campaign=ok_campaign&yclid=${WINDOWS_YCLID}`
);
assert.ok(
  windowsAttribution.kept.some((item) => item.key === "yclid" && item.value === WINDOWS_YCLID)
);
assert.ok(windowsAttribution.dropped.some((item) => item.key === "utm_source"));
assert.ok(windowsAttribution.dropped.some((item) => item.key === "email"));
assert.ok(windowsAttribution.dropped.some((item) => item.key === "phone"));
assert.equal(leaky, "https://clover-spb.ru/checkout?utm_source=yd&yclid=998877");
assert.equal(
  sanitizeAnalyticsUrl("https://clover-spb.ru/about#token=supersecret"),
  "https://clover-spb.ru/about"
);
assert.equal(hit.url, "https://clover-spb.ru/contacts?utm_medium=cpc");
assert.equal(hit.referer, "");
assert.ok(!hit.title.includes("921"));
assert.ok(!hit.title.includes("@"));
assert.equal(
  payloadContainsSensitiveLeak({
    type: "hit",
    url: windowsAttribution.url,
    title: "КЛЕВЕР",
    referer: "",
  }),
  false
);

const bounce = createFakeDom();
const bounceRun = createLiveRuntime(bounce);
assert.equal(bounceRun.runtime.prepare().active, true);
bounceRun.runtime.trackPageview();
const afterStorefront = bounceRun.runtime.getNetwork().length;
bounce.location.pathname = "/lk";
assert.equal(bounceRun.runtime.prepare().active, false);
assert.ok(bounceRun.runtime.getNetwork().some((item) => item.kind === "ym" && item.method === "destruct"));
assert.equal(bounce.scripts.length, 0);
bounce.location.pathname = "/";
assert.equal(bounceRun.runtime.prepare().active, true);
bounceRun.runtime.trackPageview();
assert.equal(bounce.scripts.length, 1);
assert.ok(bounceRun.runtime.getNetwork().length > afterStorefront);

writeAnalyticsConsent(bounceRun.consent, ANALYTICS_CONSENT_DENIED, bounce.win);
assert.equal(bounceRun.runtime.prepare().active, false);
const afterRevoke = bounceRun.runtime.getNetwork().filter((item) => item.kind === "script").length;
bounceRun.runtime.trackPageview();
bounceRun.runtime.reachGoal(METRIKA_GOALS.CONTACT_PHONE_CLICK);
assert.equal(
  bounceRun.runtime.getNetwork().filter((item) => item.kind === "script").length,
  afterRevoke
);
assert.equal(bounce.scripts.length, 0);

const testEnv = {
  [YANDEX_METRIKA_ENABLED_ENV]: "1",
  [YANDEX_METRIKA_TEST_MODE_ENV]: "1",
  VITE_YANDEX_METRIKA_TAG_SRC: "https://mc.yandex.ru/metrika/tag.js",
};
assert.equal(isMetrikaTestMode(testEnv), true);
assert.equal(resolveMetrikaTagSrc(testEnv), YANDEX_METRIKA_TEST_TAG_SRC);
const localTest = createFakeDom({ hostname: "127.0.0.1" });
const localRun = createLiveRuntime(localTest, { env: testEnv });
assert.equal(localRun.runtime.prepare().active, true);
assert.equal(localTest.scripts[0].src, YANDEX_METRIKA_TEST_TAG_SRC);
assert.doesNotMatch(localTest.scripts[0].src, /mc\.yandex/);

const footer = src("src/screens/storefront/components/StoreFooter.jsx");
assert.match(footer, /openAnalyticsSettings/);
assert.match(footer, /storefront\.analytics\.settings/);
assert.match(footer, /readMetrikaEnvFlag/);
const banner = src("src/analytics/AnalyticsConsentBanner.jsx");
assert.match(banner, /data-analytics-action="allow"/);
assert.match(banner, /storefront\.analytics\.allow/);
assert.match(banner, /storefront\.analytics\.deny/);
assert.doesNotMatch(checkout, /storefront\.analytics/);
assert.match(src("src/analytics/metrikaConfig.js"), /build-time flag/);
assert.match(src("docs/technical/yandex-metrika-safe-init.md"), /PUT \/api\/state\/orders/);

const catalog = src("src/shared/i18n/uiCatalog.js");
const seed = src("server/src/i18n/uiTranslationSeed.js");
for (const key of [
  "storefront.analytics.bannerTitle",
  "storefront.analytics.bannerText",
  "storefront.analytics.allow",
  "storefront.analytics.deny",
  "storefront.analytics.settings",
  "storefront.analytics.revoke",
  "storefront.analytics.revokeNote",
  "storefront.analytics.privacyLink",
  "storefront.analytics.close",
  "storefront.checkout.orderLegalNote",
  "storefront.checkout.orderLegalLink",
]) {
  assert.match(catalog, new RegExp(`"key": "${key}"`));
  assert.match(seed, new RegExp(`"${key}": \\{`));
  assert.match(seed, new RegExp(`"${key}": \\{[\\s\\S]*?"ar":`));
}

console.log("verify-yandex-metrika-safe-init: ok");
