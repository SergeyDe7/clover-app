import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/clover-theme.css'
import App from './App.jsx'
import { AppModalHost } from './shared/AppModal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      <AppModalHost />
      <App />
    </>
  </StrictMode>,
)

const CLOVER_UI_BUILD = "ui-20260802-v55";
const BOOT_SPLASH_MS = 1000;

function hideBootSplash() {
  const splash = document.getElementById("clover-boot-splash");
  if (!splash || splash.dataset.done === "1") return;
  splash.dataset.done = "1";
  splash.classList.add("is-done");
  window.setTimeout(() => {
    splash.remove();
  }, 420);
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
