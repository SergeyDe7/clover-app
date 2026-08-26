import { useEffect } from "react";

/**
 * Правый край колонки товаров: сетка или самая правая карточка.
 * Не опираемся на колонку корзины — только на то, что реально рисует товары.
 */
function measureProductsBox(host) {
  const hostBox = host.getBoundingClientRect();
  let left = hostBox.left;
  let right = hostBox.right;

  const grid = host.querySelector(".product-grid");
  if (grid && grid.offsetParent !== null) {
    const gridBox = grid.getBoundingClientRect();
    left = gridBox.left;
    right = gridBox.right;
    const cards = grid.querySelectorAll(":scope > .product-card, :scope > article");
    for (const card of cards) {
      const cardRight = card.getBoundingClientRect().right;
      if (cardRight > right) right = cardRight;
    }
  }

  return {
    left: Math.max(0, Math.round(left)),
    width: Math.max(0, Math.round(right - left)),
  };
}

/**
 * Фиксирует chrome (поиск/toolbar) под шапкой кабинета.
 * hostRef — панель в потоке страницы (для ширины и spacer-высоты);
 * chromeRef — сам fixed-блок (может быть в portal вне host).
 */
export function useFixedChromeHeight(chromeRef, hostRef, cssVarName, active = true) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;

    let raf = 0;
    let ro = null;

    const apply = () => {
      const el = chromeRef.current;
      const host = hostRef?.current;
      if (!el || !host) return false;

      const { left, width } = measureProductsBox(host);

      // Сначала ширина — иначе высота меряется у «уехавшего» shrink-to-fit блока.
      el.style.setProperty("position", "fixed", "important");
      el.style.setProperty("top", "var(--clover-chrome-offset, 56px)", "important");
      el.style.setProperty("left", `${left}px`, "important");
      el.style.setProperty("width", `${width}px`, "important");
      el.style.setProperty("max-width", `${width}px`, "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("z-index", "40", "important");

      // +12px запас, чтобы тень/паддинг не наезжали на первые карточки.
      const height = Math.ceil(el.getBoundingClientRect().height) + 12;
      host.style.setProperty(cssVarName, `${height}px`);
      return true;
    };

    const arm = () => {
      if (!apply()) {
        raf = window.requestAnimationFrame(arm);
        return;
      }
      ro?.disconnect();
      ro =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
      if (chromeRef.current) ro?.observe(chromeRef.current);
      if (hostRef?.current) {
        ro?.observe(hostRef.current);
        const grid = hostRef.current.querySelector(".product-grid");
        if (grid) ro?.observe(grid);
      }
    };

    arm();
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", apply, true);
    return () => {
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", apply, true);
      const host = hostRef?.current;
      host?.style.removeProperty(cssVarName);
      const el = chromeRef.current;
      if (el) {
        el.style.removeProperty("position");
        el.style.removeProperty("top");
        el.style.removeProperty("left");
        el.style.removeProperty("width");
        el.style.removeProperty("max-width");
        el.style.removeProperty("right");
        el.style.removeProperty("z-index");
      }
    };
  }, [chromeRef, hostRef, cssVarName, active]);
}

const MOBILE_MQ = "(max-width: 820px)";

/** Высота fixed-chrome только на телефоне (каталог «В матрицу»). */
export function useMobileFixedChromeHeight(ref, hostSelector, cssVarName) {
  useEffect(() => {
    if (!hostSelector) return undefined;
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;

    const apply = () => {
      const host = hostSelector ? el.closest(hostSelector) : el.parentElement;
      if (!host) return;
      const mq = window.matchMedia(MOBILE_MQ);
      if (!mq.matches) {
        host.style.removeProperty(cssVarName);
        return;
      }
      host.style.setProperty(
        cssVarName,
        `${Math.ceil(el.getBoundingClientRect().height)}px`
      );
    };

    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    const mq = window.matchMedia(MOBILE_MQ);
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, [ref, hostSelector, cssVarName]);
}
