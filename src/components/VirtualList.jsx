import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Простая windowing-виртуализация без внешних зависимостей.
 * Рендерит только видимый диапазон + overscan.
 */
export function VirtualList({
  items = [],
  itemHeight = 88,
  height = 480,
  overscan = 6,
  className = "",
  style = {},
  getItemKey = (item, index) => item?.id ?? index,
  renderItem,
}) {
  const list = Array.isArray(items) ? items : [];
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef(null);

  const rowHeight = Math.max(24, Number(itemHeight) || 88);
  const viewportHeight = Math.max(120, Number(height) || 480);
  const totalHeight = list.length * rowHeight;

  const { start, end } = useMemo(() => {
    const rawStart = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.ceil(viewportHeight / rowHeight);
    const startIndex = Math.max(0, rawStart - overscan);
    const endIndex = Math.min(list.length, rawStart + visibleCount + overscan);
    return { start: startIndex, end: endIndex };
  }, [scrollTop, rowHeight, viewportHeight, overscan, list.length]);

  const visible = list.slice(start, end);

  useEffect(() => {
    // Сброс скролла при резком сокращении списка.
    if (scrollTop > totalHeight) {
      setScrollTop(0);
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
    }
  }, [totalHeight, scrollTop]);

  if (!list.length) {
    return null;
  }

  // Короткие списки — без виртуализации (проще DOM / фокус).
  if (list.length <= 40) {
    return (
      <div className={className} style={style}>
        {list.map((item, index) => (
          <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className={className}
      style={{
        ...style,
        height: viewportHeight,
        overflowY: "auto",
        position: "relative",
      }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visible.map((item, localIndex) => {
          const index = start + localIndex;
          return (
            <div
              key={getItemKey(item, index)}
              style={{
                position: "absolute",
                top: index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
                boxSizing: "border-box",
                paddingBottom: 10,
                overflow: "hidden",
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
