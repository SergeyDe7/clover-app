import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  buildPublicSite,
  mergeStorefrontSettings,
  normalizeStorefrontHeroHref,
  normalizeStorefrontHeroIntervalSec,
  normalizeStorefrontHeroSlides,
  STOREFRONT_SETTING_KEYS,
} from "../src/storefrontPublic.js";
import {
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  STOREFRONT_DEFAULT_HERO_SLIDES,
} from "../../src/screens/storefront/siteCopy.js";

assert.equal(normalizeStorefrontHeroSlides([]).length, 3);
assert.equal(
  normalizeStorefrontHeroSlides(null)[0].src,
  STOREFRONT_DEFAULT_HERO_SLIDES[0].src
);
assert.equal(normalizeStorefrontHeroHref("/install-app"), "/install-app");
assert.equal(
  normalizeStorefrontHeroSlides(null)[0].href,
  "/install-app"
);
assert.equal(
  normalizeStorefrontHeroSlides([
    { src: "javascript:alert(1)", alt: "x" },
    { src: "/uploads/storefront-hero-1.webp", alt: "Упаковка" },
    { src: "https://evil.example/x.png" },
  ]).length,
  1
);
assert.equal(
  normalizeStorefrontHeroSlides([
    { src: "/uploads/storefront-hero-1.webp", alt: "App" },
  ])[0].href,
  "/install-app"
);
assert.equal(
  normalizeStorefrontHeroSlides([
    { src: "/uploads/storefront-hero-1.webp", alt: "Упаковка" },
  ])[0].src,
  "/uploads/storefront-hero-1.webp"
);
assert.equal(normalizeStorefrontHeroHref("javascript:alert(1)"), "");
assert.equal(normalizeStorefrontHeroHref("https://evil.example/x"), "");
assert.equal(normalizeStorefrontHeroHref("ABC-100"), "/product/ABC-100");
assert.equal(
  normalizeStorefrontHeroHref("https://clover-spb.ru/product/ABC-100"),
  "/product/ABC-100"
);
assert.equal(
  normalizeStorefrontHeroSlides([
    {
      src: "/uploads/storefront-hero-1.webp",
      href: "ABC-100",
      buttonLabel: " Смотреть акцию ",
    },
  ])[0].href,
  "/product/ABC-100"
);
assert.equal(
  normalizeStorefrontHeroSlides([
    {
      src: "/uploads/storefront-hero-1.webp",
      href: "ABC-100",
      buttonLabel: " Смотреть акцию ",
    },
  ])[0].buttonLabel,
  "Смотреть акцию"
);
assert.equal(normalizeStorefrontHeroIntervalSec(1), 2);
assert.equal(normalizeStorefrontHeroIntervalSec(90), 60);
assert.equal(
  normalizeStorefrontHeroIntervalSec("abc"),
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC
);

const merged = mergeStorefrontSettings(
  { storefrontHeroTitle: "Keep" },
  {
    storefrontHeroSlides: [
      { src: "/storefront/hero-packaging.webp", alt: "Упаковка" },
    ],
    storefrontHeroIntervalSec: 8,
  }
);
assert.equal(merged.storefrontHeroTitle, "Keep");
assert.equal(merged.storefrontHeroSlides.length, 1);
assert.equal(merged.storefrontHeroIntervalSec, 8);

const site = buildPublicSite(merged);
assert.equal(site.heroSlides.length, 1);
assert.equal(site.heroIntervalSec, 8);
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontHeroSlides"));
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontHeroIntervalSec"));

for (const slide of STOREFRONT_DEFAULT_HERO_SLIDES) {
  const filePath = path.join(projectRoot, "public", slide.src.replace(/^\//, ""));
  assert.ok(existsSync(filePath), `Нет файла слайда ${slide.src}`);
}

const home = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/HomePage.jsx"),
  "utf8"
);
const admin = readFileSync(
  path.join(projectRoot, "src/screens/manager/ManagerStorefront.jsx"),
  "utf8"
);
const server = readFileSync(path.join(projectRoot, "server/src/server.js"), "utf8");
const css = readFileSync(
  path.join(projectRoot, "src/screens/storefront/storefront.css"),
  "utf8"
);

assert.match(home, /HeroSlides/);
assert.match(admin, /storefrontHeroIntervalSec/);
assert.match(admin, /uploadStorefrontHeroImage/);
assert.match(admin, /buttonLabel/);
assert.match(server, /\/api\/admin\/storefront\/hero-image/);
assert.match(css, /\.sf-hero-dots/);
assert.match(css, /\.sf-hero-slide-btn/);

console.log("verify-storefront-hero-slides: ok");
