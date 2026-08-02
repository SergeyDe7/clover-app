/**
 * Lightweight check: unread count for manager badgeCount after notify.
 * VAPID remains off — we only assert unread accounting used for badgeCount.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temp = mkdtempSync(path.join(tmpdir(), "clover-push-badge-"));
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
  const { notifyManagers } = await import("../src/managerNotifications.js");
  db.setGlobalState("settings", {
    managerNotificationsEnabled: true,
    managerNotifyNewOrders: true,
    managerNotifyEmail: false,
    managerNotifyTelegram: false,
    managerNotifyPush: true,
  });

  await notifyManagers({
    type: "new_order",
    title: "Новый заказ №BADGE-1",
    body: "Badge test",
    sourceId: "BADGE-1",
    url: "/?managerTab=orders&order=BADGE-1",
  });
  await notifyManagers({
    type: "new_order",
    title: "Новый заказ №BADGE-2",
    body: "Badge test 2",
    sourceId: "BADGE-2",
    url: "/?managerTab=orders&order=BADGE-2",
  });

  const unread = db.listManagerNotifications({ unreadOnly: true, limit: 500 }).length;
  if (unread !== 2) {
    throw new Error(`Ожидали 2 непрочитанных для badgeCount, получили ${unread}`);
  }

  console.log("verify-push-badge: OK (unread for badgeCount =", unread, ")");
} finally {
  try {
    databaseModule?.db?.close?.();
  } catch (error) {
    console.warn(`Temporary verification database close warning: ${error?.message || error}`);
  }
  try {
    rmSync(temp, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Temporary verification folder cleanup warning: ${error?.message || error}`);
  }
}
