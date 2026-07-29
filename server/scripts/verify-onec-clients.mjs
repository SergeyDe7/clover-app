import assert from "node:assert/strict";
import {
  autoLinkCloverClients,
  buildOneCClientCandidates,
  linkCloverClient,
  mergeClientLinksPreservingOneCLinks,
  normalizeOneCClients,
  selectRelevantOneCClients,
} from "../src/oneCClients.js";

const clients = [
  { id: "client-1", companyName: "Восточная лавка", phone: "+7 911 790-80-89", email: "vl@example.test", inn: "" },
  { id: "client-2", companyName: "ООО Альфа Фуд", phone: "+7 921 111-22-33", email: "orders@alpha.test", inn: "7812345678" },
  { id: "client-3", companyName: "Кафе Север", phone: "+7 921 555-44-33", email: "cafe@north.test", inn: "" },
];
const links = {};
const realItems = [
  { id: "onec-client-1", code: "НФ-00001", name: "Восточная лавка", phone: "+79117908089" },
  { id: "onec-client-2", code: "НФ-00002", name: "Альфа-Фуд ООО", inn: "7812345678", email: "office@alpha.test" },
  { id: "onec-client-3", code: "НФ-00003", name: "Кафе Север СПб", phone: "+79215554433", email: "cafe@north.test" },
];
const distractors = Array.from({ length: 997 }, (_, index) => ({
  id: `other-${index + 1}`,
  code: `К-${index + 1}`,
  name: `Посторонний контрагент ${index + 1}`,
  phone: `+7800${String(index).padStart(7, "0")}`,
}));
const catalog = normalizeOneCClients([...realItems, ...distractors]);
assert.equal(catalog.length, 1000);

const candidates = buildOneCClientCandidates(clients, links, catalog);
const retained = selectRelevantOneCClients(clients, links, catalog, candidates);
assert.ok(retained.length <= 30, "Полная клиентская база не должна сохраняться");

const auto = autoLinkCloverClients(clients, links, retained, "2026-07-24T22:00:00.000Z");
assert.equal(auto.report.linked, 3);
assert.equal(auto.clientLinks["client-1"].oneCId, "onec-client-1");
assert.equal(auto.clientLinks["client-2"].oneCId, "onec-client-2");
assert.equal(auto.clientLinks["client-3"].oneCId, "onec-client-3");

const manual = linkCloverClient({}, "client-1", realItems[0]);
assert.equal(manual["client-1"].matched1C, true);
assert.equal(manual["client-1"].oneCName, "Восточная лавка");

const preserved = mergeClientLinksPreservingOneCLinks(
  { "client-1": { matrixMode: "all", oneCId: "" } },
  { "client-1": manual["client-1"] }
);
assert.equal(preserved["client-1"].oneCId, "onec-client-1");
const cleared = mergeClientLinksPreservingOneCLinks(
  { "client-1": { oneCId: "", oneCLinkMode: "manual-cleared" } },
  { "client-1": manual["client-1"] }
);
assert.equal(cleared["client-1"].oneCId, "");

console.log("Проверка выборочного сопоставления клиентов 1С пройдена успешно.");
console.log(`Просканировано: ${catalog.length}; сохранено выборочно: ${retained.length}; связано: ${auto.report.linked}.`);
