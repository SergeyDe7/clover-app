import { api } from "../serverApi";

/** Bound wait for serviceWorker.ready so push resync cannot hang app recovery. */
export const PUSH_READY_TIMEOUT_MS = 4000;

let pushSyncInFlight = null;

export function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Race a promise against a timeout. Always clears the timer.
 * Resolves with { timedOut:true } on timeout (never rejects from the timer).
 */
export function withBoundedReady(promise, timeoutMs = PUSH_READY_TIMEOUT_MS) {
  let timer = null;
  let settled = false;
  return new Promise((resolve) => {
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      resolve(payload);
    };
    timer = setTimeout(() => {
      timer = null;
      finish({ timedOut: true, value: null, error: null });
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => finish({ timedOut: false, value, error: null }),
      (error) => finish({ timedOut: false, value: null, error })
    );
  });
}

async function syncPushSubscriptionOnce(preferences = {}) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { synced: false, reason: "unsupported" };
  }

  // Lifecycle / automatic resync must never call Notification.requestPermission().
  if (Notification.permission !== "granted") {
    return { synced: false, reason: "denied" };
  }

  let status;
  try {
    status = await api.getPushStatus();
  } catch {
    return { synced: false, reason: "status_error" };
  }

  if (!status?.enabled) return { synced: false, reason: "disabled" };

  const ready = await withBoundedReady(navigator.serviceWorker.ready);
  if (ready.timedOut) {
    return { synced: false, reason: "ready_timeout" };
  }
  if (ready.error || !ready.value) {
    return {
      synced: false,
      reason: "ready_error",
      error: String(ready.error?.message || ready.error || "ready_failed"),
    };
  }

  const registration = ready.value;
  let subscription;
  try {
    subscription = await registration.pushManager.getSubscription();
  } catch (error) {
    return {
      synced: false,
      reason: "subscription_read_error",
      error: String(error?.message || error),
    };
  }

  const serverSubs = status.subscriptions || [];
  const saved = subscription
    ? serverSubs.find((item) => item.endpoint === subscription.endpoint)
    : null;
  const promotions = preferences.promotions ?? saved?.promotions ?? false;

  try {
    if (!subscription) {
      // Permission already granted — subscribe does not open a permission prompt.
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.publicKey),
      });
    }

    // Always upsert: after SW unregister/rebuild the browser may keep permission
    // but lose PushManager state / server may still hold a dead endpoint.
    const wasMissing = !serverSubs.some(
      (item) => item.endpoint === subscription.endpoint
    );
    await api.subscribePush(subscription.toJSON(), {
      orderEvents: true,
      promotions,
    });
    return {
      synced: true,
      reason: wasMissing ? "registered" : "ok",
      endpoint: subscription.endpoint,
    };
  } catch (error) {
    return {
      synced: false,
      reason: "sync_error",
      error: String(error?.message || error),
    };
  }
}

/**
 * Синхронизирует браузерную push-подписку с сервером после обновления SW/PWA.
 * Single-flight: concurrent callers share one in-flight operation.
 * Failures return structured results — they do not throw into App root.
 */
export function syncPushSubscription(preferences = {}) {
  if (pushSyncInFlight) {
    return pushSyncInFlight;
  }
  pushSyncInFlight = syncPushSubscriptionOnce(preferences).finally(() => {
    pushSyncInFlight = null;
  });
  return pushSyncInFlight;
}

function runLifecycleSync(callback) {
  // Fire-and-forget: contain rejections so App/root never sees them.
  void syncPushSubscription()
    .then((result) => {
      callback?.(result);
    })
    .catch(() => {
      callback?.({ synced: false, reason: "unhandled_sync_error" });
    });
}

/**
 * Session lifecycle + SW message hooks for push resync.
 * Automatic paths never request Notification permission.
 */
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
      runLifecycleSync(callback);
    }
  };

  const onSwReady = () => {
    runLifecycleSync(callback);
  };

  const onPageShow = () => {
    runLifecycleSync(callback);
  };

  const onOnline = () => {
    runLifecycleSync(callback);
  };

  const onFocus = () => {
    runLifecycleSync(callback);
  };

  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    runLifecycleSync(callback);
  };

  navigator.serviceWorker.addEventListener("message", onMessage);
  window.addEventListener("clover-sw-ready", onSwReady);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("visibilitychange", onVisibility);

  return () => {
    navigator.serviceWorker.removeEventListener("message", onMessage);
    window.removeEventListener("clover-sw-ready", onSwReady);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("visibilitychange", onVisibility);
  };
}
