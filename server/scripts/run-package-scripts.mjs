/**
 * Runs the long `check` / `test:onec` chains without 1k+ character lines in
 * package.json (Cursor npm task detection fails to parse those lines).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function processFailed(result) {
  return Boolean(result.signal) || result.status !== 0;
}

if (!processFailed({ status: null, signal: "SIGTERM" })) {
  throw new Error("Signalled child processes must fail the package runner.");
}

const CHECK_FILES = [
  "src/server.js",
  "src/db.js",
  "src/backups.js",
  "src/sitemapArtifact.js",
  "src/mailer.js",
  "src/push.js",
  "src/managerNotifications.js",
  "src/passkeys.js",
  "src/exchange.js",
  "src/storefrontCounterparty.js",
  "src/onecClaimRequeue.js",
  "src/orderStatus.js",
  "src/roles.js",
  "src/staffPolicy.js",
  "src/staffBootstrap.js",
  "src/staffNotifications.js",
  "src/staffPermissionsMigrate.js",
  "src/passwordHash.js",
  "src/credentialVaultInspector.js",
  "src/passwordVaultMigrate.js",
  "scripts/verify-staff-notifications.mjs",
  "src/clientSettings.js",
  "src/staffAccessVault.js",
  "src/oneCSearchIndex.js",
  "src/matrixGuard.js",
  "src/oneC.js",
  "src/oneCPublicError.js",
  "src/safeLog.js",
  "src/authUrlPolicy.js",
  "src/authIssuance.js",
  "src/outboundResponse.js",
  "src/remoteImagePolicy.js",
  "src/pushSubscriptionOwnership.js",
  "src/productEnrichment.js",
  "src/oneCProducts.js",
  "src/oneCClients.js",
  "src/pricing.js",
  "src/oneCPriceSync.js",
  "src/oneCContourAuth.js",
  "scripts/verify-onec-products.mjs",
  "scripts/verify-product-delete.mjs",
  "scripts/verify-onec-clients.mjs",
  "scripts/verify-manual-client-price-type.mjs",
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
  "scripts/verify-s2-new-001-order-preserve.mjs",
  "scripts/verify-s2-new-001-concurrency.mjs",
  "scripts/verify-onec-claim-auth.mjs",
  "scripts/verify-sec-001-contour-credentials.mjs",
  "scripts/verify-onec-contour-module-sources.mjs",
  "scripts/verify-onec-claim-requeue-db.mjs",
  "scripts/verify-order-status-roles.mjs",
  "scripts/verify-onec-accepted-status.mjs",
  "scripts/verify-bootstrap-search-opt.mjs",
  "scripts/verify-v18.mjs",
  "scripts/verify-runtime-integrations.mjs",
  "scripts/verify-manager-notifications.mjs",
  "scripts/verify-manager-tabs-smoke.mjs",
  "scripts/verify-client-self-matrix.mjs",
  "scripts/verify-staff-access-vault.mjs",
  "scripts/verify-staff-access-ui.mjs",
  "scripts/verify-manager-permissions.mjs",
  "scripts/prove-s2-pkg2-base-fail.mjs",
  "scripts/verify-s2-pkg2-permissions-migrate-backups.mjs",
  "scripts/verify-legacy-staff-permissions-migrate.mjs",
  "scripts/verify-s2-new-002-migration.mjs",
  "scripts/verify-s2-new-002-audit-recursive.mjs",
  "scripts/verify-s2-new-002-vault-concurrency.mjs",
  "scripts/verify-s2-new-002-password-storage.mjs",
  "scripts/verify-admin-client-password-login.mjs",
  "scripts/verify-auth-login-error-display.mjs",
  "scripts/assert-locale-route-release.mjs",
  "scripts/verify-locale-route-release.mjs",
  "scripts/verify-seo-portable-launcher.mjs",
  "scripts/verify-seo-build-readonly.mjs",
  "scripts/verify-seo-locale-html-preview.mjs",
  "scripts/verify-ui-build-tag.mjs",
  "scripts/verify-nginx-static-cache.mjs",
  "scripts/uiAssetProbe.mjs",
  "scripts/verify-ui-asset-gate.mjs",
  "scripts/releaseNamespace.js",
  "scripts/preparedDist.mjs",
  "scripts/verify-release-namespace.mjs",
  "scripts/verify-safe-production-deploy.mjs",
  "scripts/verify-security-stage3-package1.mjs",
  "scripts/verify-security-stage3-package2.mjs",
  "scripts/verify-security-stage3-package3.mjs",
  "src/previewArtifact.js",
  "src/auditRetention.js",
  "src/runtimeFilePermissions.js",
  "src/safeFsPath.js",
  "scripts/run-audit-retention.mjs",
  "scripts/run-runtime-permissions.mjs",
];

const TEST_ONEC = [
  "scripts/verify-onec-products.mjs",
  "scripts/verify-product-delete.mjs",
  "scripts/verify-onec-clients.mjs",
  "scripts/verify-manual-client-price-type.mjs",
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
  "scripts/verify-sec-001-contour-credentials.mjs",
  "scripts/verify-onec-contour-module-sources.mjs",
  "scripts/verify-onec-claim-requeue-db.mjs",
  "scripts/verify-order-status-roles.mjs",
  "scripts/verify-onec-accepted-status.mjs",
  "scripts/verify-bootstrap-search-opt.mjs",
  "scripts/verify-onec-prod-contour.mjs",
  "scripts/verify-catalog-prefix-search.mjs",
  "scripts/verify-storefront-group-tiles-ui.mjs",
  "scripts/verify-storefront-catalog-tree-ui.mjs",
  "scripts/verify-storefront-contacts.mjs",
  "scripts/verify-storefront-hero-slides.mjs",
  "scripts/verify-public-catalog-list-payload.mjs",
  "scripts/verify-catalog-progressive-render.mjs",
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
  if (processFailed(result)) {
    process.exit(Number.isInteger(result.status) ? result.status : 1);
  }
}

function gitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: path.resolve(serverRoot, ".."),
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (processFailed(result)) {
    throw new Error(
      `git ${args.join(" ")} failed${
        result.signal ? ` with ${result.signal}` : ""
      }: ${result.stderr || result.stdout}`
    );
  }
  return String(result.stdout || "").trim();
}

const mode = process.argv[2];
if (mode === "check") {
  for (const file of CHECK_FILES) {
    run(["--check", file]);
  }
} else if (mode === "test:onec") {
  const reviewBase =
    String(process.env.CLOVER_VERIFY_BASE_SHA || "").trim() ||
    gitOutput(["merge-base", "HEAD", "origin/main"]);
  const reviewHead =
    String(process.env.CLOVER_VERIFY_HEAD_SHA || "").trim() ||
    gitOutput(["rev-parse", "HEAD"]);
  for (const file of TEST_ONEC) {
    run(
      file === "scripts/verify-manual-client-price-type.mjs"
        ? [file, "--base", reviewBase, "--head", reviewHead]
        : [file]
    );
  }
} else {
  console.error("usage: node scripts/run-package-scripts.mjs <check|test:onec>");
  process.exit(2);
}
