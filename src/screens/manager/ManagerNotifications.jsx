import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел менеджера: центр уведомлений.
import { writeManagerMoreTab, formatDateTime } from "../../shared/appHelpers";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const MANAGER_NOTIFICATION_META = {
  new_order: { labelKey: "client.order.new", tab: "orders" },
  order_changed: { labelKey: "manager.orderChanged", tab: "orders" },
  order_deleted: { labelKey: "manager.orderDeleted", tab: "orders" },
  custom_item: { labelKey: "manager.newProductNeeded", tab: "orders" },
  reconciliation_request: { labelKey: "client.nav.reconciliation", tab: "acts" },
  client_registration: { labelKey: "manager.newClient", tab: "clients" },
  onec_error: { labelKey: "manager.exchange.failedToSend", tab: "exchange" },
  test: { labelKey: "manager.test", tab: "more", moreTab: "settings" },
};

export function managerNotificationTab(notification) {
  const meta = MANAGER_NOTIFICATION_META[notification?.type];
  if (meta?.moreTab) {
    writeManagerMoreTab(meta.moreTab);
  }
  return meta?.tab || "orders";
}

function pickLabeledLine(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`^${escaped}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() || "";
}

/** Дата заказа + время в одной строке; без отдельного дубля снизу. */
export function notificationOrderDateTime(orderDate, createdAt) {
  const fromBody = String(orderDate || "").trim();
  if (fromBody && /\d{1,2}:\d{2}/.test(fromBody)) {
    return fromBody;
  }
  if (createdAt) {
    const full = formatDateTime(createdAt);
    if (!fromBody || fromBody === "не указана" || fromBody === "—") {
      return full;
    }
    const timePart = full.includes(",")
      ? full.split(",").slice(1).join(",").trim()
      : "";
    return timePart ? `${fromBody}, ${timePart}` : fromBody;
  }
  return fromBody;
}

/** Разбор title/body уведомления о заказе в поля шаблона. */
export function parseManagerNotification(item, t) {
  const title = String(item?.title || "").trim();
  const body = String(item?.body || "").trim();
  const type = String(item?.type || "");
  const isOrderLike = ["new_order", "order_changed", "order_deleted"].includes(type);

  const labeledAmount = pickLabeledLine(body, "Сумма");
  const labeledPositions = pickLabeledLine(body, "Кол-во позиций");
  const labeledDelivery = pickLabeledLine(body, "Дата доставки");
  const labeledOrderDate = pickLabeledLine(body, "Дата заказа");
  const labeledNumber = body.match(/^№\s*(.+)$/im)?.[1]?.trim() || "";

  if (isOrderLike && (labeledAmount || labeledPositions || labeledDelivery || labeledOrderDate || labeledNumber)) {
    const changed = /^Изменён\b/im.test(body);
    return {
      clientName: title,
      amount: labeledAmount,
      positions: labeledPositions,
      deliveryDate: labeledDelivery,
      orderDate: notificationOrderDateTime(labeledOrderDate, item?.createdAt),
      orderNumber: labeledNumber.replace(/^№\s*/, ""),
      detail: changed ? (typeof t === "function" ? t("manager.changed") : "Изменён") : "",
      headline: "",
      hideFooterTime: true,
    };
  }

  // Старый формат: body = №… · сумма · N поз. · доставка …
  const orderParts = body.split(/\s*[·|]\s*|\n+/).map((part) => part.trim()).filter(Boolean);
  const amountPart = orderParts.find((part) => /₽|руб/i.test(part) && !/^Сумма:/i.test(part)) || "";
  const orderPart = orderParts.find((part) => /^№/.test(part)) || "";
  const positionsPart = orderParts.find((part) => /\d+\s*поз/i.test(part)) || "";
  const deliveryPart = orderParts.find((part) => /доставк/i.test(part)) || "";
  const orderFromTitle = title.match(/№\s*([^\s·]+)/);
  const formatLegacyDate = (raw) => {
    const value = String(raw || "").replace(/^доставка\s*/i, "").trim();
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value.slice(0, 10)}T12:00:00`));
      } catch {
        return value;
      }
    }
    return value;
  };

  if (isOrderLike && !orderFromTitle && (orderPart || amountPart || labeledAmount)) {
    return {
      clientName: title,
      amount: amountPart || labeledAmount,
      positions: (positionsPart.match(/\d+/)?.[0] || positionsPart.replace(/\s*поз\.?/i, "").trim()),
      deliveryDate: formatLegacyDate(deliveryPart),
      orderDate: notificationOrderDateTime(labeledOrderDate, item?.createdAt),
      orderNumber: orderPart.replace(/^№\s*/, ""),
      detail: orderParts
        .filter((part) => part !== orderPart && part !== amountPart && part !== positionsPart && part !== deliveryPart && !/^Изменён$/i.test(part))
        .join(" · "),
      headline: "",
      hideFooterTime: true,
    };
  }

  if (isOrderLike || orderFromTitle) {
    return {
      clientName: orderParts[0] || "",
      amount: amountPart,
      positions: "",
      deliveryDate: "",
      orderDate: notificationOrderDateTime("", item?.createdAt),
      orderNumber: orderFromTitle?.[1] || orderPart.replace(/^№\s*/, ""),
      detail: orderParts.slice(1).filter((part) => part !== amountPart).join(" · "),
      headline: title.replace(/\s*№\s*[^\s·]+/, "").trim(),
      hideFooterTime: Boolean(item?.createdAt),
    };
  }

  return {
    clientName: "",
    amount: "",
    positions: "",
    deliveryDate: "",
    orderDate: "",
    orderNumber: "",
    detail: body,
    headline: title,
    hideFooterTime: false,
  };
}

