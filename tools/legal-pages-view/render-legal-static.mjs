#!/usr/bin/env node
/**
 * Optional text snapshot only. Does not replace Windows React view
 * (run-legal-pages-view.mjs). Does not start the app or enable Metrika.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STOREFRONT_INFO_CONTENT } from "../../src/screens/storefront/pages/infoPageContent.js";
import { STOREFRONT_INFO_PAGES } from "../../src/screens/storefront/pages/infoPages.js";
import { LEGAL_INFO_PAGE_BODIES } from "../../server/src/i18n/legalInfoPageBodyTranslations.js";
import { UI_CATALOG_BY_KEY } from "../../src/shared/i18n/uiCatalog.js";
import { SEEDS as UI_SEEDS } from "../../server/src/i18n/uiTranslationSeed.js";
import { getInfoPageSeedTranslation } from "../../server/src/i18n/infoPageTranslationSeed.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "tools/legal-pages-view/pages");
mkdirSync(outDir, { recursive: true });

function headingOf(slug) {
  return STOREFRONT_INFO_PAGES.find((page) => page.slug === slug)?.heading || slug;
}

function headingAr(slug) {
  return getInfoPageSeedTranslation(slug, "heading", "ar") || headingOf(slug);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderBlocks(blocks) {
  return (blocks || [])
    .map((block) => {
      if (block.type === "h2") return `<h2>${escapeHtml(block.text)}</h2>`;
      if (block.type === "list") {
        const items = (block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
        return `<ul class="sf-info-list">${items}</ul>`;
      }
      if (block.type === "route") {
        return `<p class="sf-info-link">${escapeHtml(block.label)}</p>`;
      }
      return `<p>${escapeHtml(block.text)}</p>`;
    })
    .join("\n");
}

function pageShell({ title, dir, body, kind }) {
  return `<!doctype html>
<html lang="${dir === "rtl" ? "ar" : "ru"}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: only light; }
    body { margin: 0; background: #f5f7f4; color: #283329; font-family: Manrope, system-ui, sans-serif; }
    .sf-info-page { display: grid; gap: 18px; max-width: 860px; margin: 0 auto; padding: 16px; }
    .sf-info-body { background: #fff; border: 1px solid rgba(28,31,28,.08); border-radius: 20px; padding: 24px 22px; display: grid; gap: 14px; }
    h1 { font-size: 1.45rem; margin: 0; }
    h2 { margin: 6px 0 0; font-size: 1.15rem; }
    p { margin: 0; color: #3f4a3f; line-height: 1.55; }
    .sf-info-list { margin: 0; padding-inline-start: 20px; display: grid; gap: 6px; color: #3f4a3f; line-height: 1.5; }
    .sf-checkout { background: #fff; border: 1px solid rgba(28,31,28,.08); border-radius: 20px; padding: 20px; max-width: 520px; }
    .sf-checkout-legal { line-height: 1.45; color: #6d786e; }
    .sf-checkout-legal-link { color: #4f9a52; font-weight: 600; }
    .mark { font-size: .8rem; color: #6d786e; }
  </style>
</head>
<body>
  <p class="mark">Статический снимок исходников. Не live, не Метрика, не отправка заказа. ${escapeHtml(kind)}</p>
  ${body}
</body>
</html>
`;
}

function writePage(name, html) {
  const dest = path.join(outDir, name);
  writeFileSync(dest, html);
  return dest;
}

const slugs = ["privacy-policy", "personal-data-consent"];
const written = [];

for (const slug of slugs) {
  written.push(
    writePage(
      `${slug}-ru.html`,
      pageShell({
        title: headingOf(slug),
        dir: "ltr",
        kind: `RU ${slug}`,
        body: `<div class="sf-info-page"><header><h1>${escapeHtml(headingOf(slug))}</h1></header><div class="sf-info-body">${renderBlocks(STOREFRONT_INFO_CONTENT[slug])}</div></div>`,
      })
    )
  );
  written.push(
    writePage(
      `${slug}-ar.html`,
      pageShell({
        title: headingAr(slug),
        dir: "rtl",
        kind: `AR ${slug}`,
        body: `<div class="sf-info-page"><header><h1>${escapeHtml(headingAr(slug))}</h1></header><div class="sf-info-body">${renderBlocks(LEGAL_INFO_PAGE_BODIES[slug].ar)}</div></div>`,
      })
    )
  );
}

const noteRu = UI_CATALOG_BY_KEY["storefront.checkout.orderLegalNote"].sourceRu;
const linkRu = UI_CATALOG_BY_KEY["storefront.checkout.orderLegalLink"].sourceRu;
const noteAr = UI_SEEDS["storefront.checkout.orderLegalNote"].ar;
const linkAr = UI_SEEDS["storefront.checkout.orderLegalLink"].ar;

function checkoutBody(note, link) {
  return `<div class="sf-info-page"><div class="sf-checkout"><p class="sf-checkout-legal">${escapeHtml(note)} <a class="sf-checkout-legal-link" href="#">${escapeHtml(link)}</a>.</p></div></div>`;
}

written.push(
  writePage(
    "checkout-legal-ru.html",
    pageShell({ title: "Checkout legal RU", dir: "ltr", kind: "RU checkout link", body: checkoutBody(noteRu, linkRu) })
  )
);
written.push(
  writePage(
    "checkout-legal-ar.html",
    pageShell({ title: "Checkout legal AR", dir: "rtl", kind: "AR checkout link", body: checkoutBody(noteAr, linkAr) })
  )
);

const index = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Legal pages view RU/AR</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #eef2ee; }
    header { padding: 12px 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    select, button { font: inherit; padding: 6px 10px; }
    iframe { display: block; margin: 0 auto 24px; border: 1px solid #c5d0c5; background: #fff; height: 80vh; }
    .w390 { width: 390px; }
    .w1280 { width: min(1280px, 100%); }
    p { margin: 0 16px 12px; color: #445; }
  </style>
</head>
<body>
  <header>
    <label>Страница
      <select id="page">
        <option value="privacy-policy-ru.html">Политика RU</option>
        <option value="privacy-policy-ar.html">سياسة AR</option>
        <option value="personal-data-consent-ru.html">Согласие RU</option>
        <option value="personal-data-consent-ar.html">موافقة AR</option>
        <option value="checkout-legal-ru.html">Ссылка заказа RU</option>
        <option value="checkout-legal-ar.html">رابط الطلب AR</option>
      </select>
    </label>
    <button type="button" data-w="390">390</button>
    <button type="button" data-w="1280">1280</button>
  </header>
  <p>Только статический текст из текущего дерева. Не полный chrome витрины. Не Метрика. Чеклист: Филанко / 7838492138 / Россия только у сайта и рабочей базы; 1С не получатель; нет «автоудаления нет» как срока.</p>
  <iframe id="frame" class="w390" src="privacy-policy-ru.html" title="legal view"></iframe>
  <script>
    const frame = document.getElementById("frame");
    const page = document.getElementById("page");
    page.addEventListener("change", () => { frame.src = page.value; });
    for (const button of document.querySelectorAll("button[data-w]")) {
      button.addEventListener("click", () => {
        frame.className = "w" + button.dataset.w;
      });
    }
  </script>
</body>
</html>
`;
written.push(writePage("index.html", index));
console.log(written.map((file) => path.relative(root, file)).join("\n"));
