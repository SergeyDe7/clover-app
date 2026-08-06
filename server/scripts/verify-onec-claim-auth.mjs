import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isOneCClaimExpired,
  normalizeExchangeState,
  ONEC_CLAIM_EXPIRED_REQUEUE_MESSAGE,
  ONEC_CLAIM_LEASE_MS,
  ONEC_CLAIM_REQUEUE_INTERVAL_MS,
  releaseExpiredClaimExchange,
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
  "Каталог (preview) должен требовать X-Clover-Database: TEST."
);
assert.ok(
  serverSource.includes("function requireOneCAllowedDatabase"),
  "Pull/ACK должны использовать allowlist баз (prod-контур)."
);
assert.ok(
  serverSource.includes("ONEC_PROD_EXCHANGE_ENABLED"),
  "Prod-контур должен читаться из ONEC_PROD_EXCHANGE_ENABLED."
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

const nowMs = Date.now();
const activeRelease = releaseExpiredClaimExchange(
  {
    status: "sending",
    lastAttemptAt: new Date(nowMs).toISOString(),
    attempts: 2,
  },
  nowMs
);
assert.equal(activeRelease, null, "Активный claim не должен requeue.");

const expiredRelease = releaseExpiredClaimExchange(
  {
    status: "sending",
    lastAttemptAt: new Date(nowMs - ONEC_CLAIM_LEASE_MS - 1000).toISOString(),
    attempts: 2,
    channel: "onec-pull",
  },
  nowMs
);
assert.ok(expiredRelease, "Истёкший claim должен requeue в ready.");
assert.equal(expiredRelease.status, "ready");
assert.equal(expiredRelease.attempts, 2);
assert.equal(expiredRelease.message, ONEC_CLAIM_EXPIRED_REQUEUE_MESSAGE);
assert.equal(
  releaseExpiredClaimExchange({ status: "ready" }, nowMs),
  null,
  "ready не должен requeue."
);

assert.ok(
  Number.isFinite(ONEC_CLAIM_REQUEUE_INTERVAL_MS) && ONEC_CLAIM_REQUEUE_INTERVAL_MS >= 5_000,
  "Интервал auto-requeue должен быть задан."
);
assert.ok(
  serverSource.includes("startOneCClaimRequeueTimer"),
  "Сервер должен запускать фоновый auto-requeue timer."
);
assert.ok(
  serverSource.includes('from "./onecClaimRequeue.js"') ||
    serverSource.includes("from './onecClaimRequeue.js'"),
  "Сервер должен брать releaseExpiredOneCClaims из onecClaimRequeue.js."
);
assert.ok(
  serverSource.includes("releaseExpiredOneCClaims"),
  "Сервер должен вызывать releaseExpiredOneCClaims."
);

const requeueSource = readFileSync(
  path.join(root, "server/src/onecClaimRequeue.js"),
  "utf8"
);
assert.ok(
  requeueSource.includes("one-c.claim.expired-requeue"),
  "Requeue должен писать audit."
);
assert.ok(
  requeueSource.includes("releaseExpiredClaimExchange"),
  "Requeue должен использовать общий helper releaseExpiredClaimExchange."
);

assert.ok(
  serverSource.includes('previous.status === "sending" && !isOneCClaimExpired(previous)'),
  "Send не должен возвращать активный sending в ready."
);
assert.ok(
  serverSource.includes("ONEC_RESET_NOT_ALLOWED") ||
    serverSource.includes('previous.status === "sending"'),
  "Reset должен явно обрабатывать очередь ready/sending (отмена передачи менеджером)."
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
const resetSlice = serverSource.slice(resetIdx, resetIdx + 1200);
assert.ok(
  resetSlice.includes("ONEC_SENT_LOCKED") || resetSlice.includes('status === "sent"'),
  "Reset endpoint обязан блокировать уже принятый в 1С заказ."
);

const { readFrontendUiSource } = await import("./readFrontendUiSource.mjs");
const appSource = readFrontendUiSource(root);
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
