import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  buildPublicSite,
  getStorefrontSettings,
  mergeStorefrontSettings,
  stripStorefrontSettings,
  STOREFRONT_SETTING_KEYS,
} from "../src/storefrontPublic.js";
import { staffHasFeature } from "../src/roles.js";
import {
  STOREFRONT_INFO_PAGES,
  STOREFRONT_INFO_SLUGS,
  STOREFRONT_INFO_LIMITS,
  STOREFRONT_LEGAL_INFO_SLUGS,
  applyEditorInfoPagesPatch,
  cloneStorefrontInfoPages,
  formatStorefrontDocumentTitle,
  normalizeStorefrontInfoBlock,
  normalizeStorefrontInfoPages,
  normalizeStorefrontInfoRoute,
  readEditorStorefrontInfoPage,
  resolveStorefrontInfoPage,
  storefrontInfoPageUrl,
} from "../../src/shared/storefrontInfoPages.js";
import { STOREFRONT_INFO_CONTENT } from "../../src/screens/storefront/pages/infoPageContent.js";

const NOW = new Date("2026-09-08T20:00:00.000Z");
const FIXED_SLUGS = [
  "about",
  "delivery",
  "payment",
  "returns",
  "wholesale",
  "privacy-policy",
  "personal-data-consent",
];

function page(overrides = {}) {
  return {
    heading: "H",
    title: "T",
    description: "D",
    blocks: [{ type: "p", text: "Body" }],
    ...overrides,
  };
}

function saveDraft(current, draftPages, extra = {}) {
  return mergeStorefrontSettings(current, {
    storefrontInfoPages: cloneStorefrontInfoPages(draftPages),
    ...extra,
  });
}

function writeOnePage(stored, slug, nextPage) {
  return { ...cloneStorefrontInfoPages(stored), [slug]: nextPage };
}

function resetOnePage(stored, slug) {
  const next = { ...cloneStorefrontInfoPages(stored) };
  delete next[slug];
  return next;
}

function managerGenericPut(current, incoming) {
  const safeIncoming = {
    ...stripStorefrontSettings(incoming),
    ...Object.fromEntries(
      STOREFRONT_SETTING_KEYS.map((key) => [key, current[key]])
    ),
  };
  return { ...current, ...safeIncoming };
}

assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontInfoPages"));
assert.deepEqual(STOREFRONT_INFO_SLUGS, FIXED_SLUGS);
assert.equal(STOREFRONT_INFO_PAGES.length, 7);
assert.deepEqual(STOREFRONT_LEGAL_INFO_SLUGS, [
  "privacy-policy",
  "personal-data-consent",
]);

// 1. no persisted setting → exact hardcoded fallback for all seven
for (const slug of FIXED_SLUGS) {
  const registry = STOREFRONT_INFO_PAGES.find((item) => item.slug === slug);
  const resolved = resolveStorefrontInfoPage(slug);
  assert.equal(resolved.heading, registry.heading);
  assert.equal(resolved.title, registry.title);
  assert.equal(resolved.description, registry.description);
  assert.deepEqual(resolved.blocks, STOREFRONT_INFO_CONTENT[slug]);
  assert.equal(storefrontInfoPageUrl(slug), `https://clover-spb.ru/${slug}`);
}
assert.deepEqual(cloneStorefrontInfoPages(undefined), {});
assert.deepEqual(cloneStorefrontInfoPages({}), {});
assert.equal(resolveStorefrontInfoPage("not-a-page"), null);

const emptySite = buildPublicSite({});
assert.deepEqual(emptySite.infoPages, {});
assert.ok(!("storefrontInfoPages" in emptySite));
assert.ok(!("storefrontPricingMode" in emptySite));
for (const slug of FIXED_SLUGS) {
  const resolved = resolveStorefrontInfoPage(slug, emptySite.infoPages);
  assert.equal(resolved.heading, STOREFRONT_INFO_PAGES.find((item) => item.slug === slug).heading);
  assert.ok(resolved.blocks.length > 0);
}

