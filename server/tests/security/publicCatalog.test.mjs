/**
 * Публичный каталог: состав ответа и кэширование.
 *
 * Маршрут открыт без аутентификации, поэтому всё, что в нём есть,
 * считается опубликованным. Внутренние идентификаторы 1С и стратегия
 * ценообразования к этому списку относиться не должны.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, seedAccessFixtures } from "../helpers/testServer.mjs";

let server;
let users;

/** Товар, попадающий на витрину: активный, показываемый, связанный с 1С. */
const STOREFRONT_PRODUCT = {
  id: "sec-catalog-1",
  name: "Стакан бумажный 250 мл",
  code: "CL-9001",
  oneCId: "onec-9001",
  oneCCode: "1C-9001",
  oneCName: "Стакан бум. 250",
  category: "Одноразовая посуда",
  subcategory: "Стаканы",
  active: true,
  showOnStorefront: true,
  saleUnits: ["piece", "pack"],
  pricePiece: 12,
  pricePack: 600,
  pieceSize: 1,
  packSize: 50,
  imageUrl: "/uploads/none.jpg",
  certificateUrl: "https://example.test/cert.pdf",
  storefrontDetails: { description: "Описание", composition: "Бумага", characteristics: "250 мл" },
};

test.before(async () => {
  server = await startTestServer();
  users = await seedAccessFixtures(server);

  const response = await server.request("/api/state/products", {
    method: "PUT",
    body: { products: [STOREFRONT_PRODUCT] },
    token: users.admin.token,
  });
  assert.equal(response.status, 200, "не удалось подготовить каталог");
});

test.after(async () => {
  await server?.stop();
});

async function catalog() {
  const response = await server.request("/api/public/catalog");
  assert.equal(response.status, 200);
  return { response, body: await response.json() };
}

test("витрина получает поля, которые ей нужны", async () => {
  const { body } = await catalog();
  const product = body.products.find((item) => item.id === STOREFRONT_PRODUCT.id);
  assert.ok(product, `товар не попал в каталог: ${JSON.stringify(body.products)}`);

  for (const field of [
    "id",
    "code",
    "name",
    "category",
    "subcategory",
    "imageUrl",
    "certificateUrl",
    "saleUnits",
    "prices",
    "details",
  ]) {
    assert.ok(field in product, `в ответе нет поля ${field}, витрина его использует`);
  }

  assert.equal(typeof product.prices, "object");
  assert.ok(Array.isArray(body.categories), "витрина строит навигацию по categories");
  assert.ok(body.site && typeof body.site === "object", "витрина использует блок site");
});

test("внутренние поля наружу не уходят", async () => {
  const { body } = await catalog();
  const product = body.products.find((item) => item.id === STOREFRONT_PRODUCT.id);

  for (const field of ["priceSources", "oneCId", "oneCCode", "oneCName", "cloverCode"]) {
    assert.equal(field in product, false, `внутреннее поле ${field} не должно быть в публичном ответе`);
  }

  const serialized = JSON.stringify(body);
  for (const marker of ["storefrontMarkupPercent", "storefrontPricingMode", "purchasePrice", "costPrice"]) {
    assert.equal(serialized.includes(marker), false, `в ответе не должно быть ${marker}`);
  }
});

test("карточка товара скрывает те же поля", async () => {
  const response = await server.request(`/api/public/catalog/${STOREFRONT_PRODUCT.oneCCode}`);
  assert.equal(response.status, 200);
  const { product } = await response.json();

  assert.equal(product.id, STOREFRONT_PRODUCT.id);
  for (const field of ["priceSources", "oneCId", "oneCCode", "oneCName", "cloverCode"]) {
    assert.equal(field in product, false, `внутреннее поле ${field} не должно быть в карточке товара`);
  }
});

test("каталог отдаёт валидатор кэша и отвечает 304 на повторный запрос", async () => {
  const { response } = await catalog();

  const cacheControl = response.headers.get("cache-control");
  assert.ok(cacheControl?.includes("max-age"), `ожидался Cache-Control с max-age, получено ${cacheControl}`);

  const etag = response.headers.get("etag");
  assert.ok(etag, "ожидался ETag");

  const revalidated = await server.request("/api/public/catalog", {
    headers: { "If-None-Match": etag },
  });
  assert.equal(revalidated.status, 304, "повторный запрос с ETag должен отдавать 304");
});

test("заказ по-прежнему оформляется по productId из публичного каталога", async () => {
  const { body } = await catalog();
  const product = body.products.find((item) => item.id === STOREFRONT_PRODUCT.id);

  const response = await server.request("/api/public/orders", {
    method: "POST",
    body: {
      contactName: "Иван Иванов",
      phone: "+7 900 000-00-00",
      address: "Санкт-Петербург, Невский проспект, 1",
      items: [{ productId: product.id, code: product.code, unit: "piece", qty: 2 }],
    },
  });

  // Товар связан с 1С, поэтому заказ должен создаться, а не упасть на поиске.
  assert.equal(response.status, 201, `неожиданный ответ: ${await response.text()}`);
});
