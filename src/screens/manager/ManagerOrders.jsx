// Раздел менеджера: заказы клиентов.
import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { ORDER_STATUSES, MANAGER_BULK_ORDER_STATUSES, allowedNextOrderStatuses, canCancelOneCTransfer } from "../../config/orderConfig";
import { CustomRequestPhoto, OrderTimeline } from "../../shared/SharedPanels";
import {
  UNIT_CONFIG,
  selectDefaultNumber,
  EXCHANGE_STATUS_LABELS,
  normalizeOrderExchange,
  exchangeBadgeClass,
  exchangeStatusLabel,
  printOrderDocument,
  formatDate,
  formatDateTime,
  formatMoney,
  getOrderTotal,
  getPositionCount,
  statusClass,
  matchesTextSearch,
  buildOrderSearchHaystack,
  productArticle,
} from "../../shared/appHelpers";
import { canPurgeOrder, canTrashOrder, isAdminHardDeleteStatus } from "../../shared/orderTrash";
import { appAlert, appConfirm } from "../../shared/AppModal";
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

function orderLineQty(item) {
  const qty = Number(item.quantity) || 0;
  const unit = UNIT_CONFIG[item.unit]?.shortLabel || item.unit || "шт";
  return `${qty} ${unit}`;
}

function orderLinePrice(item, settings) {
  if (!settings?.showPrices) return "—";
  const unitPrice = Number(item.unitPrice);
  if (Number.isFinite(unitPrice) && unitPrice > 0) return formatMoney(unitPrice);
  const qty = Number(item.quantity) || 0;
  const total = Number(item.lineTotal) || 0;
  if (qty > 0 && total > 0) return formatMoney(total / qty);
  return "—";
}

