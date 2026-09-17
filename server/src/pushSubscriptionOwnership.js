import { randomUUID } from "node:crypto";

/**
 * Push subscription upsert used by db.js.
 * Same endpoint cannot be reassigned to another user_id.
 */
export function upsertPushSubscriptionRecord(database, {
  userId,
  subscription,
  preferences = {},
  id,
  timestamp,
} = {}) {
  const endpoint = String(subscription?.endpoint || "");
  if (!endpoint) throw new Error("В push-подписке отсутствует endpoint.");
  const updatedAt = timestamp || new Date().toISOString();
  const existing = database.prepare(
    `SELECT id, user_id, created_at FROM push_subscriptions WHERE endpoint = ?`
  ).get(endpoint);
  if (existing && String(existing.user_id) !== String(userId)) {
    const error = new Error("Этот канал уведомлений уже привязан к другому пользователю.");
    error.code = "PUSH_ENDPOINT_OWNERSHIP_CONFLICT";
    error.status = 409;
    throw error;
  }
  const rowId = existing?.id || id || randomUUID();
  const createdAt = existing?.created_at || updatedAt;
  const result = database.prepare(`
    INSERT INTO push_subscriptions(
      id, user_id, endpoint, subscription_json, order_events, promotions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      subscription_json = excluded.subscription_json,
      order_events = excluded.order_events,
      promotions = excluded.promotions,
      updated_at = excluded.updated_at
    WHERE push_subscriptions.user_id = excluded.user_id
  `).run(
    rowId,
    String(userId),
    endpoint,
    JSON.stringify(subscription),
    1,
    preferences.promotions ? 1 : 0,
    createdAt,
    updatedAt
  );
  if (!result.changes) {
    const error = new Error("Этот канал уведомлений уже привязан к другому пользователю.");
    error.code = "PUSH_ENDPOINT_OWNERSHIP_CONFLICT";
    error.status = 409;
    throw error;
  }
  return {
    id: rowId,
    endpoint,
    orderEvents: true,
    promotions: Boolean(preferences.promotions),
  };
}