/** Общий шаблон строк: клиент + сумма/позиции/даты/номер. */
export function ManagerOrderSummaryLines({
  clientName = "",
  amount = "",
  positions = "",
  deliveryDate = "",
  orderDate = "",
  orderNumber = "",
  detail = "",
  className = "",
}) {
  const { t } = useLocalization();
    return (
    <div className={["manager-order-summary", className].filter(Boolean).join(" ")}>
      {clientName ? <div className="manager-order-client manager-notification-client">{clientName}</div> : null}
      {detail ? <div className="manager-order-summary-line muted">{detail}</div> : null}
      {amount !== "" && amount != null ? (
        <div className="manager-order-summary-line manager-order-sum-line">{t("shared.amount")}: {amount}</div>
      ) : null}
      {positions !== "" && positions != null ? (
        <div className="manager-order-summary-line">{t("shared.numberOfItems")}: {positions}</div>
      ) : null}
      {deliveryDate !== "" && deliveryDate != null ? (
        <div className="manager-order-summary-line">{t("checkout.deliveryDate")}: {deliveryDate}</div>
      ) : null}
      {orderDate !== "" && orderDate != null ? (
        <div className="manager-order-summary-line">{t("shared.orderDate")}: {orderDate}</div>
      ) : null}
      {orderNumber !== "" && orderNumber != null ? (
        <div className="manager-order-summary-line manager-order-number">№ {orderNumber}</div>
      ) : null}
    </div>
  );
}

function NotificationCard({ item, onOpen, onRead }) {
  const { t } = useLocalization();
  const parsed = parseManagerNotification(item, t);
  const meta = MANAGER_NOTIFICATION_META[item.type];
  const label = meta?.labelKey ? t(meta.labelKey) : t("manager.event");
  const hasOrderSummary = Boolean(
    parsed.clientName || parsed.amount || parsed.positions || parsed.deliveryDate || parsed.orderDate || parsed.orderNumber
  );

  return (
    <article className="manager-notification-item">
      <div className="manager-notification-main">
        <span className="badge yellow manager-notification-badge">{label}</span>
        {hasOrderSummary ? (
          <ManagerOrderSummaryLines
            clientName={parsed.clientName || parsed.headline}
            amount={parsed.amount}
            positions={parsed.positions}
            deliveryDate={parsed.deliveryDate}
            orderDate={parsed.orderDate}
            orderNumber={parsed.orderNumber}
            detail={parsed.detail}
          />
        ) : (
          <>
            {parsed.headline && <div className="manager-notification-client">{parsed.headline}</div>}
            {parsed.detail && <div className="manager-notification-meta">{parsed.detail}</div>}
            {!parsed.headline && item.title && <div className="manager-notification-meta">{item.title}</div>}
          </>
        )}
        {item.createdAt && !parsed.hideFooterTime ? (
          <time className="manager-notification-time">{formatDateTime(item.createdAt)}</time>
        ) : null}
      </div>
      <div className="manager-notification-actions">
        <button className="primary-button" type="button" onClick={() => onOpen(item)}>{t("shared.action.open")}</button>
        <button className="secondary-button" type="button" onClick={() => onRead(item)}>{t("manager.read")}</button>
      </div>
    </article>
  );
}

