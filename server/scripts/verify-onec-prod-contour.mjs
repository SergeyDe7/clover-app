import assert from "node:assert/strict";
import {
  defaultExchangeDatabase,
  isAllowedOneCDatabase,
  isProdExchangeEnabled,
  isTestDatabase,
  normalizeOneCDatabaseName,
  parseAllowedOneCDatabases,
  publicOneCExchangeStatus,
  purchasePriceFreshness,
  TEST_DATABASE_NAME,
} from "../src/oneCPriceSync.js";
import {
  exchangeDatabaseLabel,
  exchangeStatusLabel,
  normalizeExchangeState,
} from "../src/exchange.js";

const prev = { ...process.env };

function withEnv(map, fn) {
  for (const [key, value] of Object.entries(map)) {
    if (value === null || value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(map)) {
      if (Object.hasOwn(prev, key)) process.env[key] = prev[key];
      else delete process.env[key];
    }
  }
}

withEnv(
  {
    ONEC_PROD_EXCHANGE_ENABLED: "false",
    ONEC_ALLOWED_DATABASES: "TEST,VLAVKA",
    ONEC_DEFAULT_EXCHANGE_DATABASE: "VLAVKA",
  },
  () => {
    assert.equal(isProdExchangeEnabled(), false);
    assert.deepEqual(parseAllowedOneCDatabases(), [TEST_DATABASE_NAME]);
    assert.equal(isAllowedOneCDatabase("VLAVKA"), false);
    assert.equal(isAllowedOneCDatabase("TEST"), true);
    assert.equal(defaultExchangeDatabase(), TEST_DATABASE_NAME);
  }
);

withEnv(
  {
    ONEC_PROD_EXCHANGE_ENABLED: "true",
    ONEC_ALLOWED_DATABASES: "TEST,VLAVKA",
    ONEC_DEFAULT_EXCHANGE_DATABASE: "TEST",
  },
  () => {
    assert.equal(isProdExchangeEnabled(), true);
    assert.ok(parseAllowedOneCDatabases().includes("VLAVKA"));
    assert.equal(isAllowedOneCDatabase("VLAVKA"), true);
    assert.equal(defaultExchangeDatabase(), "TEST");
    const status = publicOneCExchangeStatus();
    assert.equal(status.prodEnabled, true);
  }
);

assert.equal(normalizeOneCDatabaseName("vlavka"), "VLAVKA");
assert.equal(isTestDatabase("TEST"), true);
assert.equal(exchangeDatabaseLabel("TEST"), "1С TEST");
assert.equal(exchangeDatabaseLabel("VLAVKA"), "1С VLAVKA");

const legacy = normalizeExchangeState({ status: "ready" });
assert.equal(legacy.database, "TEST");
assert.match(exchangeStatusLabel(legacy), /TEST/);

const prodQueued = normalizeExchangeState({ status: "ready", database: "VLAVKA" });
assert.equal(prodQueued.database, "VLAVKA");
assert.match(exchangeStatusLabel(prodQueued), /VLAVKA/);

const fresh = purchasePriceFreshness(
  {
    purchasePrice: 10,
    purchasePriceReceivedAt: new Date().toISOString(),
    purchasePriceSourceDatabase: "TEST",
  },
  { expectedDatabase: "TEST", maxAgeMs: 60 * 60 * 1000 }
);
assert.equal(fresh.fresh, true);

console.log("verify-onec-prod-contour: ok");
