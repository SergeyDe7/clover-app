import {
  createManagerNotification,
  getGlobalState,
  listManagerNotifications,
  listManagerUsers,
  listStaffUsers,
  writeAudit,
} from "./db.js";
import { DEFAULT_SETTINGS } from "./defaults.js";
import {
  publicMailStatus,
  sendCloverMail,
  newOrderManualEmail,
} from "./mailer.js";
import {
  publicPushStatus,
  sendOrderPush,
} from "./push.js";

const EVENT_SETTING = {
  new_order: "managerNotifyNewOrders",
  order_changed: "managerNotifyOrderChanges",
  order_deleted: "managerNotifyOrderChanges",
  custom_item: "managerNotifyCustomItems",
  reconciliation_request: "managerNotifyReconciliation",
  client_registration: "managerNotifyRegistrations",
  onec_error: "managerNotifyOneCErrors",
  test: "managerNotificationsEnabled",
};

function currentSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...(getGlobalState("settings", DEFAULT_SETTINGS) || {}),
  };
}

function emailRecipients(settings) {
  const configured = String(
    settings.managerNotificationEmail ||
    process.env.MANAGER_NOTIFICATION_EMAIL ||
    ""
  )
    .split(/[;,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && value.includes("@") && !value.endsWith(".local"));

  if (configured.length) {
    return [...new Set(configured)];
  }

  return [...new Set(
    listManagerUsers()
      .filter((user) => user.emailVerified && !String(user.email).endsWith(".local"))
      .map((user) => String(user.email || "").trim().toLowerCase())
      .filter(Boolean)
  )];
}

function telegramConfig(settings) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(
    settings.managerTelegramChatId ||
    process.env.TELEGRAM_MANAGER_CHAT_ID ||
    ""
  ).trim();
  return {
    token,
    chatId,
    configured: Boolean(token && chatId),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cabinetPathPrefix() {
  let path = String(process.env.CABINET_PATH || "/lk").trim();
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/$/, "") || "/lk";
}

/** Относительный URL внутри ЛК (для push / in-app), не витрина. */
function toCabinetRelativeUrl(url) {
  const cabinetPath = cabinetPathPrefix();
  const path = String(url || "/").startsWith("/") ? String(url || "/") : `/${url}`;
  if (path === cabinetPath || path.startsWith(`${cabinetPath}/`)) return path;
  // Публичная витрина — не трогаем
  if (
    path === "/vitrina" ||
    path.startsWith("/vitrina/") ||
    path.startsWith("/catalog") ||
    path.startsWith("/product") ||
    path.startsWith("/cart") ||
    path.startsWith("/checkout")
  ) {
    return path;
  }
  return `${cabinetPath}${path === "/" ? "/" : path}`;
}

function publicUrl(notification) {
  const base = String(process.env.CLOVER_PUBLIC_URL || process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (!base || !notification.url) return "";
  const path = toCabinetRelativeUrl(notification.url);
  return `${base}${path}`;
}

async function sendTelegram(notification, settings) {
  const config = telegramConfig(settings);
  if (!config.configured) {
    return { channel: "telegram", sent: false, reason: "telegram_not_configured" };
  }

  const link = publicUrl(notification);
  const text = [
    `🍀 ${notification.title}`,
    notification.body,
    link ? `Открыть Clover: ${link}` : "",
  ].filter(Boolean).join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      return {
        channel: "telegram",
        sent: false,
        reason: "telegram_api_error",
        error: String(result.description || `Telegram HTTP ${response.status}`),
      };
    }
    return { channel: "telegram", sent: true, messageId: result.result?.message_id || "" };
  } catch (error) {
    const message = String(error?.message || error || "fetch failed");
    const unreachable =
      error?.name === "AbortError" ||
      /fetch failed|ETIMEDOUT|ENETUNREACH|ECONNREFUSED|abort/i.test(message);
    return {
      channel: "telegram",
      sent: false,
      reason: unreachable ? "telegram_unreachable" : "telegram_send_failed",
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEmail(notification, settings, event = {}) {
  const recipients = emailRecipients(settings);
  const mailStatus = publicMailStatus();
  if (!mailStatus.configured) {
    return { channel: "email", sent: false, reason: "smtp_not_configured" };
  }
  if (!recipients.length) {
    return { channel: "email", sent: false, reason: "recipient_not_configured" };
  }

  const link = publicUrl(notification);
  let subject = String(event.emailSubject || `Clover: ${notification.title}`);
  let text = String(event.emailText || "");
  let html = String(event.emailHtml || "");

  if (!text || !html) {
    if (notification.type === "new_order" && event.order) {
      const mail = newOrderManualEmail({
        order: event.order,
        customerName: event.customerName || notification.title,
        link,
      });
      subject = mail.subject;
      text = mail.text;
      html = mail.html;
    } else {
      text = [
        notification.title,
        notification.body,
        link ? `Открыть Clover: ${link}` : "",
      ].filter(Boolean).join("\n\n");
      html = [
        `<h2>${escapeHtml(notification.title)}</h2>`,
        notification.body
          ? `<p>${escapeHtml(notification.body).replaceAll("\n", "<br>")}</p>`
          : "",
        link ? `<p><a href="${escapeHtml(link)}">Открыть Clover</a></p>` : "",
      ].filter(Boolean).join("");
    }
  }

  const result = await sendCloverMail({
    to: recipients.join(", "),
    subject,
    text,
    html,
  });
  return { channel: "email", ...result, recipients: recipients.length };
}

async function sendManagerPush(notification, settings) {
  if (settings.managerNotifyPush === false) {
    return { channel: "push", sent: 0, failed: 0, reason: "disabled" };
  }
  // listManagerUsers() — только role=manager; телефон подписан как admin,
  // поэтому push уходил в no_push_subscription. Берём staff (manager+admin),
  // клиентов listStaffUsers не возвращает. listManagerUsers не меняем:
  // он ещё нужен для email-fallback.
  const managers = listStaffUsers();
  const badgeCount = listManagerNotifications({ unreadOnly: true, limit: 500 }).length;
  const results = await Promise.all(
    managers.map((manager) => sendOrderPush(manager.id, {
      title: notification.title,
      body: notification.body,
      url: toCabinetRelativeUrl(notification.url || "/?section=manager-notifications"),
      tag: `manager-${notification.type}-${notification.sourceId || notification.id}`,
      badgeCount,
    }))
  );
  return {
    channel: "push",
    enabled: results.some((item) => item.enabled),
    sent: results.reduce((sum, item) => sum + Number(item.sent || 0), 0),
    failed: results.reduce((sum, item) => sum + Number(item.failed || 0), 0),
    reason: results.every((item) => !item.enabled)
      ? "push_not_configured"
      : results.reduce((sum, item) => sum + Number(item.sent || 0), 0) > 0
        ? ""
        : "no_push_subscription",
  };
}

export function publicManagerNotificationStatus(settings = currentSettings()) {
  const mail = publicMailStatus();
  const telegram = telegramConfig(settings);
  const push = publicPushStatus();
  return {
    inApp: { enabled: settings.managerNotificationsEnabled !== false },
    email: {
      enabled: Boolean(settings.managerNotifyEmail),
      configured: Boolean(mail.configured && emailRecipients(settings).length),
      smtpConfigured: Boolean(mail.configured),
      recipientConfigured: Boolean(emailRecipients(settings).length),
      recipient: String(settings.managerNotificationEmail || process.env.MANAGER_NOTIFICATION_EMAIL || ""),
    },
    telegram: {
      enabled: Boolean(settings.managerNotifyTelegram),
      configured: telegram.configured,
      tokenConfigured: Boolean(telegram.token),
      chatConfigured: Boolean(telegram.chatId),
      chatId: telegram.chatId ? `${telegram.chatId.slice(0, 4)}…${telegram.chatId.slice(-3)}` : "",
    },
    push: {
      enabled: settings.managerNotifyPush !== false,
      configured: Boolean(push.enabled),
    },
  };
}

export async function notifyManagers(event = {}) {
  const settings = currentSettings();
  const type = String(event.type || "general");
  const eventSetting = EVENT_SETTING[type];
  if (settings.managerNotificationsEnabled === false) {
    return { created: false, skipped: "notifications_disabled" };
  }
  if (eventSetting && settings[eventSetting] === false) {
    return { created: false, skipped: "event_disabled" };
  }

  const created = createManagerNotification({
    type,
    title: event.title,
    body: event.body,
    url: event.url,
    sourceId: event.sourceId,
  });
  if (!created.created) {
    return { ...created, delivery: [], duplicate: true };
  }

  const notification = created.notification;
  const tasks = [];
  if (settings.managerNotifyEmail) {
    tasks.push(sendEmail(notification, settings, event));
  }
  if (settings.managerNotifyTelegram) {
    tasks.push(sendTelegram(notification, settings));
  }
  if (settings.managerNotifyPush !== false) {
    tasks.push(sendManagerPush(notification, settings));
  }

  const settled = await Promise.allSettled(tasks);
  const delivery = settled.map((item) => item.status === "fulfilled"
    ? item.value
    : {
      channel: "unknown",
      sent: false,
      error: String(item.reason?.message || item.reason || "Ошибка отправки"),
    }
  );

  writeAudit({
    action: "manager.notification",
    details: {
      notificationId: notification.id,
      type: notification.type,
      sourceId: notification.sourceId,
      delivery: delivery.map((item) => ({
        channel: item.channel || "unknown",
        sent: item.sent,
        failed: item.failed,
        reason: item.reason || "",
        error: item.error || "",
      })),
    },
  });

  return { ...created, delivery };
}
