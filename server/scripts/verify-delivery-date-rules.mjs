import assert from "node:assert/strict";
import {
  DELIVERY_DATE_MESSAGES,
  formatLocalIsoDate,
  getEarliestDeliveryDate,
  getEarliestDeliveryDateIso,
  isAfterDeliveryCutoff,
  isDeliveryClosedDay,
  nextWorkingDeliveryDay,
  parseLocalIsoDate,
  validateDeliveryDate,
} from "../../src/shared/deliveryDateRules.js";

function atLocal(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

assert.equal(formatLocalIsoDate(atLocal(2026, 8, 3)), "2026-08-03");
assert.equal(parseLocalIsoDate("2026-08-03")?.getDate(), 3);
assert.equal(parseLocalIsoDate("2026-13-01"), null);
assert.equal(isDeliveryClosedDay(atLocal(2026, 8, 2)), true); // Sunday
assert.equal(isDeliveryClosedDay(atLocal(2026, 8, 1)), false); // Saturday
assert.equal(isDeliveryClosedDay(atLocal(2026, 8, 3)), false); // Monday

assert.equal(
  formatLocalIsoDate(nextWorkingDeliveryDay(atLocal(2026, 8, 2))),
  "2026-08-03"
);

// Monday 10:00 → earliest Tuesday
{
  const now = atLocal(2026, 8, 3, 10, 0);
  assert.equal(isAfterDeliveryCutoff(now), false);
  assert.equal(getEarliestDeliveryDateIso(now), "2026-08-04");
  assert.equal(validateDeliveryDate("2026-08-03", now).ok, false);
  assert.equal(validateDeliveryDate("2026-08-03", now).code, "too_early");
  assert.equal(validateDeliveryDate("2026-08-03", now).message, DELIVERY_DATE_MESSAGES.beforeCutoff);
  assert.equal(validateDeliveryDate("2026-08-04", now).ok, true);
  assert.equal(validateDeliveryDate("2026-08-09", now).code, "sunday"); // Sunday Aug 9
  assert.equal(validateDeliveryDate("2026-08-09", now).message, DELIVERY_DATE_MESSAGES.sunday);
}

// Monday 18:00 → earliest Wednesday
{
  const now = atLocal(2026, 8, 3, 18, 0);
  assert.equal(isAfterDeliveryCutoff(now), true);
  assert.equal(getEarliestDeliveryDateIso(now), "2026-08-05");
  assert.equal(validateDeliveryDate("2026-08-04", now).ok, false);
  assert.equal(validateDeliveryDate("2026-08-04", now).message, DELIVERY_DATE_MESSAGES.afterCutoff);
  assert.equal(validateDeliveryDate("2026-08-05", now).ok, true);
}

// Friday 19:00 → after tomorrow is Sunday → Monday
{
  const now = atLocal(2026, 8, 7, 19, 0); // Friday
  assert.equal(getEarliestDeliveryDateIso(now), "2026-08-10"); // Mon
  assert.equal(validateDeliveryDate("2026-08-09", now).ok, false); // Sunday
  assert.equal(validateDeliveryDate("2026-08-10", now).ok, true);
}

// Saturday before cutoff → Sunday skipped → Monday
{
  const now = atLocal(2026, 8, 1, 12, 0); // Saturday
  assert.equal(formatLocalIsoDate(getEarliestDeliveryDate(now)), "2026-08-03");
}

assert.equal(validateDeliveryDate("", atLocal(2026, 8, 3)).ok, false);
assert.equal(validateDeliveryDate("not-a-date", atLocal(2026, 8, 3)).code, "invalid");

console.log("verify-delivery-date-rules: ok");
