import {
  listOrders,
  runInTransaction,
  updateOrderPayload,
  writeAudit,
} from "./db.js";
import { releaseExpiredClaimExchange } from "./exchange.js";
import { logCaughtError } from "./safeLog.js";

/**
 * Возвращает истёкшие claim (sending → ready) и пишет audit.
 * Используется на pull и фоновым timer.
 */
export function releaseExpiredOneCClaims(nowMs = Date.now()) {
  return runInTransaction(() => {
    // Read only after BEGIN IMMEDIATE. This prevents a stale requeue snapshot
    // from overwriting an ACK committed by another server process.
    let released = 0;
    for (const order of listOrders()) {
      const nextExchange = releaseExpiredClaimExchange(order.exchange, nowMs);
      if (!nextExchange) continue;

      updateOrderPayload(order.id, {
        ...order,
        exchange: nextExchange,
        updatedAt: new Date(nowMs).toISOString(),
      });
      writeAudit({
        action: "one-c.claim.expired-requeue",
        details: {
          orderId: order.id,
          number: order.number || "",
          previousStatus: "sending",
          nextStatus: "ready",
        },
      });
      released += 1;
    }
    return released;
  });
}

export function runOneCClaimRequeueTick(deps = {}) {
  const release = deps.releaseExpiredOneCClaims || releaseExpiredOneCClaims;
  try {
    return release();
  } catch (error) {
    logCaughtError("onec.claim.requeue", error, { component: "oneC" });
    return 0;
  }
}
