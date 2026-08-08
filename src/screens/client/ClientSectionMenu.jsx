import { useEffect, useRef, useState } from "react";

/**
 * Одна кнопка разделов ЛК клиента: Заказ / Мои заказы / Акт сверки / Настройки.
 */
export function ClientSectionMenu({
  tabs,
  activeId,
  onSelect,
  ordersBadge = 0,
  actsBadge = 0,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const active = tabs.find(([id]) => id === activeId) || tabs[0];
  const activeLabel = active?.[1] || "Меню";
  const totalBadge = Number(ordersBadge) + Number(actsBadge);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={open ? "client-section-menu open" : "client-section-menu"}
    >
      <button
        className="client-section-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="client-section-menu-label">{activeLabel}</span>
        <span
          className={
            totalBadge > 0
              ? "client-section-menu-badge"
              : "client-section-menu-badge is-empty"
          }
          aria-hidden="true"
        >
          {totalBadge > 0 ? (totalBadge > 99 ? "99+" : totalBadge) : ""}
        </span>
        <span className="client-section-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="client-section-menu-panel" role="menu">
          {tabs.map(([id, label]) => {
            const badge =
              id === "orders"
                ? ordersBadge
                : id === "reconciliation"
                  ? actsBadge
                  : 0;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className={
                  id === activeId
                    ? "client-section-menu-item active"
                    : "client-section-menu-item"
                }
                onClick={() => {
                  onSelect(id);
                  setOpen(false);
                }}
              >
                <span>{label}</span>
                {badge > 0 ? (
                  <span className="client-nav-count" aria-label={`Уведомлений: ${badge}`}>
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
