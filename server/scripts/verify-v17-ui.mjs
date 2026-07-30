import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(scriptDir, "../../src/App.jsx");
const exchangePath = path.resolve(scriptDir, "../src/exchange.js");
const source = await readFile(appPath, "utf8");
const exchangeSource = await readFile(exchangePath, "utf8");

const checks = [
  [
    'const UNIT_ORDER = ["piece", "bundle", "pack"]',
    "Единицы отображаются в порядке Штука → Пачка → Упаковка",
  ],
  [
    'className="product-purchase-summary"',
    "Закупочная цена видна в карточке товара менеджера",
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
    'const [openClientId, setOpenClientId] = useState(readOpenManagerClientId)',
    "Раскрытая карточка клиента восстанавливается после F5",
  ],
  [
    'open={matrixOpen}',
    "Открытая матрица клиента управляется сохранённым состоянием",
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
];

for (const [fragment, description] of checks) {
  if (!source.includes(fragment)) {
    throw new Error(`Проверка не пройдена: ${description}`);
  }
}

if (source.includes("PRICE_SOURCE_LABELS") || source.includes('className="price-source')) {
  throw new Error("В клиентской карточке осталась подпись источника цены.");
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
