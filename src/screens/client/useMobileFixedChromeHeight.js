import { useEffect, useLayoutEffect } from "react";

/**
 * Правый край колонки товаров: сетка или самая правая карточка.
 * Для shell ЛК (.lk-order-catalog) — ширина всей колонки (4 карточки).
 */
function measureProductsBox(host) {
  const hostBox = host.getBoundingClientRect();
  if (
    host.classList?.contains("lk-order-catalog") ||
    host.classList?.contains("catalog-main")
  ) {
    return {
      left: Math.max(0, Math.round(hostBox.left)),
      width: Math.max(0, Math.round(hostBox.width)),
    };
  }

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
  useLayoutEffect(() => {
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

      // Spacer только на зону перекрытия: колонка уже ниже шапки, полная высота
      // тулбара давала лишнюю пустоту над карточками.
      const toolbarRect = el.getBoundingClientRect();
      const hostTopDoc = host.getBoundingClientRect().top + window.scrollY;
      const alreadyBelow = hostTopDoc - toolbarRect.top;
      const height = Math.max(
        0,
        Math.ceil(toolbarRect.height - Math.max(0, alreadyBelow))
      );
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
    // scroll на mobile даёт layout thrash у края страницы — не слушаем.
    const onScroll = () => {
      if (window.matchMedia("(max-width: 820px)").matches) return;
      apply();
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", onScroll, true);
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
