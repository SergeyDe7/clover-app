import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/clover-theme.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const CLOVER_UI_BUILD = "ui-20260802-v30";

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

  // Один принудительный reload, чтобы телефон точно взял новый JS/CSS.
  if (previous) {
    window.location.reload();
  }
}

window.addEventListener("load", () => {
  void refreshServiceWorkerIfNeeded();
});
