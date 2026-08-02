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

const CUSTOM_STATUSES = [
  "Новый запрос",
  "Уточняется",
  "Согласован",
  "Добавлен в каталог",
  "Отклонён",
];

function exchangeSendLabel(exchange) {
  if (exchange.status === "sending") return "Ожидает ACK 1С";
  if (exchange.status === "ready") return "Обновить очередь";
  if (exchange.status === "sent" || exchange.status === "error") return "Передать повторно";
  return "Передать в 1С TEST";
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
  const filtersActive = status !== "Все" || exchangeFilter !== "all" || sort !== "newest";
  const inTrash = ordersView === "trash";
  const sourceOrders = inTrash ? trashedOrders : orders;

  const visible = useMemo(() => {
    const needle = effectiveSearch.trim();
    return [...sourceOrders].filter((order) => {
      const exchange = normalizeOrderExchange(order.exchange);
      const link = clientLinks[order.clientId] || {};
      const haystack = buildOrderSearchHaystack(order, link);
      return (!needle || matchesTextSearch(haystack, needle))
        && (inTrash || status === "Все" || order.status === status)
        && (inTrash || exchangeFilter === "all" || exchange.status === exchangeFilter);
    }).sort((a, b) => {
      if (sort === "delivery") return String(a.firstDeliveryDate).localeCompare(String(b.firstDeliveryDate));
      if (sort === "oldest") return String(a.createdAt).localeCompare(String(b.createdAt));
      return String(b.createdAt || b.deletedAt || "").localeCompare(String(a.createdAt || a.deletedAt || ""));
    });
  }, [sourceOrders, effectiveSearch, status, exchangeFilter, sort, clientLinks, inTrash]);

  const runExchangeAction = async (order, action) => {
    setBusyOrderId(order.id);
    try {
      if (action === "send") {
        const result = await api.sendExchangeOrder(order.id);
        if (Array.isArray(result.managerNotifications)) {
          onApplyManagerNotifications?.(result.managerNotifications);
        }
        alert(result.exchange?.message || "Тестовая передача выполнена.");
      }
      await onReload();
    } catch (error) {
      alert(error.message);
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

  const applyBulkStatus = () => {
    if (!selectedIds.length) return;
    const selected = orders.filter((order) => selectedIds.includes(order.id));
    const allowedIds = selected
      .filter((order) => allowedNextOrderStatuses(order.status).includes(bulkStatus))
      .map((order) => order.id);
    const skipped = selected.length - allowedIds.length;
    if (!allowedIds.length) {
      alert(`Статус «${bulkStatus}» недоступен ни для одного выбранного заказа.`);
      return;
    }
    onBulkUpdateOrders(allowedIds, { status: bulkStatus });
    setSelectedIds([]);
    if (skipped > 0) {
      alert(`Статус обновлён у ${allowedIds.length}. Пропущено (запрещённый переход): ${skipped}.`);
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
        alert(`Не все заказы обработаны:\n${errors.join("\n")}`);
      }
      setSelectedIds([]);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <section>
      <div className="manager-orders-view-switch category-list" style={{ marginBottom: 14 }}>
        <button
          className={ordersView === "active" ? "category-button active" : "category-button"}
          type="button"
          onClick={() => onOrdersViewChange?.("active")}
        >
          Заказы ({orders.length})
        </button>
        <button
          className={ordersView === "trash" ? "category-button active" : "category-button"}
          type="button"
          onClick={() => onOrdersViewChange?.("trash")}
        >
          Корзина ({trashedOrders.length})
        </button>
      </div>

      {!inTrash && (
      <div className="manager-orders-tools">
        <button
          className="secondary-button manager-filters-toggle"
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? "Скрыть фильтры" : "Фильтры"}
          {!filtersOpen && filtersActive ? " · изменены" : ""}
        </button>
        <button
          className="secondary-button manager-bulk-toggle"
          type="button"
          aria-expanded={bulkPanelOpen}
          onClick={() => setBulkPanelOpen((open) => !open)}
        >
          {bulkPanelOpen ? "Скрыть действия" : "Массовые действия"}
          {selectedIds.length > 0 ? ` · ${selectedIds.length}` : ""}
        </button>
      </div>
      )}

      {!inTrash && filtersOpen && (
        <div className="toolbar three manager-orders-filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Фильтр статуса заказа"><option>Все</option>{ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={exchangeFilter} onChange={(e) => setExchangeFilter(e.target.value)} aria-label="Фильтр статуса 1С"><option value="all">Все статусы 1С</option>{Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка заказов"><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="delivery">По дате доставки</option></select>
        </div>
      )}

      {!inTrash && bulkPanelOpen && (
        <div className="panel manager-bulk-panel">
          <div className="toolbar four">
            <button className="secondary-button" type="button" onClick={selectVisible}>
              {visible.length > 0 && visible.every((order) => selectedIds.includes(order.id))
                ? "Снять выбор с видимых"
                : "Выбрать все видимые"}
            </button>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} aria-label="Статус для массового изменения">
              {ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button className="primary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={applyBulkStatus}>
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
            <label className="manager-order-select">
              <input
                type="checkbox"
                checked={selectedIds.includes(order.id)}
                onChange={() => toggleSelected(order.id)}
                aria-label={`Выбрать заказ ${order.number}`}
              />
              <div>
                <div className="exchange-status-line">
                  <span className={`badge ${statusClass(order.status)}`}>{order.status}</span>
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
            </label>
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
                    className="primary-button manager-send-onec-button"
                    disabled={busy || exchange.status === "sending"}
                    type="button"
                    onClick={() => runExchangeAction(order, "send")}
                  >
                    {exchangeSendLabel(exchange)}
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
          {!inTrash && (
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
        <div className="empty-box">
          {inTrash ? "Корзина пуста." : "Заказы не найдены."}
        </div>
      )}
    </section>
  );
}
