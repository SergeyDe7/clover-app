import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temp = mkdtempSync(path.join(tmpdir(), "clover-manager-notifications-"));
process.env.DB_PATH = path.join(temp, "clover.sqlite");
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
process.env.SMTP_HOST = "";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";

let databaseModule;

try {
  const db = await import("../src/db.js");
  databaseModule = db;
  const { notifyManagers, publicManagerNotificationStatus } = await import("../src/managerNotifications.js");
  db.setGlobalState("settings", {
    managerNotificationsEnabled: true,
    managerNotifyNewOrders: true,
    managerNotifyEmail: false,
    managerNotifyTelegram: false,
    managerNotifyPush: false,
  });

  const first = await notifyManagers({
    type: "new_order",
    title: "Новый заказ №TEST-1",
    body: "Тестовый клиент · 2 поз.",
    sourceId: "TEST-1",
    url: "/?managerTab=orders&order=TEST-1",
  });
  if (!first.created) throw new Error("Первое уведомление не создано.");

  const duplicate = await notifyManagers({
    type: "new_order",
    title: "Дубликат",
    sourceId: "TEST-1",
  });
  if (!duplicate.duplicate) throw new Error("Дубликат уведомления не отфильтрован.");

  const notifications = db.listManagerNotifications();
  if (notifications.length !== 1 || notifications[0].type !== "new_order") {
    throw new Error("Список уведомлений сформирован неверно.");
  }

  db.markManagerNotificationRead(notifications[0].id);
  if (!db.listManagerNotifications()[0].readAt) {
    throw new Error("Уведомление не отмечено прочитанным.");
  }

  const orderA = "ORDER-A";
  const orderB = "ORDER-B";
  await notifyManagers({
    type: "new_order",
    title: "Новый заказ A",
    sourceId: orderA,
    url: `/?managerTab=orders&order=${orderA}`,
  });
  await notifyManagers({
    type: "order_changed",
    title: "Изменён заказ A",
    sourceId: `${orderA}:hash1`,
    url: `/?managerTab=orders&order=${orderA}`,
  });
  await notifyManagers({
    type: "new_order",
    title: "Новый заказ B",
    sourceId: orderB,
    url: `/?managerTab=orders&order=${orderB}`,
  });

  const cleared = db.markManagerNotificationsReadForOrder(orderA);
  if (cleared.changed !== 2) {
    throw new Error(`Ожидали очистить 2 уведомления по заказу A, получили ${cleared.changed}.`);
  }
  const afterClear = db.listManagerNotifications({ unreadOnly: true });
  const unreadSources = afterClear.map((item) => item.sourceId).sort();
  if (unreadSources.join(",") !== orderB) {
    throw new Error(`После очистки заказа A непрочитанными должны остаться только ${orderB}, получили: ${unreadSources.join(",") || "(пусто)"}`);
  }

  const snapshot = db.exportDatabaseSnapshot();
  if (!Array.isArray(snapshot.managerNotifications) || snapshot.managerNotifications.length < 1) {
    throw new Error("Уведомления не вошли в резервную копию базы.");
  }

  db.importDatabaseSnapshot(snapshot);
  if (db.listManagerNotifications().length < 1) {
    throw new Error("Уведомления не восстановились из резервной копии.");
  }

  const status = publicManagerNotificationStatus();
  if (!status.inApp.enabled || status.email.configured || status.telegram.configured) {
    throw new Error("Публичный статус каналов сформирован неверно.");
  }

  console.log("Manager notifications verified: in-app, dedupe, read state, clear-on-order, backup/restore, channel status.");
} finally {
  // Windows can keep SQLite/WAL files locked briefly after the test.
  // Close the database explicitly and never fail a successful functional test
  // only because its disposable temporary folder cannot be removed immediately.
  try {
    databaseModule?.db?.close?.();
  } catch (error) {
    console.warn(`Temporary verification database close warning: ${error?.message || error}`);
  }

  try {
    rmSync(temp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    });
  } catch (error) {
    console.warn(
      `Temporary verification folder cleanup deferred: ${error?.code || "ERROR"} ${error?.message || error}`
    );
  }
}
