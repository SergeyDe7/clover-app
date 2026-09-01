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

function simulateOrdersExchangeFilterSync(initial = "all") {
  let parent = initial;
  let local = initial;
  return {
    parent: () => parent,
    local: () => local,
    setExchangeFilterValue(next) {
      local = next;
      parent = next;
    },
    applyParentExchangeFilterFromKpi(prop) {
      parent = prop;
      if (prop) local = prop;
    },
    setLocalOnly(next) {
      local = next;
    },
    repeatKpiWithoutParentChange() {
      // Parent already "error"; React effect does not rerun when prop value is unchanged.
    },
  };
}

const synced = simulateOrdersExchangeFilterSync();
synced.applyParentExchangeFilterFromKpi(managerKpiOrderFilters("exchangeErrors").exchangeFilter);
assert.equal(synced.parent(), "error");
assert.equal(synced.local(), "error");

synced.setExchangeFilterValue("all");
assert.equal(synced.parent(), "all");
assert.equal(synced.local(), "all");

synced.applyParentExchangeFilterFromKpi(managerKpiOrderFilters("exchangeErrors").exchangeFilter);
assert.equal(synced.parent(), "error");
assert.equal(synced.local(), "error");

synced.setExchangeFilterValue("waiting");
assert.equal(synced.parent(), "waiting");
assert.equal(synced.local(), "waiting");

synced.applyParentExchangeFilterFromKpi(managerKpiOrderFilters("exchangeErrors").exchangeFilter);
assert.equal(synced.parent(), "error");
assert.equal(synced.local(), "error");

const desynced = simulateOrdersExchangeFilterSync();
desynced.applyParentExchangeFilterFromKpi("error");
desynced.setLocalOnly("all");
assert.equal(desynced.parent(), "error");
assert.equal(desynced.local(), "all");
desynced.repeatKpiWithoutParentChange();
assert.equal(desynced.local(), "all", "unchanged parent prop must not resync after local-only segment change");
desynced.setExchangeFilterValue("error");
assert.equal(desynced.parent(), "error");
assert.equal(desynced.local(), "error");

console.log("verify-manager-kpi-filters: ok");
