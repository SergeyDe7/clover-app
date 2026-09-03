import assert from "node:assert/strict";
import {
  matchesTextSearch,
  phoneSearchDigitVariants,
} from "../../src/shared/appHelpers.js";

// Факт из локальной БД: один клиент без маски, остальные с маской.
const clients = [
  { name: "Восточная лавка", phone: "+79117908089" },
  { name: "TEST1", phone: "+7 (911) 111-11-11" },
  { name: "ООО Клевер", phone: "+7 (911) 236-82-77" },
  { name: "OOO KLEVER", phone: "89112368277" },
];

function findByPhone(query) {
  return clients.filter((client) =>
    matchesTextSearch(`${client.name} ${client.phone}`, query)
  );
}

// Регрессия: раньше includes находил только «сырой» +79117908089.
assert.equal(findByPhone("+79117908089").length, 1);
assert.equal(findByPhone("+79117908089")[0].name, "Восточная лавка");

assert.equal(findByPhone("+79111111111").length, 1);
assert.equal(findByPhone("+79111111111")[0].name, "TEST1");
assert.equal(findByPhone("9111111111").length, 1);
assert.equal(findByPhone("+7 (911) 111-11-11").length, 1);
assert.equal(findByPhone("8 911 111-11-11").length, 1);

assert.equal(findByPhone("9112368277").length, 2);
assert.equal(findByPhone("+79112368277").length, 2);
assert.equal(findByPhone("89112368277").length, 2);

assert.equal(findByPhone("Восточная").length, 1);
assert.equal(findByPhone("").length, 4);
assert.equal(findByPhone("zzznomatch").length, 0);

assert.ok(phoneSearchDigitVariants("+7 (911) 111-11-11").includes("79111111111"));
assert.ok(phoneSearchDigitVariants("89111111111").includes("79111111111"));

console.log("verify-manager-phone-search: ok");
