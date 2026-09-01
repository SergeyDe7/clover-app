import assert from "node:assert/strict";
import {
  managerKpiOrderFilters,
  shouldActivateStatCard,
} from "../../src/shared/appHelpers.js";

assert.deepEqual(managerKpiOrderFilters("newOrders"), {
  statusFilter: "Новый",
  exchangeFilter: "all",
});
assert.deepEqual(managerKpiOrderFilters("exchangeErrors"), {
  statusFilter: "Все",
  exchangeFilter: "error",
});
assert.deepEqual(managerKpiOrderFilters("unknown"), {
  statusFilter: "Все",
  exchangeFilter: "all",
});

assert.equal(shouldActivateStatCard({ key: "Enter" }), true);
assert.equal(shouldActivateStatCard({ key: " " }), true);
assert.equal(shouldActivateStatCard({ key: "Escape" }), false);

let activated = false;
if (shouldActivateStatCard({ key: "Enter" })) {
  activated = true;
}
assert.equal(activated, true);

console.log("verify-manager-kpi-filters: ok");
