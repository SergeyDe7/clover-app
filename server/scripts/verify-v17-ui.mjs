import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { projectRoot, readFrontendUiSource } from "./readFrontendUiSource.mjs";
import { firstPositiveCatalogPrice } from "../../src/shared/appHelpers.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const exchangePath = path.resolve(scriptDir, "../src/exchange.js");
const source = readFrontendUiSource(projectRoot);
const exchangeSource = await readFile(exchangePath, "utf8");

const checks = [
  [
    'const UNIT_ORDER = ["piece", "pair", "meter", "roll", "pack", "bundle", "box"]',
    "Единицы отображаются в порядке штука → пара → метр → рулон → упаковка → пачка → коробка",
  ],
  [
    'className="catalog-view-toggle"',
    "Клиент может переключать вид каталога: с фото / список",
  ],
  [
    "Удалить из каталога",
    "В карточке товара есть удаление из каталога Clover, витрины и матриц",
  ],
  [
    "Список без фото: исходный шрифт телефона, название целиком",
    "В списке без фото на телефоне исходный шрифт и название целиком",
  ],
  [
    'className="purchase-price-card"',
    "Закупочная цена видна в окне редактирования товара",
  ],
  [
    'const [tab, setTab] = useState(readManagerActiveTab)',
    "Текущая вкладка менеджера восстанавливается после F5",
  ],
  [
    'const [openClientId, setOpenClientId] = useState("")',
    "Товарная матрица клиента свёрнута после обновления страницы",
  ],
  [
    "<summary>1С и цены</summary>",
    "Настройки 1С и цен открываются внутри окна матрицы",
  ],
  [
    "grid-auto-flow: column !important",
    "Карточки с 1 и 2 единицами измерения одной высоты",
  ],
  [
    "Телефон ЛК, вид «Фото»: компактные карточки, бейджи над фото",
    "В ЛК клиента на телефоне вид «Фото» — компактные карточки, бейджи над рамкой фото",
  ],
  [
    'setSelectedIds(new Set(filteredProducts.map((item) => String(item.id))))',
    "В настройках витрины «Выбрать все» отмечает все позиции фильтра",
  ],
  [
    'className="storefront-pick-actions"',
    "Кнопки витрины не прыгают при ручном выборе позиции",
  ],
  [
    'html.classList.add("clover-cart-open")',
    "Окно корзины закреплено и не смещается при прокрутке",
  ],
  [
    "body.style.position = \"fixed\"",
    "Страница под корзиной заморожена без сдвига самого окна",
  ],
  [
    "          document.documentElement",
    "Окно корзины порталится в html, а не в body",
  ],
  [
    "if (Math.abs(dx) > Math.abs(dy))",
    "Горизонтальный жест в корзине не сдвигает окно влево",
  ],
  [
    'html.classList.add("clover-client-lk")',
    "На телефоне оболочка ЛК клиента зафиксирована и не смещается",
  ],
  [
    "grid-template-columns: repeat(2, minmax(0, 1fr)) !important;\n    grid-auto-rows: auto !important;",
    "Ряды фото-каталога по высоте карточки, не от экрана",
  ],
  [
    'className="toolbar two manager-clients-toolbar"',
    "Окно «Клиентов» той же высоты, что и поиск",
  ],
  [
    ".clover-app .client-card {\n  padding: 12px 14px !important;",
    "Карточка клиента компактная, без лишней пустоты",
  ],
  [
    "grid-template-columns: 38px minmax(0, 1fr) 38px !important",
    "На телефоне в ЛК кнопки количества крупнее",
  ],
  [
    'Number.isFinite(Number(value))',
    "Проверка закупочной цены отличает отсутствующую цену от нуля",
  ],
  [
    'Фото товара — необязательно',
    "К запросу менеджеру можно прикрепить фотографию",
  ],
  [
    'photo: form.photo || null',
    "Фотография сохраняется внутри позиции запроса",
  ],
  [
    'Фотография клиента',
    "Менеджер видит прикреплённую фотографию",
  ],
  [
    'UNIT_CONFIG[unit].shortLabel',
    "В карточке клиента цена подписана только единицей продажи",
  ],
  [
    "Добавить из каталога",
    "В матрице клиента можно добавить товар из каталога Clover",
  ],
  [
    'className="matrix-add-compact"',
    "Кнопки добавления в матрицу стоят компактно без подсказок рядом",
  ],
  [
    "Галочка в списке матрицы — выбор для удаления, а не членство. Снятие не убирает товар из матрицы.",
    "Галочка в матрице только отмечает товар, снятие не удаляет его из матрицы",
  ],
  [
    'className="matrix-pick-actions"',
    "Кнопки отметки и удаления из матрицы стоят одной строкой",
  ],
  [
    'label: "Данные клиента"',
    "В карточке клиента остаётся пункт «Данные клиента»",
  ],
  [
    'label: "Матрица"',
    "Пункт меню клиента открывает окно матрицы, а не прокрутку страницы",
  ],
  [
    "Скачать Excel",
    "Из окна матрицы можно скачать Excel всей матрицы клиента",
  ],
  [
    'label: "Заблокировать доступ"',
    "В меню клиента блокировка называется «Заблокировать доступ»",
  ],
  [
    'className="client-password-block"',
    "Смена пароля находится в «Данные клиента»",
  ],
  [
    'target="catalog"',
    "В каталог Clover можно загрузить товары из Excel",
  ],
  [
    'className="catalog-pick-actions"',
    "В каталоге есть кнопки выбрать все, снять все и удалить выбранные",
  ],
  [
    "Удалить выбранные",
    "В каталоге можно удалить отмеченные галочками товары",
  ],
  [
    "                            Выбрать все",
    "В матрице клиента кнопка выбора называется «Выбрать все»",
  ],
  [
    'className="order-lines-table"',
    "Состав заказа в карточке — таблица как в 1С: наименование, количество, цена",
  ],
  [
    "matchesCatalogPrefixSearch",
    "Поиск каталога идёт по начальным буквам слов",
  ],
  [
    "product.subcategory,\n    product.facet,",
    "Поиск витрины учитывает подгруппу и фасет, как до смены на prefix search",
  ],
  [
    '["orders", "Заказы"],\n  ["products", "Товары"],\n  ["storefront", "Витрина"],\n  ["clients", "Клиенты"],\n  ["acts", "Акты сверок"],\n  ["exchange", "1С"],\n  ["more", "Ещё"]',
    "Главное меню: Заказы, Товары, Витрина, Клиенты, Акты сверок, 1С, Ещё",
  ],
  [
    "restoreWindowScroll",
    "После сохранения товара страница остаётся на том же месте прокрутки",
  ],
  [
    '"Химия, чистящие средства"',
    "На витрине категория химии называется «Химия, чистящие средства»",
  ],
  [
    "background: #f3f2ee;",
    "Фон витрины нейтральный, без зелёной заливки страницы",
  ],
  [
    "Тряпки, мопы, полотенца",
    "Подгруппа с мопами пишется со строчной буквы",
  ],
  [
    '["matrix", "Моя матрица"],\n  ["catalog", "Добавить товары из каталога"],',
    "В ЛК клиента есть «Моя матрица» и «Добавить товары из каталога»",
  ],
  [
    'className="manager-order-extra"',
    "В ЛК админа номер, телефон, адрес и состав заказа спрятаны за «Подробнее»",
  ],
  [
    "settings.managerCanDeleteOrders ? (",
    "В карточке заказа кнопка «Удалить» стоит рядом со статусами, не внутри «Подробнее»",
  ],
  [
    "width: auto !important;\n  padding-left: 8px !important;\n  padding-right: 20px !important;",
    "В составе заказа количество и цена стоят рядом с наименованием, не внахлёст",
  ],
  [
    'className="manager-order-title-row"',
    "В карточке заказа сначала клиент и сумма, ниже статусы и действие 1С",
  ],
  [
    "firstPositiveCatalogPrice",
    "В списке товаров цена берётся из закупки, вида цен или каталога",
  ],
  [
    ".exchange-status-line > .badge,\n.exchange-status-line > .manager-order-status-select {",
    "Бейджи статуса заказа и 1С одной высоты",
  ],
];

