// Раздел менеджера: заказы клиентов.
import { useMemo, useState } from "react";
import { api } from "../../serverApi";
import { ORDER_STATUSES, allowedNextOrderStatuses } from "../../config/orderConfig";
import { CustomRequestPhoto, OrderTimeline } from "../../shared/SharedPanels";
import {
  UNIT_CONFIG,
  selectDefaultNumber,
  EXCHANGE_STATUS_LABELS,
  normalizeOrderExchange,
  exchangeBadgeClass,
  printOrderDocument,
  formatDate,
  formatDateTime,
  formatMoney,
  getOrderTotal,
  getPositionCount,
  statusClass,
  matchesTextSearch,
  buildOrderSearchHaystack,
} from "../../shared/appHelpers";
import { canTrashOrder } from "../../shared/orderTrash";
import { appAlert } from "../../shared/AppModal";
import { EmptyState } from "../../shared/uxFeedback";

const CUSTOM_STATUSES = [
  "Новый запрос",
  "Уточняется",
  "Согласован",
  "Добавлен в каталог",
  "Отклонён",
];

function exchangeSendLabel(exchange) {
  if (exchange.status === "sending") return "Ожидает ответ 1С…";
  if (exchange.status === "ready" || exchange.status === "sent" || exchange.status === "draft") {
    return "Передано в 1С";
  }
  if (exchange.status === "error") return "Передать повторно";
  return "Передать в 1С";
}

