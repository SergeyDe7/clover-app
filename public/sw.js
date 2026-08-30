/* Build stamps CACHE_NAME via vite (clover-ui-build-tag). Do not hardcode forever. */
const CACHE_NAME = "clover-shell-%CLOVER_UI_BUILD%";
const SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/clover-logo.png",
];

async function applyPushBadge(data) {
  if (!self.registration?.setAppBadge) return;
  const raw = data?.badgeCount;
  if (raw === undefined || raw === null || raw === "") return;
  const count = Math.max(0, Math.floor(Number(raw) || 0));
  try {
    if (count > 0) {
      await self.registration.setAppBadge(count);
    } else if (self.registration.clearAppBadge) {
      await self.registration.clearAppBadge();
    }
  } catch {
    // Badging API недоступен на этой платформе.
  }
}

function isApiOrUpload(path) {
  return path.startsWith("/api/") || path.startsWith("/uploads/");
}

function isNavigationRequest(request, path) {
  return (
    request.mode === "navigate" ||
    path === "/" ||
    path === "/index.html" ||
    request.destination === "document"
  );
}

function isHashedAsset(path) {
  return path.startsWith("/assets/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  const path = new URL(request.url).pathname;

  // Never cache API / uploads (login, bootstrap, etc.).
  if (isApiOrUpload(path)) return;

  // SW script itself: always network, never HTTP-cache.
  if (path === "/sw.js") {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  // HTML shell / SPA navigations: network-first with no-store so PWA cannot stick on old index.html.
  if (isNavigationRequest(request, path)) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => response)
        .catch(async () => (await caches.match("/offline.html")) || Response.error())
    );
    return;
  }

  // Hashed build assets: cache-first (filename changes every build).
  if (isHashedAsset(path)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // Other same-origin static (icons, fonts, manifest): network, refresh SHELL entries in cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && SHELL.includes(path)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return Response.error();
      })
  );
});

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || "" };
  }
  const title = data.title || "Clover";
  const options = {
    body: data.body || "Новое уведомление",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "clover-notification",
    data: { url: data.url || "/lk/", badgeCount: data.badgeCount },
  };
  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), applyPushBadge(data)])
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const registration = self.registration;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription && event.oldSubscription?.options) {
        try {
          subscription = await registration.pushManager.subscribe(event.oldSubscription.options);
        } catch {
          subscription = null;
        }
      }
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const payload = subscription
        ? { type: "clover-push-subscription", subscription: subscription.toJSON() }
        : { type: "clover-push-resync" };
      for (const client of windows) {
        client.postMessage(payload);
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/lk/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    })
  );
});
