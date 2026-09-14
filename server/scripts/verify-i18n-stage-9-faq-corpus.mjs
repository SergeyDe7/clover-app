/**
 * FAQ optional-empty gate: absent corpus only; present/missing/stale still block;
 * load/count errors must not look like an empty corpus.
 */
import assert from "node:assert/strict";
import {
  computeLanguageCompleteness,
  OPTIONAL_EMPTY_COMPLETENESS_DOMAINS,
} from "../../src/shared/i18n/localizationSettings.js";

assert.deepEqual(OPTIONAL_EMPTY_COMPLETENESS_DOMAINS, ["faq"]);

const absent = computeLanguageCompleteness("en", [], {
  domainCorpusStatus: { faq: "absent" },
});
assert.equal(absent.domains.faq.total, 0);
assert.equal(absent.domains.faq.complete, true, "absent FAQ corpus is optional");
assert.equal(absent.domains.faq.corpusStatus, "absent");
assert.equal(absent.domains.interface.complete, false, "other empty domains still block");

const presentButUncounted = computeLanguageCompleteness("en", [], {
  domainCorpusStatus: { faq: "present" },
});
assert.equal(presentButUncounted.domains.faq.complete, false, "present corpus + total0 fails closed");
assert.equal(presentButUncounted.domains.faq.corpusMismatch, true);
assert.equal(presentButUncounted.complete, false);

const loadError = computeLanguageCompleteness("en", [], {
  domainCorpusStatus: { faq: "error" },
});
assert.equal(loadError.domains.faq.complete, false, "FAQ count error must not look empty");
assert.equal(loadError.domains.faq.corpusStatus, "error");
assert.equal(loadError.complete, false);

const presentMissing = computeLanguageCompleteness(
  "en",
  [
    {
      domain: "faq",
      language: "en",
      critical: true,
      state: "MISSING",
      stale: false,
      value: "",
    },
    {
      domain: "interface",
      language: "en",
      critical: true,
      state: "MANUAL",
      stale: false,
      value: "OK",
    },
    {
      domain: "products",
      language: "en",
      critical: true,
      state: "AUTO",
      stale: false,
      value: "Soap",
    },
    {
      domain: "categories",
      language: "en",
      critical: true,
      state: "AUTO",
      stale: false,
      value: "Cat",
    },
    {
      domain: "pages",
      language: "en",
      critical: true,
      state: "AUTO",
      stale: false,
      value: "Page",
    },
    {
      domain: "seo",
      language: "en",
      critical: true,
      state: "AUTO",
      stale: false,
      value: "Seo",
    },
    {
      domain: "checkout",
      language: "en",
      critical: true,
      state: "AUTO",
      stale: false,
      value: "Checkout",
    },
  ],
  { domainCorpusStatus: { faq: "present" } }
);
assert.equal(presentMissing.domains.faq.total, 1);
assert.equal(presentMissing.domains.faq.ready, 0);
assert.equal(presentMissing.domains.faq.complete, false, "missing FAQ translation blocks");
assert.equal(presentMissing.complete, false);

const presentStale = computeLanguageCompleteness(
  "en",
  [
    {
      domain: "faq",
      language: "en",
      critical: true,
      state: "STALE",
      stale: true,
      value: "Old FAQ",
    },
  ],
  { domainCorpusStatus: { faq: "present" } }
);
assert.equal(presentStale.domains.faq.total, 1);
assert.equal(presentStale.domains.faq.ready, 0);
assert.equal(presentStale.domains.faq.complete, false, "stale FAQ translation blocks");

const presentReady = computeLanguageCompleteness(
  "en",
  [
    {
      domain: "faq",
      language: "en",
      critical: true,
      state: "MANUAL",
      stale: false,
      value: "FAQ answer",
    },
  ],
  { domainCorpusStatus: { faq: "present" } }
);
assert.equal(presentReady.domains.faq.complete, true);
assert.equal(presentReady.domains.faq.corpusStatus, "present");

console.log("verify-i18n-stage-9-faq-corpus: ok");
