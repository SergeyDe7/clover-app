import {
  deletePushSubscription,
  listPushSubscriptions,
} from "./db.js";

function config() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "mailto:admin@localhost").trim();
  return {
    enabled: Boolean(publicKey && privateKey && subject),
    publicKey,
    privateKey,
    subject,
  };
}

export function publicPushStatus() {
  const current = config();
  return {
    enabled: current.enabled,
    publicKey: current.enabled ? current.publicKey : "",
  };
}

async function loadWebPush() {
  const current = config();
  if (!current.enabled) return null;
  const { default: webpush } = await import("web-push");
  webpush.setVapidDetails(current.subject, current.publicKey, current.privateKey);
  return webpush;
}

export async function sendPushToSubscriptions(subscriptions, payload) {
  const webpush = await loadWebPush();
  if (!webpush) return { enabled: false, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const item of subscriptions) {
    try {
      await webpush.sendNotification(item.subscription, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency: "normal",
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      if ([404, 410].includes(Number(error?.statusCode))) {
        deletePushSubscription(item.userId, item.endpoint);
      } else {
        console.error("Push notification error", error?.message || error);
      }
    }
  }
  return { enabled: true, sent, failed };
}

function cabinetPathPrefix() {
  let path = String(process.env.CABINET_PATH || "/lk").trim();
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/$/, "") || "/lk";
}

function toCabinetRelativeUrl(url) {
  const cabinetPath = cabinetPathPrefix();
  const path = String(url || "/").startsWith("/") ? String(url || "/") : `/${url}`;
  if (path === cabinetPath || path.startsWith(`${cabinetPath}/`)) return path;
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

export function sendOrderPush(userId, payload) {
  const subscriptions = listPushSubscriptions(userId, "orders").filter(
    (item) => item.orderEvents
  );
  const next = {
    ...payload,
    url: toCabinetRelativeUrl(payload?.url || "/lk/"),
  };
  return sendPushToSubscriptions(subscriptions, next);
}

export function sendPromotionPush(payload) {
  const subscriptions = listPushSubscriptions(null, "promotions");
  const next = {
    ...payload,
    url: toCabinetRelativeUrl(payload?.url || "/lk/?section=promotions"),
  };
  return sendPushToSubscriptions(subscriptions, next);
}
