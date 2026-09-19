/**
 * Regression for Windows smoke FAIL 2026-09-19:
 * unanchored PHONE_RE dropped yclid=12345678901234567890.
 * Does not import .env or start a browser.
 */
import assert from "node:assert/strict";
import {
  buildAnalyticsHit,
  payloadContainsSensitiveLeak,
  sanitizeAnalyticsQueryValue,
  sanitizeAnalyticsUrl,
  sanitizeAnalyticsUrlDetails,
} from "../../src/analytics/metrikaUrl.js";

const WINDOWS_YCLID = "12345678901234567890";

const leaky = sanitizeAnalyticsUrl(
  "https://clover-spb.ru/checkout?email=ivan@example.com&phone=%2B79210000000&reset=abc12345678&utm_source=yd&yclid=998877&comment=hello"
);
assert.equal(leaky, "https://clover-spb.ru/checkout?utm_source=yd&yclid=998877");
assert.equal(
  sanitizeAnalyticsUrl("https://clover-spb.ru/about#token=supersecret"),
  "https://clover-spb.ru/about"
);

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

assert.equal(sanitizeAnalyticsQueryValue("utm_source", "ivan@example.com").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_campaign", "Иван Иванов").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_content", "hello world").reason, "utm-charset");
assert.equal(sanitizeAnalyticsQueryValue("utm_source", "9211234567").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_campaign", "79210000000").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("utm_source", "yd").ok, true);
assert.equal(sanitizeAnalyticsQueryValue("yclid", "123456789012345").ok, true);

const yclid = sanitizeAnalyticsQueryValue("yclid", WINDOWS_YCLID);
assert.equal(yclid.ok, true, "Windows yclid must be kept; phone substring is not a click-id rule");
assert.equal(yclid.value, WINDOWS_YCLID);
assert.equal(sanitizeAnalyticsQueryValue("ymclid", WINDOWS_YCLID).ok, true);
assert.equal(sanitizeAnalyticsQueryValue("ysclid", WINDOWS_YCLID).ok, true);
assert.equal(sanitizeAnalyticsQueryValue("gclid", WINDOWS_YCLID).ok, true);

assert.equal(sanitizeAnalyticsQueryValue("yclid", "123 456").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("yclid", "abc@def").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("gclid", "+79991234567").ok, false);
assert.equal(sanitizeAnalyticsQueryValue("ymclid", "a".repeat(129)).reason, "click-id-charset");
assert.equal(sanitizeAnalyticsQueryValue("ysclid", "").reason, "empty");

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

assert.equal(
  payloadContainsSensitiveLeak({
    type: "hit",
    url: windowsAttribution.url,
    title: "КЛЕВЕР",
    referer: "",
  }),
  false
);

console.log("verify-yandex-metrika-url-sanitizer: ok");