function readChromeOffsetPx() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--clover-chrome-offset")
    .trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 56;
}

export function ManagerNotificationBell({
  notifications = [],
  open,
  onToggle,
  onClose,
  onOpen,
  onRead,
  onReadAll,
}) {
  const { t } = useLocalization();
  const unread = notifications.filter((item) => !item.readAt);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelBox, setPanelBox] = useState(null);

  const close = useCallback(() => {
    if (!open) return;
    // Explicit close for outside/Escape (idempotent; avoids toggle races).
    if (typeof onClose === "function") onClose();
    else onToggle();
    // Return focus after React unmounts the portal (backdrop must not steal it).
    queueMicrotask(() => {
      triggerRef.current?.focus?.();
    });
  }, [open, onClose, onToggle]);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      setPanelBox(null);
      return undefined;
    }
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const chromeBottom = readChromeOffsetPx();
      const mobile =
        window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
      const gap = 8;
      const top = Math.max(
        chromeBottom,
        trigger ? trigger.bottom : chromeBottom
      ) + gap;
      const maxHeight = Math.max(
        160,
        Math.min(
          window.innerHeight - top - Math.max(12, Number(getComputedStyle(document.documentElement).paddingBottom) || 0) - 12,
          mobile ? Math.min(window.innerHeight * 0.68, 480) : Math.min(window.innerHeight * 0.7, 420)
        )
      );
      if (mobile) {
        setPanelBox({
          top,
          left: 10,
          right: 10,
          width: "auto",
          maxHeight,
        });
      } else {
        const width = Math.min(360, window.innerWidth * 0.82);
        const right = trigger
          ? Math.max(8, window.innerWidth - trigger.right)
          : 16;
        setPanelBox({
          top,
          right,
          left: "auto",
          width,
          maxHeight,
        });
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, unread.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      // AppModal (and similar) sit above the bell — let them own Escape first.
      if (document.querySelector(".app-modal-shell")) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const panel =
    open && panelBox && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="manager-bell-backdrop"
              aria-label={t("shared.action.close")}
              tabIndex={-1}
            />
            <div
              ref={panelRef}
              className="manager-bell-panel manager-bell-panel--portal"
              role="dialog"
              aria-modal="true"
              aria-label={t("manager.notifications.title")}
              style={{
                top: panelBox.top,
                left: panelBox.left,
                right: panelBox.right,
                width: panelBox.width,
                maxHeight: panelBox.maxHeight,
              }}
            >
              <div className="manager-notification-header">
                <strong>
                  {unread.length
                    ? t("manager.notifications.titleWithCount", { count: unread.length })
                    : t("manager.notifications.title")}
                </strong>
                {unread.length > 0 && (
                  <button className="secondary-button" type="button" onClick={onReadAll}>
                    {t("manager.markAllRead")}
                  </button>
                )}
              </div>
              {unread.length ? (
                <div className="manager-notification-list">
                  {unread.slice(0, 8).map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      onOpen={onOpen}
                      onRead={onRead}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-box manager-notification-empty">
                  {t("manager.noNewNotifications")}
                </div>
              )}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div className="manager-bell" ref={rootRef}>
      <button
        ref={triggerRef}
        className="secondary-button manager-bell-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread.length ? t("manager.notifications.countLabel", { count: unread.length }) : t("manager.notifications.title")}
        onClick={onToggle}
      >
        <span className="manager-bell-label-full">{t("manager.notifications.title")}</span>
        <span className="manager-bell-label-short">{t("manager.notif")}</span>
        {unread.length > 0 && <span className="manager-bell-count">{unread.length}</span>}
      </button>
      {panel}
    </div>
  );
}
