import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clover-v26-client-test-"));
const databasePath = path.join(tempDirectory, "clover-test.sqlite");
process.env.DB_PATH = databasePath;
process.env.MANAGER_EMAIL = "manager-client-test@clover.local";
process.env.MANAGER_PASSWORD = "TemporaryTestPassword!";

const dbModule = await import(`../src/db.js?test=${Date.now()}`);
const {
  createUser,
  db,
  findUserByEmail,
  getClientState,
  listClients,
  listOrders,
  replaceOrders,
  setClientStateField,
  updateClientByManager,
} = dbModule;

const client = createUser({
  email: "old-client@example.local",
  passwordHash: "test-hash",
  role: "client",
  profile: {
    companyName: "Старое название",
    contactName: "Иван",
    phone: "+70000000000",
    email: "old-client@example.local",
  },
});

setClientStateField(client.id, "favorites", [1, 2, 3]);
replaceOrders({
  userId: client.id,
  managerMode: false,
  orders: [
    {
      id: "old-order",
      number: "CL-OLD-001",
      clientId: client.id,
      customerName: "Старое название",
      customerEmail: "old-client@example.local",
      items: [],
      createdAt: "2026-07-24T00:00:00.000Z",
    },
  ],
});

const addresses = [
  {
    id: "address-main",
    label: "Основной магазин",
    address: "Санкт-Петербург, ул. Тестовая, 1",
    isDefault: true,
  },
  {
    id: "address-second",
    label: "Склад",
    address: "Санкт-Петербург, ул. Складская, 2",
    isDefault: false,
  },
];

const updated = updateClientByManager({
  clientId: client.id,
  profile: {
    companyName: "Восточная лавка",
    contactName: "Анна",
    phone: "+7 911 111-22-33",
    email: "new-client@example.local",
  },
  addresses,
  managerNote: "Звонить перед доставкой. Принимает товар до 16:00.",
});

assert.equal(updated.companyName, "Восточная лавка");
assert.equal(updated.contactName, "Анна");
assert.equal(updated.phone, "+7 911 111-22-33");
assert.equal(updated.email, "new-client@example.local");
assert.equal(updated.managerNote, "Звонить перед доставкой. Принимает товар до 16:00.");
assert.equal(updated.addresses.length, 2);
assert.equal(updated.addresses[0].isDefault, true);
assert.equal(findUserByEmail("old-client@example.local"), undefined);
assert.equal(findUserByEmail("new-client@example.local").id, client.id);

const state = getClientState(client.id);
assert.equal(state.profile.companyName, "Восточная лавка");
assert.equal(state.profile.email, "new-client@example.local");
assert.deepEqual(state.addresses, addresses);
assert.deepEqual(state.favorites, [1, 2, 3]);
assert.equal(listOrders(client.id).length, 1);
assert.equal(listOrders(client.id)[0].customerName, "Старое название");
assert.equal(listOrders(client.id)[0].customerEmail, "old-client@example.local");
const listedClient = listClients().find((item) => item.id === client.id);
assert.equal(listedClient.addresses[1].label, "Склад");
assert.equal(listedClient.managerNote, "Звонить перед доставкой. Принимает товар до 16:00.");
assert.equal(state.profile.managerNote, undefined);

const withExtraPhone = updateClientByManager({
  clientId: client.id,
  profile: {
    companyName: "Восточная лавка",
    contactName: "Анна",
    phone: "+7 911 111-22-33",
    email: "new-client@example.local",
    contacts: [
      {
        id: "contact-primary",
        name: "Анна",
        label: "Основной",
        phone: "+7 911 111-22-33",
        isPrimary: true,
      },
      {
        id: "contact-extra",
        name: "Склад",
        label: "Дополнительный",
        phone: "+7 911 000-11-22",
        isPrimary: false,
      },
    ],
  },
  addresses,
  managerNote: "Звонить перед доставкой. Принимает товар до 16:00.",
});
assert.equal(withExtraPhone.contacts.length, 2);
assert.equal(withExtraPhone.contacts.some((item) => item.phone.includes("000-11-22") && !item.isPrimary), true);

db.close();
rmSync(tempDirectory, { recursive: true, force: true });

console.log("Проверка редактирования данных клиента и внутреннего комментария менеджера пройдена успешно.");
