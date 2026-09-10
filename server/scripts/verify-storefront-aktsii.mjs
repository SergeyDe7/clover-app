import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  buildPublicSite,
  mergeStorefrontSettings,
  STOREFRONT_SETTING_KEYS,
} from "../src/storefrontPublic.js";
import {
  isPromotionActive,
  listActivePromotions,
  listHomePromotions,
  normalizePromotionLink,
  normalizeStorefrontPromotions,
  promotionStatus,
  PROMO_STATUS,
} from "../../src/shared/storefrontPromotions.js";

const NOW = new Date("2026-09-07T12:00:00.000Z");

function promo(overrides = {}) {
  return {
    id: "p1",
    enabled: true,
    showOnHome: false,
    title: "Тестовая акция",
    shortText: "Кратко",
    fullDescription: "Подробно",
    link: "/catalog",
    buttonText: "Подробнее",
    imageUrl: "/uploads/storefront-promo-abc.webp",
    startsAt: null,
    endsAt: null,
    sortOrder: 10,
    ...overrides,
  };
}

// --- ACTIVE date logic ---
assert.equal(
  promotionStatus(promo({ enabled: true, startsAt: null, endsAt: null }), NOW),
  PROMO_STATUS.ACTIVE
);
assert.equal(
  isPromotionActive(
    promo({
      enabled: true,
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-30T23:59:59.000Z",
    }),
    NOW
  ),
  true
);

// --- scheduled ---
assert.equal(
  promotionStatus(
    promo({ enabled: true, startsAt: "2026-09-10T00:00:00.000Z" }),
    NOW
  ),
  PROMO_STATUS.SCHEDULED
);
assert.equal(
  isPromotionActive(
    promo({ enabled: true, startsAt: "2026-09-10T00:00:00.000Z" }),
    NOW
  ),
  false
);

// --- expired / completed ---
assert.equal(
  promotionStatus(
    promo({ enabled: true, endsAt: "2026-09-01T00:00:00.000Z" }),
    NOW
  ),
  PROMO_STATUS.COMPLETED
);
assert.equal(
  listActivePromotions(
    [promo({ id: "expired", endsAt: "2026-09-01T00:00:00.000Z" })],
    NOW
  ).length,
  0
);

// --- disabled ---
assert.equal(
  promotionStatus(promo({ enabled: false }), NOW),
  PROMO_STATUS.DISABLED
);
assert.equal(
  listActivePromotions([promo({ id: "off", enabled: false })], NOW).length,
  0
);

// --- showOnHome filtering ---
const homeList = listHomePromotions(
  [
    promo({ id: "home-yes", showOnHome: true, title: "На главной" }),
    promo({ id: "home-no", showOnHome: false, title: "Только список" }),
    promo({
      id: "home-off",
      showOnHome: true,
      enabled: false,
      title: "Выключена",
    }),
  ],
  NOW
);
assert.equal(homeList.length, 1);
assert.equal(homeList[0].id, "home-yes");

// --- empty public state helpers ---
assert.equal(listActivePromotions([], NOW).length, 0);
assert.equal(listHomePromotions([], NOW).length, 0);

// --- unsafe link rejection ---
assert.equal(normalizePromotionLink("javascript:alert(1)"), "");
assert.equal(normalizePromotionLink("data:text/html,hi"), "");
assert.equal(normalizePromotionLink("file:///etc/passwd"), "");
assert.equal(normalizePromotionLink("vbscript:msgbox(1)"), "");
assert.equal(normalizePromotionLink("http://evil.example/x"), "");
assert.equal(normalizePromotionLink("//evil.example/x"), "");
assert.equal(normalizePromotionLink("/catalog"), "/catalog");
assert.equal(normalizePromotionLink("/aktsii"), "/aktsii");
assert.equal(
  normalizePromotionLink("https://clover-spb.ru/catalog"),
  "https://clover-spb.ru/catalog"
);
assert.ok(
  normalizePromotionLink("https://example.com/path").startsWith("https://")
);

