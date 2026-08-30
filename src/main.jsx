import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/clover-theme.css";
import { AppModalHost } from "./shared/AppModal.jsx";
import { shouldRenderStorefront } from "./screens/storefront/mode.js";

// Витрина и ЛК — разные чанки: на витрине не тянем админку/клиентский кабинет.
const StorefrontApp = lazy(() => import("./screens/storefront/StorefrontApp.jsx"));
const App = lazy(() => import("./App.jsx"));

/** Reactive shell: storefront ↔ /lk without full document reload (no re-boot splash). */
function RootShell() {
  const [storefront, setStorefront] = useState(() => shouldRenderStorefront());
  useEffect(() => {
    const sync = () => setStorefront(shouldRenderStorefront());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return (
    <>
      {!storefront ? <AppModalHost /> : null}
      <Suspense fallback={null}>
        {storefront ? <StorefrontApp /> : <App />}
      </Suspense>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RootShell />
  </StrictMode>
);

const CLOVER_UI_BUILD =
  document.querySelector('meta[name="clover-ui-build"]')?.getAttribute("content")?.trim() ||
  "ui-dev";
const BOOT_SPLASH_MS = 450;
const APP_THEME_COLOR = "#f4f8f2";
const STOREFRONT_THEME_COLOR = "#f3f2ee";
const VIEWPORT_BASE = "width=device-width, initial-scale=1.0, viewport-fit=cover";

function setThemeColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
}

/** После правки текста на iPhone сбрасывает «залипший» зум страницы. */
function resetMobileViewportZoom() {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  const scaled = vv && Math.abs((vv.scale || 1) - 1) > 0.02;
  if (!scaled) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  meta.setAttribute("content", `${VIEWPORT_BASE}, maximum-scale=1.0`);
  window.setTimeout(() => {
    meta.setAttribute("content", VIEWPORT_BASE);
  }, 80);
}

function installMobileInputZoomReset() {
  document.addEventListener(
    "focusout",
    (event) => {
      const target = event.target;
      if (!target || !/^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName || "")) return;
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active && /^(INPUT|TEXTAREA|SELECT)$/i.test(active.tagName || "")) return;
        resetMobileViewportZoom();
      }, 120);
    },
    true
  );
}

installMobileInputZoomReset();

function hideBootSplash() {
  const splash = document.getElementById("clover-boot-splash");
  if (!splash || splash.dataset.done === "1") return;
  splash.dataset.done = "1";
  splash.classList.add("is-done");
  // После splash: ЛК — зелёный кабинет, витрина — свой бежевый фон.
  // Иначе телефон заливает витрину цветом ЛК (#f4f8f2), а компьютер остаётся #f3f2ee.
  const shellColor = shouldRenderStorefront()
    ? STOREFRONT_THEME_COLOR
    : APP_THEME_COLOR;
  setThemeColor(shellColor);
  document.documentElement.style.backgroundColor = shellColor;
  document.body.style.backgroundColor = shellColor;
  window.setTimeout(() => {
    splash.remove();
  }, 280);
}

function scheduleBootSplashHide(startedAt) {
  const elapsed = Date.now() - startedAt;
  const wait = Math.max(0, BOOT_SPLASH_MS - elapsed);
  window.setTimeout(hideBootSplash, wait);
}

const bootStartedAt = Date.now();
if (document.readyState === "complete") {
  scheduleBootSplashHide(bootStartedAt);
} else {
  window.addEventListener("load", () => scheduleBootSplashHide(bootStartedAt), { once: true });
}

// Как только React нарисовал вход — убираем splash (иначе 2 логотипа на медленной сети)
const rootEl = document.getElementById("root");
if (rootEl) {
  const splashObserver = new MutationObserver(() => {
    if (rootEl.childElementCount > 0) {
      hideBootSplash();
      splashObserver.disconnect();
    }
  });
  splashObserver.observe(rootEl, { childList: true, subtree: true });
  // Страховка: не держать splash дольше 2.5с
  window.setTimeout(() => {
    hideBootSplash();
    splashObserver.disconnect();
  }, 2500);
}

async function registerCloverServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    // updateViaCache:'none' — не брать sw.js из HTTP-кэша браузера (критично для установленной PWA).
    const registration = await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });
    registration.update().catch(() => undefined);

    // Reload once when a new SW takes control (after skipWaiting), not on first install.
    if (!window.__cloverSwControllerHooked) {
      window.__cloverSwControllerHooked = true;
      window.__cloverHadSwControllerAtStart = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!window.__cloverHadSwControllerAtStart) return;
        if (sessionStorage.getItem("clover-sw-controller-reload") === "1") return;
        sessionStorage.setItem("clover-sw-controller-reload", "1");
        window.location.reload();
      });
    }

    window.dispatchEvent(new CustomEvent("clover-sw-ready"));
  } catch (error) {
    console.error("Не удалось зарегистрировать PWA Clover", error);
  }
}

/**
 * Single build-guard (not duplicated in index.html):
 * - first visit / same build: register + update check
 * - new build: clear SW+caches once, one reload, then persist hash
 * - reloading flag prevents loops
 */
async function refreshServiceWorkerIfNeeded() {
  const previous = localStorage.getItem("clover-ui-build");
  const reloading = sessionStorage.getItem("clover-ui-reloading");

  if (reloading === CLOVER_UI_BUILD) {
    localStorage.setItem("clover-ui-build", CLOVER_UI_BUILD);
    sessionStorage.removeItem("clover-ui-reloading");
    sessionStorage.removeItem("clover-sw-controller-reload");
    await registerCloverServiceWorker();
    return;
  }

  if (!previous || previous === CLOVER_UI_BUILD) {
    if (!previous) localStorage.setItem("clover-ui-build", CLOVER_UI_BUILD);
    await registerCloverServiceWorker();
    return;
  }

  // New UI build: one controlled reload after cache drop.
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.error("Не удалось сбросить кэш PWA Clover", error);
  }
  sessionStorage.setItem("clover-ui-reloading", CLOVER_UI_BUILD);
  window.location.reload();
}

window.addEventListener("load", () => {
  void refreshServiceWorkerIfNeeded();
});
// Also re-check SW when a standalone PWA returns to foreground.
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistration().then((registration) => {
    registration?.update?.().catch(() => undefined);
  });
});