function OrderLinesTable({ order, settings }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const customItems = Array.isArray(order.customItems) ? order.customItems : [];
  if (!items.length && !customItems.length) {
    return <p className="muted small">Позиции в заказе не сохранены.</p>;
  }
  return (
    <table className="order-lines-table">
      <thead>
        <tr>
          <th>Наименование</th>
          <th>Количество</th>
          <th>Цена</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const article = productArticle(item);
          return (
            <tr key={`${order.id}-item-${item.productId ?? item.id}`}>
              <td>
                <span className="order-lines-name">{item.name}</span>
                {article ? <span className="order-lines-article">{article}</span> : null}
              </td>
              <td>{orderLineQty(item)}</td>
              <td>{orderLinePrice(item, settings)}</td>
            </tr>
          );
        })}
        {customItems.map((item) => (
          <tr key={`${order.id}-custom-${item.id}`}>
            <td>
              <span className="order-lines-name">{item.name}</span>
              <span className="order-lines-article">Вне матрицы</span>
            </td>
            <td>
              {Number(item.quantity) || 0} {item.unit || "шт"}
            </td>
            <td>
              {Number(item.unitPrice) > 0
                ? formatMoney(Number(item.unitPrice))
                : "Цена уточняется"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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
  staffRole = "manager",
}) {
  const [status, setStatus] = useState("Все");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [exchangeContour, setExchangeContour] = useState({
    prodEnabled: false,
    allowedDatabases: ["TEST"],
    defaultDatabase: "TEST",
  });
  const [sendDatabase, setSendDatabase] = useState("TEST");

  useEffect(() => {
    let cancelled = false;
    api
      .getExchange(1)
      .then((result) => {
        if (cancelled) return;
        const contour = result?.exchangeContour || {
          prodEnabled: false,
          allowedDatabases: ["TEST"],
          defaultDatabase: "TEST",
        };
        const allowed =
          Array.isArray(contour.allowedDatabases) && contour.allowedDatabases.length
            ? contour.allowedDatabases
            : ["TEST"];
        const fallback = allowed.includes(contour.defaultDatabase)
          ? contour.defaultDatabase
          : allowed[0];
        setExchangeContour({ ...contour, allowedDatabases: allowed });
        setSendDatabase(fallback);
      })
      .catch(() => {
        // Контур остаётся TEST — безопасный fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveSendDatabase = async () => {
    const target = String(sendDatabase || exchangeContour.defaultDatabase || "TEST").toUpperCase();
    return target;
  };
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
    // Уже в очереди / принято: повторный клик «Передать» не нужен.
    if (
      action === "send"
      && (exchange.status === "ready"
        || exchange.status === "sending"
        || exchange.status === "draft"
        || exchange.status === "sent")
    ) {
      return;
    }
    if (action === "cancel" && !canCancelOneCTransfer(exchange)) {
      await appAlert({
        title: "Отмена недоступна",
        message:
          exchange.status === "sent" || exchange.status === "draft"
            ? "Заказ уже принят в 1С. Отозвать передачу нельзя."
            : "Отменить можно только заказ в очереди до принятия в 1С.",
        tone: "warn",
      });
      return;
    }
    let database = "";
    if (action === "send") {
      database = await resolveSendDatabase();
      if (!database) return;
    }
    setBusyOrderId(order.id);
    try {
      if (action === "send") {
        const result = await api.sendExchangeOrder(order.id, { database });
        if (Array.isArray(result.managerNotifications)) {
          onApplyManagerNotifications?.(result.managerNotifications);
        }
      }
      if (action === "cancel") {
        await api.resetExchangeOrder(order.id);
      }
      await onReload();
    } catch (error) {
      await appAlert({
        title: action === "cancel" ? "Не удалось отменить передачу" : "Не удалось передать в 1С",
        message: error.message,
        tone: "danger",
      });
      await onReload();
    } finally {
      setBusyOrderId("");
    }
  };

  const runBulkCancelOneC = async () => {
    if (!selectedIds.length) return;
    const cancellable = orders.filter(
      (order) =>
        selectedIds.includes(order.id) &&
        canCancelOneCTransfer(normalizeOrderExchange(order.exchange))
    );
    if (!cancellable.length) {
      await appAlert({
        title: "Нечего отменять",
        message:
          "Среди выбранных нет заказов в очереди 1С (до принятия). Уже принятые в 1С отозвать нельзя.",
        tone: "warn",
      });
      return;
    }
    const ok = await appConfirm({
      title: "Отменить передачу в 1С?",
      message: `Будет отменена передача для ${cancellable.length} заказ(ов). Кнопка снова станет «Передать в 1С».`,
      confirmLabel: "Отменить передачу",
      cancelLabel: "Не надо",
      tone: "danger",
    });
    if (!ok) return;

    setBulkBusy(true);
    const errors = [];
    try {
      for (const order of cancellable) {
        try {
          await api.resetExchangeOrder(order.id);
        } catch (error) {
          errors.push(`${order.number || order.id}: ${error.message}`);
        }
      }
      await onReload();
      if (errors.length) {
        await appAlert({
          title: "Не все передачи отменены",
          message: errors.join("\n"),
          tone: "danger",
        });
      }
      setSelectedIds([]);
    } finally {
      setBulkBusy(false);
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

  const runBulkTrash = async () => {
    if (!selectedIds.length) return;
    if (!settings.managerCanDeleteOrders) {
      await appAlert({
        title: "Корзина отключена",
        message: "Удаление заказов менеджером сейчас отключено в настройках.",
        tone: "warn",
      });
      return;
    }
    const trashable = orders.filter(
      (order) => selectedIds.includes(order.id) && canTrashOrder(order, "manager").ok
    );
    if (!trashable.length) {
      await appAlert({
        title: "Нечего удалять",
        message:
          "Среди выбранных нет заказов, которые можно убрать в корзину. Принятые и стоящие в очереди 1С не удаляются.",
        tone: "warn",
      });
      return;
    }

    setBulkBusy(true);
    const errors = [];
    try {
      for (const order of trashable) {
        try {
          await api.trashOrder(order.id);
        } catch (error) {
          errors.push(`${order.number || order.id}: ${error.message}`);
        }
      }
      await onReload();
      if (errors.length) {
        await appAlert({
          title: "Не все заказы удалены",
          message: errors.join("\n"),
          tone: "danger",
        });
      }
      setSelectedIds([]);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkSendToOneC = async () => {
    if (!selectedIds.length) return;
    const database = await resolveSendDatabase();
    if (!database) return;
    setBulkBusy(true);
    const errors = [];
    try {
      for (const orderId of selectedIds) {
        try {
          await api.checkExchangeOrder(orderId);
          const result = await api.sendExchangeOrder(orderId, { database });
          if (Array.isArray(result.managerNotifications)) {
            onApplyManagerNotifications?.(result.managerNotifications);
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
          className={ordersView === "active" && exchangeFilter === "all" ? "manager-orders-seg active" : "manager-orders-seg"}
          type="button"
          onClick={() => {
            onOrdersViewChange?.("active");
            setExchangeFilter("all");
          }}
        >
          Заказы
        </button>
        {!inTrash && (
          <>
            <button
              className={exchangeFilter === "waiting" ? "manager-orders-seg active" : "manager-orders-seg"}
              type="button"
              onClick={() => {
                setFiltersOpen(false);
                setExchangeFilter((current) => (current === "waiting" ? "all" : "waiting"));
              }}
            >
              Ждут передачи в 1С
              {waitingOneCCount > 0 ? (
                <span className="manager-nav-count" aria-label={`Ждут передачи в 1С: ${waitingOneCCount}`}>
                  {waitingOneCCount}
                </span>
              ) : null}
            </button>
            <button
              className={exchangeFilter === "queued" ? "manager-orders-seg active" : "manager-orders-seg"}
              type="button"
              onClick={() => {
                setFiltersOpen(false);
                setExchangeFilter((current) => (current === "queued" ? "all" : "queued"));
              }}
            >
              В очереди
              {queuedOneCCount > 0 ? (
                <span className="manager-nav-count" aria-label={`В очереди: ${queuedOneCCount}`}>
                  {queuedOneCCount}
                </span>
              ) : null}
            </button>
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
              {selectedIds.length > 0 ? (
                <span className="manager-nav-count" aria-label={`Выбрано: ${selectedIds.length}`}>
                  {selectedIds.length}
                </span>
              ) : null}
            </button>
          </>
        )}
        <button
          className={ordersView === "trash" ? "manager-orders-seg active" : "manager-orders-seg"}
          type="button"
          onClick={() => onOrdersViewChange?.("trash")}
        >
          Корзина
          {trashedOrders.length > 0 ? (
            <span className="manager-nav-count" aria-label={`В корзине: ${trashedOrders.length}`}>
              {trashedOrders.length}
            </span>
          ) : null}
        </button>
      </div>

      {!inTrash && exchangeContour.prodEnabled && (exchangeContour.allowedDatabases || []).length > 1 ? (
        <label className="field manager-orders-contour" style={{ marginTop: 12, maxWidth: 320 }}>
          Контур передачи в 1С
          <select
            value={sendDatabase}
            onChange={(event) => setSendDatabase(event.target.value)}
          >
            {(exchangeContour.allowedDatabases || ["TEST"]).map((name) => (
              <option key={name} value={name}>
                {String(name).toUpperCase() === "TEST" ? "Тестовая 1С" : "Рабочая 1С"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
          <div className="manager-bulk-status-row">
            <button className="secondary-button manager-bulk-chip" type="button" onClick={selectVisible}>
              {visible.length > 0 && visible.every((order) => selectedIds.includes(order.id))
                ? "Снять выбор"
                : "Выбрать все"}
            </button>
            <select
              className="manager-bulk-status-select"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              aria-label="Статус для массового изменения"
            >
              {MANAGER_BULK_ORDER_STATUSES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button
              className="primary-button manager-bulk-chip manager-bulk-apply"
              type="button"
              disabled={!selectedIds.length || bulkBusy}
              onClick={() => void applyBulkStatus()}
            >
              Изменить статус
              {selectedIds.length > 0 ? (
                <span className="manager-bulk-apply-count">{selectedIds.length}</span>
              ) : null}
            </button>
          </div>
          <div className="exchange-actions manager-bulk-exchange" style={{ marginTop: 10 }}>
            <button
              className="manager-send-onec-button manager-send-onec-idle"
              type="button"
              disabled={!selectedIds.length || bulkBusy}
              onClick={() => void runBulkSendToOneC()}
            >
              Передать выбранные в 1С
            </button>
            <button
              className="danger-button manager-cancel-onec-button"
              type="button"
              disabled={!selectedIds.length || bulkBusy}
              onClick={() => void runBulkCancelOneC()}
            >
              Отменить передачу в 1С
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={!selectedIds.length || bulkBusy}
              onClick={() => void runBulkTrash()}
            >
              Удалить
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
        const trashGate = canTrashOrder(order, staffRole);
        const hardDeleteCompleted =
          staffRole === "admin" && isAdminHardDeleteStatus(order.status);
        const canShowDelete =
          !inTrash &&
          (settings.managerCanDeleteOrders || hardDeleteCompleted);
        return (
        <article className="order-card manager-order-card-item" key={order.id}>
          <div className="order-card-header manager-order-card-header">
            <input
              className="manager-order-checkbox"
              type="checkbox"
              checked={selectedIds.includes(order.id)}
              onChange={() => toggleSelected(order.id)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Выбрать заказ ${order.number}`}
            />
            <div className="manager-order-main">
              <div className="manager-order-title-row">
                <h3 className="manager-order-client">{order.customerName || "Клиент"}</h3>
                <strong className="manager-order-sum success-text">
                  {settings.showPrices && getOrderTotal(order) > 0
                    ? formatMoney(getOrderTotal(order))
                    : "уточняется"}
                </strong>
              </div>
              <div className="manager-order-status-row exchange-status-line">
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
                <span className={`badge ${exchangeBadgeClass(exchange.status)}`}>
                  1С: {exchangeStatusLabel(exchange)}
                </span>
                {inTrash ? (
                  <>
                    <button className="primary-button manager-order-inline-action" type="button" onClick={() => onRestoreOrder?.(order)}>
                      Восстановить
                    </button>
                    {(() => {
                      const purgeGate = canPurgeOrder(order, staffRole);
                      return (
                        <button
                          className="danger-button manager-order-inline-action"
                          type="button"
                          disabled={!purgeGate.ok}
                          title={purgeGate.ok ? "Удалить навсегда" : purgeGate.error}
                          onClick={() => onPurgeOrder?.(order)}
                        >
                          Удалить навсегда
                        </button>
                      );
                    })()}
                  </>
                ) : order.status === "Обработан вручную" ? (
                  <span
                    className="badge status-work manager-manual-processed-badge"
                    title="Заказ обработан вручную. Передача в 1С не требуется или отменена."
                  >
                    Обработан вручную
                  </span>
                ) : (
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
                )}
                {!inTrash && canShowDelete ? (
                  <button
                    className="danger-button manager-order-inline-action"
                    type="button"
                    disabled={!trashGate.ok}
                    title={
                      trashGate.ok
                        ? hardDeleteCompleted
                          ? "Удалить заказ навсегда из Clover (документ в 1С не меняется)"
                          : "Перенести заказ в корзину"
                        : trashGate.error
                    }
                    onClick={() => onDeleteOrder(order)}
                  >
                    {hardDeleteCompleted ? "Удалить навсегда" : "Удалить"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <details className="manager-order-extra" open={false}>
            <summary>Подробнее</summary>
            <div className="order-meta manager-order-meta">
              <div>
                <span>Номер</span>
                <strong>{order.number || "—"}</strong>
              </div>
              <div>
                <span>Создан</span>
                <strong>{order.createdAt ? formatDateTime(order.createdAt) : "—"}</strong>
              </div>
              <div>
                <span>Дата доставки</span>
                <strong>{order.firstDeliveryDate ? formatDate(order.firstDeliveryDate) : "не указана"}</strong>
              </div>
              <div>
                <span>Позиций</span>
                <strong>{getPositionCount(order)}</strong>
              </div>
              {(order.customerContact || order.customerPhone || order.customerEmail) ? (
                <div className="order-meta-wide">
                  <span>Контакт</span>
                  <strong>
                    {[order.customerContact, order.customerPhone, order.customerEmail]
                      .filter(Boolean)
                      .join(" · ")}
                  </strong>
                </div>
              ) : null}
              <div className="order-meta-wide">
                <span>Адрес</span>
                <strong>{order.address || "—"}</strong>
              </div>
            </div>
            {order.clientComment ? (
              <div className="manager-client-comment">
                <div className="comment-box comment-box-compact">
                  <strong>Комментарий клиента:</strong>
                  <p>{order.clientComment}</p>
                </div>
              </div>
            ) : null}
            <div className="manager-order-controls">
              <div className="exchange-actions">
                {inTrash ? (
                  <button className="secondary-button" type="button" onClick={() => printOrderDocument(order, settings)}>Печать</button>
                ) : (
                  <>
                    {canCancelOneCTransfer(exchange) ? (
                      <button
                        className="danger-button manager-cancel-onec-button"
                        type="button"
                        disabled={busy}
                        title="Вернуть заказ из очереди 1С. После принятия в 1С отменить нельзя."
                        onClick={() => void runExchangeAction(order, "cancel")}
                      >
                        Отменить передачу в 1С
                      </button>
                    ) : null}
                    <button className="secondary-button" type="button" onClick={() => printOrderDocument(order, settings)}>Печать</button>
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
                {exchange.message}{exchange.receipt ? ` · Заказ покупателя ${exchange.receipt}` : ""}
              </div>
            )}
            <div className="order-products">
              <OrderLinesTable order={order} settings={settings} />
              {(order.customItems || []).map((item) => (
                inTrash ? (
                  item.photo?.dataUrl ? (
                    <div className="custom-line" key={`${order.id}-${item.id}-photo`}>
                      <div className="manager-request-photo-block">
                        <strong>Фотография клиента</strong>
                        <CustomRequestPhoto photo={item.photo} className="custom-request-photo-manager" />
                      </div>
                    </div>
                  ) : null
                ) : (
                  <div className="custom-line" key={`${order.id}-${item.id}`}>
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
                )
              ))}
            </div>
            <OrderTimeline order={order} />
          </details>
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