for (const [fragment, description] of checks) {
  if (!source.includes(fragment)) {
    throw new Error(`Проверка не пройдена: ${description}`);
  }
}

{
  const ordersUi = await readFile(
    path.join(projectRoot, "src/screens/manager/ManagerOrders.jsx"),
    "utf8"
  );
  const deleteAt = ordersUi.indexOf("onClick={() => onDeleteOrder(order)}");
  const extraAt = ordersUi.indexOf('className="manager-order-extra"');
  if (deleteAt < 0 || extraAt < 0 || deleteAt > extraAt) {
    throw new Error(
      "Кнопка «Удалить» должна быть в шапке карточки заказа, до блока «Подробнее»."
    );
  }
}

if (source.includes("PRICE_SOURCE_LABELS") || source.includes('className="price-source')) {
  throw new Error("В клиентской карточке осталась подпись источника цены.");
}

if (source.includes("Черновик автоматически сохраняется в этом браузере.")) {
  throw new Error("В сводке заказа осталась служебная заметка про автосохранение черновика.");
}

if (source.includes("Добавление из каталога 1С: вручную или списком из Excel")) {
  throw new Error("У кнопки «Добавить из 1С» снова длинная подсказка.");
}

if (source.includes("Добавление из каталога Clover: товар уже есть")) {
  throw new Error("У кнопки «Добавить из каталога» снова длинная подсказка.");
}