// 2 + 15/16/17. valid one-page override (H1 / title / description / body)
const firstSave = saveDraft(
  {
    storefrontHeroTitle: "Hero keep",
    storefrontContactPhone: "+7 (921) 000-00-00",
    storefrontPromotions: [],
    storefrontPricingMode: "price_type",
    storefrontOneCClientName: "Интернет магазин Clover",
  },
  {
    about: page({
      heading: "О компании",
      title: "О компании",
      description: "Новое описание",
      blocks: [{ type: "lead", text: "Новый лид" }],
    }),
  },
  {},
);
assert.equal(firstSave.storefrontHeroTitle, "Hero keep");
assert.equal(firstSave.storefrontContactPhone, "+7 (921) 000-00-00");
assert.equal(firstSave.storefrontPricingMode, "price_type");
assert.equal(firstSave.storefrontOneCClientName, "Интернет магазин Clover");
assert.equal(firstSave.storefrontInfoPages.about.heading, "О компании");
assert.equal(Object.keys(firstSave.storefrontInfoPages).join(","), "about");
const aboutResolved = resolveStorefrontInfoPage("about", firstSave.storefrontInfoPages);
assert.equal(aboutResolved.heading, "О компании");
assert.equal(aboutResolved.title, "О компании");
assert.equal(aboutResolved.description, "Новое описание");
assert.equal(aboutResolved.blocks[0].text, "Новый лид");
assert.equal(
  formatStorefrontDocumentTitle(aboutResolved.title),
  "О компании | КЛЕВЕР"
);

// 3. second page preserved while first changes
const twoPages = saveDraft(firstSave, writeOnePage(firstSave.storefrontInfoPages, "delivery", page({
  heading: "Доставка обновлена",
  title: "Доставка обновлена",
  description: "График",
  blocks: [{ type: "p", text: "Курьер" }],
})));
assert.equal(twoPages.storefrontInfoPages.about.heading, "О компании");
assert.equal(twoPages.storefrontInfoPages.delivery.heading, "Доставка обновлена");

const aboutChanged = saveDraft(
  twoPages,
  writeOnePage(twoPages.storefrontInfoPages, "about", page({
    heading: "Ещё раз",
    title: "Ещё раз",
    description: "Другое",
    blocks: [{ type: "p", text: "Другой текст" }],
  }))
);
assert.equal(aboutChanged.storefrontInfoPages.about.heading, "Ещё раз");
assert.equal(aboutChanged.storefrontInfoPages.delivery.heading, "Доставка обновлена");

// 4. unrelated storefront settings preserved when only info pages change
assert.equal(aboutChanged.storefrontHeroTitle, "Hero keep");
assert.equal(aboutChanged.storefrontContactPhone, "+7 (921) 000-00-00");
assert.equal(aboutChanged.storefrontPricingMode, "price_type");
assert.equal(aboutChanged.storefrontOneCClientName, "Интернет магазин Clover");

const heroPatch = mergeStorefrontSettings(aboutChanged, {
  storefrontHeroTitle: "New hero",
});
assert.equal(heroPatch.storefrontHeroTitle, "New hero");
assert.equal(heroPatch.storefrontInfoPages.about.heading, "Ещё раз");
assert.equal(heroPatch.storefrontInfoPages.delivery.heading, "Доставка обновлена");

// 5. reset one page only
const afterReset = saveDraft(
  aboutChanged,
  resetOnePage(aboutChanged.storefrontInfoPages, "about")
);
assert.equal(afterReset.storefrontInfoPages.about, undefined);
assert.equal(afterReset.storefrontInfoPages.delivery.heading, "Доставка обновлена");
const resetResolved = resolveStorefrontInfoPage("about", afterReset.storefrontInfoPages);
assert.equal(resetResolved.heading, "О нас");
assert.deepEqual(resetResolved.blocks, STOREFRONT_INFO_CONTENT.about);

