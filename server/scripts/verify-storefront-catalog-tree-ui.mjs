import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";

const css = readFileSync(
  path.join(projectRoot, "src/screens/storefront/storefront.css"),
  "utf8"
).replace(/\r\n/gu, "\n");
const nav = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/CatalogGroupNav.jsx"),
  "utf8"
);
const page = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/CatalogPage.jsx"),
  "utf8"
);
const groups = readFileSync(
  path.join(projectRoot, "src/screens/storefront/productGroups.js"),
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
  /\.sf-group-nav-row\s*\{[^}]*display:\s*flex[^}]*min-width:\s*0/,
  "Название и стрелка группы размещены в гибкой строке без переполнения."
);
assert.match(
  css,
  /\.sf-group-nav-row \.sf-cat-btn\s*\{[^}]*flex:\s*1 1 auto/,
  "Название занимает доступную ширину строки группы."
);
assert.match(
  css,
  /\.sf-group-nav-toggle\s*\{[^}]*flex:\s*0 0 32px;[^}]*width:\s*32px/,
  "Стрелка имеет фиксированную ширину 32px."
);
assert.doesNotMatch(
  css,
  /\.sf-group-nav-toggle\s*\{[^}]*min-height:\s*52px/,
  "Стрелка «Хозяйственных товаров» не должна быть 52px и уезжать ниже остальных."
);
assert.match(
  nav,
  /\{hasChildren \? \([\s\S]*className=\{`sf-group-nav-toggle/,
  "Стрелка показана только у групп с подгруппами."
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
  /\.sf-product-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
  "На телефоне товары в две колонки — на экран помещается около четырёх карточек."
);
assert.match(
  mobile,
  /\.sf-product-media\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/,
  "На телефоне фото в карточке квадратное."
);
assert.match(
  css,
  /\.sf-cat-btn\s*\{[^}]*border-radius:\s*12px/,
  "Кнопки дерева имеют скругление 12px."
);
assert.match(
  css,
  /\.sf-cat-btn\.is-active\s*\{[^}]*background:\s*var\(--clover-green-soft/,
  "Активная категория имеет мягкий зелёный фон."
);
assert.match(
  css,
  /\.sf-cat-btn\.is-active\s*\{[^}]*border-color:\s*var\(--clover-green-border/,
  "Активная категория имеет зелёную границу."
);
assert.match(
  css,
  /\.sf-cat-btn\.is-active\s*\{[^}]*color:\s*var\(--clover-selected-text/,
  "Активная категория имеет контрастный текст из палитры Clover."
);
assert.match(
  nav,
  /if \(next\.has\(name\)\) next\.delete\(name\)/,
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
  /t\("storefront\.signInToCabinet"\)/,
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
assert.match(
  mobile,
  /a\.sf-header-tool\.sf-login-mobile,[\s\S]*display:\s*inline-flex !important/,
  "На телефоне ссылка входа в ЛК видна."
);
assert.match(
  boot,
  /const shellColor = shouldRenderStorefront\(\)\s*\? STOREFRONT_THEME_COLOR\s*:\s*APP_THEME_COLOR/,
  "После splash для витрины и ЛК выбираются разные цвета системной темы."
);
assert.match(
  css,
  /color-scheme:\s*only light/,
  "Витрина не уходит в тёмную автопалитру телефона."
);
assert.doesNotMatch(
  page,
  /Выберите категорию/,
  "На каталоге нет подсказки «Выберите категорию»."
);
assert.doesNotMatch(
  page,
  /activeMeta\.lead|getGroupMeta\([^)]*\)\.lead/,
  "Под названием категории не показываем lead-подсказку."
);
assert.doesNotMatch(
  page,
  /укажите подкатегорию в карточке|Товары без выбранной подгруппы/,
  "На витрине нет служебной подсказки про подгруппу в карточке товара."
);
assert.doesNotMatch(
  groups,
  /\blead:/,
  "В метаданных групп витрины больше нет lead-текстов."
);

console.log("verify-storefront-catalog-tree-ui: ok");
