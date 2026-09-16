import { useEffect, useRef, useState } from "react";
import { useLocalization } from "../../shared/i18n/LocalizationProvider";

/** Same 4-tile grid mark as catalog cards toggle — matrix / product grid. */
function MatrixGridIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
      <rect x="8.75" y="1.5" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
      <rect x="1.5" y="8.75" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
      <rect x="8.75" y="8.75" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
    </svg>
  );
}

/**
 * Телефон: одна кнопка разделов ЛК (Заказ / Мои заказы / …).
 * На десктопе в ClientScreen остаётся ряд кнопок client-nav.
 * Активная «Моя матрица» — компактная иконка сетки (текст остаётся в aria-label).
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
  const { t } = useLocalization();
  const SHORT_LABELS = {
    matrix: t("client.nav.matrix"),
    catalog: t("client.nav.catalog"),
    orders: t("client.nav.orders"),
    reconciliation: t("client.nav.reconciliation"),
    cabinet: t("client.nav.cabinet"),
  };
  const active = tabs.find(([id]) => id === activeId) || tabs[0];
  const activeKey = active?.[0];
  const activeLabel =
    SHORT_LABELS[activeKey] || active?.[1] || t("shared.nav.menu");
  const matrixIconActive = activeKey === "matrix";
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
        className={
          matrixIconActive
            ? "client-section-menu-trigger client-section-menu-trigger--matrix-icon"
            : "client-section-menu-trigger"
        }
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={activeLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {matrixIconActive ? (
          <span className="client-section-menu-icon" aria-hidden="true">
            <MatrixGridIcon />
          </span>
        ) : (
          <span className="client-section-menu-label">{activeLabel}</span>
        )}
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
                <span>{t(label)}</span>
                {badge > 0 ? (
                  <span className="client-nav-count" aria-label={t("client.nav.notificationsCount", { count: badge })}>
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
