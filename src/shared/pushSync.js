import { api } from "../serverApi";

export function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Синхронизирует браузерную push-подписку с сервером после обновления SW/PWA.
 */
export async function syncPushSubscription(preferences = {}) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { synced: false, reason: "unsupported" };
  }

  let status;
  try {
    status = await api.getPushStatus();
  } catch {
    return { synced: false, reason: "status_error" };
  }

  if (!status?.enabled) return { synced: false, reason: "disabled" };
  if (Notification.permission !== "granted") return { synced: false, reason: "denied" };

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const serverSubs = status.subscriptions || [];
  const serverEndpoints = new Set(serverSubs.map((item) => item.endpoint));
  const saved = subscription
    ? serverSubs.find((item) => item.endpoint === subscription.endpoint)
    : null;
  const promotions =
    preferences.promotions ?? saved?.promotions ?? false;

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    });
  }

  if (!serverEndpoints.has(subscription.endpoint)) {
    await api.subscribePush(subscription.toJSON(), {
      orderEvents: true,
      promotions,
    });
    return { synced: true, reason: "registered", endpoint: subscription.endpoint };
  }

  return { synced: true, reason: "ok", endpoint: subscription.endpoint };
}

export function installPushSyncListeners(callback) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }

  const onMessage = (event) => {
    const data = event.data || {};
    if (data.type === "clover-push-subscription" && data.subscription) {
      void (async () => {
        try {
          await api.subscribePush(data.subscription, {
            orderEvents: true,
            promotions: Boolean(data.promotions),
          });
          callback?.({ synced: true, reason: "sw_resubscribe" });
        } catch {
          callback?.({ synced: false, reason: "sw_resubscribe_failed" });
        }
      })();
      return;
    }
    if (data.type === "clover-push-resync") {
      void syncPushSubscription().then((result) => callback?.(result));
    }
  };

  const onSwReady = () => {
    void syncPushSubscription().then((result) => callback?.(result));
  };

  navigator.serviceWorker.addEventListener("message", onMessage);
  window.addEventListener("clover-sw-ready", onSwReady);

  return () => {
    navigator.serviceWorker.removeEventListener("message", onMessage);
    window.removeEventListener("clover-sw-ready", onSwReady);
  };
}
