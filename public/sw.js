const CACHE_NAME = "clover-v18-shell-v187-lint";
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

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/") || path.startsWith("/uploads/")) return;

  // HTML навигация и hashed assets — только сеть (иначе stale HTML → чужие css/js → голый текст).
  if (request.mode === "navigate" || path === "/" || path.startsWith("/assets/")) {
    event.respondWith(
      fetch(request).catch(async () => {
        if (request.mode === "navigate") {
          return (
            (await caches.match("/offline.html"))
            || Response.error()
          );
        }
        return Response.error();
      })
    );
    return;
  }

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
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "" }; }
  const title = data.title || "Clover";
  const options = {
    body: data.body || "Новое уведомление",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "clover-notification",
    data: { url: data.url || "/lk/", badgeCount: data.badgeCount },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      applyPushBadge(data),
    ])
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
