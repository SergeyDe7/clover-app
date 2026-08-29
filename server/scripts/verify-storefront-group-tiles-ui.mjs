import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";

const css = readFileSync(
  path.join(projectRoot, "src/screens/storefront/storefront.css"),
  "utf8"
);
const home = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/HomePage.jsx"),
  "utf8"
);
const tile = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/GroupTile.jsx"),
  "utf8"
);

assert.ok(
  home.includes("STOREFRONT_HERO_TITLE") &&
    home.includes("STOREFRONT_HERO_LEAD"),
  "Главная витрины берёт описание компании из siteCopy."
);
assert.doesNotMatch(
  home,
  /Выберите категорию/,
  "Под заголовком категорий на главной нет подсказки «Выберите категорию»."
);
assert.doesNotMatch(
  tile,
  /\.lead/,
  "Плитка категории не показывает текстовую подсказку под названием."
);

const copy = readFileSync(
  path.join(projectRoot, "src/screens/storefront/siteCopy.js"),
  "utf8"
);
assert.ok(
  copy.includes("Хозтовары, упаковка и химия для HoReCa"),
  "Заголовок витрины должен говорить про хозтовары, упаковку и химию для HoReCa."
);
assert.ok(
  copy.includes("Компания КЛЕВЕР") &&
    copy.includes("кафе, ресторанов и отелей") &&
    copy.includes("бытовую химию") &&
    copy.includes("хозяйственные товары"),
  "Подзаголовок витрины должен начинаться с «Компания КЛЕВЕР» и описывать поставки для HoReCa."
);
assert.ok(
  copy.includes("/storefront/hero-app.webp") &&
    copy.includes("/storefront/hero-packaging.webp") &&
    copy.includes("/storefront/hero-chemistry.webp"),
  "На главной витрины есть три слайда баннера по тематике КЛЕВЕР."
);
assert.ok(
  home.includes("HeroSlides") && home.includes("heroIntervalSec"),
  "Главная крутит слайды баннера с интервалом из настроек."
);
assert.match(
  css,
  /\.sf-hero h1\s*\{[^}]*max-width:\s*28ch/,
  "Заголовок на главной не должен сжиматься в 18ch."
);

assert.match(
  css,
  /\.sf-group-tile-name\s*\{[^}]*white-space:\s*nowrap/,
  "На главной название категории в одну строку, без переносов."
);
assert.match(
  tile,
  /"Пакеты, упаковочные материалы": \["Пакеты,", "упаковочные материалы"\]/,
  "«Пакеты, упаковочные материалы» на главной — две строки по словам, без разрыва слова."
);
assert.match(
  tile,
  /"Химия, чистящие средства": \["Химия,", "чистящие средства"\]/,
  "«Химия, чистящие средства» на главной — две строки по словам, без разрыва слова."
);
assert.match(
  css,
  /\.sf-group-tile-name\.is-two-line\s*\{[^}]*hyphens:\s*none/,
  "Двухстрочное имя категории не рвёт слово дефисом."
);

const mobile = css.split("@media (max-width: 900px)")[1] || "";
assert.ok(mobile.length > 0, "Нужен мобильный breakpoint витрины 900px.");

assert.match(
  mobile,
  /\.sf-group-tile\s*\{[^}]*grid-template-columns:\s*1fr/,
  "На телефоне плитка категории — колонка: иконка сверху, название ниже."
);
assert.doesNotMatch(
  mobile.split("@media")[0],
  /\.sf-group-tile\s*\{[^}]*grid-template-columns:\s*auto\s+1fr/,
  "На телефоне нельзя оставлять иконку и длинное имя в одну строку."
);
assert.match(
  mobile,
  /\.sf-group-tile-name\s*\{[^}]*font-size:\s*0\.88rem/,
  "На телефоне название категории должно быть компактнее."
);

console.log("verify-storefront-group-tiles-ui: ok");
