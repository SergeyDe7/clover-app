/**
 * Цифра на иконке установленного PWA (Badging API).
 * Android Chrome / Windows Edge+Chrome — обычно да; iOS — ограниченно.
 */
export function syncAppBadge(count) {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (value > 0 && typeof navigator.setAppBadge === "function") {
      void navigator.setAppBadge(value);
      return;
    }
    if (typeof navigator.clearAppBadge === "function") {
      void navigator.clearAppBadge();
    }
  } catch {
    // Браузер без поддержки или отказ ОС — не блокируем UI.
  }
}

export function clearAppBadge() {
  syncAppBadge(0);
}
