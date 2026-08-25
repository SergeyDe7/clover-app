import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/clover-theme.css'
import App from './App.jsx'
import { AppModalHost } from './shared/AppModal.jsx'
import StorefrontApp from './screens/storefront/StorefrontApp.jsx'
import { shouldRenderStorefront } from './screens/storefront/mode.js'

// Витрина: хост витрины (/) или превью /vitrina. ЛК: /lk (и localhost без store-хоста).
const storefront = shouldRenderStorefront()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      {!storefront ? <AppModalHost /> : null}
      {storefront ? <StorefrontApp /> : <App />}
    </>
  </StrictMode>,
)

const CLOVER_UI_BUILD = "ui-20260825-v270-sf";
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
  const shellColor = storefront ? STOREFRONT_THEME_COLOR : APP_THEME_COLOR;
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

async function refreshServiceWorkerIfNeeded() {
  if (!("serviceWorker" in navigator)) return;
  const previous = localStorage.getItem("clover-ui-build");
  if (previous === CLOVER_UI_BUILD) {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Не удалось зарегистрировать PWA Clover", error);
    });
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.error("Не удалось сбросить кэш PWA Clover", error);
  }

  localStorage.setItem("clover-ui-build", CLOVER_UI_BUILD);
  await navigator.serviceWorker.register(`/sw.js?v=${CLOVER_UI_BUILD}`).catch((error) => {
    console.error("Не удалось зарегистрировать PWA Clover", error);
  });

  // Не silent reload: App показывает SoftBanner «Обновить».
  if (previous) {
    window.dispatchEvent(new CustomEvent("clover:update-available"));
  }
}

window.addEventListener("load", () => {
  void refreshServiceWorkerIfNeeded();
});