if (source.includes('label: "Матрица и 1С"')) {
  throw new Error("Пункт меню снова называется «Матрица и 1С» и уводит со страницы.");
}

if (source.includes('"Настройки клиента"') || source.includes("Скрыть настройки клиента")) {
  throw new Error("Кнопка «Настройки клиента» снова дублирует «Данные клиента».");
}

{
  const pickerAt = source.indexOf("<OneCClientPicker");
  const lastPickerAt = source.lastIndexOf("<OneCClientPicker");
  const matrixAt = source.indexOf("<summary>1С и цены");
  if (pickerAt < 0) {
    throw new Error("Пропала кнопка выбора контрагента 1С.");
  }
  if (matrixAt < 0 || lastPickerAt > matrixAt) {
    throw new Error("Выбор контрагента 1С снова спрятан в матрице, а не в данных клиента.");
  }
  if (!source.includes("Контрагент 1С не выбран — откройте «Данные клиента».")) {
    throw new Error("В матрице нет подсказки, что контрагента выбирают в данных клиента.");
  }
}

if (source.includes("Обновить фото (белый фон)")) {
  throw new Error("В настройках витрины осталась кнопка обновления фото.");
}

if (source.includes('title: "Фото сохранено"')) {
  throw new Error("После добавления фото снова показывается анимация «Фото сохранено».");
}

if (source.includes("<summary>Товарная матрица</summary>")) {
  throw new Error("Кнопка «Товарная матрица» снова на карточке клиента.");
}

if (source.includes('id: "password"')) {
  throw new Error("Пункт «Сменить пароль» снова в меню трёх точек, а не в данных клиента.");
}

const productsPath = path.resolve(projectRoot, "src/screens/manager/ManagerProducts.jsx");
const productsSource = await readFile(productsPath, "utf8");
if (productsSource.includes("от ${formatMoney")) {
  throw new Error("В списке товаров снова подпись цены «от …» вместо одной суммы.");
}
if (productsSource.includes("product-manager-title-row")) {
  throw new Error("Название товара снова в одной строке с бейджами.");
}
if (!/product-manager-side[\s\S]*product-manager-badges/.test(productsSource)) {
  throw new Error("Бейджи «Активен» должны стоять в правой колонке над кнопками.");
}

