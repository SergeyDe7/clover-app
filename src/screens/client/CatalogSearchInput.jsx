import { useEffect, useRef, useState } from "react";

/**
 * Поиск каталога: на телефоне не даём iOS/PWA сразу фокусировать поле
 * и открывать клавиатуру при старте ЛК — только после явного тапа.
 */
export function CatalogSearchInput({
  value,
  onChange,
  placeholder = "Поиск по названию или коду",
  className = "catalog-search",
}) {
  const inputRef = useRef(null);
  const armedRef = useRef(false);
  const [armed, setArmed] = useState(false);

  const arm = () => {
    if (armedRef.current) return;
    armedRef.current = true;
    setArmed(true);
  };

  useEffect(() => {
    const blockAutofocus = () => {
      const el = inputRef.current;
      if (!el || armedRef.current) return;
      if (document.activeElement === el) el.blur();
    };
    blockAutofocus();
    const t0 = window.setTimeout(blockAutofocus, 0);
    const t1 = window.setTimeout(blockAutofocus, 250);
    window.addEventListener("pageshow", blockAutofocus);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.removeEventListener("pageshow", blockAutofocus);
    };
  }, []);

  return (
    <input
      ref={inputRef}
      className={className}
      type="search"
      inputMode="search"
      enterKeyHint="search"
      autoFocus={false}
      autoComplete="off"
      readOnly={!armed}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onPointerDown={arm}
      onTouchStart={arm}
      onFocus={(event) => {
        if (!armedRef.current) {
          event.target.blur();
        }
      }}
    />
  );
}
