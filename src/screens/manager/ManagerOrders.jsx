// Раздел менеджера: заказы клиентов.
import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { ORDER_STATUSES, allowedNextOrderStatuses } from "../../config/orderConfig";
import { VirtualList } from "../../components/VirtualList";
import { CustomRequestPhoto, OrderTimeline } from "../../shared/SharedPanels";
import {
  UNIT_CONFIG,
  selectDefaultNumber,
  EXCHANGE_STATUS_LABELS,
  normalizeOrderExchange,
  exchangeBadgeClass,
  buildOrderSearchHaystack,
  getOrderOneCDocumentRef,
  isOrderAlreadyInOneC,
  downloadBlobFile,
  printOrderDocument,
  formatDate,
  formatMoney,
  getOrderTotal,
  getPositionCount,
  statusClass,
} from "../../shared/appHelpers";

const CUSTOM_STATUSES = [
  "Новый запрос",
  "Уточняется",
  "Согласован",
  "Добавлен в каталог",
  "Отклонён",
];

export function ManagerOrders({
  orders,
  settings,
  onUpdateOrder,
  onBulkUpdateOrders,
  onDeleteOrder,
  onCreateProductFromCustom,
  onReload,
  onNavigate,
  headerSearch = "",
  statusFilter = "Все",
  onStatusFilterChange,
  exchangeFilter: exchangeFilterProp = "all",
  onExchangeFilterChange,
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(statusFilter || "Все");
  const [exchangeFilter, setExchangeFilter] = useState(exchangeFilterProp || "all");
  const [sort, setSort] = useState("newest");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("Принят");
  const [bulkBusy, setBulkBusy] = useState(false);
  const effectiveSearch = headerSearch.trim() || search;

  useEffect(() => {
    if (statusFilter) setStatus(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    if (exchangeFilterProp) setExchangeFilter(exchangeFilterProp);
  }, [exchangeFilterProp]);

  const setStatusFilter = (next) => {
    setStatus(next);
    onStatusFilterChange?.(next);
  };

  const setExchangeFilterValue = (next) => {
    setExchangeFilter(next);
    onExchangeFilterChange?.(next);
  };

  const hasActiveFilters =
    status !== "Все" ||
    exchangeFilter !== "all" ||
    Boolean(effectiveSearch.trim());

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("Все");
    setExchangeFilterValue("all");
  };

  const visible = useMemo(() => {
    const needle = effectiveSearch.trim().toLowerCase();
    return [...orders].filter((order) => {
      const exchange = normalizeOrderExchange(order.exchange);
      const haystack = buildOrderSearchHaystack(order);
      return (!needle || haystack.includes(needle))
        && (status === "Все" || order.status === status)
        && (exchangeFilter === "all" || exchange.status === exchangeFilter);
    }).sort((a, b) => {
      if (sort === "delivery") return String(a.firstDeliveryDate).localeCompare(String(b.firstDeliveryDate));
      if (sort === "oldest") return String(a.createdAt).localeCompare(String(b.createdAt));
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }, [orders, effectiveSearch, status, exchangeFilter, sort]);

  const runExchangeAction = async (order, action) => {
    setBusyOrderId(order.id);
    try {
      if (action === "check") {
        const result = await api.checkExchangeOrder(order.id);
        alert(result.validation?.ready
          ? "Проверка пройдена. Для отправки нажмите «Передать в 1С TEST»."
          : (result.validation?.issues || []).join("\n"));
      } else if (action === "send") {
        const result = await api.sendExchangeOrder(order.id);
        alert(result.exchange?.message || "Тестовая передача выполнена.");
      } else if (action === "reset") {
        await api.resetExchangeOrder(order.id);
      }
      await onReload();
    } catch (error) {
      alert(error.message);
      await onReload();
    } finally {
      setBusyOrderId("");
    }
  };

  const downloadOrder = async (order, format) => {
    setBusyOrderId(order.id);
    try {
      const blob = await api.downloadExchangeOrder(order.id, format);
      downloadBlobFile(blob, `clover-order-${order.number || order.id}-1c.${format}`);
    } catch (error) {
      alert(error.message);
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
            await api.sendExchangeOrder(orderId);
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
      <div className="toolbar four">
        {!headerSearch.trim() && (
          <input
            type="search"
            placeholder="№ Clover, № 1С, клиент, телефон…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск заказов по номеру Clover или 1С"
          />
        )}
        <select value={status} onChange={(e) => setStatusFilter(e.target.value)}><option>Все</option>{ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={exchangeFilter} onChange={(e) => setExchangeFilterValue(e.target.value)}><option value="all">Все статусы 1С</option>{Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="delivery">По дате доставки</option></select>
      </div>
      <div className="manager-orders-toolbar-meta">
        <span className="muted small">Найдено: {visible.length}</span>
        <div className="manager-orders-quick-filters">
          <button
            className={`chip-button${exchangeFilter === "sent" ? " active" : ""}`}
            type="button"
            onClick={() => setExchangeFilterValue(exchangeFilter === "sent" ? "all" : "sent")}
          >
            Уже в 1С
          </button>
          <button
            className={`chip-button${exchangeFilter === "error" ? " active" : ""}`}
            type="button"
            onClick={() => setExchangeFilterValue(exchangeFilter === "error" ? "all" : "error")}
          >
            Ошибки 1С
          </button>
          {hasActiveFilters && (
            <button className="chip-button chip-button--ghost" type="button" onClick={resetFilters}>
              Сбросить
            </button>
          )}
        </div>
      </div>
      <div className="panel manager-bulk-panel" style={{ marginTop: 10, marginBottom: 12, padding: 12 }}>
        <div className="toolbar four">
          <button className="secondary-button" type="button" onClick={selectVisible}>
            {visible.length > 0 && visible.every((order) => selectedIds.includes(order.id))
              ? "Снять выбор"
              : "Выбрать видимые"}
          </button>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="primary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={applyBulkStatus}>
            Статус ({selectedIds.length})
          </button>
          <button className="secondary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={() => runBulkExchange("check")}>
            Проверить 1С
          </button>
        </div>
        <div className="exchange-actions" style={{ marginTop: 8 }}>
          <button className="secondary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={() => runBulkExchange("send")}>
            Передать выбранные
          </button>
          {selectedIds.length > 0 && <button className="secondary-button" type="button" onClick={() => setSelectedIds([])}>Очистить</button>}
          <span className="muted small">Выбрано: {selectedIds.length}</span>
        </div>
      </div>

      {visible.length ? <VirtualList className="manager-grid manager-orders-list" items={visible} itemHeight={268} height={Math.min(900, typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.82) : 900)} getItemKey={(order) => order.id} renderItem={(order) => {
        const exchange = normalizeOrderExchange(order.exchange);
        const busy = busyOrderId === order.id;
        const oneCDoc = getOrderOneCDocumentRef(exchange);
        const alreadyInOneC = isOrderAlreadyInOneC(exchange);
        const needsAccept = order.status === "Новый" && (exchange.status === "sent" || exchange.status === "draft");
        return (
        <article className={`order-card order-card--compact${alreadyInOneC ? " order-card--in-onec" : ""}`} key={order.id}>
          <div className="order-card-header">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(order.id)}
                onChange={() => toggleSelected(order.id)}
                aria-label={`Выбрать заказ ${order.number}`}
              />
            </label>
            <div>
              <div className="exchange-status-line"><span className={`badge ${statusClass(order.status)}`}>{order.status}</span><span className={`badge ${exchangeBadgeClass(exchange.status)}`}>1С: {EXCHANGE_STATUS_LABELS[exchange.status]}</span></div>
              <h3>№ {order.number} · {order.customerName || "Клиент"}</h3>
              <p className="order-card-sub">{order.customerPhone || order.customerEmail || order.customerContact || "—"}</p>
            </div>
            <strong className="success-text">{settings.showPrices && getOrderTotal(order) > 0 ? formatMoney(getOrderTotal(order)) : `${getPositionCount(order)} поз.`}</strong>
          </div>
          {alreadyInOneC && (
            <div className={`order-in-onec-banner${exchange.status === "sent" ? " order-in-onec-banner--sent" : ""}${needsAccept ? " order-in-onec-banner--warn" : ""}`}>
              <strong>Уже в 1С</strong>
              {oneCDoc ? <span className="order-in-onec-doc">{oneCDoc}</span> : <span className="order-in-onec-doc">{EXCHANGE_STATUS_LABELS[exchange.status]}</span>}
              {needsAccept ? <span className="order-in-onec-hint">Поставьте статус «Принят»</span> : null}
            </div>
          )}
          <div className="order-meta order-meta--compact">
            <div><span>Доставка</span><strong>{formatDate(order.firstDeliveryDate)}</strong></div>
            <div><span>Адрес</span><strong>{order.address}</strong></div>
            <div><span>Clover ID</span><strong className="order-id-value">{order.externalId || order.id || "—"}</strong></div>
            <div><span>№ 1С</span><strong className="order-id-value">{oneCDoc || "—"}</strong></div>
          </div>
          <div className="manager-order-controls manager-order-controls--compact">
            <label className="field">Статус
              <select value={order.status} onChange={(e) => onUpdateOrder(order.id, { status: e.target.value, updatedAt: new Date().toISOString() })}>{allowedNextOrderStatuses(order.status).map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <div className="exchange-actions" style={{ alignSelf: "end" }}>
              <button className="secondary-button" type="button" onClick={() => printOrderDocument(order, settings)}>Печать</button>
              {settings.managerCanDeleteOrders && <button className="danger-button" type="button" onClick={() => onDeleteOrder(order)}>Удалить</button>}
            </div>
          </div>
            <div className={`order-onec-box${exchange.status === "sent" ? " order-onec-box--done" : ""}`}>
            <div className="order-onec-head">
              <span className="order-onec-label">1С</span>
              <span className={`badge ${exchangeBadgeClass(exchange.status)}`}>
                {EXCHANGE_STATUS_LABELS[exchange.status]}
              </span>
              {oneCDoc ? (
                <span className="order-onec-receipt">{oneCDoc}</span>
              ) : null}
              {exchange.status !== "sent" ? (
                <span className="order-onec-meta">попыток {exchange.attempts}</span>
              ) : null}
            </div>
            {exchange.status !== "sent" && exchange.message ? (
              <div className="exchange-message">{exchange.message}</div>
            ) : null}
            {exchange.status === "sent" ? null : (
              <div className="exchange-actions order-onec-primary">
                <button
                  className="primary-button"
                  disabled={busy || exchange.status === "sending"}
                  type="button"
                  onClick={() => runExchangeAction(order, "send")}
                >
                  {exchange.status === "sending"
                    ? "Ожидает ACK 1С"
                    : exchange.status === "ready"
                      ? "Обновить очередь"
                      : exchange.status === "error"
                        ? "Передать повторно"
                        : "Передать в 1С TEST"}
                </button>
              </div>
            )}
            <details className="order-more-actions">
              <summary>Ещё</summary>
              <div className="exchange-actions">
                <button className="secondary-button" disabled={busy} type="button" onClick={() => runExchangeAction(order, "check")}>Проверить</button>
                <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOrder(order, "json")}>JSON</button>
                <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOrder(order, "csv")}>CSV</button>
                {exchange.status !== "not_sent" && exchange.status !== "sent" && (
                  <button className="secondary-button" disabled={busy || exchange.status === "sending"} type="button" onClick={() => runExchangeAction(order, "reset")}>Сбросить</button>
                )}
              </div>
            </details>
          </div>
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
                    <div className="field"><span>Действие</span><button className="secondary-button" type="button" onClick={() => onCreateProductFromCustom(order, item)}>Создать товар в каталоге</button></div>
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
        </article>
      );}} /> : (
        <div className="empty-box">
          <p>Заказы не найдены.</p>
          {hasActiveFilters ? (
            <button className="primary-button" type="button" onClick={resetFilters}>
              Сбросить фильтры
            </button>
          ) : (
            <button className="secondary-button" type="button" onClick={() => onNavigate?.("exchange")}>
              Открыть вкладку 1С
            </button>
          )}
        </div>
      )}
    </section>
  );
}