assert.equal(
  firstPositiveCatalogPrice({
    purchasePrices: {},
    salePricesByType: { t1: { piece: 12.5, priceTypeName: "Розничная" } },
  }),
  12.5
);
assert.equal(
  firstPositiveCatalogPrice({
    purchasePrices: {},
    salePricesByType: { "7be6c8b6-23bb-11e9-9b9b-9cda3efabffd": { piece: 88 } },
  }, [{ id: "7be6c8b6-23bb-11e9-9b9b-9cda3efabffd", name: "Закупочная цена" }]),
  88
);
assert.equal(
  firstPositiveCatalogPrice({
    purchasePrices: { pack: 80 },
    salePricesByType: {},
    pricePiece: 0,
  }),
  80
);
assert.equal(
  firstPositiveCatalogPrice({
    purchasePrices: {},
    salePricesByType: {},
    pricePack: 40,
  }),
  40
);

const ordersPath = path.resolve(projectRoot, "src/screens/manager/ManagerOrders.jsx");
const ordersSource = await readFile(ordersPath, "utf8");
if (ordersSource.includes("ID 1С:")) {
  throw new Error("В составе заказа снова показываются два идентификатора (код и UUID 1С).");
}

if (source.includes("useState(readOpenManagerClientId)")) {
  throw new Error("Товарная матрица снова восстанавливается после обновления страницы.");
}

if (source.includes("grid-auto-rows: calc((100dvh - var(--clover-chrome-offset")) {
  throw new Error("Высота рядов фото-каталога всё ещё считается от 100dvh.");
}

if (source.includes("grid-auto-rows: minmax(0, calc((100% - 4px) / 2))")) {
  throw new Error("Ряды фото-каталога снова считаются от 100% — карточки схлопываются.");
}

const orderEditorPath = path.resolve(projectRoot, "src/screens/client/OrderEditor.jsx");
const orderEditor = await readFile(orderEditorPath, "utf8");
const cartChunk =
  orderEditor.split('className="cart-sheet"')[1]?.split('className="delivery-date-sheet"')[0] || "";
const dateChunk = orderEditor.split('className="delivery-date-sheet"')[1] || "";
if (!cartChunk || /,\s*document\.body\s*\)/.test(cartChunk)) {
  throw new Error("Окно корзины снова порталится в document.body — на iPhone будет ехать.");
}
if (!dateChunk || /,\s*document\.body\s*\)/.test(dateChunk)) {
  throw new Error("Окно даты доставки снова порталится в document.body.");
}
if (!cartChunk.includes("document.documentElement") || !dateChunk.includes("document.documentElement")) {
  throw new Error("Окна корзины/даты должны порталиться в document.documentElement.");
}

const themePath = path.resolve(projectRoot, "src/styles/clover-theme.css");
const theme = await readFile(themePath, "utf8");
const cartTheme = theme.split("/* Корзина вне body")[1]?.split(".order-thankyou-mobile")[0] || "";
const overlayBlock = cartTheme.split(".cart-sheet-backdrop")[0] || "";
if (
  /(?:^|\n)\s*width: 100% !important/.test(overlayBlock) &&
  overlayBlock.includes("left: 0 !important") &&
  overlayBlock.includes("right: 0 !important")
) {
  throw new Error("Слой корзины снова с left+right+width 100% — окно уедет влево.");
}
if (/\.cart-sheet-footer\s*\{[^}]*margin:\s*0\s+-1[68]px/.test(source)) {
  throw new Error("У подвала корзины снова отрицательный margin — слой шире экрана.");
}

const customPayload = exchangeSource.split("customItems:")[1]?.split("totals:")[0] || "";
if (customPayload.includes("dataUrl") || customPayload.includes("photo:")) {
  throw new Error("Фотография ошибочно включена в пакет заказа для 1С.");
}

if (source.includes('value !== "" &&\n    hasPurchasePrice(value)')) {
  throw new Error("Обнаружен рекурсивный вызов hasPurchasePrice.");
}

console.log("Clover V17 UI verification passed:");
for (const [, description] of checks) {
  console.log(`- ${description}`);
}
console.log("- Фото запроса не включается в пакет для 1С");
console.log("- Служебная заметка про автосохранение черновика скрыта");
console.log("- Кнопка обновления фото витрины скрыта");
console.log("- Высота рядов фото-каталога не считается от 100dvh");
console.log("- Корзина и дата не порталятся в body");
console.log("- Слой корзины без left+right+width 100% и без отрицательного margin");