// D. reset already-default is idempotent
const resetAgain = saveDraft(
  afterReset,
  resetOnePage(afterReset.storefrontInfoPages, "about")
);
assert.equal(resetAgain.storefrontInfoPages.about, undefined);
assert.equal(resetAgain.storefrontInfoPages.delivery.heading, "Доставка обновлена");

// 6. unknown slug blocked
const withUnknown = normalizeStorefrontInfoPages({
  about: page({ heading: "Keep" }),
  unknown: page({ heading: "Нет" }),
  contacts: page({ heading: "Нельзя" }),
});
assert.equal(withUnknown.unknown, undefined);
assert.equal(withUnknown.contacts, undefined);
assert.equal(withUnknown.about.heading, "Keep");

// 7. unsupported block stripped
const blocks = normalizeStorefrontInfoPages({
  about: page({
    blocks: [
      { type: "lead", text: "Лид" },
      { type: "script", text: "alert(1)" },
      { type: "html", text: "<b>x</b>" },
      { type: "p", text: "" },
      { type: "p", text: "Ок" },
    ],
  }),
});
assert.deepEqual(
  blocks.about.blocks.map((item) => item.type),
  ["lead", "p"]
);

// 8. unknown keys removed from persisted/public page
const extraKeys = normalizeStorefrontInfoPages({
  about: {
    heading: "H",
    title: "T",
    description: "D",
    blocks: [{ type: "p", text: "B" }],
    secret: "nope",
    html: "<script>",
  },
});
assert.deepEqual(Object.keys(extraKeys.about).sort(), [
  "blocks",
  "description",
  "heading",
  "title",
  "updatedAt",
]);
const publicExtra = buildPublicSite({ storefrontInfoPages: extraKeys });
assert.equal(publicExtra.infoPages.about.secret, undefined);
assert.ok(!("storefrontMarkupPercent" in publicExtra));

// 9. malicious HTML/script stored as plain text, not executable markup
const xss = normalizeStorefrontInfoPages({
  about: page({
    heading: "<img src=x onerror=alert(1)>",
    title: "<script>alert(1)</script>",
    description: "javascript:alert(1)",
    blocks: [{ type: "p", text: "<script>alert(1)</script>" }],
  }),
});
assert.equal(xss.about.heading, "<img src=x onerror=alert(1)>");
assert.equal(xss.about.title, "<script>alert(1)</script>");
assert.equal(xss.about.blocks[0].text, "<script>alert(1)</script>");

// 10. unsafe routes blocked; safe route keeplisted
assert.equal(normalizeStorefrontInfoRoute("javascript:alert(1)"), null);
assert.equal(normalizeStorefrontInfoRoute({ name: "javascript:alert(1)" }), null);
assert.equal(normalizeStorefrontInfoRoute({ name: "data" }), null);
assert.equal(
  normalizeStorefrontInfoBlock({
    type: "route",
    label: "XSS",
    route: { name: "javascript", slug: "alert" },
  }),
  null
);
assert.equal(
  normalizeStorefrontInfoBlock({
    type: "route",
    label: "Bad",
    route: "javascript:alert(1)",
  }),
  null
);
const safeRoute = normalizeStorefrontInfoBlock({
  type: "route",
  label: "Контакты",
  route: { name: "contacts", onclick: "alert(1)", href: "javascript:alert(1)" },
});
assert.deepEqual(safeRoute, {
  type: "route",
  label: "Контакты",
  route: { name: "contacts" },
});

// bounds
const tooMany = normalizeStorefrontInfoPages({
  about: page({
    heading: "H".repeat(400),
    blocks: Array.from({ length: 80 }, (_, i) => ({ type: "p", text: `p${i}` })),
  }),
});
assert.equal(tooMany.about.heading.length, STOREFRONT_INFO_LIMITS.heading);
assert.equal(tooMany.about.blocks.length, STOREFRONT_INFO_LIMITS.blocks);

// malformed one slug must not blank others
const malformed = normalizeStorefrontInfoPages({
  about: "not-an-object",
  delivery: page({ heading: "Доставка ок" }),
});
assert.equal(malformed.about, undefined);
assert.equal(malformed.delivery.heading, "Доставка ок");
const malformedResolved = resolveStorefrontInfoPage("about", malformed);
assert.equal(malformedResolved.heading, "О нас");
assert.ok(malformedResolved.blocks.length > 0);

