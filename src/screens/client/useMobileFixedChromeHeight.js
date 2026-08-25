import { useEffect } from "react";

const MOBILE_MQ = "(max-width: 820px)";

/** Задаёт высоту fixed-блока (поиск + категории) на телефоне для spacer под контент. */
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