function exchangeSendButtonClass(exchange) {
  if (exchange.status === "ready" || exchange.status === "sending" || exchange.status === "sent" || exchange.status === "draft") {
    return "manager-send-onec-button manager-send-onec-done";
  }
  if (exchange.status === "error") {
    return "manager-send-onec-button manager-send-onec-retry";
  }
  return "manager-send-onec-button manager-send-onec-idle";
}
export function ManagerOrders({
  orders,
  trashedOrders = [],
  ordersView = "active",
  onOrdersViewChange,
  settings,
  onUpdateOrder,
  onBulkUpdateOrders,
  onDeleteOrder,
  onRestoreOrder,
  onPurgeOrder,
  onCreateProductFromCustom,
  onReload,
  onApplyManagerNotifications,
  headerSearch = "",
  clientLinks = {},
}) {
  const [status, setStatus] = useState("Все");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("Принят");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPanelOpen, setBulkPanelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const effectiveSearch = headerSearch.trim();
  const inTrash = ordersView === "trash";
  const sourceOrders = inTrash ? trashedOrders : orders;

  const waitingOneCCount = useMemo(
    () => orders.filter((order) => {
      const exchange = normalizeOrderExchange(order.exchange);
      return exchange.status === "not_sent" || exchange.status === "error";
    }).length,
    [orders]
  );

  const queuedOneCCount = useMemo(
    () => orders.filter((order) => {
      const exchange = normalizeOrderExchange(order.exchange);
      return exchange.status === "ready" || exchange.status === "sending";
    }).length,
    [orders]
  );

  const visible = useMemo(() => {
    const needle = effectiveSearch.trim();
    return [...sourceOrders].filter((order) => {
      const exchange = normalizeOrderExchange(order.exchange);
      const link = clientLinks[order.clientId] || {};
      const haystack = buildOrderSearchHaystack(order, link);
      return (!needle || matchesTextSearch(haystack, needle))
        && (inTrash || status === "Все" || order.status === status)
        && (inTrash || exchangeFilter === "all"
          || (exchangeFilter === "waiting" && (exchange.status === "not_sent" || exchange.status === "error"))
          || (exchangeFilter === "queued" && (exchange.status === "ready" || exchange.status === "sending"))
          || exchange.status === exchangeFilter);
    }).sort((a, b) => {
      if (sort === "delivery") return String(a.firstDeliveryDate).localeCompare(String(b.firstDeliveryDate));
      if (sort === "oldest") return String(a.createdAt).localeCompare(String(b.createdAt));
      return String(b.createdAt || b.deletedAt || "").localeCompare(String(a.createdAt || a.deletedAt || ""));
    });
  }, [sourceOrders, effectiveSearch, status, exchangeFilter, sort, clientLinks, inTrash]);

  const runExchangeAction = async (order, action) => {
    const exchange = normalizeOrderExchange(order.exchange);
    // Уже в очереди / принято: повторный клик в обычной работе не нужен.
    if (
      action === "send"
      && (exchange.status === "ready"
        || exchange.status === "sending"
        || exchange.status === "draft"
        || exchange.status === "sent")
    ) {
      return;
    }
    setBusyOrderId(order.id);
    try {
      if (action === "send") {
        const result = await api.sendExchangeOrder(order.id);
        if (Array.isArray(result.managerNotifications)) {
          onApplyManagerNotifications?.(result.managerNotifications);
        }
      }
      await onReload();
    } catch (error) {
      await appAlert({
        title: "Не удалось передать в 1С",
        message: error.message,
        tone: "danger",
      });
      await onReload();
    } finally {
      setBusyOrderId("");
    }
  };

  const toggleSelected = (orderId) => {
    setSelectedIds((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId]
    );
  };

  const selectVisible = () => {
    const visibleIds = visible.map((order) => order.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    );
  };

  const applyBulkStatus = async () => {
    if (!selectedIds.length) return;
    const selected = orders.filter((order) => selectedIds.includes(order.id));
    const alreadySame = selected.filter((order) => order.status === bulkStatus);
    const allowedIds = selected
      .filter(
        (order) =>
          order.status !== bulkStatus
          && allowedNextOrderStatuses(order.status).includes(bulkStatus)
      )
      .map((order) => order.id);
    const forbidden = selected.length - alreadySame.length - allowedIds.length;

    if (!allowedIds.length) {
      if (alreadySame.length === selected.length) {
        await appAlert({
          title: "Без изменений",
          message: `Все выбранные заказы уже в статусе «${bulkStatus}».`,
        });
        return;
      }
      await appAlert({
        title: "Статус не изменён",
        message: [
          `Статус «${bulkStatus}» недоступен для выбранных заказов.`,
          alreadySame.length ? `Уже в этом статусе: ${alreadySame.length}.` : "",
          forbidden ? `Нельзя сменить: ${forbidden}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        tone: "warn",
      });
      return;
    }

    onBulkUpdateOrders(allowedIds, { status: bulkStatus });
    setSelectedIds([]);
    if (forbidden > 0 || alreadySame.length > 0) {
      await appAlert({
        title: "Статус обновлён частично",
        message: [
          `К обновлению: ${allowedIds.length}.`,
          alreadySame.length ? `Уже в этом статусе: ${alreadySame.length}.` : "",
          forbidden ? `Нельзя сменить: ${forbidden}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        tone: "warn",
      });
    }
  };

  const runBulkExchange = async (action) => {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    const errors = [];
    try {
      for (const orderId of selectedIds) {
        try {
          if (action === "check") await api.checkExchangeOrder(orderId);
          if (action === "send") {
            await api.checkExchangeOrder(orderId);
            const result = await api.sendExchangeOrder(orderId);
            if (Array.isArray(result.managerNotifications)) {
              onApplyManagerNotifications?.(result.managerNotifications);
            }
          }
        } catch (error) {
          errors.push(error.message);
        }
      }
      await onReload();
      if (errors.length) {
        await appAlert({
          title: "Не все заказы обработаны",
          message: errors.join("\n"),
          tone: "danger",
        });
      }
      setSelectedIds([]);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <section className="manager-orders-section">
      <div className="manager-orders-topbar" role="toolbar" aria-label="Заказы и действия">
        <button
          className={ordersView === "active" ? "manager-orders-seg active" : "manager-orders-seg"}
          type="button"
          onClick={() => onOrdersViewChange?.("active")}
        >
          Заказы ({orders.length})
        </button>
        <button
          className={ordersView === "trash" ? "manager-orders-seg active" : "manager-orders-seg"}
          type="button"
          onClick={() => onOrdersViewChange?.("trash")}
        >
          Корзина ({trashedOrders.length})
        </button>
        {!inTrash && (
          <>
            <button
              className={filtersOpen ? "manager-orders-seg manager-filters-toggle active" : "manager-orders-seg manager-filters-toggle"}
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {filtersOpen ? "Скрыть фильтры" : "Фильтры"}
            </button>
            <button
              className={bulkPanelOpen ? "manager-orders-seg manager-bulk-toggle active" : "manager-orders-seg manager-bulk-toggle"}
              type="button"
              aria-expanded={bulkPanelOpen}
              onClick={() => setBulkPanelOpen((open) => !open)}
            >
              {bulkPanelOpen ? "Скрыть действия" : "Массовые действия"}
              {selectedIds.length > 0 ? ` · ${selectedIds.length}` : ""}
            </button>
          </>
        )}
      </div>

      {!inTrash && (
        <div className="manager-orders-quick-chips" role="group" aria-label="Быстрые фильтры 1С">
          <button
            className={exchangeFilter === "waiting" ? "manager-orders-seg active" : "manager-orders-seg"}
            type="button"
            onClick={() => {
              setFiltersOpen(false);
              setExchangeFilter((current) => (current === "waiting" ? "all" : "waiting"));
            }}
          >
            Ждут передачи в 1С ({waitingOneCCount})
          </button>
          <button
            className={exchangeFilter === "queued" ? "manager-orders-seg active" : "manager-orders-seg"}
            type="button"
            onClick={() => {
              setFiltersOpen(false);
              setExchangeFilter((current) => (current === "queued" ? "all" : "queued"));
            }}
          >
            В очереди ({queuedOneCCount})
          </button>
        </div>
      )}

      {!inTrash && filtersOpen && (
        <div className="toolbar three manager-orders-filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Фильтр статуса заказа"><option>Все</option>{ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
          <select
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value)}
            aria-label="Фильтр статуса 1С"
          >
            <option value="all">Все статусы 1С</option>
            <option value="waiting">Ждут передачи в 1С</option>
            <option value="queued">В очереди</option>
            {Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка заказов"><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="delivery">По дате доставки</option></select>
        </div>
      )}

      {!inTrash && bulkPanelOpen && (
        <div className="panel manager-bulk-panel">
          <div className="toolbar four">
            <button className="secondary-button" type="button" onClick={selectVisible}>
                  {visible.length > 0 && visible.every((order) => selectedIds.includes(order.id))
                    ? "Снять выбор"
                    : "Выбрать все"}
            </button>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} aria-label="Статус для массового изменения">
              {ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button className="primary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={() => void applyBulkStatus()}>
              Изменить статус ({selectedIds.length})
            </button>
            <button className="secondary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={() => runBulkExchange("check")}>
              Проверить выбранные в 1С
            </button>
          </div>
          <div className="exchange-actions" style={{ marginTop: 10 }}>
            <button className="secondary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={() => runBulkExchange("send")}>
              Тестово передать выбранные
            </button>
            {selectedIds.length > 0 && <button className="secondary-button" type="button" onClick={() => setSelectedIds([])}>Очистить выбор</button>}
            <span className="muted small">Выбрано заказов: {selectedIds.length}</span>
          </div>
        </div>
      )}

      {visible.length ? (
        <div className="manager-grid">
          {visible.map((order) => {
        const exchange = normalizeOrderExchange(order.exchange);
        const busy = busyOrderId === order.id;
        return (
        <article className="order-card manager-order-card-item" key={order.id}>
          <div className="order-card-header manager-order-card-header">
            <div className="manager-order-select">
              <input
                className="manager-order-checkbox"
                type="checkbox"
                checked={selectedIds.includes(order.id)}
                onChange={() => toggleSelected(order.id)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Выбрать заказ ${order.number}`}
              />
              <div className="manager-order-select-body">
                <div className="exchange-status-line">
                  {inTrash || allowedNextOrderStatuses(order.status).length <= 1 ? (
                    <span className={`badge ${statusClass(order.status)}`}>{order.status}</span>
                  ) : (
                    <select
                      className={`badge ${statusClass(order.status)} manager-order-status-select`}
                      value={order.status || "Новый"}
                      aria-label={`Статус заказа ${order.number || ""}`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        if (nextStatus === order.status) return;
                        onUpdateOrder(order.id, { status: nextStatus });
                      }}
                    >
                      {allowedNextOrderStatuses(order.status).map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  )}
                  <span className={`badge ${exchangeBadgeClass(exchange.status)}`}>1С: {EXCHANGE_STATUS_LABELS[exchange.status]}</span>
                </div>
                <h3 className="manager-order-client">{order.customerName || "Клиент"}</h3>
                <p>
                  № {order.number || "—"}
                  {order.createdAt ? ` · создан ${formatDateTime(order.createdAt)}` : ""}
                </p>
                {(order.customerContact || order.customerPhone || order.customerEmail) && (
                  <p className="manager-order-contacts muted small">
                    {[order.customerContact, order.customerPhone, order.customerEmail].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="nowrap">
              <strong className="manager-order-sum success-text">
                {settings.showPrices && getOrderTotal(order) > 0
                  ? formatMoney(getOrderTotal(order))
                  : "уточняется"}
              </strong>
            </div>
          </div>
          <div className="order-meta">
            <div>
              <span>Дата доставки</span>
              <strong>{order.firstDeliveryDate ? formatDate(order.firstDeliveryDate) : "не указана"}</strong>
            </div>
            <div>
              <span>Адрес</span>
              <strong>{order.address || "—"}</strong>
            </div>
            <div>
              <span>Позиций</span>
              <strong>{getPositionCount(order)}</strong>
            </div>
            <div>
              <span>Дата заказа</span>
              <strong>{order.createdAt ? formatDate(String(order.createdAt).slice(0, 10)) : "—"}</strong>
            </div>
          </div>
          <div className="manager-order-controls">
            <div className="exchange-actions">
              {inTrash ? (
                <>
                  <button className="primary-button" type="button" onClick={() => onRestoreOrder?.(order)}>
                    Восстановить
                  </button>
                  <button className="danger-button" type="button" onClick={() => onPurgeOrder?.(order)}>
                    Удалить навсегда
                  </button>
                  <button className="secondary-button" type="button" onClick={() => printOrderDocument(order, settings)}>Печать</button>
                </>
              ) : (
                <>
                  <button
                    className={
                      busy && (exchange.status === "not_sent" || exchange.status === "error")
                        ? "manager-send-onec-button manager-send-onec-done"
                        : exchangeSendButtonClass(exchange)
                    }
                    disabled={
                      busy
                      || exchange.status === "sending"
                      || exchange.status === "ready"
                      || exchange.status === "draft"
                      || exchange.status === "sent"
                    }
                    type="button"
                    title={
                      exchange.status === "ready"
                        ? "Заказ уже в очереди 1С. 1С сама заберёт его при следующем обмене."
                        : exchange.status === "sent" || exchange.status === "draft"
                          ? "Заказ уже передан в 1С."
                          : exchange.status === "sending"
                            ? "Ждём подтверждение от 1С"
                            : exchange.status === "error"
                              ? "Произошла ошибка — нажмите, чтобы передать снова"
                              : "Поставить заказ в очередь обмена с 1С"
                    }
                    onClick={() => runExchangeAction(order, "send")}
                  >
                    {busy ? "Передача…" : exchangeSendLabel(exchange)}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => printOrderDocument(order, settings)}>Печать</button>
                  {settings.managerCanDeleteOrders && canTrashOrder(order, "manager").ok && (
                    <button className="danger-button" type="button" onClick={() => onDeleteOrder(order)}>
                      В корзину
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {inTrash && order.deletedAt && (
            <div className="exchange-message manager-order-exchange-note">
              В корзине с {formatDateTime(order.deletedAt)}
              {order.deletedBy?.role ? ` · удалил: ${order.deletedBy.role}` : ""}
            </div>
          )}
          {!inTrash && exchange.message && (
            <div className="exchange-message manager-order-exchange-note">
              {exchange.message}{exchange.receipt ? ` · квитанция ${exchange.receipt}` : ""}
            </div>
          )}
          {inTrash ? (
            <details className="order-details" open={false}>
              <summary>Состав удалённого заказа</summary>
              <div className="order-products">
                {(order.items || []).map((item) => (
                  <div className="order-product" key={`${order.id}-${item.productId ?? item.id}`}>
                    <span>
                      {item.name}
                      <small>{item.code || item.category} · ID 1С: {item.oneCId || "—"}</small>
                    </span>
                    <strong>
                      {item.quantity} {UNIT_CONFIG[item.unit]?.shortLabel || item.unit}
                      <small>
                        {settings.showPrices && item.lineTotal > 0
                          ? formatMoney(item.lineTotal)
                          : item.multiplier > 1
                            ? `${item.quantity * item.multiplier} шт. всего`
                            : ""}
                      </small>
                    </strong>
                  </div>
                ))}
                {(order.customItems || []).map((item) => (
                  <div className="custom-line" key={`${order.id}-${item.id}`}>
                    <div className="order-product" style={{ border: 0, paddingTop: 0 }}>
                      <span>
                        <span className="badge yellow">Товар вне матрицы</span>
                        {item.name}
                        <small>{item.details}</small>
                        {item.managerComment ? <small>Менеджер: {item.managerComment}</small> : null}
                      </span>
                      <strong>
                        {item.quantity} {item.unit}
                        <small>
                          {Number(item.unitPrice) > 0
                            ? formatMoney(item.unitPrice * item.quantity)
                            : "Цена уточняется"}
                        </small>
                      </strong>
                    </div>
                    {item.photo?.dataUrl && (
                      <div className="manager-request-photo-block">
                        <strong>Фотография клиента</strong>
                        <CustomRequestPhoto photo={item.photo} className="custom-request-photo-manager" />
                      </div>
                    )}
                  </div>
                ))}
                {!(order.items || []).length && !(order.customItems || []).length && (
                  <p className="muted small">Позиции в заказе не сохранены.</p>
                )}
              </div>
              {(order.clientComment || order.managerComment || order.internalNote) && (
                <div className="manager-textareas" style={{ marginTop: 12 }}>
                  {order.clientComment ? (
                    <div className="comment-box">
                      <strong>Комментарий клиента:</strong>
                      <p>{order.clientComment}</p>
                    </div>
                  ) : null}
                  {order.managerComment ? (
                    <div className="comment-box">
                      <strong>Комментарий клиенту</strong>
                      <p>{order.managerComment}</p>
                    </div>
                  ) : null}
                  {order.internalNote ? (
                    <div className="comment-box">
                      <strong>Внутренняя заметка</strong>
                      <p>{order.internalNote}</p>
                    </div>
                  ) : null}
                </div>
              )}
              <OrderTimeline order={order} />
            </details>
          ) : (
          <details className="order-details" open={false}>
            <summary>Состав и обработка заказа</summary>
            <div className="order-products">
              {(order.items || []).map((item) => <div className="order-product" key={`${order.id}-${item.productId ?? item.id}`}><span>{item.name}<small>{item.code || item.category} · ID 1С: {item.oneCId || "проверяется по каталогу"}</small></span><strong>{item.quantity} {UNIT_CONFIG[item.unit]?.shortLabel || item.unit}<small>{settings.showPrices && item.lineTotal > 0 ? formatMoney(item.lineTotal) : item.multiplier > 1 ? `${item.quantity * item.multiplier} шт. всего` : ""}</small></strong></div>)}
              {(order.customItems || []).map((item) => (
                <div className="custom-line" key={`${order.id}-${item.id}`}>
                  <div className="order-product" style={{ border: 0, paddingTop: 0 }}><span><span className="badge yellow">Товар вне матрицы</span>{item.name}<small>{item.details}</small></span><strong>{item.quantity} {item.unit}<small>{Number(item.unitPrice) > 0 ? formatMoney(item.unitPrice * item.quantity) : "Цена уточняется"}</small></strong></div>
                  {item.photo?.dataUrl && (
                    <div className="manager-request-photo-block">
                      <strong>Фотография клиента</strong>
                      <CustomRequestPhoto photo={item.photo} className="custom-request-photo-manager" />
                    </div>
                  )}
                  <div className="form-grid">
                    <label className="field">Статус запроса
                      <select value={item.requestStatus || "Новый запрос"} onChange={(e) => onUpdateOrder(order.id, { customItems: order.customItems.map((value) => value.id === item.id ? { ...value, requestStatus: e.target.value } : value) })}>{CUSTOM_STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
                    </label>
                    <label className="field">Цена за указанную единицу
                      <input type="number" min="0" step="0.01" value={item.unitPrice || ""} onFocus={selectDefaultNumber} onChange={(e) => onUpdateOrder(order.id, { customItems: order.customItems.map((value) => value.id === item.id ? { ...value, unitPrice: Number(e.target.value) || 0 } : value) })} />
                    </label>
                    <label className="field">Комментарий клиенту
                      <input value={item.managerComment || ""} onChange={(e) => onUpdateOrder(order.id, { customItems: order.customItems.map((value) => value.id === item.id ? { ...value, managerComment: e.target.value } : value) })} />
                    </label>
                    <div className="field"><span>Действие</span><button className="primary-button" type="button" onClick={() => onCreateProductFromCustom(order, item)}>Создать товар в каталоге</button></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="manager-textareas">
              {order.clientComment ? (
                <div className="comment-box">
                  <strong>Комментарий клиента:</strong>
                  <p>{order.clientComment}</p>
                </div>
              ) : null}
              <label className="field">Комментарий клиенту
                <textarea value={order.managerComment || ""} onChange={(e) => onUpdateOrder(order.id, { managerComment: e.target.value, updatedAt: new Date().toISOString() })} />
              </label>
              <label className="field">Внутренняя заметка менеджера
                <textarea value={order.internalNote || ""} onChange={(e) => onUpdateOrder(order.id, { internalNote: e.target.value })} />
              </label>
            </div>
            <OrderTimeline order={order} />
          </details>
          )}
        </article>
        );
          })}
        </div>
      ) : (
        <EmptyState
          title={inTrash ? "Удалённых заказов нет" : "Заказы не найдены"}
          message={
            inTrash
              ? "Здесь появятся заказы, которые вы удалите."
              : exchangeFilter !== "all" || status !== "Все"
                ? "По текущим фильтрам ничего нет. Сбросьте фильтр или выберите другой."
                : "Когда клиенты оформят заказы, они появятся в этом списке."
          }
        />
      )}
    </section>
  );
}
