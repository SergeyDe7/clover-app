import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isOneCClaimExpired,
  normalizeExchangeState,
  ONEC_CLAIM_LEASE_MS,
  sanitizeOrderExchangeForSave,
} from "../src/exchange.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSource = readFileSync(path.join(root, "server/src/server.js"), "utf8");
const envExample = readFileSync(path.join(root, "server/.env.example"), "utf8");

assert.ok(
  serverSource.includes('ONEC_ALLOW_LOCAL_WITHOUT_KEY || "false"'),
  "Локальный oneC без ключа по умолчанию должен быть false."
);
assert.ok(
  envExample.includes("ONEC_ALLOW_LOCAL_WITHOUT_KEY=false"),
  ".env.example должен рекомендовать false для локального bypass."
);
assert.ok(
  serverSource.includes("function claimOrderForOneC"),
  "Pull должен claim-ить заказ (ready → sending)."
);
assert.ok(
  serverSource.includes('status: "sending"'),
  "Claim должен писать exchange.status=sending."
);
assert.ok(
  serverSource.includes("function requireOneCTestDatabase"),
  "Обмен должен требовать X-Clover-Database: TEST."
);
assert.ok(
  serverSource.includes("previous.status !== \"ready\" && previous.status !== \"sending\""),
  "ACK должен принимать ready и sending."
);

const clientsPreviewIdx = serverSource.indexOf('app.post("/api/one-c/clients-preview"');
assert.ok(clientsPreviewIdx > 0, "clients-preview должен существовать.");
const clientsSlice = serverSource.slice(clientsPreviewIdx, clientsPreviewIdx + 400);
assert.ok(
  clientsSlice.includes("requireOneCTestDatabase"),
  "clients-preview обязан требовать TEST-header."
);

const productsPreviewIdx = serverSource.indexOf('app.post("/api/one-c/products-preview"');
const productsSlice = serverSource.slice(productsPreviewIdx, productsPreviewIdx + 500);
assert.ok(
  productsSlice.includes("requireOneCTestDatabase"),
  "products-preview обязан требовать TEST-header."
);

assert.equal(normalizeExchangeState({ status: "sending" }).status, "sending");
assert.equal(
  isOneCClaimExpired({
    status: "sending",
    lastAttemptAt: new Date(Date.now() - ONEC_CLAIM_LEASE_MS - 1000).toISOString(),
  }),
  true,
  "Истёкший claim должен считаться expired."
);
assert.equal(
  isOneCClaimExpired({
    status: "sending",
    lastAttemptAt: new Date().toISOString(),
  }),
  false,
  "Свежий claim не должен быть expired."
);

assert.ok(
  serverSource.includes('previous.status === "sending" && !isOneCClaimExpired(previous)'),
  "Send не должен возвращать активный sending в ready."
);
assert.ok(
  serverSource.includes("ONEC_CLAIM_ACTIVE"),
  "Reset должен блокировать активный claim с явным кодом."
);
assert.ok(
  serverSource.includes("ONEC_DRAFT_LOCKED") ||
    serverSource.includes('previous.status === "draft"'),
  "Reset/re-queue должен учитывать реальный draft 1С."
);
assert.ok(
  serverSource.includes("function isAdminFullResetAllowed"),
  "Полный сброс должен иметь kill-switch."
);
assert.ok(
  serverSource.includes('confirm === "RESET"') ||
    serverSource.includes('trim() !== "RESET"'),
  "Полный сброс требует confirm RESET."
);
assert.ok(
  envExample.includes("ALLOW_ADMIN_FULL_RESET"),
  ".env.example должен документировать ALLOW_ADMIN_FULL_RESET."
);

const resetIdx = serverSource.indexOf('"/api/admin/exchange/orders/:orderId/reset"');
assert.ok(resetIdx > 0, "reset endpoint должен существовать.");
const resetSlice = serverSource.slice(resetIdx, resetIdx + 900);
assert.ok(
  resetSlice.includes("isOneCClaimExpired"),
  "Reset endpoint обязан проверять lease claim."
);

const appSource = readFileSync(path.join(root, "src/App.jsx"), "utf8");
assert.ok(
  appSource.includes('disabled={busy || exchange.status === "sending"}'),
  "UI не должен давать send/reset при активном sending."
);
const apiSource = readFileSync(path.join(root, "src/serverApi.js"), "utf8");
assert.ok(
  apiSource.includes('confirm: "RESET"'),
  "resetAll должен передавать confirm RESET."
);

const previousSending = {
  id: "o1",
  exchange: { status: "sending", message: "claimed", lastAttemptAt: new Date().toISOString() },
};
assert.equal(
  isOneCClaimExpired(previousSending.exchange),
  false
);
const managerBulk = sanitizeOrderExchangeForSave(
  { id: "o1", exchange: { status: "not_sent" } },
  previousSending,
  "manager"
);
assert.equal(
  normalizeExchangeState(managerBulk.exchange).status,
  "sending",
  "Manager bulk PUT не должен сбрасывать sending."
);

console.log("verify-onec-claim-auth: ok");
