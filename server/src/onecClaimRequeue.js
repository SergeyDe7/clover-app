import { listOrders, updateOrderPayload, writeAudit } from "./db.js";
import { releaseExpiredClaimExchange } from "./exchange.js";

/**
 * Возвращает истёкшие claim (sending → ready) и пишет audit.
 * Используется на pull и фоновым timer.
 */
export function releaseExpiredOneCClaims(nowMs = Date.now()) {
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
}
