/** Один сплошной цвет под status bar + экран (без градиента = без шва). */
export const CLOVER_AMBIENT_COLOR = "#d2e8cb";
export const CLOVER_AMBIENT_BG = "#d2e8cb";

export const THANKYOU_SCREEN_COLOR = CLOVER_AMBIENT_COLOR;
export const THANKYOU_SCREEN_BG = CLOVER_AMBIENT_BG;

/**
 * Пока открыта анимация: html/body/theme-color/оверлей — один hex.
 */
export function lockThankYouScreen(active, elementRef) {
  if (!active || typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  const html = document.documentElement;
  const body = document.body;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const previous = {
    htmlBackground: html.style.background,
    htmlBackgroundColor: html.style.backgroundColor,
    bodyBackground: body.style.background,
    bodyBackgroundColor: body.style.backgroundColor,
    themeColor: themeMeta?.getAttribute("content") || "",
  };

  html.style.background = CLOVER_AMBIENT_BG;
  html.style.backgroundColor = CLOVER_AMBIENT_COLOR;
  body.style.background = CLOVER_AMBIENT_BG;
  body.style.backgroundColor = CLOVER_AMBIENT_COLOR;
  if (themeMeta) themeMeta.setAttribute("content", CLOVER_AMBIENT_COLOR);

  const syncSize = () => {
    const el = elementRef?.current;
    if (!el) return;
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.right = "0";
    el.style.bottom = "0";
    el.style.left = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.minWidth = "100%";
    el.style.minHeight = "100%";
    el.style.minHeight = "100dvh";
    el.style.minHeight = "100lvh";
    el.style.margin = "0";
    el.style.padding = "0";
    el.style.boxSizing = "border-box";
    el.style.background = CLOVER_AMBIENT_BG;
    el.style.backgroundColor = CLOVER_AMBIENT_COLOR;
  };

  syncSize();
  const raf = window.requestAnimationFrame(syncSize);
  window.addEventListener("resize", syncSize);
  window.addEventListener("orientationchange", syncSize);

  return () => {
    window.cancelAnimationFrame(raf);
    window.removeEventListener("resize", syncSize);
    window.removeEventListener("orientationchange", syncSize);
    html.style.background = previous.htmlBackground;
    html.style.backgroundColor = previous.htmlBackgroundColor;
    body.style.background = previous.bodyBackground;
    body.style.backgroundColor = previous.bodyBackgroundColor;
    if (themeMeta) {
      themeMeta.setAttribute("content", previous.themeColor || "#f4f8f2");
    }
  };
}