// 11–13 permissions
assert.equal(staffHasFeature({ role: "admin" }, "storefront"), true);
assert.equal(staffHasFeature({ role: "manager" }, "storefront"), false);
assert.equal(
  staffHasFeature({ role: "manager", permissions: { fullAccess: true } }, "storefront"),
  false
);

const currentProtected = getStorefrontSettings(aboutChanged);
const bypass = managerGenericPut(currentProtected, {
  storefrontInfoPages: {
    about: page({ heading: "HACK" }),
  },
  storefrontHeroTitle: "HACK HERO",
  managerPhone: "keep-me",
});
assert.equal(bypass.storefrontInfoPages.about.heading, "Ещё раз");
assert.notEqual(bypass.storefrontHeroTitle, "HACK HERO");

const stripped = stripStorefrontSettings({
  storefrontInfoPages: xss,
  storefrontHeroTitle: "x",
  managerPhone: "keep",
});
assert.equal(stripped.storefrontInfoPages, undefined);
assert.equal(stripped.storefrontHeroTitle, undefined);
assert.equal(stripped.managerPhone, "keep");

// 14. public sanitized payload
const site = buildPublicSite(aboutChanged);
assert.equal(site.infoPages.about.heading, "Ещё раз");
assert.equal(site.infoPages.delivery.heading, "Доставка обновлена");
assert.ok(!("storefrontInfoPages" in site));
assert.ok(!("storefrontPricingMode" in site));
assert.equal(site.contactPhone, "+7 (921) 000-00-00");
assert.equal(resolveStorefrontInfoPage("payment", site.infoPages).heading, "Оплата");

// 18. canonical / title convention
assert.equal(formatStorefrontDocumentTitle("О нас"), "О нас | КЛЕВЕР");
assert.equal(formatStorefrontDocumentTitle("О нас | КЛЕВЕР"), "О нас | КЛЕВЕР");
assert.equal(formatStorefrontDocumentTitle(""), "");
assert.doesNotMatch(
  formatStorefrontDocumentTitle("О нас | КЛЕВЕР"),
  /КЛЕВЕР \| КЛЕВЕР/
);
for (const slug of FIXED_SLUGS) {
  assert.equal(storefrontInfoPageUrl(slug), `https://clover-spb.ru/${slug}`);
}

// updatedAt: server-owned, client timestamp ignored
const clientStamp = normalizeStorefrontInfoPages(
  {
    "privacy-policy": page({
      heading: "Политика",
      updatedAt: "1999-01-01T00:00:00.000Z",
    }),
  },
  { now: NOW }
);
assert.equal(clientStamp["privacy-policy"].updatedAt, NOW.toISOString());
const unchanged = normalizeStorefrontInfoPages(
  {
    "privacy-policy": {
      ...clientStamp["privacy-policy"],
      updatedAt: "2030-01-01T00:00:00.000Z",
    },
  },
  { previous: clientStamp, now: new Date("2026-09-09T00:00:00.000Z") }
);
assert.equal(
  unchanged["privacy-policy"].updatedAt,
  clientStamp["privacy-policy"].updatedAt
);

// 20. Contacts remain outside info pages
assert.equal(FIXED_SLUGS.includes("contacts"), false);
assert.equal(resolveStorefrontInfoPage("contacts"), null);
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontContactPhone"));
assert.ok(!STOREFRONT_SETTING_KEYS.includes("storefrontContactPages"));