// --- normalize drops bad image / empty title ---
const normalized = normalizeStorefrontPromotions([
  { title: "", enabled: true },
  {
    title: "Ок",
    enabled: true,
    imageUrl: "https://evil.example/x.png",
    link: "javascript:alert(1)",
    sortOrder: 2,
  },
  {
    id: "dup",
    title: "A",
    enabled: true,
    sortOrder: 1,
  },
  {
    id: "dup",
    title: "B",
    enabled: true,
    sortOrder: 0,
  },
]);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].id, "dup");
assert.equal(normalized[0].title, "A");
assert.equal(normalized[1].imageUrl, "");
assert.equal(normalized[1].link, "");

// --- settings merge + public site ---
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontPromotions"));

const merged = mergeStorefrontSettings(
  {},
  {
    storefrontPromotions: [
      promo({ id: "pub", showOnHome: true, title: "Публичная" }),
      promo({
        id: "later",
        startsAt: "2026-10-01T00:00:00.000Z",
        title: "Позже",
      }),
    ],
  }
);
assert.equal(merged.storefrontPromotions.length, 2);

const site = buildPublicSite(merged, NOW);
assert.equal(site.promotions.length, 1);
assert.equal(site.promotions[0].id, "pub");
assert.equal(site.homePromotions.length, 1);
assert.equal(site.homePromotions[0].id, "pub");

// --- route / SEO / sitemap / admin wiring (source smoke) ---
const mode = readFileSync(
  path.join(projectRoot, "src/screens/storefront/mode.js"),
  "utf8"
);
const seo = readFileSync(
  path.join(projectRoot, "src/screens/storefront/seo.js"),
  "utf8"
);
const app = readFileSync(
  path.join(projectRoot, "src/screens/storefront/StorefrontApp.jsx"),
  "utf8"
);
const header = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/StoreHeader.jsx"),
  "utf8"
);
const footer = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/StoreFooter.jsx"),
  "utf8"
);
const home = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/HomePage.jsx"),
  "utf8"
);
const aktsii = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/AktsiiPage.jsx"),
  "utf8"
);
const admin = readFileSync(
  path.join(projectRoot, "src/screens/manager/ManagerStorefront.jsx"),
  "utf8"
);
const adminPromos = readFileSync(
  path.join(projectRoot, "src/screens/manager/ManagerStorefrontPromotions.jsx"),
  "utf8"
);
const server = readFileSync(path.join(projectRoot, "server/src/server.js"), "utf8");
const {
  SITEMAP_STATIC_PATHS,
  toAbsoluteSitemapUrl,
} = await import("../../src/shared/sitemap/sitemapContract.js");
const pricing = readFileSync(path.join(projectRoot, "server/src/pricing.js"), "utf8");
const delivery = readFileSync(
  path.join(projectRoot, "server/src/deliveryFee.js"),
  "utf8"
);

assert.match(mode, /aktsii/);
assert.match(seo, /aktsii/);
assert.match(seo, /https:\/\/clover-spb\.ru\/aktsii|storefrontHref\(\{ name: "aktsii" \}\)/);
assert.match(app, /AktsiiPage/);
assert.match(header, /t\("storefront\.nav\.promos"\)/);
assert.match(footer, /STOREFRONT_INFO_PAGES|storefrontHref/);
assert.match(home, /homePromotions/);
assert.match(aktsii, /t\("storefront\.thereAreNoSpecialOffersRight"\)/);
assert.match(aktsii, /t\("storefront\.nav\.promos"\)/);
assert.match(admin, /storefrontPromotions/);
assert.match(adminPromos, /uploadStorefrontPromoImage/);
assert.match(server, /\/api\/admin\/storefront\/promo-image/);
assert.ok(SITEMAP_STATIC_PATHS.includes("/aktsii"));
assert.equal(toAbsoluteSitemapUrl("/aktsii"), "https://clover-spb.ru/aktsii");

// informational-only isolation: promotions module must not touch pricing/delivery source
assert.doesNotMatch(pricing, /storefrontPromotions|normalizePromotionLink/);
assert.doesNotMatch(delivery, /storefrontPromotions|normalizePromotionLink/);

console.log("verify-storefront-aktsii: ok");
