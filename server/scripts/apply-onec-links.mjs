import {
  db,
  getGlobalState,
  listClients,
  setGlobalState,
  writeAudit,
} from "../src/db.js";
import { DEFAULT_PRODUCTS } from "../src/defaults.js";
import {
  autoLinkCloverProducts,
  buildOneCProductsSummary,
} from "../src/oneCProducts.js";
import {
  autoLinkCloverClients,
  buildOneCClientsSummary,
} from "../src/oneCClients.js";

const linkedAt = new Date().toISOString();
const products = getGlobalState("products", DEFAULT_PRODUCTS);
const oneCProducts = getGlobalState("oneCProducts", []);

if (Array.isArray(oneCProducts) && oneCProducts.length) {
  const linked = autoLinkCloverProducts(products, oneCProducts, linkedAt);
  if (linked.changed) setGlobalState("products", linked.products);
  const previousMeta = getGlobalState("oneCProductsMeta", {});
  const meta = { ...previousMeta, lastAutoLinkAt: linkedAt, lastReport: linked.report };
  setGlobalState("oneCProductsMeta", meta);
  writeAudit({ action: "one-c.products.auto-link.install", details: linked.report });
  const summary = buildOneCProductsSummary(linked.products, linked.oneCProducts, meta);
  console.log(`Каталог 1С: ${summary.oneCTotal}. Связано товаров: ${summary.linked}. Без связи: ${summary.unmatched}.`);
} else {
  console.log("Каталог товаров 1С пока пуст. Сопоставление выполнится после следующей выгрузки из 1С.");
}

const clients = listClients();
const clientLinks = getGlobalState("clientLinks", {});
const oneCClients = getGlobalState("oneCClients", []);

if (Array.isArray(oneCClients) && oneCClients.length) {
  const linked = autoLinkCloverClients(clients, clientLinks, oneCClients, linkedAt);
  if (linked.changed) setGlobalState("clientLinks", linked.clientLinks);
  const previousMeta = getGlobalState("oneCClientsMeta", {});
  const meta = { ...previousMeta, lastAutoLinkAt: linkedAt, lastReport: linked.report };
  setGlobalState("oneCClientsMeta", meta);
  writeAudit({ action: "one-c.clients.auto-link.install", details: linked.report });
  const summary = buildOneCClientsSummary(clients, linked.clientLinks, linked.oneCClients, meta);
  console.log(`Контрагентов 1С сохранено выборочно: ${summary.oneCTotal}. Связано клиентов: ${summary.linked}.`);
}

db.close();
