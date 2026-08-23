import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";

const css = readFileSync(
  path.join(projectRoot, "src/screens/storefront/storefront.css"),
  "utf8"
);
const nav = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/CatalogGroupNav.jsx"),
  "utf8"
);
const page = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/CatalogPage.jsx"),
  "utf8"
);
const boot = readFileSync(path.join(projectRoot, "src/main.jsx"), "utf8");
const header = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/StoreHeader.jsx"),
  "utf8"
);
const pageApp = readFileSync(
  path.join(projectRoot, "src/screens/storefront/StorefrontApp.jsx"),
  "utf8"
);

assert.match(
  css,
  /\.sf-group-nav-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+1\.75rem/,
  "Колонка стрелки в дереве фиксированная — длинное имя не сдвигает шеврон."
);
assert.match(
  css,
  /\.sf-group-nav-row\s*\{[^}]*align-items:\s*start/,
  "Стрелка подгруппы сидит на первой строке названия, а не по центру переноса."
);
assert.match(
  css,
  /\.sf-group-nav-toggle\s*\{[^}]*width:\s*1\.75rem/,
  "Кнопка стрелки одинаковой ширины у всех групп, не 52px."
);
assert.doesNotMatch(
  css,
  /\.sf-group-nav-toggle\s*\{[^}]*min-height:\s*52px/,
  "Стрелка «Хозяйственных товаров» не должна быть 52px и уезжать ниже остальных."
);
assert.match(
  nav,
  /sf-group-nav-toggle is-placeholder/,
  "У групп без подгрупп колонка стрелки всё равно занята — линия шевронов общая."
);
assert.match(
  nav,
  /className="sf-group-nav-chevron"/,
  "Шеврон — SVG с предсказуемой геометрией, не глиф ▾."
);

assert.doesNotMatch(
  css,
  /\.sf-catalog-side\s*\{[^}]*position:\s*sticky/,
  "Дерево не sticky: sticky всё равно едет вместе со страницей."
);
assert.match(
  css,
  /html\.sf-catalog-lock[\s\S]*overflow:\s*hidden/,
  "На каталоге страница не скроллится — иначе дерево уезжает."
);
assert.match(
  css,
  /\.sf-catalog-main\s*\{[^}]*overflow:\s*auto/,
  "Крутятся только товары, дерево стоит на месте."
);
assert.match(
  css,
  /\.sf-catalog-main\s*\{[^}]*scrollbar-width:\s*none/,
  "Внутренний скролл товаров без полосы, как у отдельного окна."
);
assert.match(
  css,
  /\.sf-catalog-main::-webkit-scrollbar[\s\S]*display:\s*none/,
  "WebKit не рисует полосу прокрутки у колонки товаров."
);
assert.match(
  css,
  /\.sf-catalog-tree-body\s*\{[^}]*overflow:\s*auto/,
  "Длинное дерево крутится внутри своей колонки, не со страницей."
);
assert.match(
  pageApp,
  /sf-catalog-lock/,
  "Класс sf-catalog-lock вешается только на странице каталога."
);

const mobile = css.split("@media (max-width: 900px)")[1] || "";
assert.ok(mobile.length > 0, "Нужен мобильный breakpoint витрины 900px.");
assert.doesNotMatch(
  mobile.split("@media")[0],
  /\.sf-catalog-side\s*\{[^}]*display:\s*none/,
  "На телефоне дерево категорий и подгрупп не прячем."
);
assert.match(
  page,
  /sf-catalog-tree-toggle/,
  "На узком экране дерево можно свернуть кнопкой, не теряя подгруппы."
);
assert.match(
  page,
  /sf-subcat-chips/,
  "На телефоне подгруппы категории доступны чипами над товарами."
);
assert.match(
  page,
  /setTreeOpen\(false\)/,
  "После выбора категории на телефоне дерево сворачивается, товары сразу видны."
);
assert.match(
  css,
  /max-height:\s*min\(38vh/,
  "Открытое дерево на телефоне не выше ~38vh — не закрывает весь экран."
);
assert.match(
  mobile,
  /\.sf-product-grid\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/,
  "На телефоне товары в две колонки — на экран помещается около четырёх карточек."
);
assert.match(
  mobile,
  /\.sf-product-media\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/,
  "На телефоне фото в карточке ниже квадрата, чтобы ряд был компактнее."
);
assert.match(
  css,
  /\.sf-group-nav-item\s*\{[^}]*overflow:\s*hidden/,
  "Полоска обрезается тем же скруглением 12px, что и кнопка."
);
assert.match(
  css,
  /\.sf-group-nav-item\.is-active::before\s*\{[^}]*top:\s*0/,
  "Полоска на всю высоту кнопки, не короткая капсула внутри."
);
assert.match(
  css,
  /\.sf-group-nav-item\.is-active::before\s*\{[^}]*border-radius:\s*12px\s+0\s+0\s+12px/,
  "Левые углы полоски как у кнопки, не прямая линия."
);
assert.match(
  css,
  /\.sf-group-nav-item\.is-active::before\s*\{[^}]*linear-gradient/,
  "Ободок активной категории с зелёным градиентом."
);
assert.match(
  css,
  /\.sf-group-nav-item\.is-active::before\s*\{[^}]*--clover-green/,
  "Градиент ободка из токенов Clover green."
);
assert.doesNotMatch(
  css,
  /\.sf-group-nav-item\.is-child\.is-active/,
  "Зелёный ободок не ограничивать только подкатегорией."
);
assert.doesNotMatch(
  css,
  /\.sf-group-nav-item\.is-active\s*\{[^}]*box-shadow/,
  "Ободок категории — полоска ::before, не inset-тень (её перекрывает иконка)."
);
assert.match(
  nav,
  /next\.delete\(group\.name\)/,
  "Клик по названию категории сворачивает её подгруппы."
);
assert.doesNotMatch(
  nav,
  /useEffect/,
  "Посадка на категорию не должна сама раскрывать подгруппы."
);
assert.match(
  header,
  /sf-catalog-mobile/,
  "На телефоне в шапке есть кнопка «Каталог»."
);
assert.match(
  header,
  /Войти в ЛК/,
  "В шапке есть «Войти в ЛК»."
);
assert.match(
  header,
  /sf-cart-mobile[\s\S]*sf-login/,
  "На телефоне «Корзина» стоит левее «Войти в ЛК»."
);
assert.match(
  header,
  /StorefrontContacts/,
  "В шапке витрины есть кнопка «Контакты»."
);
assert.doesNotMatch(
  mobile.split("@media")[0],
  /\.sf-login(?:-desktop)?\s*\{[^}]*display:\s*none/,
  "На телефоне «Войти в ЛК» не прячем."
);
assert.match(
  boot,
  /storefront \? STOREFRONT_THEME_COLOR : APP_THEME_COLOR/,
  "После splash витрина не красится цветом ЛК — иначе телефон и компьютер расходятся."
);
assert.match(
  css,
  /color-scheme:\s*only light/,
  "Витрина не уходит в тёмную автопалитру телефона."
);

console.log("verify-storefront-catalog-tree-ui: ok");
