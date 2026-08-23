/**
 * Runs the long `check` / `test:onec` chains without 1k+ character lines in
 * package.json (Cursor npm task detection fails to parse those lines).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECK_FILES = [
  "src/server.js",
  "src/db.js",
  "src/backups.js",
  "src/mailer.js",
  "src/push.js",
  "src/managerNotifications.js",
  "src/passkeys.js",
  "src/exchange.js",
  "src/storefrontCounterparty.js",
  "src/onecClaimRequeue.js",
  "src/orderStatus.js",
  "src/roles.js",
  "src/clientSettings.js",
  "src/oneCSearchIndex.js",
  "src/matrixGuard.js",
  "src/oneC.js",
  "src/oneCProducts.js",
  "src/oneCClients.js",
  "src/pricing.js",
  "src/oneCPriceSync.js",
  "scripts/verify-onec-products.mjs",
  "scripts/verify-product-delete.mjs",
  "scripts/verify-onec-clients.mjs",
  "scripts/verify-create-product-from-onec.mjs",
  "scripts/verify-order-payload.mjs",
  "scripts/apply-onec-links.mjs",
  "scripts/verify-db-preservation.mjs",
  "scripts/verify-live-data.mjs",
  "scripts/verify-client-management.mjs",
  "scripts/verify-product-editor-selection.mjs",
  "scripts/verify-client-pricing.mjs",
  "scripts/verify-client-pricing-ui.mjs",
  "scripts/verify-onec-price-sync.mjs",
  "scripts/verify-v17-ui.mjs",
  "scripts/verify-orders-hardening.mjs",
  "scripts/verify-onec-claim-auth.mjs",
  "scripts/verify-onec-claim-requeue-db.mjs",
  "scripts/verify-order-status-roles.mjs",
  "scripts/verify-onec-accepted-status.mjs",
  "scripts/verify-bootstrap-search-opt.mjs",
  "scripts/verify-v18.mjs",
  "scripts/verify-runtime-integrations.mjs",
  "scripts/verify-manager-notifications.mjs",
  "scripts/verify-manager-tabs-smoke.mjs",
  "scripts/verify-client-self-matrix.mjs",
];

const TEST_ONEC = [
  "scripts/verify-onec-products.mjs",
  "scripts/verify-product-delete.mjs",
  "scripts/verify-onec-clients.mjs",
  "scripts/verify-create-product-from-onec.mjs",
  "scripts/verify-order-payload.mjs",
  "scripts/verify-db-preservation.mjs",
  "scripts/verify-client-management.mjs",
  "scripts/verify-product-editor-selection.mjs",
  "scripts/verify-client-pricing.mjs",
  "scripts/verify-client-pricing-ui.mjs",
  "scripts/verify-onec-price-sync.mjs",
  "scripts/verify-v17-ui.mjs",
  "scripts/verify-orders-hardening.mjs",
  "scripts/verify-onec-claim-auth.mjs",
  "scripts/verify-onec-claim-requeue-db.mjs",
  "scripts/verify-order-status-roles.mjs",
  "scripts/verify-onec-accepted-status.mjs",
  "scripts/verify-bootstrap-search-opt.mjs",
  "scripts/verify-onec-prod-contour.mjs",
  "scripts/verify-catalog-prefix-search.mjs",
  "scripts/verify-storefront-group-tiles-ui.mjs",
  "scripts/verify-storefront-catalog-tree-ui.mjs",
  "scripts/verify-storefront-contacts.mjs",
  "scripts/verify-clover-taxonomy.mjs",
  "scripts/verify-storefront-guest-counterparty.mjs",
  "scripts/verify-client-self-matrix.mjs",
];

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: serverRoot,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status) {
    process.exit(result.status);
  }
}

const mode = process.argv[2];
if (mode === "check") {
  for (const file of CHECK_FILES) {
    run(["--check", file]);
  }
} else if (mode === "test:onec") {
  for (const file of TEST_ONEC) {
    run([file]);
  }
} else {
  console.error("usage: node scripts/run-package-scripts.mjs <check|test:onec>");
  process.exit(2);
}