const src = (rel) => readFileSync(path.join(projectRoot, rel), "utf8");
const admin = src("src/screens/manager/ManagerStorefront.jsx");
const editor = src("src/screens/manager/ManagerStorefrontInfoPages.jsx");
const footer = src("src/screens/storefront/components/StoreFooter.jsx");
const infoPage = src("src/screens/storefront/pages/InfoPage.jsx");
const seo = src("src/screens/storefront/seo.js");
const mode = src("src/screens/storefront/mode.js");
const app = src("src/screens/storefront/StorefrontApp.jsx");
const publicSite = src("src/screens/storefront/publicSite.js");
const server = src("server/src/server.js");
const sitemap = src("public/sitemap.xml");
const robots = src("public/robots.txt");
const deliveryFee = src("server/src/deliveryFee.js");
const checkout = src("src/screens/storefront/pages/CheckoutPage.jsx");
const contactsPage = src("src/screens/storefront/pages/ContactsPage.jsx");
const shared = src("src/shared/storefrontInfoPages.js");

assert.match(admin, /ManagerStorefrontInfoPages/);
assert.match(admin, /storefrontInfoPages/);
assert.match(admin, /api\.saveStorefrontSettings/);
assert.match(admin, /catch \(error\)/);
assert.doesNotMatch(admin, /setDraft\(\(\) => \(\{[\s\S]*storefrontInfoPages: \{\}\)/);

assert.match(editor, /t\("manager.infoPages"\)/);
assert.match(editor, /STOREFRONT_INFO_PAGES\.map/);
assert.match(editor, /t\("manager.publicUrl"\)/);
assert.match(editor, /storefrontInfoPageUrl/);
assert.doesNotMatch(editor, /Добавить страницу|новый slug|new slug/i);
assert.match(editor, /t\("manager.pageHeadingH1"\)/);
assert.match(editor, /SEO title/);
assert.match(editor, /SEO description/);
assert.match(editor, /t\("manager.addParagraph"\)/);
assert.match(editor, /t\("shared.action.delete"\)/);
assert.match(editor, /t\("manager.up"\)/);
assert.match(editor, /t\("manager.down"\)/);
assert.match(editor, /t\("manager.restoreDefaultText"\)/);
assert.match(editor, /delete next\[selected\.slug\]/);
assert.match(editor, /ROUTE_OPTIONS/);
assert.match(editor, /t\("manager.changingThisTextAppearsOnThe"\)/);
assert.match(editor, /isStorefrontLegalInfoSlug/);
assert.doesNotMatch(editor, /api\.|saveStorefrontSettings|fetch\(/);
assert.doesNotMatch(editor, /dangerouslySetInnerHTML|innerHTML|WYSIWYG|markdown/i);

assert.match(infoPage, /resolveStorefrontInfoPage/);
assert.match(infoPage, /<h1>\{page\.heading\}<\/h1>/);
assert.match(infoPage, /\{block\.text\}/);
assert.doesNotMatch(infoPage, /dangerouslySetInnerHTML|innerHTML/);
assert.match(footer, /resolveStorefrontInfoPage/);
assert.match(footer, /\{ name: "info", slug: page\.slug \}/);
assert.match(app, /loadPublicSite/);
assert.match(app, /infoPages=\{site\?\.infoPages\}/);
assert.doesNotMatch(app, /storefrontApi\.site\(\)/);
assert.match(publicSite, /storefrontApi/);
assert.match(seo, /formatStorefrontDocumentTitle/);
assert.match(seo, /storefrontHref\(route\)/);
assert.doesNotMatch(seo, /page\.canonical|canonical:/);
assert.match(mode, /STOREFRONT_INFO_SLUGS/);
assert.match(mode, /parts\[0\] === "contacts"/);
assert.match(mode, /parts\[0\] === "aktsii"/);
assert.match(mode, /parts\[0\] === "catalog"/);

assert.match(server, /roleRequired\("admin"\)/);
assert.match(server, /\/api\/admin\/storefront/);
assert.match(server, /\/api\/public\/site/);
assert.match(server, /stripStorefrontSettings/);

for (const slug of FIXED_SLUGS) {
  assert.match(sitemap, new RegExp(`https://clover-spb\\.ru/${slug}`));
}
assert.match(sitemap, /https:\/\/clover-spb\.ru\/contacts/);
assert.match(robots, /Sitemap: https:\/\/clover-spb\.ru\/sitemap\.xml/);
assert.doesNotMatch(robots, /Disallow: \/about/);

assert.doesNotMatch(deliveryFee, /storefrontInfoPages|STOREFRONT_INFO_/);
assert.doesNotMatch(checkout, /storefrontInfoPages|STOREFRONT_INFO_/);
assert.match(contactsPage, /storefrontApi/);
assert.match(contactsPage, /<h1>\{t\("storefront.nav.contacts"\)\}<\/h1>/);
assert.doesNotMatch(contactsPage, /storefrontInfoPages/);
assert.doesNotMatch(shared, /enabledLanguages|locale:|rtl/i);
assert.doesNotMatch(shared, /dangerouslySetInnerHTML|innerHTML|eval\(|new Function/);

// Edit-time draft must keep raw spaces; save/public still normalize.
const headingDraft = applyEditorInfoPagesPatch({}, "about", {
  heading: "Привет ",
});
assert.equal(
  readEditorStorefrontInfoPage("about", headingDraft).heading,
  "Привет "
);
const internalDraft = applyEditorInfoPagesPatch({}, "about", {
  heading: "Привет  мир",
  description: "Привет  мир",
  blocks: [{ type: "p", text: "Привет  мир" }],
});
const internalView = readEditorStorefrontInfoPage("about", internalDraft);
assert.equal(internalView.heading, "Привет  мир");
assert.equal(internalView.description, "Привет  мир");
assert.equal(internalView.blocks[0].text, "Привет  мир");

const listDraft = applyEditorInfoPagesPatch({}, "about", {
  blocks: [{ type: "list", items: ["Первое слово "] }],
});
assert.equal(
  readEditorStorefrontInfoPage("about", listDraft).blocks[0].items[0],
  "Первое слово "
);
const routeDraft = applyEditorInfoPagesPatch({}, "about", {
  blocks: [{ type: "route", label: "Связаться ", route: { name: "contacts" } }],
});
assert.equal(
  readEditorStorefrontInfoPage("about", routeDraft).blocks[0].label,
  "Связаться "
);

const saved = cloneStorefrontInfoPages(
  applyEditorInfoPagesPatch({}, "about", {
    heading: "Текст страницы   ",
    title: "Текст страницы   ",
    description: "Текст страницы   ",
    blocks: [
      { type: "lead", text: "Текст страницы   " },
      { type: "p", text: "Текст страницы   " },
      { type: "h2", text: "Текст страницы   " },
      { type: "list", items: ["Текст страницы   "] },
      { type: "route", label: "Текст страницы   ", route: { name: "contacts" } },
    ],
  })
);
assert.equal(saved.about.heading, "Текст страницы");
assert.equal(saved.about.title, "Текст страницы");
assert.equal(saved.about.description, "Текст страницы");
assert.equal(saved.about.blocks[0].text, "Текст страницы");
assert.equal(saved.about.blocks[1].text, "Текст страницы");
assert.equal(saved.about.blocks[2].text, "Текст страницы");
assert.equal(saved.about.blocks[3].items[0], "Текст страницы");
assert.equal(saved.about.blocks[4].label, "Текст страницы");

const xssDraft = applyEditorInfoPagesPatch({}, "about", {
  heading: "<script>alert(1)</script>",
  blocks: [{ type: "p", text: "<img src=x onerror=alert(1)>" }],
});
const xssSaved = cloneStorefrontInfoPages(xssDraft);
assert.equal(xssSaved.about.heading, "<script>alert(1)</script>");
assert.equal(xssSaved.about.blocks[0].text, "<img src=x onerror=alert(1)>");
assert.equal(
  normalizeStorefrontInfoBlock({
    type: "route",
    label: "XSS",
    route: "javascript:alert(1)",
  }),
  null
);
assert.match(editor, /applyEditorInfoPagesPatch/);
assert.match(editor, /readEditorStorefrontInfoPage/);
assert.doesNotMatch(editor, /cloneStorefrontInfoPages\(/);

console.log("verify-storefront-info-pages-admin: ok");
