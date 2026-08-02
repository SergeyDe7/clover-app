// Раздел менеджера: центр уведомлений.
import { writeManagerMoreTab, formatDateTime } from "../../shared/appHelpers";

const MANAGER_NOTIFICATION_META = {
  new_order: { label: "Новый заказ", tab: "orders" },
  order_changed: { label: "Заказ изменён", tab: "orders" },
  order_deleted: { label: "Заказ удалён", tab: "orders" },
  custom_item: { label: "Нужен новый товар", tab: "orders" },
  reconciliation_request: { label: "Акт сверки", tab: "more", moreTab: "acts" },
  client_registration: { label: "Новый клиент", tab: "clients" },
  onec_error: { label: "Не удалось передать в 1С", tab: "exchange" },
  test: { label: "Тест", tab: "more", moreTab: "settings" },
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
export function parseManagerNotification(item) {
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
      detail: changed ? "Изменён" : "",
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
  return (
    <div className={["manager-order-summary", className].filter(Boolean).join(" ")}>
      {clientName ? <div className="manager-order-client manager-notification-client">{clientName}</div> : null}
      {detail ? <div className="manager-order-summary-line muted">{detail}</div> : null}
      {amount !== "" && amount != null ? (
        <div className="manager-order-summary-line manager-order-sum-line">Сумма: {amount}</div>
      ) : null}
      {positions !== "" && positions != null ? (
        <div className="manager-order-summary-line">Кол-во позиций: {positions}</div>
      ) : null}
      {deliveryDate !== "" && deliveryDate != null ? (
        <div className="manager-order-summary-line">Дата доставки: {deliveryDate}</div>
      ) : null}
      {orderDate !== "" && orderDate != null ? (
        <div className="manager-order-summary-line">Дата заказа: {orderDate}</div>
      ) : null}
      {orderNumber !== "" && orderNumber != null ? (
        <div className="manager-order-summary-line manager-order-number">№ {orderNumber}</div>
      ) : null}
    </div>
  );
}

function NotificationCard({ item, onOpen, onRead }) {
  const parsed = parseManagerNotification(item);
  const label = MANAGER_NOTIFICATION_META[item.type]?.label || "Событие";
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
        {!parsed.hideFooterTime && (
          <time className="manager-notification-time">{formatDateTime(item.createdAt)}</time>
        )}
      </div>
      <div className="manager-notification-actions">
        <button className="primary-button" type="button" onClick={() => onOpen(item)}>Открыть</button>
        <button className="secondary-button" type="button" onClick={() => onRead(item)}>Прочитано</button>
      </div>
    </article>
  );
}

export function ManagerNotificationBell({ notifications = [], open, onToggle, onOpen, onRead, onReadAll }) {
  const unread = notifications.filter((item) => !item.readAt);
  return (
    <div className="manager-bell">
      <button
        className="secondary-button manager-bell-trigger"
        type="button"
        aria-expanded={open}
        aria-label={unread.length ? `Уведомления: ${unread.length}` : "Уведомления"}
        onClick={onToggle}
      >
        <span className="manager-bell-label-full">Уведомления</span>
        <span className="manager-bell-label-short">Увед.</span>
        {unread.length > 0 && <span className="manager-bell-count">{unread.length}</span>}
      </button>
      {open && (
        <div className="manager-bell-panel">
          <div className="manager-notification-header">
            <strong>Уведомления{unread.length ? ` · ${unread.length}` : ""}</strong>
            {unread.length > 0 && (
              <button className="secondary-button" type="button" onClick={onReadAll}>
                Всё прочитано
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
            <div className="empty-box manager-notification-empty">Новых уведомлений нет.</div>
          )}
        </div>
      )}
    </div>
  );
}
