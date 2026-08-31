/**
 * Verify personal client manager wiring (contacts + assignment + fallback).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeStaffContact,
  normalizeStaffContactsMap,
  publicStaffContact,
} from "../src/staffContacts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSrc = readFileSync(path.join(root, "server/src/server.js"), "utf8");

assert.match(serverSrc, /function resolveClientManagerContactSettings/);
assert.match(serverSrc, /personalManagerId/);
assert.match(serverSrc, /\/api\/admin\/staff\/:userId\/contacts/);
assert.match(serverSrc, /resolveClientManagerContactSettings\(/);
assert.match(serverSrc, /publicClientLinkForClient/);
assert.match(serverSrc, /key === "personalManagerId"/);

const contact = normalizeStaffContact({
  fullName: "  Иван  ",
  phone: "+7 900",
  max: "maxuser",
  telegram: "@ivan",
  password: "secret",
});
assert.equal(contact.fullName, "Иван");
assert.equal(contact.phone, "+7 900");
assert.equal(Object.prototype.hasOwnProperty.call(contact, "password"), false);

const map = normalizeStaffContactsMap({
  "mgr-1": { fullName: "A", phone: "1" },
  "": { fullName: "skip" },
});
assert.equal(Object.keys(map).length, 1);
assert.deepEqual(publicStaffContact(map["mgr-1"]), {
  fullName: "A",
  phone: "1",
  max: "",
  telegram: "",
});

const defaults = readFileSync(
  path.join(root, "server/src/defaults.js"),
  "utf8"
);
assert.match(defaults, /personalManagerId:\s*""/);

const clientsUi = readFileSync(
  path.join(root, "src/screens/manager/ManagerClients.jsx"),
  "utf8"
);
assert.match(clientsUi, /Личный менеджер/);
assert.match(clientsUi, /personalManagerId/);

const adminUi = readFileSync(
  path.join(root, "src/components/AdminRolePanel.jsx"),
  "utf8"
);
assert.match(adminUi, /managerFullName/);
assert.match(adminUi, /setStaffContacts|saveContacts/);

const api = readFileSync(path.join(root, "src/serverApi.js"), "utf8");
assert.match(api, /setStaffContacts/);
assert.match(api, /fullName:\s*contact\.fullName/);

console.log("verify-personal-client-manager: ok");
