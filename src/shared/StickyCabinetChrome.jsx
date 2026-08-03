import { useEffect, useRef } from "react";

/**
 * Непрозрачная шапка кабинета: логотип/поиск + вкладки.
 * Всегда сверху; страница уходит под блок и не просвечивает.
 */
export function StickyCabinetChrome({ children, className = "" }) {
  const chromeRef = useRef(null);

  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return undefined;

    const apply = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      const host = el.closest(".clover-app") || document.documentElement;
      host.style.setProperty("--clover-chrome-offset", `${height}px`);
      host.style.setProperty("--clover-header-offset", `${height}px`);
      document.documentElement.style.setProperty("--clover-chrome-offset", `${height}px`);
    };

    apply();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    observer?.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [children]);

  return (
    <>
      <div
        ref={chromeRef}
        className={`app-top-chrome${className ? ` ${className}` : ""}`}
      >
        {children}
      </div>
      <div className="app-top-chrome-spacer" aria-hidden="true" />
    </>
  );
}
