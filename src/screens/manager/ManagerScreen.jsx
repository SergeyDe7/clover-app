// Экран менеджера/администратора: заказы, клиенты, товары, обмен с 1С, настройки.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../serverApi";
import { ORDER_STATUSES, allowedNextOrderStatuses } from "../../config/orderConfig";
import { VirtualList } from "../../components/VirtualList";
import { AdminRolePanel } from "../../components/AdminRolePanel";
import { PanelErrorBoundary, OrderTimeline, Header, CustomRequestPhoto, PasswordSecurityPanel, PushSettings } from "../../shared/SharedPanels";
import {
  MANAGER_TABS,
  MANAGER_MORE_TABS,
  readManagerActiveTab,
  writeManagerActiveTab,
  readManagerMoreTab,
  writeManagerMoreTab,
  readOpenManagerClientId,
  writeOpenManagerClientId,
  UNIT_CONFIG,
  getRussianPhoneLocalDigits,
  formatRussianPhone,
  selectDefaultNumber,
  UNIT_ORDER,
  EMPTY_LINK,
  EXCHANGE_STATUS_LABELS,
  normalizeOrderExchange,
  exchangeBadgeClass,
  downloadBlobFile,
  printOrderDocument,
  normalizeProduct,
  formatDate,
  formatDateTime,
  formatMoney,
  hasPurchasePrice,
  hasManualUnitValue,
  prefillManualPriceFromProduct,
  calculateMarkupPreview,
  getOrderTotal,
  getPositionCount,
  statusClass,
  reconciliationPeriodLabel,
  RECONCILIATION_STATUS_LABELS,
} from "../../shared/appHelpers";

const CUSTOM_STATUSES = [
  "Новый запрос",
  "Уточняется",
  "Согласован",
  "Добавлен в каталог",
  "Отклонён",
];

function ManagerReconciliation({ requests = [], onReload }) {
  const [busyId, setBusyId] = useState("");
  const [comments, setComments] = useState({});

  const update = async (item, status) => {
    setBusyId(item.id);
    try {
      await api.updateReconciliation(item.id, { status, managerComment: comments[item.id] ?? item.managerComment ?? "" });
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusyId("");
    }
  };

  const upload = async (item, file) => {
    if (!file) return;
    setBusyId(item.id);
    try {
      await api.uploadReconciliationFile(item.id, file, comments[item.id] ?? item.managerComment ?? "");
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading"><div><p className="eyebrow">Документы</p><h2>Запросы актов сверки</h2><p>Подготовьте акт в 1С, прикрепите PDF и клиент получит уведомление.</p></div></div>
      <div className="reconciliation-list">
        {requests.length ? requests.map((item) => (
          <article className="manager-reconciliation-row" key={item.id}>
            <div><span className={`badge ${item.status === "ready" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>{RECONCILIATION_STATUS_LABELS[item.status] || item.status}</span><h3>{item.client?.companyName || item.client?.email || "Клиент"}</h3><p>{reconciliationPeriodLabel(item)} · {formatDateTime(item.createdAt)}</p>{item.clientComment && <p>Комментарий клиента: {item.clientComment}</p>}</div>
            <label className="field">Комментарий менеджера<input value={comments[item.id] ?? item.managerComment ?? ""} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
            <div className="inline-actions">
              <button className="secondary-button" type="button" disabled={busyId === item.id} onClick={() => update(item, "processing")}>В работу</button>
              <label className="import-label">Прикрепить PDF<input type="file" accept="application/pdf" disabled={busyId === item.id} onChange={(event) => upload(item, event.target.files?.[0])} /></label>
              <button className="danger-button" type="button" disabled={busyId === item.id} onClick={() => update(item, "rejected")}>Отклонить</button>
            </div>
          </article>
        )) : <div className="empty-box">Новых запросов актов сверки нет.</div>}
      </div>
    </section>
  );
}

function ManagerPromotionPanel() {
  const [title, setTitle] = useState("Новость Clover");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const result = await api.sendPromotion(title, body);
      alert(result.result?.enabled ? `Отправлено: ${result.result.sent}` : "Push пока не настроен на сервере.");
      setBody("");
    } catch (error) { alert(error.message); } finally { setBusy(false); }
  };
  return (
    <div className="manager-contact-settings">
      <h3>Push-уведомление об акции или новинке</h3>
      <div className="form-grid"><label className="field">Заголовок<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field field-wide">Текст<textarea rows="3" value={body} onChange={(event) => setBody(event.target.value)} /></label></div>
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy || !body.trim()} onClick={send}>Отправить подписанным клиентам</button></div>
    </div>
  );
}

function ManagerOrders({ orders, settings, onUpdateOrder, onBulkUpdateOrders, onDeleteOrder, onCreateProductFromCustom, onReload, headerSearch = "" }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Все");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("Принят");
  const [bulkBusy, setBulkBusy] = useState(false);
  const effectiveSearch = headerSearch.trim() || search;

  const visible = useMemo(() => {
    const needle = effectiveSearch.trim().toLowerCase();
    return [...orders].filter((order) => {
      const exchange = normalizeOrderExchange(order.exchange);
      const haystack = `${order.number} ${order.externalId || ""} ${order.customerName} ${order.customerContact} ${order.customerPhone} ${order.customerEmail} ${order.address}`.toLowerCase();
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
          <input type="search" placeholder="Поиск по заказу, клиенту, телефону или ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option>Все</option>{ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={exchangeFilter} onChange={(e) => setExchangeFilter(e.target.value)}><option value="all">Все статусы 1С</option>{Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="delivery">По дате доставки</option></select>
      </div>
      <div className="panel" style={{ marginTop: 14, marginBottom: 18, padding: 16 }}>
        <div className="toolbar four">
          <button className="secondary-button" type="button" onClick={selectVisible}>
            {visible.length > 0 && visible.every((order) => selectedIds.includes(order.id))
              ? "Снять выбор с видимых"
              : "Выбрать все видимые"}
          </button>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
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

      {visible.length ? <VirtualList className="manager-grid" items={visible} itemHeight={400} height={Math.min(720, typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.72) : 720)} getItemKey={(order) => order.id} renderItem={(order) => {
        const exchange = normalizeOrderExchange(order.exchange);
        const busy = busyOrderId === order.id;
        return (
        <article className="order-card" key={order.id}>
          <div className="order-card-header">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(order.id)}
                onChange={() => toggleSelected(order.id)}
                aria-label={`Выбрать заказ ${order.number}`}
              />
            </label>
            <div>
              <div className="exchange-status-line"><span className={`badge ${statusClass(order.status)}`}>{order.status}</span><span className={`badge ${exchangeBadgeClass(exchange.status)}`}>1С: {EXCHANGE_STATUS_LABELS[exchange.status]}</span></div>
              <h3>Заказ № {order.number} · {order.customerName || "Клиент"}</h3>
              <p>{order.customerContact} · {order.customerPhone} · {order.customerEmail}</p>
              <p className="small">Внешний ID: {order.externalId || order.id}</p>
            </div>
            <strong className="success-text">{settings.showPrices && getOrderTotal(order) > 0 ? formatMoney(getOrderTotal(order)) : `${getPositionCount(order)} поз.`}</strong>
          </div>
          <div className="order-meta">
            <div><span>Доставка</span><strong>{formatDate(order.firstDeliveryDate)}</strong></div>
            <div><span>Адрес</span><strong>{order.address}</strong></div>
            <div><span>Позиций</span><strong>{getPositionCount(order)}</strong></div>
            <div><span>Создан</span><strong>{formatDateTime(order.createdAt)}</strong></div>
          </div>
          <div className="manager-order-controls">
            <label className="field">Статус заказа
              <select value={order.status} onChange={(e) => onUpdateOrder(order.id, { status: e.target.value, updatedAt: new Date().toISOString() })}>{allowedNextOrderStatuses(order.status).map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <div className="exchange-actions" style={{ alignSelf: "end" }}>
              <button className="secondary-button" type="button" onClick={() => printOrderDocument(order, settings)}>Печать</button>
              {settings.managerCanDeleteOrders && <button className="danger-button" type="button" onClick={() => onDeleteOrder(order)}>Удалить</button>}
            </div>
          </div>
          <div className="order-onec-box">
            <strong className="order-onec-title">Обмен с 1С · {EXCHANGE_STATUS_LABELS[exchange.status]} · попыток {exchange.attempts}</strong>
            {exchange.message && <div className="exchange-message">{exchange.message}{exchange.receipt ? ` · квитанция ${exchange.receipt}` : ""}</div>}
            <div className="exchange-actions">
              <button className="secondary-button" disabled={busy} type="button" onClick={() => runExchangeAction(order, "check")}>Проверить</button>
              <button className="primary-button" disabled={busy || exchange.status === "sending"} type="button" onClick={() => runExchangeAction(order, "send")}>{exchange.status === "sending" ? "Ожидает ACK 1С" : exchange.status === "ready" ? "Обновить очередь" : exchange.status === "sent" || exchange.status === "error" ? "Передать повторно" : "Передать в 1С TEST"}</button>
              <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOrder(order, "json")}>JSON</button>
              <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOrder(order, "csv")}>CSV</button>
              {exchange.status !== "not_sent" && <button className="secondary-button" disabled={busy || exchange.status === "sending"} type="button" onClick={() => runExchangeAction(order, "reset")}>Сбросить</button>}
            </div>
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
        </article>
      );}} /> : <div className="empty-box">Заказы не найдены.</div>}
    </section>
  );
}

function OneCClientPicker({ client, link, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(client.companyName || "");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCandidates = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const candidates = await api.getOneCClientCandidates(client.id);
      if ((candidates.items || []).length) {
        setItems(candidates.items || []);
        return;
      }
      const result = await api.getOneCClients({ search: client.companyName || "", limit: 30 });
      setItems(result.items || []);
    } catch (loadError) {
      setError(loadError.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCClients({ search, limit: 50 });
      setItems(result.items || []);
    } catch (searchError) {
      setError(searchError.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const selectClient = async (item) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.linkOneCClient(client.id, item.id, item);
      onChange(result.clientLink || {});
      setOpen(false);
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setLoading(false);
    }
  };

  const clearLink = () => {
    onChange({
      matched1C: false,
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCInn: "",
      oneCLinkMode: "manual-cleared",
      oneCLinkedAt: "",
    });
  };

  return (
    <div className="one-c-client-picker">
      <div className="one-c-link-editor-head">
        <div>
          <span className={link.oneCId ? "badge green" : "badge yellow"}>
            {link.oneCId ? "Связан с 1С" : "Будет определён при заказе"}
          </span>
          <p className="muted small" style={{ marginTop: 8 }}>
            {link.oneCId
              ? `${link.oneCName || "Контрагент 1С"} · ${link.oneCCode || "без кода"}`
              : "Clover передаст название, телефон и email. Если 1С вернёт ID контрагента, связь сохранится автоматически."}
          </p>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={loadCandidates}>
            {link.oneCId ? "Изменить контрагента" : "Выбрать контрагента 1С"}
          </button>
          {link.oneCId && (
            <button className="secondary-button" type="button" onClick={clearLink}>Убрать связь</button>
          )}
        </div>
      </div>

      {open && (
        <div className="one-c-picker">
          <div className="one-c-products-search">
            <input
              type="search"
              value={search}
              placeholder="Название, ИНН, телефон, email или код"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
            <button className="secondary-button" type="button" disabled={loading} onClick={runSearch}>
              {loading ? "Поиск..." : "Найти"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
          {error && <div className="sync-error">{error}</div>}
          <div className="one-c-products-list one-c-picker-list">
            {items.map((item) => {
              const linkedToCurrent = item.cloverLink && String(item.cloverLink.clientId) === String(client.id);
              const linkedElsewhere = item.cloverLink && !linkedToCurrent;
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>Код: {item.code || "—"} · ИНН: {item.inn || "—"}</span>
                    {(item.phone || item.email) && <span>{item.phone || ""} {item.email || ""}</span>}
                    {Number(item.score) > 0 && <span className="muted small">Совпадение: {Math.round(Number(item.score) * 100)}%</span>}
                    {linkedElsewhere && <span className="warning-text">Уже связан с клиентом Clover: {item.cloverLink.clientName}</span>}
                  </div>
                  <button
                    className={linkedToCurrent ? "secondary-button" : "primary-button"}
                    type="button"
                    disabled={loading || Boolean(linkedElsewhere)}
                    onClick={() => selectClient(item)}
                  >
                    {linkedToCurrent ? "Выбрано" : linkedElsewhere ? "Уже связан" : "Выбрать"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">
                Контрагент ещё не загружен. Заказ всё равно передаст данные клиента в 1С, а точная связь сохранится автоматически после подтверждения 1С.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MatrixOneCProductAdd({ clientId, link, setProducts, setClientLinks, onAfterAdd }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const runSearch = async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCProducts({
        search: String(query || "").trim(),
        limit: 50,
        offset: 0,
      });
      setItems(result.items || []);
      setTotal(Number(result.total) || 0);
    } catch (searchError) {
      setError(searchError.message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const openPicker = async () => {
    setOpen(true);
    setNotice("");
    await runSearch(search);
  };

  const selectItem = async (item) => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await api.createProductFromOneCCatalog({
        oneCId: item.id,
        item,
        clientId,
      });
      if (Array.isArray(result.products)) {
        setProducts(result.products.map(normalizeProduct));
      }
      if (result.clientLinks) {
        setClientLinks(result.clientLinks);
      } else if (result.clientLink) {
        setClientLinks((current) => ({
          ...current,
          [clientId]: {
            ...EMPTY_LINK,
            ...(current[clientId] || {}),
            ...result.clientLink,
          },
        }));
      }
      setNotice(
        result.created
          ? `Товар «${result.product?.name || item.name}» добавлен в Clover и в матрицу.`
          : `Товар уже был в Clover — добавлен в матрицу: «${result.product?.name || item.name}».`
      );
      onAfterAdd?.(result);
      setOpen(false);
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="matrix-onec-add" style={{ marginTop: 12 }}>
      <div className="toolbar two">
        <p className="muted small" style={{ margin: 0 }}>
          Можно взять позицию прямо из каталога 1С: товар появится в разделе «Товары» и в матрице клиента.
          {link.matrixMode === "all" ? " В режиме «все товары» позиция сразу доступна клиенту." : ""}
        </p>
        <button className="secondary-button" type="button" onClick={openPicker} disabled={loading}>
          Добавить из 1С
        </button>
      </div>
      {notice && <div className="matrix-save-message saved" style={{ marginTop: 8 }}>{notice}</div>}
      {open && (
        <div className="one-c-picker" style={{ marginTop: 10 }}>
          <div className="one-c-products-search">
            <input
              type="search"
              value={search}
              placeholder="Название или код номенклатуры 1С"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
            <button className="secondary-button" type="button" disabled={loading} onClick={() => runSearch()}>
              {loading ? "Поиск..." : "Найти"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
          {error && <div className="sync-error">{error}</div>}
          <p className="muted small">Найдено: {total}. Показаны первые {items.length || 0}.</p>
          <div className="one-c-products-list one-c-picker-list">
            {items.map((item) => {
              const alreadyInClover = Boolean(item.cloverLink?.productId);
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>Код: {item.code || "—"}</span>
                    {alreadyInClover && (
                      <span className="muted small">
                        Уже в Clover: {item.cloverLink.productName || `ID ${item.cloverLink.productId}`}
                      </span>
                    )}
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={loading}
                    onClick={() => selectItem(item)}
                  >
                    {alreadyInClover ? "В матрицу" : "Добавить"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">Номенклатура не найдена. Уточните запрос или обновите выгрузку из 1С.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeManagerClientAddresses(addresses = []) {
  const normalized = (Array.isArray(addresses) ? addresses : [])
    .map((item, index) => {
      if (typeof item === "string") {
        const address = item.trim();
        if (!address) return null;
        return {
          id: `legacy-address-${index}`,
          label: index === 0 ? "Основной адрес" : `Адрес ${index + 1}`,
          address,
          isDefault: index === 0,
        };
      }

      const address = String(item?.address || "").trim();
      if (!address) return null;

      return {
        id: String(item?.id || `address-${index}`),
        label: String(item?.label || `Адрес ${index + 1}`).trim(),
        address,
        isDefault: Boolean(item?.isDefault),
      };
    })
    .filter(Boolean);

  if (normalized.length && !normalized.some((item) => item.isDefault)) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }

  let defaultFound = false;
  return normalized.map((item) => {
    if (!item.isDefault) return item;
    if (defaultFound) return { ...item, isDefault: false };
    defaultFound = true;
    return item;
  });
}

function createManagerClientForm(client) {
  return {
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
    managerNote: client.managerNote || "",
    addresses: normalizeManagerClientAddresses(client.addresses),
  };
}

function ManagerClientEditor({ client, onReload, onClose }) {
  const [form, setForm] = useState(() => createManagerClientForm(client));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const clientVersion = JSON.stringify({
    id: client.id,
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
    managerNote: client.managerNote || "",
    addresses: normalizeManagerClientAddresses(client.addresses),
  });

  useEffect(() => {
    setForm(createManagerClientForm(client));
  }, [clientVersion]);

  const setProfileField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  };

  const updateAddress = (addressId, patch) => {
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((item) => {
        if (patch.isDefault === true) {
          return item.id === addressId
            ? { ...item, ...patch, isDefault: true }
            : { ...item, isDefault: false };
        }
        return item.id === addressId ? { ...item, ...patch } : item;
      }),
    }));
    setMessage("");
    setError("");
  };

  const addAddress = () => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `address-${Date.now()}`;
    setForm((current) => ({
      ...current,
      addresses: [
        ...current.addresses,
        {
          id,
          label: "",
          address: "",
          isDefault: current.addresses.length === 0,
        },
      ],
    }));
    setMessage("");
    setError("");
  };

  const removeAddress = (addressId) => {
    setForm((current) => {
      const removed = current.addresses.find((item) => item.id === addressId);
      const addresses = current.addresses.filter((item) => item.id !== addressId);
      if (removed?.isDefault && addresses.length) {
        addresses[0] = { ...addresses[0], isDefault: true };
      }
      return { ...current, addresses };
    });
    setMessage("");
    setError("");
  };

  const save = async () => {
    const companyName = form.companyName.trim();
    const contactName = form.contactName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();
    const managerNote = form.managerNote.trim();
    const addresses = form.addresses.map((item) => ({
      ...item,
      label: item.label.trim(),
      address: item.address.trim(),
    }));

    if (!companyName && !contactName) {
      setError("Укажите название компании или имя клиента.");
      return;
    }
    if (!email) {
      setError("Укажите email клиента.");
      return;
    }
    if (addresses.some((item) => !item.label || !item.address)) {
      setError("Заполните название и полный адрес во всех строках.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api.updateClient(client.id, {
        profile: {
          companyName,
          contactName,
          phone,
          email,
          managerNote,
        },
        addresses,
      });
      setMessage("Данные клиента сохранены в Clover.");
      await onReload();
    } catch (saveError) {
      setError(saveError.message || "Не удалось сохранить данные клиента.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="client-profile-panel" id={`client-profile-${client.id}`}>
      <div className="client-profile-panel-head">
        <div>
          <p className="eyebrow">Профиль</p>
          <h3>Данные клиента</h3>
          <p className="muted small">Телефон, email, адреса и заметка менеджера</p>
        </div>
        {onClose && (
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        )}
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">
          Компания или торговая точка
          <input
            value={form.companyName}
            onChange={(event) => setProfileField("companyName", event.target.value)}
          />
        </label>
        <label className="field">
          Контактное лицо
          <input
            value={form.contactName}
            onChange={(event) => setProfileField("contactName", event.target.value)}
          />
        </label>
        <label className="field">
          Телефон
          <input
            value={form.phone}
            onChange={(event) => setProfileField("phone", event.target.value)}
          />
        </label>
        <label className="field">
          Email для входа клиента
          <input
            type="email"
            value={form.email}
            onChange={(event) => setProfileField("email", event.target.value)}
          />
        </label>
      </div>

      <div className="manager-client-addresses">
        <div className="manager-client-addresses-heading">
          <strong>Адреса доставки</strong>
          <button className="secondary-button" type="button" onClick={addAddress}>
            + Добавить адрес
          </button>
        </div>
        {form.addresses.map((item) => (
          <div className="manager-client-address-row" key={item.id}>
            <label className="field">
              Название
              <input
                value={item.label}
                placeholder="Например: Основной магазин"
                onChange={(event) => updateAddress(item.id, { label: event.target.value })}
              />
            </label>
            <label className="field manager-client-address-field">
              Полный адрес
              <input
                value={item.address}
                placeholder="Город, улица, дом, помещение"
                onChange={(event) => updateAddress(item.id, { address: event.target.value })}
              />
            </label>
            <label className="manager-client-default-address">
              <input
                type="radio"
                name={`default-address-${client.id}`}
                checked={Boolean(item.isDefault)}
                onChange={() => updateAddress(item.id, { isDefault: true })}
              />
              Основной
            </label>
            <button
              className="danger-button"
              type="button"
              onClick={() => removeAddress(item.id)}
            >
              Удалить
            </button>
          </div>
        ))}
        {!form.addresses.length && (
          <div className="empty-box">Адресов пока нет.</div>
        )}
      </div>

      <label className="field" style={{ marginTop: 14 }}>
        Комментарий менеджера
        <textarea
          rows="4"
          maxLength="2000"
          placeholder="Например: звонить перед доставкой, принимает товар до 16:00"
          value={form.managerNote}
          onChange={(event) => setProfileField("managerNote", event.target.value)}
        />
        <small>Виден только менеджерам Clover. Клиенту и в 1С не передаётся.</small>
      </label>

      <div className="matrix-catalog-note" style={{ marginTop: 14 }}>
        Изменения используются в новых заказах Clover. Данные контрагента в 1С автоматически не перезаписываются. При изменении email клиент будет входить по новому адресу.
      </div>

      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="sync-success" style={{ marginTop: 12 }}>{message}</div>}
      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary-button" type="button" disabled={saving} onClick={save}>
          {saving ? "Сохраняем..." : "Сохранить данные клиента"}
        </button>
      </div>
    </section>
  );
}

function ClientCardMenu({ open, onToggle, onClose, items = [] }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose?.();
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="client-card-menu" ref={menuRef}>
      <button
        className="client-card-menu-trigger"
        type="button"
        aria-label="Действия с клиентом"
        aria-expanded={open}
        onClick={onToggle}
      >
        ⋮
      </button>
      {open && (
        <div className="client-card-menu-panel" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              className={item.danger ? "client-card-menu-item danger" : "client-card-menu-item"}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                onClose?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerClients({
  clients,
  products,
  setProducts,
  clientLinks,
  setClientLinks,
  onReload,
}) {
  const [search, setSearch] = useState("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [defaultMarkupDrafts, setDefaultMarkupDrafts] = useState({});
  const [individualMarkupDrafts, setIndividualMarkupDrafts] = useState({});
  const [matrixSaveState, setMatrixSaveState] = useState({});
  const [openClientId, setOpenClientId] = useState(readOpenManagerClientId);
  const [approvalBusyId, setApprovalBusyId] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [profileOpenId, setProfileOpenId] = useState("");
  const restoredOpenClient = useRef(false);

  useEffect(() => {
    if (restoredOpenClient.current || !openClientId) return;
    const target = document.getElementById(`client-matrix-${openClientId}`);
    if (!target) return;

    restoredOpenClient.current = true;
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }, [openClientId, clients]);

  const setApproval = async (client, status) => {
    setApprovalBusyId(client.id);
    try {
      await api.setClientApproval(client.id, status);
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setApprovalBusyId("");
    }
  };

  const visible = clients.filter((client) =>
    `${client.companyName} ${client.contactName} ${client.phone} ${client.email}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  const updateLink = (clientId, patch) => {
    setClientLinks((current) => ({
      ...current,
      [clientId]: {
        ...EMPTY_LINK,
        ...(current[clientId] || {}),
        ...patch,
      },
    }));
    setMatrixSaveState((current) => ({
      ...current,
      [clientId]: {
        status: "dirty",
        message:
          "Есть несохранённые изменения. Нажмите «Сохранить матрицу», иначе после F5 они пропадут.",
      },
    }));
  };

  const updatePersonalPrice = (
    clientId,
    link,
    productId,
    patch,
    product = null
  ) => {
    const key = String(productId);
    const currentPrice = {
      source: "inherit",
      ...(link.personalPrices?.[key] || {}),
    };

    let nextPrice = {
      ...currentPrice,
      ...patch,
    };

    if (nextPrice.source === "manual" && product) {
      nextPrice = prefillManualPriceFromProduct(product, nextPrice);
    }

    const nextPrices = {
      ...(link.personalPrices || {}),
    };

    if (nextPrice.source === "inherit") {
      delete nextPrices[key];
    } else {
      nextPrices[key] = nextPrice;
    }

    updateLink(clientId, {
      personalPrices: nextPrices,
    });
  };

  const parsePriceInput = (value) =>
    value === "" ? null : Math.max(0, Number(value) || 0);

  const normalizePercentInput = (value) => {
    if (value === "" || value === null || value === undefined) return 0;
    return Math.max(0, Number(value) || 0);
  };

  const getDefaultMarkupDraft = (clientId, link) =>
    Object.prototype.hasOwnProperty.call(defaultMarkupDrafts, clientId)
      ? defaultMarkupDrafts[clientId]
      : String(link.defaultMarkupPercent ?? "");

  const getIndividualMarkupDraft = (clientId, productId, price) => {
    const clientDrafts = individualMarkupDrafts[clientId] || {};
    const key = String(productId);
    return Object.prototype.hasOwnProperty.call(clientDrafts, key)
      ? clientDrafts[key]
      : String(price.markupPercent ?? "");
  };

  const saveClientMatrix = async (clientId, link) => {
    setMatrixSaveState((current) => ({
      ...current,
      [clientId]: { status: "saving", message: "Сохраняем матрицу..." },
    }));

    const nextLink = {
      ...link,
      defaultMarkupPercent: normalizePercentInput(
        getDefaultMarkupDraft(clientId, link)
      ),
      personalPrices: { ...(link.personalPrices || {}) },
    };

    const productDrafts = individualMarkupDrafts[clientId] || {};
    for (const [productId, rawValue] of Object.entries(productDrafts)) {
      const currentPrice = nextLink.personalPrices[productId];
      if (currentPrice?.source === "purchase_markup") {
        nextLink.personalPrices[productId] = {
          ...currentPrice,
          markupPercent: normalizePercentInput(rawValue),
        };
      }
    }

    const productsById = new Map(
      (Array.isArray(products) ? products : []).map((item) => [
        String(item.id),
        item,
      ])
    );
    for (const [productId, config] of Object.entries(nextLink.personalPrices)) {
      if (config?.source !== "manual") continue;
      const product = productsById.get(String(productId));
      if (!product) continue;
      const filled = prefillManualPriceFromProduct(product, config);
      if (!hasManualUnitValue(filled)) {
        setMatrixSaveState((current) => ({
          ...current,
          [clientId]: {
            status: "error",
            message:
              `Для «${product.name}» выбрана фиксированная цена, но сумма не указана. Введите цену или верните «По умолчанию клиента».`,
          },
        }));
        return;
      }
      nextLink.personalPrices[productId] = filled;
    }

    const nextLinks = {
      ...clientLinks,
      [clientId]: nextLink,
    };

    try {
      setClientLinks(nextLinks);
      await api.saveClientLinks(nextLinks);
      setDefaultMarkupDrafts((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
      setIndividualMarkupDrafts((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
      setMatrixSaveState((current) => ({
        ...current,
        [clientId]: { status: "saved", message: "Матрица сохранена." },
      }));
    } catch (error) {
      setMatrixSaveState((current) => ({
        ...current,
        [clientId]: {
          status: "error",
          message: error.message || "Не удалось сохранить матрицу.",
        },
      }));
    }
  };

  return (
    <PanelErrorBoundary label="Ошибка раздела «Клиенты»">
    <section>
      <div className="toolbar two">
        <input
          type="search"
          placeholder="Поиск клиента"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="mini-card">
          <span className="mini-label">Клиентов</span>
          <strong>{clients.length}</strong>
        </div>
      </div>

      {visible.length ? (
        <div className="client-list">
          {visible.map((client) => {
            const rawLink = {
              ...EMPTY_LINK,
              ...(clientLinks[client.id] || {}),
            };
            const link = {
              ...rawLink,
              matrixProductIds: Array.isArray(rawLink.matrixProductIds)
                ? rawLink.matrixProductIds
                : [],
              personalPrices:
                rawLink.personalPrices && typeof rawLink.personalPrices === "object"
                  ? { ...rawLink.personalPrices }
                  : {},
            };
            const matrixProductIds = link.matrixProductIds;
            const orderedIds = [
              ...new Set(
                (Array.isArray(client.orders) ? client.orders : []).flatMap((order) =>
                  (order.items || []).map(
                    (item) => item.productId ?? item.id
                  )
                )
              ),
            ];
            const matrixProducts = (Array.isArray(products) ? products : []).filter(
              (product) =>
                product.active !== false &&
                (!matrixSearch ||
                  String(product.name || "")
                    .toLowerCase()
                    .includes(matrixSearch.toLowerCase()) ||
                  String(product.code || "")
                    .toLowerCase()
                    .includes(matrixSearch.toLowerCase()))
            );
            const personalPriceCount = Object.keys(
              link.personalPrices || {}
            ).length;
            const matrixOpen = String(openClientId) === String(client.id);

            return (
              <article className="client-card" key={client.id}>
                <div className="client-card-header">
                  <div>
                    <span
                      className={
                        link.matched1C
                          ? "badge green"
                          : "badge yellow"
                      }
                    >
                      {link.matched1C
                        ? "Связан с 1С"
                        : "Не сопоставлен"}
                    </span>
                    <h3>
                      {client.companyName || "Клиент без названия"}
                    </h3>
                    <p className="muted small">
                      {client.contactName} · {client.phone} ·{" "}
                      {client.email}
                    </p>
                  </div>
                  <div className="client-card-header-actions">
                    <strong>{client.orders.length} заказов</strong>
                    <ClientCardMenu
                      open={String(openMenuId) === String(client.id)}
                      onToggle={() =>
                        setOpenMenuId((current) =>
                          String(current) === String(client.id) ? "" : client.id
                        )
                      }
                      onClose={() => setOpenMenuId("")}
                      items={[
                        ...(client.isRegistered !== false
                          ? [
                              {
                                id: "profile",
                                label: "Данные клиента",
                                onSelect: () => {
                                  setProfileOpenId(client.id);
                                  window.setTimeout(() => {
                                    document
                                      .getElementById(`client-profile-${client.id}`)
                                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  }, 50);
                                },
                              },
                            ]
                          : []),
                        {
                          id: "matrix",
                          label: "Матрица и 1С",
                          onSelect: () => {
                            setOpenClientId(client.id);
                            writeOpenManagerClientId(client.id);
                            window.setTimeout(() => {
                              const target = document.getElementById(
                                `client-matrix-${client.id}`
                              );
                              if (target instanceof HTMLDetailsElement) {
                                target.open = true;
                              }
                              target?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }, 50);
                          },
                        },
                        ...(client.isRegistered !== false &&
                        client.approvalStatus === "approved"
                          ? [
                              {
                                id: "block",
                                label: "Заблокировать вход",
                                danger: true,
                                disabled: approvalBusyId === client.id,
                                onSelect: () => {
                                  if (
                                    window.confirm(
                                      "Заблокировать вход этому клиенту? Он не сможет войти в Clover, пока вы снова не разрешите доступ."
                                    )
                                  ) {
                                    setApproval(client, "rejected");
                                  }
                                },
                              },
                            ]
                          : []),
                        ...(client.isRegistered !== false &&
                        client.approvalStatus === "rejected"
                          ? [
                              {
                                id: "allow",
                                label: "Разрешить вход",
                                disabled:
                                  approvalBusyId === client.id ||
                                  !client.emailVerified,
                                onSelect: () => setApproval(client, "approved"),
                              },
                            ]
                          : []),
                        ...(client.isRegistered !== false &&
                        client.approvalStatus === "pending"
                          ? [
                              {
                                id: "approve",
                                label: "Разрешить вход",
                                disabled:
                                  approvalBusyId === client.id ||
                                  !client.emailVerified,
                                onSelect: () => setApproval(client, "approved"),
                              },
                              {
                                id: "reject",
                                label: "Отклонить регистрацию",
                                danger: true,
                                disabled: approvalBusyId === client.id,
                                onSelect: () => {
                                  if (
                                    window.confirm(
                                      "Отклонить регистрацию? Клиент не сможет войти, пока доступ не разрешат снова."
                                    )
                                  ) {
                                    setApproval(client, "rejected");
                                  }
                                },
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>

                <div className="client-metrics">
                  <article>
                    <span>Заказов</span>
                    <strong>{client.orders.length}</strong>
                  </article>
                  <article>
                    <span>Активных</span>
                    <strong>
                      {
                        client.orders.filter(
                          (order) =>
                            !["Выполнен", "Отменён"].includes(
                              order.status
                            )
                        ).length
                      }
                    </strong>
                  </article>
                  <article>
                    <span>Товаров в матрице</span>
                    <strong>
                      {link.matrixMode === "all"
                        ? products.filter((item) => item.active !== false).length
                        : matrixProductIds.length}
                    </strong>
                  </article>
                  <article>
                    <span>Персональных цен</span>
                    <strong>{personalPriceCount}</strong>
                  </article>
                </div>

                {client.isRegistered !== false && client.approvalStatus === "pending" && (
                  <div className="approval-box">
                    <div>
                      <strong>Новая регистрация</strong>
                      <p>
                        {client.emailVerified
                          ? "Почта подтверждена — можно разрешить вход в Clover."
                          : "Сначала клиент должен подтвердить электронную почту."}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={approvalBusyId === client.id || !client.emailVerified}
                        onClick={() => setApproval(client, "approved")}
                      >
                        Разрешить вход
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={approvalBusyId === client.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Отклонить регистрацию? Клиент не сможет войти, пока доступ не разрешат снова."
                            )
                          ) {
                            setApproval(client, "rejected");
                          }
                        }}
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                )}

                {client.isRegistered !== false && client.approvalStatus === "rejected" && (
                  <div className="approval-box approval-box-rejected">
                    <div>
                      <strong>Вход заблокирован</strong>
                      <p>Клиент не может авторизоваться в Clover.</p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={approvalBusyId === client.id || !client.emailVerified}
                        onClick={() => setApproval(client, "approved")}
                      >
                        Разрешить вход
                      </button>
                    </div>
                  </div>
                )}

                {client.isRegistered !== false &&
                String(profileOpenId) === String(client.id) ? (
                  <ManagerClientEditor
                    client={client}
                    onReload={onReload}
                    onClose={() => setProfileOpenId("")}
                  />
                ) : null}

                {client.isRegistered === false && (
                  <div className="matrix-catalog-note" style={{ marginTop: 15 }}>
                    Это клиент из старого заказа без отдельного аккаунта Clover. Его данные в заказе сохранены, но карточка станет редактируемой после регистрации клиента.
                  </div>
                )}

                <details
                  id={`client-matrix-${client.id}`}
                  className="order-details"
                  style={{ marginTop: 15 }}
                  open={matrixOpen}
                  onToggle={(event) => {
                    const isOpen = Boolean(event.currentTarget.open);
                    setOpenClientId((current) => {
                      const value = isOpen
                        ? String(client.id)
                        : String(current) === String(client.id)
                          ? ""
                          : current;
                      writeOpenManagerClientId(value);
                      return value;
                    });
                  }}
                >
                  <summary>
                    Товарная матрица, цены и связь с 1С
                  </summary>

                  {matrixOpen && (
                  <PanelErrorBoundary label="Ошибка блока матрицы клиента">
                  <OneCClientPicker
                    client={client}
                    link={link}
                    onChange={(patch) => updateLink(client.id, patch)}
                  />

                  <div
                    className="form-grid"
                    style={{ marginTop: 14 }}
                  >
                    <label className="field">
                      Точное название в 1С — необязательно
                      <input
                        value={link.oneCMatchName || ""}
                        placeholder={client.companyName || "Название контрагента"}
                        onChange={(event) => updateLink(client.id, { oneCMatchName: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      ИНН для точного сопоставления
                      <input
                        value={link.oneCMatchInn || ""}
                        inputMode="numeric"
                        onChange={(event) => updateLink(client.id, { oneCMatchInn: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      Код контрагента в 1С — необязательно
                      <input
                        value={link.oneCMatchCode || ""}
                        onChange={(event) => updateLink(client.id, { oneCMatchCode: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      Режим товарной матрицы
                      <select
                        value={link.matrixMode}
                        onChange={(event) =>
                          updateLink(client.id, {
                            matrixMode: event.target.value,
                          })
                        }
                      >
                        <option value="pending">
                          Матрица подготавливается
                        </option>
                        <option value="selected">
                          Только выбранные товары
                        </option>
                        <option value="all">
                          Все активные товары
                        </option>
                      </select>
                    </label>

                    <label className="field">
                      Полный каталог для клиента
                      <select
                        value={
                          link.allowFullCatalog ? "yes" : "no"
                        }
                        onChange={(event) =>
                          updateLink(client.id, {
                            allowFullCatalog:
                              event.target.value === "yes",
                          })
                        }
                      >
                        <option value="no">
                          Скрыт — только матрица
                        </option>
                        <option value="yes">
                          Разрешить просмотр
                        </option>
                      </select>
                    </label>


                    <label className="field">
                      Цена по умолчанию для матрицы
                      <select
                        value={link.defaultPricingMode || "base"}
                        onChange={(event) =>
                          updateLink(client.id, {
                            defaultPricingMode: event.target.value,
                          })
                        }
                      >
                        <option value="base">
                          Базовая цена Clover
                        </option>
                        <option value="purchase_markup">
                          Закупка 1С + общий процент
                        </option>
                      </select>
                    </label>

                    {link.defaultPricingMode === "purchase_markup" && (
                      <label className="field">
                        Общая наценка для клиента, %
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="0.1"
                          value={getDefaultMarkupDraft(client.id, link)}
                          onChange={(event) =>
                            setDefaultMarkupDrafts((current) => ({
                              ...current,
                              [client.id]: event.target.value,
                            }))
                          }
                          onBlur={() =>
                            updateLink(client.id, {
                              defaultMarkupPercent: normalizePercentInput(
                                getDefaultMarkupDraft(client.id, link)
                              ),
                            })
                          }
                        />
                        <small>
                          Применяется ко всем товарам без индивидуального исключения.
                        </small>
                      </label>
                    )}
                  </div>

                  <label
                    className="field"
                    style={{ marginTop: 12 }}
                  >
                    Заметка по матрице и связи с 1С
                    <textarea
                      rows="3"
                      value={link.managerNote}
                      onChange={(event) =>
                        updateLink(client.id, {
                          managerNote: event.target.value,
                        })
                      }
                    />
                    <small>Видна только менеджерам и относится к настройкам матрицы/1С.</small>
                  </label>

                  {link.matrixMode === "pending" && (
                    <div className="matrix-catalog-note pending" style={{ marginTop: 14 }}>
                      Сначала выберите режим товарной матрицы. Настройки цен сохранятся вместе с матрицей.
                    </div>
                  )}

                  {link.matrixMode !== "pending" && (
                    <div style={{ marginTop: 14 }}>
                      <MatrixOneCProductAdd
                        clientId={client.id}
                        link={link}
                        setProducts={setProducts}
                        setClientLinks={setClientLinks}
                      />
                      <div className="toolbar two">
                        <input
                          type="search"
                          placeholder="Поиск товара в матрице"
                          value={matrixSearch}
                          onChange={(event) =>
                            setMatrixSearch(event.target.value)
                          }
                        />
                        {link.matrixMode === "selected" ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              updateLink(client.id, {
                                matrixMode: "selected",
                                matrixProductIds: orderedIds,
                              })
                            }
                          >
                            Заполнить по истории заказов
                          </button>
                        ) : (
                          <div className="matrix-catalog-note">
                            Все активные товары используют общую схему цены, кроме индивидуальных исключений.
                          </div>
                        )}
                      </div>

                      <div className="matrix-summary">
                        <span>
                          {link.matrixMode === "all"
                            ? `Товаров в матрице: ${products.filter((item) => item.active).length}`
                            : `Выбрано: ${matrixProductIds.length}`}
                        </span>
                        <span>
                          Индивидуальных исключений: {personalPriceCount}
                        </span>
                        {link.matrixMode === "selected" && (
                          <>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                updateLink(client.id, {
                                  matrixMode: "selected",
                                  matrixProductIds: products
                                    .filter((item) => item.active)
                                    .map((item) => item.id),
                                })
                              }
                            >
                              Выбрать все
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                updateLink(client.id, {
                                  matrixProductIds: [],
                                })
                              }
                            >
                              Снять все
                            </button>
                          </>
                        )}
                      </div>

                      <div className="matrix-editor-list">
                        {matrixProducts.map((product) => {
                          const price =
                            link.personalPrices?.[
                              String(product.id)
                            ] || {};
                          const selected =
                            link.matrixMode === "all" ||
                            matrixProductIds.some(
                              (id) => String(id) === String(product.id)
                            );
                          const priceMode = ["manual", "purchase_markup"].includes(
                            price.source
                          )
                            ? price.source
                            : "inherit";
                          const effectiveMode =
                            priceMode === "inherit"
                              ? link.defaultPricingMode || "base"
                              : priceMode;
                          const markupPercent =
                            priceMode === "purchase_markup"
                              ? normalizePercentInput(
                                  getIndividualMarkupDraft(
                                    client.id,
                                    product.id,
                                    price
                                  )
                                )
                              : normalizePercentInput(
                                  getDefaultMarkupDraft(client.id, link)
                                );

                          return (
                            <div
                              className="matrix-editor-row"
                              key={product.id}
                            >
                              <label className="matrix-editor-product">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={link.matrixMode === "all"}
                                  onChange={(event) =>
                                    updateLink(client.id, {
                                      matrixMode: "selected",
                                      matrixProductIds:
                                        event.target.checked
                                          ? [
                                              ...new Set([
                                                ...matrixProductIds,
                                                product.id,
                                              ]),
                                            ]
                                          : matrixProductIds.filter(
                                              (id) => String(id) !== String(product.id)
                                            ),
                                    })
                                  }
                                />
                                <span>
                                  <strong>{product.name}</strong>
                                  <small
                                    style={{
                                      display: "block",
                                      marginTop: 3,
                                    }}
                                  >
                                    {product.code} · {product.category}
                                  </small>
                                </span>
                              </label>

                              {UNIT_ORDER.map(
                                (unit) => {
                                  const priceField =
                                    unit === "piece"
                                      ? "pricePiece"
                                      : unit === "pack"
                                        ? "pricePack"
                                        : "priceBundle";
                                  const unitAllowed = Array.isArray(product.saleUnits)
                                    ? product.saleUnits.includes(unit)
                                    : false;
                                  const purchasePrice =
                                    product.purchasePrices?.[unit];
                                  const calculatedPrice =
                                    calculateMarkupPreview(
                                      purchasePrice,
                                      markupPercent
                                    );

                                  if (effectiveMode === "purchase_markup") {
                                    return (
                                      <div
                                        className="matrix-price-field matrix-price-calculated"
                                        key={unit}
                                      >
                                        <span>{UNIT_CONFIG[unit].label}</span>
                                        {!unitAllowed ? (
                                          <strong>Не продаётся</strong>
                                        ) : hasPurchasePrice(purchasePrice) ? (
                                          <>
                                            <small>
                                              Закупка: {formatMoney(purchasePrice)}
                                            </small>
                                            <strong>
                                              Клиенту: {formatMoney(calculatedPrice)}
                                            </strong>
                                          </>
                                        ) : (
                                          <strong className="danger-text">
                                            Нет цены из 1С
                                          </strong>
                                        )}
                                      </div>
                                    );
                                  }

                                  if (priceMode === "manual") {
                                    return (
                                      <label
                                        className="matrix-price-field"
                                        key={unit}
                                      >
                                        {UNIT_CONFIG[unit].label}
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          disabled={!unitAllowed}
                                          placeholder={
                                            unitAllowed
                                              ? `База: ${
                                                  Number(product[priceField]) || 0
                                                }`
                                              : "Не продаётся"
                                          }
                                          value={price[unit] ?? ""}
                                          onChange={(event) =>
                                            updatePersonalPrice(
                                              client.id,
                                              link,
                                              product.id,
                                              {
                                                [unit]: parsePriceInput(
                                                  event.target.value
                                                ),
                                              }
                                            )
                                          }
                                        />
                                      </label>
                                    );
                                  }

                                  return (
                                    <div
                                      className="matrix-price-field matrix-price-calculated"
                                      key={unit}
                                    >
                                      <span>{UNIT_CONFIG[unit].label}</span>
                                      {!unitAllowed ? (
                                        <strong>Не продаётся</strong>
                                      ) : (
                                        <>
                                          <small>Базовая цена Clover</small>
                                          <strong>
                                            {formatMoney(product[priceField])}
                                          </strong>
                                        </>
                                      )}
                                    </div>
                                  );
                                }
                              )}

                              <div className="matrix-price-mode">
                                <label className="matrix-price-field">
                                  Способ расчёта
                                  <select
                                    value={priceMode}
                                    onChange={(event) =>
                                      updatePersonalPrice(
                                        client.id,
                                        link,
                                        product.id,
                                        {
                                          source: event.target.value,
                                        },
                                        product
                                      )
                                    }
                                  >
                                    <option value="inherit">
                                      По умолчанию клиента
                                    </option>
                                    <option value="manual">
                                      Фиксированная цена вручную
                                    </option>
                                    <option value="purchase_markup">
                                      Индивидуальный процент
                                    </option>
                                  </select>
                                </label>
                                {priceMode === "purchase_markup" && (
                                  <label className="matrix-price-field">
                                    Индивидуальная наценка, %
                                    <input
                                      type="number"
                                      min="0"
                                      max="10000"
                                      step="0.1"
                                      value={getIndividualMarkupDraft(
                                        client.id,
                                        product.id,
                                        price
                                      )}
                                      onChange={(event) =>
                                        setIndividualMarkupDrafts((current) => ({
                                          ...current,
                                          [client.id]: {
                                            ...(current[client.id] || {}),
                                            [String(product.id)]: event.target.value,
                                          },
                                        }))
                                      }
                                      onBlur={() =>
                                        updatePersonalPrice(
                                          client.id,
                                          link,
                                          product.id,
                                          {
                                            markupPercent: normalizePercentInput(
                                              getIndividualMarkupDraft(
                                                client.id,
                                                product.id,
                                                price
                                              )
                                            ),
                                          }
                                        )
                                      }
                                    />
                                  </label>
                                )}
                                {priceMode === "inherit" &&
                                  effectiveMode === "purchase_markup" && (
                                    <small className="price-update-time">
                                      Общая наценка клиента: {markupPercent}%
                                    </small>
                                  )}
                                {effectiveMode === "purchase_markup" && (
                                  <small className="price-update-time">
                                    Цена 1С обновлена: {formatDateTime(product.purchasePriceUpdatedAt)}
                                  </small>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="matrix-save-bar" style={{ marginTop: 14 }}>
                    <div>
                      <strong>Сохранение товарной матрицы</strong>
                      <small>
                        После изменения режима, цен или состава нажмите кнопку справа.
                        Добавление из каталога 1С и выбор контрагента пишутся сразу.
                      </small>
                      {matrixSaveState[client.id]?.message && (
                        <span
                          className={`matrix-save-message ${
                            matrixSaveState[client.id]?.status || ""
                          }`}
                        >
                          {matrixSaveState[client.id].message}
                        </span>
                      )}
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={matrixSaveState[client.id]?.status === "saving"}
                      onClick={() => saveClientMatrix(client.id, link)}
                    >
                      {matrixSaveState[client.id]?.status === "saving"
                        ? "Сохраняем..."
                        : "Сохранить матрицу"}
                    </button>
                  </div>

                  <div
                    className="comment-box"
                    style={{ marginTop: 14 }}
                  >
                    <strong>Адреса клиента</strong>
                    <p>
                      {(() => {
                        const addresses = Array.isArray(client.addresses)
                          ? client.addresses
                          : [];
                        const text = addresses
                          .map((item) =>
                            typeof item === "string" ? item : item?.address
                          )
                          .filter(Boolean)
                          .join("; ");
                        return text || "Нет адресов";
                      })()}
                    </p>
                  </div>
                  </PanelErrorBoundary>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-box">Клиенты не найдены.</div>
      )}
    </section>
    </PanelErrorBoundary>
  );
}

function ProductEditor({ product, onClose, onSave }) {
  const isNew = !product;
  const [form, setForm] = useState(product || {
    name: "", category: "Новые товары", code: "", oneCId: "",
    oneCCode: "", oneCName: "", oneCMatchCode: "", oneCMatchName: "", oneCSearchQuery: "", oneCSearchRequestedAt: "", oneCLinkMode: "", oneCLinkedAt: "", active: true,
    pieceSize: 1, packSize: 1, bundleSize: 1,
    pricePiece: 0, pricePack: 0, priceBundle: 0,
    saleUnits: ["piece"],
  });
  const [oneCOpen, setOneCOpen] = useState(false);
  const [oneCSearch, setOneCSearch] = useState(product?.oneCName || product?.name || "");
  const [oneCResults, setOneCResults] = useState([]);
  const [oneCTotal, setOneCTotal] = useState(0);
  const [oneCLoading, setOneCLoading] = useState(false);
  const [oneCError, setOneCError] = useState("");
  const [oneCNotice, setOneCNotice] = useState("");

  const toggleUnit = (unit, checked) => {
    const next = checked ? [...new Set([...form.saleUnits, unit])] : form.saleUnits.filter((item) => item !== unit);
    setForm({ ...form, saleUnits: next.length ? next : ["piece"] });
  };

  const searchOneCProducts = async (query = oneCSearch) => {
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.getOneCProducts({
        search: String(query || "").trim(),
        limit: 50,
        offset: 0,
      });
      setOneCResults(result.items || []);
      setOneCTotal(Number(result.total) || 0);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const openOneCSearch = async () => {
    const query = form.oneCSearchQuery || form.oneCCode || form.oneCMatchCode || form.oneCName || form.oneCMatchName || form.name || "";
    setOneCSearch(query);
    setOneCOpen(true);
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      if (product?.id) {
        const candidateResult = await api.getOneCProductCandidates(product.id);
        if ((candidateResult.items || []).length) {
          setOneCResults(candidateResult.items || []);
          setOneCTotal(Number(candidateResult.total) || 0);
          setOneCNotice("Показаны наиболее подходящие варианты, найденные при последней выгрузке из 1С.");
          return;
        }
      }
      const result = await api.getOneCProducts({ search: String(query || "").trim(), limit: 50, offset: 0 });
      setOneCResults(result.items || []);
      setOneCTotal(Number(result.total) || 0);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const selectOneCProduct = (item) => {
    const nextProduct = normalizeProduct({
      ...form,
      oneCId: item.id,
      oneCCode: item.code || "",
      oneCName: item.name || "",
      oneCMatchCode: item.code || "",
      oneCMatchName: item.name || "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual",
      oneCLinkedAt: new Date().toISOString(),
    });

    setForm(nextProduct);
    setOneCOpen(false);
    setOneCError("");
    setOneCNotice(
      "Позиция 1С выбрана, но ещё не сохранена. Проверьте название, категорию, единицы, коэффициенты и цены, затем нажмите «Сохранить товар»."
    );
  };

  const requestOneCSearch = async () => {
    if (!product?.id) {
      setForm((current) => ({ ...current, oneCSearchQuery: oneCSearch || current.name }));
      setOneCNotice("Запрос будет сохранён вместе с новым товаром.");
      return;
    }
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.requestOneCProduct(product.id, {
        query: oneCSearch || form.name,
        code: form.oneCMatchCode || "",
        name: form.oneCMatchName || "",
      });
      const updatedProduct = normalizeProduct({
        ...form,
        ...(result.product || {}),
        oneCSearchQuery: oneCSearch || form.name,
      });
      setForm(updatedProduct);
      setOneCNotice(result.message || "Запрос сохранён.");
      await onSave(updatedProduct);
    } catch (error) {
      setOneCError(error.message);
    } finally {
      setOneCLoading(false);
    }
  };

  const clearOneCProduct = () => {
    setForm((current) => ({
      ...current,
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCMatchCode: "",
      oneCMatchName: "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual-cleared",
      oneCLinkedAt: "",
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim()) return;

    onSave(normalizeProduct({
      ...form,
      name: form.name.trim(),
      category: form.category.trim(),
      oneCId: String(form.oneCId || "").trim(),
      oneCCode: String(form.oneCCode || "").trim(),
      oneCName: String(form.oneCName || "").trim(),
      oneCMatchCode: String(form.oneCMatchCode || "").trim(),
      oneCMatchName: String(form.oneCMatchName || "").trim(),
      oneCSearchQuery: String(form.oneCSearchQuery || "").trim(),
      oneCSearchRequestedAt: String(form.oneCSearchRequestedAt || "").trim(),
    }));
  };

  return (
    <div className="product-editor" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="product-editor-card" onSubmit={submit}>
        <div className="panel-heading"><div><p className="eyebrow">Каталог</p><h2>{isNew ? "Новый товар" : "Редактирование товара"}</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
        <div className="form-grid">
          <label className="field">Название товара<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field">Категория<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label>
          <label className="field">Внутренний код<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label className="field">Показывать клиентам<select value={form.active ? "yes" : "no"} onChange={(e) => setForm({ ...form, active: e.target.value === "yes" })}><option value="yes">Да</option><option value="no">Нет</option></select></label>
        </div>

        <section className="one-c-link-editor">
          <div className="one-c-link-editor-head">
            <div>
              <p className="eyebrow">Связь с 1С</p>
              <h3>Точная номенклатура 1С TEST</h3>
            </div>
            <button className="secondary-button" type="button" onClick={openOneCSearch}>
              {form.oneCId ? "Изменить товар 1С" : "Выбрать из загруженных 1С"}
            </button>
          </div>

          {form.oneCId ? (
            <div className="one-c-link-selected">
              <div>
                <strong>{form.oneCName || "Выбранный товар 1С"}</strong>
                <span>Код: {form.oneCCode || "—"} · ID: {form.oneCId}</span>
              </div>
              <button className="secondary-button" type="button" onClick={clearOneCProduct}>Убрать связь</button>
            </div>
          ) : (
            <div className="one-c-link-empty one-c-match-hints">
                  <p>
                Название для сайта может отличаться от названия в 1С. Выберите
                позицию из полной выгрузки 1С TEST или укажите код / точное
                название — после выгрузки Clover сможет связать автоматически.
              </p>
              <div className="form-grid one-c-match-fields">
                <label className="field">Код товара в 1С
                  <input
                    value={form.oneCMatchCode || ""}
                    placeholder="Например, НФ-00000742"
                    onChange={(event) => setForm({ ...form, oneCMatchCode: event.target.value })}
                  />
                </label>
                <label className="field">Точное название в 1С
                  <input
                    value={form.oneCMatchName || ""}
                    placeholder="Как позиция называется внутри 1С"
                    onChange={(event) => setForm({ ...form, oneCMatchName: event.target.value })}
                  />
                </label>
              </div>
            </div>
          )}

          {!oneCOpen && oneCNotice && <div className="sync-success">{oneCNotice}</div>}

          {oneCOpen && (
            <div className="one-c-picker">
              <div className="one-c-products-search">
                <input
                  type="search"
                  placeholder="Поиск по выгрузке 1С TEST: название, код или ID"
                  value={oneCSearch}
                  onChange={(event) => setOneCSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchOneCProducts(oneCSearch);
                    }
                  }}
                  autoFocus
                />
                <button className="secondary-button" type="button" disabled={oneCLoading} onClick={() => searchOneCProducts(oneCSearch)}>
                  {oneCLoading ? "Поиск..." : "Найти"}
                </button>
                <button className="secondary-button" type="button" onClick={() => setOneCOpen(false)}>Закрыть</button>
              </div>

              {oneCError && <div className="sync-error">{oneCError}</div>}
              {oneCNotice && <div className="sync-success">{oneCNotice}</div>}
              <p className="muted small">Найдено: {oneCTotal}. Показаны первые {oneCResults.length} позиций.</p>

              <div className="one-c-products-list one-c-picker-list">
                {oneCResults.map((item) => {
                  const linkedToCurrent = item.cloverLink && String(item.cloverLink.productId) === String(product?.id);
                  const linkedElsewhere = item.cloverLink && !linkedToCurrent;
                  const selected = String(form.oneCId) === String(item.id);

                  return (
                    <article key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>Код: {item.code || "—"} · ID: {item.id}</span>
                        {Number(item.score) > 0 && <span className="muted small">Совпадение: {Math.round(Number(item.score) * 100)}%</span>}
                        {linkedElsewhere && <span className="warning-text">Уже связан с товаром Clover: {item.cloverLink.productName}</span>}
                      </div>
                      <button
                        className={selected || linkedToCurrent ? "secondary-button" : "primary-button"}
                        type="button"
                        disabled={Boolean(linkedElsewhere)}
                        onClick={() => selectOneCProduct(item)}
                      >
                        {selected || linkedToCurrent ? "Выбрано" : linkedElsewhere ? "Уже связан" : "Выбрать"}
                      </button>
                    </article>
                  );
                })}
                {!oneCLoading && !oneCResults.length && (
                  <div className="empty-box">
                    <p>В текущей выгрузке 1С подходящих позиций нет.</p>
                    <button className="primary-button" type="button" onClick={requestOneCSearch}>
                      Сохранить запрос для следующей выгрузки из 1С
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="purchase-price-card">
          <div className="purchase-price-card-head">
            <div>
              <p className="eyebrow">Цена из 1С TEST</p>
              <h3>Закупочная цена товара</h3>
            </div>
            <small>
              {form.purchasePriceUpdatedAt
                ? `Обновлено: ${formatDateTime(form.purchasePriceUpdatedAt)}`
                : "Закупочная цена ещё не получена"}
            </small>
          </div>
          <div className="purchase-price-grid">
            {UNIT_ORDER.map((unit) => {
              const value = form.purchasePrices?.[unit];
              const available = hasPurchasePrice(value);
              return (
                <article key={unit}>
                  <span>{UNIT_CONFIG[unit].label}</span>
                  <strong>{available ? formatMoney(value) : "—"}</strong>
                  <small>
                    {form.saleUnits.includes(unit)
                      ? available
                        ? "Получено из 1С"
                        : "Нет цены из 1С"
                      : "Единица не продаётся"}
                  </small>
                </article>
              );
            })}
          </div>
        </section>

        <div className="unit-settings">
          {UNIT_ORDER.map((unit) => {
            const sizeField = unit === "piece" ? "pieceSize" : unit === "pack" ? "packSize" : "bundleSize";
            const priceField = unit === "piece" ? "pricePiece" : unit === "pack" ? "pricePack" : "priceBundle";
            return <div className="unit-setting" key={unit}>
              <label><input type="checkbox" checked={form.saleUnits.includes(unit)} onChange={(e) => toggleUnit(unit, e.target.checked)} />{UNIT_CONFIG[unit].label}</label>
              <label className="field">Внутри, шт.
                <input
                  type="number"
                  min="1"
                  value={form[sizeField]}
                  onFocus={selectDefaultNumber}
                  onMouseUp={(event) => {
                    if (["0", "1"].includes(String(event.currentTarget.value))) {
                      event.preventDefault();
                      event.currentTarget.select();
                    }
                  }}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [sizeField]: event.target.value,
                    }))
                  }
                  onBlur={() =>
                    setForm((current) => ({
                      ...current,
                      [sizeField]: Math.max(1, Number(current[sizeField]) || 1),
                    }))
                  }
                />
              </label>
              <label className="field">Цена за единицу продажи
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[priceField]}
                  onFocus={selectDefaultNumber}
                  onMouseUp={(event) => {
                    if (String(event.currentTarget.value) === "0") {
                      event.preventDefault();
                      event.currentTarget.select();
                    }
                  }}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [priceField]: event.target.value,
                    }))
                  }
                  onBlur={() =>
                    setForm((current) => ({
                      ...current,
                      [priceField]: Math.max(0, Number(current[priceField]) || 0),
                    }))
                  }
                />
              </label>
            </div>;
          })}
        </div>
        <div className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit">Сохранить товар</button></div>
      </form>
    </div>
  );
}

function OneCProductsPanel({ products, setProducts }) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const initialLinkDone = useRef(false);

  const loadCatalog = async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCProducts({
        search: query,
        limit: 50,
        offset: 0,
      });
      setCatalog(result);
      return result;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runAutoLink = async ({ silent = false } = {}) => {
    setLinking(true);
    if (!silent) setError("");
    try {
      const result = await api.autoLinkOneCProducts();
      setProducts((result.products || []).map(normalizeProduct));
      const refreshed = await api.getOneCProducts({
        search,
        limit: 50,
        offset: 0,
      });
      setCatalog(refreshed);
      if (!silent) {
        const linked = result.report?.newlyLinked || 0;
        alert(
          linked
            ? `Автоматически связаны товары: ${linked}.`
            : "Новых точных совпадений не найдено. Уже созданные связи сохранены."
        );
      }
    } catch (linkError) {
      setError(linkError.message);
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const result = await loadCatalog("");
      if (cancelled || initialLinkDone.current) return;
      initialLinkDone.current = true;

      if (result?.summary?.oneCTotal > 0) {
        await runAutoLink({ silent: true });
      }
    };

    initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = catalog?.summary || {};

  return (
    <section className="one-c-products-panel">
      <div className="one-c-products-head">
        <div>
          <p className="eyebrow">Каталог 1С</p>
          <h2>Автоматическое сопоставление номенклатуры</h2>
          <p>
            Clover сохраняет только точные совпадения и несколько наиболее похожих
            вариантов для несвязанных товаров. Красивое название на сайте может быть
            другим: в заказ передаётся ID 1С. Полная номенклатура и база клиентов в
            Clover не сохраняются. Неоднозначные варианты выбирает менеджер.
          </p>
        </div>
        <div className="one-c-products-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => loadCatalog()}
            disabled={loading || linking}
          >
            {loading ? "Обновление..." : "Обновить"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => runAutoLink()}
            disabled={linking || !summary.oneCTotal}
          >
            {linking ? "Сопоставление..." : "Сопоставить автоматически"}
          </button>
        </div>
      </div>

      {error && <div className="sync-error">{error}</div>}

      <div className="one-c-products-stats">
        <article><span>Подходящих из 1С</span><strong>{summary.oneCTotal || 0}</strong></article>
        <article><span>Товаров Clover</span><strong>{summary.cloverTotal ?? products.length}</strong></article>
        <article><span>Связано</span><strong>{summary.linked || 0}</strong></article>
        <article><span>С закупочной ценой</span><strong>{summary.pricedProducts || 0}</strong></article>
        <article><span>Без связи</span><strong>{summary.unmatched ?? products.filter((item) => !item.oneCId).length}</strong></article>
        {Number(summary.candidateProducts) > 0 && <article><span>Есть варианты</span><strong>{summary.candidateProducts}</strong></article>}
      </div>

      <div className="one-c-products-meta">
        <span>
          Последняя выгрузка: {summary.receivedAt ? formatDateTime(summary.receivedAt) : "ещё не выполнялась"}
        </span>
        <span>
          Автоматически: {summary.autoLinked || 0} · вручную: {summary.manualLinked || 0}
        </span>
        {summary.stale > 0 && <span className="warning-text">Не найдено в свежем каталоге: {summary.stale}</span>}
      </div>

      <button
        className="one-c-products-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Скрыть сохранённые позиции 1С" : "Показать сохранённые позиции 1С"}
      </button>

      {open && (
        <div className="one-c-products-browser">
          <form
            className="one-c-products-search"
            onSubmit={(event) => {
              event.preventDefault();
              loadCatalog(search);
            }}
          >
            <input
              type="search"
              placeholder="Поиск по выгрузке 1С TEST: название, код или ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="secondary-button" type="submit" disabled={loading}>
              Найти
            </button>
            {search && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  loadCatalog("");
                }}
              >
                Сбросить
              </button>
            )}
          </form>

          <p className="muted small">
            Найдено: {catalog?.total || 0}. Показаны первые {catalog?.items?.length || 0} позиций.
          </p>

          <div className="one-c-products-list">
            {(catalog?.items || []).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>Код: {item.code || "—"} · ID: {item.id}</span>
                </div>
                {item.cloverLink ? (
                  <span className="badge green">
                    Связан: {item.cloverLink.productName}
                  </span>
                ) : (
                  <span className="badge gray">Не используется в Clover</span>
                )}
              </article>
            ))}
            {!loading && !(catalog?.items || []).length && (
              <div className="empty-box">Позиции не найдены.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ManagerProducts({ products, setProducts }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [visibility, setVisibility] = useState("Все");
  const [editorProduct, setEditorProduct] = useState(undefined);
  const [imageBusyId, setImageBusyId] = useState(null);
  const categories = ["Все", ...new Set(products.map((item) => item.category))];
  const visible = products.filter((product) => {
    const bySearch = !search || `${product.name} ${product.code} ${product.oneCId} ${product.oneCCode} ${product.oneCName} ${product.oneCMatchCode} ${product.oneCMatchName} ${product.oneCSearchQuery}`.toLowerCase().includes(search.toLowerCase());
    const byCategory = category === "Все" || product.category === category;
    const hasOneCLink = Boolean(String(product.oneCId || "").trim());
    const byVisibility =
      visibility === "Все" ||
      (visibility === "Активные" && product.active) ||
      (visibility === "Скрытые" && !product.active) ||
      (visibility === "Связанные с 1С" && hasOneCLink) ||
      (visibility === "Без связи с 1С" && !hasOneCLink);
    return bySearch && byCategory && byVisibility;
  });

  const save = async (value) => {
    let nextProducts;

    if (value.id) {
      nextProducts = products.map((item) => item.id === value.id ? normalizeProduct(value) : item);
    } else {
      const id = Math.max(0, ...products.map((item) => Number(item.id) || 0)) + 1;
      nextProducts = [
        ...products,
        normalizeProduct({
          ...value,
          id,
          code: value.code || `CL-${String(id).padStart(4, "0")}`,
        }),
      ];
    }

    try {
      const result = await api.saveProducts(nextProducts);
      setProducts((result.products || nextProducts).map(normalizeProduct));
      setEditorProduct(undefined);
    } catch (error) {
      alert(`Не удалось сохранить товар: ${error.message}`);
    }
  };

  const uploadImage = async (product, file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Выберите фотографию товара.");
      return;
    }

    setImageBusyId(product.id);
    try {
      const result = await api.uploadProductImage(product.id, file);
      setProducts((current) => current.map((item) =>
        item.id === product.id
          ? normalizeProduct({ ...item, ...result.product })
          : item
      ));
      alert("Фотография товара сохранена на сервере.");
    } catch (error) {
      alert(error.message);
    } finally {
      setImageBusyId(null);
    }
  };

  const deleteImage = async (product) => {
    if (!window.confirm(`Удалить фотографию товара «${product.name}»?`)) {
      return;
    }

    setImageBusyId(product.id);
    try {
      const result = await api.deleteProductImage(product.id);
      setProducts((current) => current.map((item) =>
        item.id === product.id
          ? normalizeProduct({ ...item, ...result.product })
          : item
      ));
    } catch (error) {
      alert(error.message);
    } finally {
      setImageBusyId(null);
    }
  };

  return (
    <section>
      <OneCProductsPanel products={products} setProducts={setProducts} />

      <div className="toolbar four">
        <input type="search" placeholder="Поиск товара, кода или ID 1С" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option>Все</option>
          <option>Активные</option>
          <option>Скрытые</option>
          <option>Связанные с 1С</option>
          <option>Без связи с 1С</option>
        </select>
        <button className="primary-button" type="button" onClick={() => setEditorProduct(null)}>+ Добавить товар</button>
      </div>
      <div className="server-safe-note">
        Фото загружается на сервер и автоматически появляется в личном кабинете клиента. Поддерживаются JPG, PNG и WEBP до 5 МБ.
      </div>
      <div className="product-manager-list" style={{ marginTop: 14 }}>
        <VirtualList
          items={visible}
          itemHeight={148}
          height={Math.min(640, typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.65) : 640)}
          getItemKey={(product) => product.id}
          renderItem={(product) => (
        <article className={product.active ? "product-manager-row" : "product-manager-row inactive"} key={product.id}>
          <div className="product-manager-thumb">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span>Нет фото</span>}
          </div>
          <div>
            <h3>{product.name}</h3>
            <p>{product.category} · {product.code}</p>
            <p className="product-one-c-line">
              {product.oneCId
                ? `1С: ${product.oneCCode || "без кода"} · ${product.oneCId}`
                : "1С: не связан"}
              {product.oneCLinkMode === "auto" ? " · автоматически" : product.oneCId ? " · вручную" : ""}
            </p>
            <div className="product-purchase-summary">
              {UNIT_ORDER.map((unit) => {
                const value = product.purchasePrices?.[unit];
                return (
                  <span key={unit}>
                    <strong>{UNIT_CONFIG[unit].label}:</strong>{" "}
                    {hasPurchasePrice(value) ? formatMoney(value) : "—"}
                  </span>
                );
              })}
              <span className="product-purchase-updated">
                Закупка 1С обновлена: {formatDateTime(product.purchasePriceUpdatedAt)}
              </span>
            </div>
          </div>
          <span className={product.active ? "badge green" : "badge gray"}>{product.active ? "Активен" : "Скрыт"}</span>
          <strong>{settingsPriceLabel(product)}</strong>
          <div className="image-actions">
            <label className="image-upload-label">
              {imageBusyId === product.id ? "Загрузка..." : product.imageUrl ? "Заменить фото" : "Добавить фото"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageBusyId === product.id}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  uploadImage(product, file);
                  event.target.value = "";
                }}
              />
            </label>
            {product.imageUrl && <button className="secondary-button" type="button" disabled={imageBusyId === product.id} onClick={() => deleteImage(product)}>Удалить фото</button>}
            <button className="secondary-button" type="button" onClick={() => setEditorProduct(product)}>Изменить</button>
            <button className="secondary-button" type="button" onClick={() => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: !item.active } : item))}>{product.active ? "Скрыть" : "Показать"}</button>
          </div>
        </article>
          )}
        />
      </div>
      {editorProduct !== undefined && <ProductEditor product={editorProduct} onClose={() => setEditorProduct(undefined)} onSave={save} />}
    </section>
  );
}

function settingsPriceLabel(product) {
  const prices = [product.pricePiece, product.pricePack, product.priceBundle].filter((value) => Number(value) > 0);
  return prices.length ? `от ${formatMoney(Math.min(...prices))}` : "Без цены";
}

function ToggleSetting({ title, description, value, onChange }) {
  return <article className="setting-card"><div><h3>{title}</h3><p>{description}</p></div><button className={value ? "toggle active" : "toggle"} type="button" onClick={() => onChange(!value)} aria-label={title}><span /></button></article>;
}

function ManagerNotificationSettings({ settings, set }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = async () => {
    try {
      const result = await api.getManagerNotifications({ limit: 1 });
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.saveSettings(settings);
      const result = await api.testManagerNotifications();
      const delivery = result.result?.delivery || [];
      const parts = delivery.map((item) => {
        const channel = item.channel === "email" ? "email" : item.channel === "telegram" ? "Telegram" : item.channel === "push" ? "push" : "канал";
        if (item.sent === true || Number(item.sent) > 0) return `${channel}: отправлено`;
        return `${channel}: ${item.reason || item.error || "не отправлено"}`;
      });
      setMessage(parts.length ? parts.join("; ") : "Внутреннее уведомление создано. Внешние каналы пока выключены.");
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manager-contact-settings manager-notification-settings">
      <h3>Уведомления менеджеру</h3>
      <p>Новый заказ, изменение заказа, товар вне матрицы, запрос акта сверки, регистрация клиента и ошибки 1С.</p>
      <div className="settings-grid">
        <ToggleSetting title="Уведомления в Clover" description="Показывать новые события сразу в кабинете менеджера." value={settings.managerNotificationsEnabled !== false} onChange={(value) => set("managerNotificationsEnabled", value)} />
        <ToggleSetting title="Новые заказы" description="Сообщать о каждом новом заказе клиента." value={settings.managerNotifyNewOrders !== false} onChange={(value) => set("managerNotifyNewOrders", value)} />
        <ToggleSetting title="Изменения заказов" description="Сообщать, когда клиент меняет или удаляет новый заказ." value={settings.managerNotifyOrderChanges !== false} onChange={(value) => set("managerNotifyOrderChanges", value)} />
        <ToggleSetting title="Товары вне матрицы" description="Отдельно сообщать о новой позиции, комментарии и фотографии." value={settings.managerNotifyCustomItems !== false} onChange={(value) => set("managerNotifyCustomItems", value)} />
        <ToggleSetting title="Запросы актов сверки" description="Сообщать о новом запросе с выбранным периодом." value={settings.managerNotifyReconciliation !== false} onChange={(value) => set("managerNotifyReconciliation", value)} />
        <ToggleSetting title="Новые регистрации" description="Сообщать о клиентах, ожидающих подтверждения менеджера." value={settings.managerNotifyRegistrations !== false} onChange={(value) => set("managerNotifyRegistrations", value)} />
        <ToggleSetting title="Ошибки обмена с 1С" description="Сообщать о сбоях передачи и обработки заказов." value={settings.managerNotifyOneCErrors !== false} onChange={(value) => set("managerNotifyOneCErrors", value)} />
        <ToggleSetting title="Push на устройства менеджера" description="Отправлять уведомления в установленную PWA Clover." value={settings.managerNotifyPush !== false} onChange={(value) => set("managerNotifyPush", value)} />
        <ToggleSetting title="Отправлять на email" description="Использовать SMTP и адрес, указанный ниже." value={Boolean(settings.managerNotifyEmail)} onChange={(value) => set("managerNotifyEmail", value)} />
        <ToggleSetting title="Отправлять в Telegram-бот" description="Токен хранится только в server/.env, Chat ID указывается ниже." value={Boolean(settings.managerNotifyTelegram)} onChange={(value) => set("managerNotifyTelegram", value)} />
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">Email для уведомлений
          <input type="email" value={settings.managerNotificationEmail || ""} placeholder="manager@company.ru" onChange={(event) => set("managerNotificationEmail", event.target.value)} />
        </label>
        <label className="field">Telegram Chat ID менеджера
          <input value={settings.managerTelegramChatId || ""} placeholder="Например: 123456789" onChange={(event) => set("managerTelegramChatId", event.target.value.trim())} />
        </label>
      </div>
      <div className="notification-channel-status">
        <span className={status?.email?.configured ? "badge green" : "badge yellow"}>Email: {status?.email?.configured ? "готов" : status?.email?.smtpConfigured ? "укажите адрес" : "SMTP не настроен"}</span>
        <span className={status?.telegram?.configured ? "badge green" : "badge yellow"}>Telegram: {status?.telegram?.configured ? "готов" : status?.telegram?.tokenConfigured ? "укажите Chat ID" : "токен не настроен"}</span>
        <span className={status?.push?.configured ? "badge green" : "badge yellow"}>Push: {status?.push?.configured ? "готов" : "после HTTPS и VAPID"}</span>
      </div>
      <p className="manager-contact-help">Токен Telegram-бота и SMTP-пароль не вводятся в браузере и не отправляются в чат. Для них в обновлении будет отдельный локальный настройщик.</p>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={test}>{busy ? "Проверяем…" : "Отправить тестовое уведомление"}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={loadStatus}>Обновить статус</button>
      </div>
      {message && <div className="request-photo-status">{message}</div>}
    </div>
  );
}

function ManagerSettings({ settings, setSettings, authUser }) {
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Правила</p>
          <h2>Настройки кабинета</h2>
          <p>Изменения сохраняются автоматически и применяются сразу.</p>
        </div>
      </div>

      <div className="manager-contact-settings">
        <h3>Контакты менеджера для клиентов</h3>
        <p>
          В личном кабинете появится кнопка «Ваш менеджер». При наведении
          или нажатии клиент увидит ФИО, телефон и кнопки связи.
        </p>
        <div className="form-grid">
          <label className="field">
            ФИО менеджера
            <input
              value={settings.managerFullName || ""}
              placeholder="Например: Иванов Иван Иванович"
              onChange={(event) => set("managerFullName", event.target.value)}
            />
          </label>
          <label className="field">
            Телефон менеджера
            <input
              inputMode="tel"
              value={formatRussianPhone(settings.managerPhone || "")}
              onFocus={(event) => {
                if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                  requestAnimationFrame(() => {
                    const end = event.currentTarget.value.length;
                    event.currentTarget.setSelectionRange(end, end);
                  });
                }
              }}
              onChange={(event) => set("managerPhone", formatRussianPhone(event.target.value))}
              placeholder="+7 (___) ___-__-__"
            />
          </label>
          <label className="field">
            Ссылка на профиль MAX
            <input
              value={settings.managerMax || ""}
              placeholder="https://max.ru/u/... или max.ru/username"
              onChange={(event) => set("managerMax", event.target.value)}
            />
          </label>
          <label className="field">
            Telegram менеджера — необязательно
            <input
              value={settings.managerTelegram || ""}
              placeholder="@username или ссылка t.me"
              onChange={(event) => set("managerTelegram", event.target.value)}
            />
          </label>
        </div>
        <p className="manager-contact-help">
          Для MAX вставьте ссылку на профиль, скопированную в приложении MAX.
          Telegram показывается только после заполнения имени пользователя или ссылки.
        </p>
      </div>

      <ManagerNotificationSettings settings={settings} set={set} />
      <PushSettings />

      <div className="settings-grid">
        <ToggleSetting title="Показывать цены" description="Клиент увидит цены, заполненные в карточках товаров." value={settings.showPrices} onChange={(value) => set("showPrices", value)} />
        <ToggleSetting title="Товары вне матрицы" description="Разрешить клиенту запрашивать отсутствующие позиции." value={settings.allowCustomItems} onChange={(value) => set("allowCustomItems", value)} />
        <ToggleSetting title="Редактирование новых заказов" description="Клиент может менять заказ до принятия менеджером." value={settings.allowClientEdit} onChange={(value) => set("allowClientEdit", value)} />
        <ToggleSetting title="Удаление новых заказов" description="Клиент может удалить заказ со статусом «Новый»." value={settings.allowClientDelete} onChange={(value) => set("allowClientDelete", value)} />
        <ToggleSetting title="Повтор заказа" description="Показывать кнопку для быстрого повторения заказа." value={settings.allowRepeatOrder} onChange={(value) => set("allowRepeatOrder", value)} />
        <ToggleSetting title="Обязательный профиль" description="Запретить заказ без данных организации." value={settings.requireProfile} onChange={(value) => set("requireProfile", value)} />
        <ToggleSetting title="Обязательный адрес" description="Запретить заказ без сохранённого адреса." value={settings.requireAddress} onChange={(value) => set("requireAddress", value)} />
        <ToggleSetting title="Удаление менеджером" description="Разрешить менеджеру удалять тестовые заказы." value={settings.managerCanDeleteOrders} onChange={(value) => set("managerCanDeleteOrders", value)} />
        <ToggleSetting title="Избранные товары" description="Клиент может отмечать часто используемые товары." value={settings.showFavorites} onChange={(value) => set("showFavorites", value)} />
        <ToggleSetting title="Автосохранение черновика" description="Незавершённый новый заказ сохраняется в браузере." value={settings.enableDrafts} onChange={(value) => set("enableDrafts", value)} />
      </div>
      <ManagerPromotionPanel />
      <AdminRolePanel currentUser={authUser} />
      <PasswordSecurityPanel />
    </section>
  );
}

function formatFileSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function ManagerBackup({ data, onImport, onClearOrders, onResetAll, onReload }) {
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadBackups = async () => {
    try {
      const result = await api.listBackups();
      setBackups(result.backups || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const createBackup = async () => {
    setBusy(true);
    try {
      await api.createBackup({
        label: "manual",
        reason: "Ручная копия из кабинета менеджера",
      });
      await loadBackups();
      alert("Резервная копия создана на сервере.");
    } catch (createError) {
      alert(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const cleanupBackups = async () => {
    if (!window.confirm(
      "Удалить автоматические копии старше 30 дней и оставить не больше 50 копий? Ручные свежие копии сохранятся."
    )) {
      return;
    }

    setBusy(true);
    try {
      const result = await api.cleanupBackups({
        maxFiles: 50,
        automaticMaxAgeDays: 30,
      });
      await loadBackups();
      alert(
        result.removed?.length
          ? `Удалено старых копий: ${result.removed.length}.`
          : "Старых копий для удаления нет."
      );
    } catch (cleanupError) {
      alert(cleanupError.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async (item) => {
    setBusy(true);
    try {
      const blob = await api.downloadBackup(item.fileName);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      alert(downloadError.message);
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (item) => {
    if (!window.confirm(
      `Восстановить данные из копии «${item.fileName}»? Перед восстановлением сервер автоматически создаст страховочную копию.`
    )) {
      return;
    }

    setBusy(true);
    try {
      await api.restoreBackup(item.fileName);
      await onReload();
      await loadBackups();
      alert("Данные восстановлены. Кабинет обновлён.");
    } catch (restoreError) {
      alert(restoreError.message);
    } finally {
      setBusy(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clover-public-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { onImport(JSON.parse(String(reader.result))); alert("JSON-копия загружена."); }
      catch { alert("Не удалось прочитать файл резервной копии."); }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  return <section className="panel" style={{ marginTop: 0 }}>
    <div className="panel-heading"><div><p className="eyebrow">Защита данных</p><h2>Полные резервные копии</h2><p>Копии включают клиентов, заказы, матрицы, настройки, пароли и фотографии товаров. Они хранятся только на вашем компьютере.</p></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={cleanupBackups}>Очистить старые</button><button className="primary-button" type="button" disabled={busy} onClick={createBackup}>{busy ? "Подождите..." : "Создать полную копию"}</button></div></div>
    <div className="profile-summary">
      <article><span>Серверных копий</span><strong>{backups.length}</strong></article><article><span>Товаров</span><strong>{data.products.length}</strong></article><article><span>Заказов</span><strong>{data.orders.length}</strong></article><article><span>Связей с клиентами</span><strong>{Object.keys(data.clientLinks).length}</strong></article>
    </div>
    <div className="server-safe-note">Clover автоматически создаёт полную копию при первом запуске каждого дня, перед полным сбросом и перед восстановлением. Перед восстановлением всегда создаётся страховочная копия.</div>
    {error && <div className="auth-error" style={{ marginTop: 14 }}>{error}</div>}
    <div className="backup-list">
      {backups.map((item) => <article className="backup-row" key={item.fileName}>
        <div><h3>{item.reason}</h3><p>{formatDateTime(item.createdAt)} · {formatFileSize(item.size)} · {item.includesPhotos ? `полная копия, фото: ${item.photoCount || 0}` : "старая JSON-копия без фото"}<br />{item.fileName}</p></div>
        <div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => downloadBackup(item)}>Скачать</button><button className="secondary-button" type="button" disabled={busy} onClick={() => restoreBackup(item)}>Восстановить</button></div>
      </article>)}
      {!backups.length && !error && <div className="empty-box">Копии пока не созданы.</div>}
    </div>
    <details style={{ marginTop: 22 }}>
      <summary style={{ cursor: "pointer", color: "#4f8d4b", fontWeight: 800 }}>Дополнительная переносимая JSON-копия</summary>
      <p className="muted small">Эта копия не содержит аккаунты и пароли. Она нужна только для переноса каталога, заказов и настроек.</p>
      <div className="backup-actions"><button className="secondary-button" type="button" onClick={exportData}>Скачать JSON-копию</button><label className="import-label">Загрузить JSON-копию<input type="file" accept="application/json" onChange={importFile} /></label><button className="danger-button" type="button" onClick={onClearOrders}>Удалить все заказы</button><button className="danger-button" type="button" onClick={onResetAll}>Полный сброс</button></div>
    </details>
  </section>;
}

const AUDIT_ACTION_LABELS = {
  "auth.register": "Зарегистрирован клиент",
  "auth.login": "Вход в кабинет",
  "orders.save": "Сохранены заказы",
  "products.save": "Изменён каталог",
  "settings.save": "Изменены настройки",
  "manager.notification": "Отправлено уведомление менеджеру",
  "manager.notification.read": "Уведомление отмечено прочитанным",
  "manager.notification.read_all": "Все уведомления отмечены прочитанными",
  "manager.notification.test": "Проверены каналы уведомлений",
  "client.matrix.save": "Изменена матрица клиента",
  "client.profile.manager_update": "Менеджер изменил данные клиента",
  "product.image.upload": "Загружено фото товара",
  "product.image.delete": "Удалено фото товара",
  "backup.create": "Создана резервная копия",
  "backup.restore": "Восстановлена резервная копия",
  "backup.cleanup": "Удалены старые резервные копии",
  "server.reset": "Выполнен полный сброс",
  "exchange.check": "Проверен заказ для 1С",
  "exchange.send.test": "Заказ поставлен в очередь 1С",
  "exchange.send.error": "Ошибка тестовой передачи в 1С",
  "exchange.reset": "Сброшен статус обмена с 1С",
  "exchange.download.order": "Скачан файл заказа для 1С",
  "exchange.download.batch": "Скачан пакет заказов для 1С",
  "exchange.config.save": "Сохранены настройки подключения к 1С",
  "exchange.connection.test": "Проверено подключение к 1С",
  "exchange.connection.error": "Ошибка подключения к 1С",
  "exchange.catalog.preview": "Просмотрен справочник 1С",
  "exchange.catalog.error": "Ошибка чтения справочника 1С",
  "one-c.products.receive": "Получена номенклатура из 1С",
  "one-c.products.auto-link": "Автоматически сопоставлены товары с 1С",
  "exchange.send.draft": "Создан черновик заказа в 1С",
  "exchange.send.draft.error": "Ошибка создания черновика в 1С",
};

function formatAuditDetails(item) {
  const details = item?.details || {};

  switch (item?.action) {
    case "orders.save":
      return `Заказов сохранено: ${Number(details.count) || 0}`;
    case "products.save":
      return `Товаров в каталоге: ${Number(details.count) || 0}`;
    case "client.matrix.save":
      return `Изменено клиентов: ${Number(details.clients) || 0}`;
    case "client.profile.manager_update":
      return `Клиент: ${details.clientId || "—"} · адресов: ${Number(details.addresses) || 0}${details.changedEmail ? " · изменён email для входа" : ""}`;
    case "product.image.upload":
      return details.productName
        ? `Товар: ${details.productName}`
        : "Фотография загружена";
    case "product.image.delete":
      return details.productName
        ? `Товар: ${details.productName}`
        : "Фотография удалена";
    case "backup.create":
      return `${details.reason || "Резервная копия"}${
        details.photoCount !== undefined
          ? ` · фотографий: ${details.photoCount}`
          : ""
      }`;
    case "backup.restore":
      return `Файл: ${details.fileName || "копия"} · фотографий восстановлено: ${
        Number(details.restoredPhotos) || 0
      }`;
    case "backup.cleanup":
      return `Удалено копий: ${Array.isArray(details.removed) ? details.removed.length : 0} · осталось: ${Number(details.remaining) || 0}`;
    case "settings.save":
      return "Настройки кабинета обновлены";
    case "auth.login":
      return "Успешный вход";
    case "auth.register":
      return "Создан новый аккаунт клиента";
    case "server.reset":
      return "Данные сброшены после создания страховочной копии";
    case "exchange.check":
      return `Заказ № ${details.orderNumber || "—"} · ${details.ready ? "готов к передаче" : `ошибок: ${(details.issues || []).length}`}`;
    case "exchange.send.test":
      return `Заказ № ${details.orderNumber || "—"} · квитанция: ${details.receipt || "—"}`;
    case "exchange.send.error":
      return `Заказ № ${details.orderNumber || "—"} · ошибок: ${(details.issues || []).length}`;
    case "exchange.reset":
      return `Заказ № ${details.orderNumber || "—"}`;
    case "exchange.download.order":
      return `Заказ № ${details.orderNumber || "—"} · формат: ${String(details.format || "json").toUpperCase()}`;
    case "exchange.download.batch":
      return `Формат: ${String(details.format || "json").toUpperCase()} · заказов: ${Number(details.count) || 0}`;
    case "exchange.config.save":
      return `Режим: ${details.mode === "real" ? "реальная 1С" : "симулятор"} · адрес: ${details.baseUrlConfigured ? "заполнен" : "не заполнен"}`;
    case "exchange.connection.test":
      return `${details.mode === "real" ? "Реальная 1С" : "Симулятор"} · ${details.configuration || "подключение проверено"}`;
    case "exchange.connection.error":
      return details.message || "Ошибка подключения";
    case "exchange.catalog.preview":
      return `${details.type === "clients" ? "Контрагенты" : "Номенклатура"} · записей: ${Number(details.count) || 0}`;
    case "exchange.catalog.error":
      return `${details.type || "Справочник"} · ${details.message || "ошибка"}`;
    case "one-c.products.receive":
      return `Получено: ${Number(details.received) || 0} · новых связей: ${Number(details.newlyLinked) || 0} · без совпадения: ${Number(details.unmatched) || 0}`;
    case "one-c.products.auto-link":
      return `Товаров Clover: ${Number(details.cloverTotal) || 0} · связанных: ${Number(details.linked) || 0} · новых связей: ${Number(details.newlyLinked) || 0}`;
    case "exchange.send.draft":
      return `Заказ № ${details.orderNumber || "—"} · документ ${details.documentNumber || details.documentId || "создан"} · ${details.mode === "real" ? "1С" : "симулятор"}`;
    case "exchange.send.draft.error":
      return `Заказ № ${details.orderNumber || "—"} · ${details.message || "ошибка"}`;
    default:
      return "";
  }
}

function ManagerExchange({ onReload, onNavigate }) {
  const [data, setData] = useState(null);
  const [oneC, setOneC] = useState(null);
  const [configForm, setConfigForm] = useState({
    mode: "simulation",
    baseUrl: "",
    healthPath: "/hs/clover/v1/health",
    clientsPath: "/hs/clover/v1/clients",
    productsPath: "/hs/clover/v1/products",
    draftOrderPath: "/hs/clover/v1/orders/draft",
    username: "",
    timeoutMs: 10000,
    allowDraftCreation: false,
  });
  const [connectionResult, setConnectionResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingExchange, setLoadingExchange] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [busyConnection, setBusyConnection] = useState("");
  const [batchStatus, setBatchStatus] = useState("all");

  const applyOneCState = (result) => {
    setOneC(result);
    if (result?.config) {
      setConfigForm((current) => ({
        ...current,
        ...result.config,
      }));
    }
  };

  const load = async () => {
    setLoadingExchange(true);
    try {
      const [exchangeResult, oneCResult] = await Promise.all([
        api.getExchange(300),
        api.getOneCConfig(),
      ]);
      setData(exchangeResult);
      applyOneCState(oneCResult);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingExchange(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveConnection = async () => {
    setBusyConnection("save");
    try {
      const result = await api.saveOneCConfig(configForm);
      applyOneCState(result);
      setConnectionResult(null);
      setPreview(null);
      alert("Настройки подключения к 1С сохранены.");
    } catch (saveError) {
      alert(saveError.message);
    } finally {
      setBusyConnection("");
    }
  };

  const testConnection = async () => {
    setBusyConnection("test");
    try {
      const saved = await api.saveOneCConfig(configForm);
      applyOneCState(saved);
      const result = await api.testOneCConnection();
      applyOneCState(result);
      setConnectionResult(result.result || null);
      setPreview(null);
    } catch (testError) {
      setConnectionResult({ ok: false, message: testError.message });
    } finally {
      setBusyConnection("");
    }
  };

  const loadPreview = async (type) => {
    setBusyConnection(type);
    try {
      const saved = await api.saveOneCConfig(configForm);
      applyOneCState(saved);
      const result = await api.previewOneCCatalog(type, 20);
      setPreview(result);
    } catch (previewError) {
      alert(previewError.message);
    } finally {
      setBusyConnection("");
    }
  };

  const action = async (row, type) => {
    setBusyId(row.id);
    try {
      let result;
      if (type === "check") result = await api.checkExchangeOrder(row.id);
      if (type === "send") {
        await api.checkExchangeOrder(row.id);
        result = await api.sendExchangeOrder(row.id);
      }
      if (type === "draft") {
        await api.checkExchangeOrder(row.id);
        result = await api.createOneCDraft(row.id);
      }
      if (type === "reset") result = await api.resetExchangeOrder(row.id);
      if (result?.result?.message) alert(result.result.message);
      await onReload();
      await load();
    } catch (actionError) {
      alert(actionError.message);
      await onReload();
      await load();
    } finally {
      setBusyId("");
    }
  };

  const downloadOne = async (row, format) => {
    setBusyId(row.id);
    try {
      const blob = await api.downloadExchangeOrder(row.id, format);
      downloadBlobFile(blob, `clover-order-${row.number || row.id}-1c.${format}`);
    } catch (downloadError) {
      alert(downloadError.message);
    } finally {
      setBusyId("");
    }
  };

  const downloadBatch = async (format) => {
    try {
      const blob = await api.downloadExchangeBatch(format, batchStatus);
      downloadBlobFile(blob, `clover-orders-1c.${format}`);
    } catch (downloadError) {
      alert(downloadError.message);
    }
  };

  const summary = data?.summary || {};
  const runtime = oneC?.runtime || {};
  const modeIsReal = configForm.mode === "real";
  const connectionLabel = modeIsReal
    ? runtime.readyForRead
      ? "Режим реальной 1С"
      : "Требуется адрес публикации"
    : "Безопасный симулятор";

  return <section>
    <div className="exchange-summary-strip">
      <article className="stat-card"><span>Очередь / не отправлено</span><strong>{summary.notSent || 0}</strong></article>
      <article className="stat-card"><span>Ошибки обмена</span><strong>{summary.error || 0}</strong></article>
      <article className="stat-card"><span>Связь 1С</span><strong>{connectionLabel}</strong></article>
    </div>
    <div className="exchange-notice">
      <strong>Действия по заказу</strong> — в карточке заказа (вкладка «Заказы»). Здесь сводка очереди, подключение и пакетные операции.
    </div>

    <details className="panel" style={{ marginTop: 0, padding: 16 }} open={!modeIsReal || !runtime.readyForRead}>
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>
        Подключение к 1С · {connectionLabel}
      </summary>
      <div style={{ marginTop: 14 }}>
      <div className="form-grid">
        <label className="field">
          Режим подключения
          <select value={configForm.mode} onChange={(event) => setConfigForm({ ...configForm, mode: event.target.value })}>
            <option value="simulation">Безопасный симулятор</option>
            <option value="real">Реальная 1С по локальной сети</option>
          </select>
        </label>
        <label className="field">
          Адрес опубликованной базы 1С
          <input
            value={configForm.baseUrl || ""}
            disabled={Boolean(runtime.baseUrlFromEnv)}
            placeholder="http://192.168.1.10/clover"
            onChange={(event) => setConfigForm({ ...configForm, baseUrl: event.target.value })}
          />
        </label>
        <label className="field">
          Пользователь обмена 1С
          <input
            value={configForm.username || ""}
            disabled={Boolean(runtime.usernameFromEnv)}
            placeholder="CloverExchange"
            onChange={(event) => setConfigForm({ ...configForm, username: event.target.value })}
          />
        </label>
        <label className="field">
          Тайм-аут, мс
          <input
            type="number"
            min="3000"
            max="30000"
            value={configForm.timeoutMs || 10000}
            onChange={(event) => setConfigForm({ ...configForm, timeoutMs: Number(event.target.value) || 10000 })}
          />
        </label>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary className="section-toggle">Технические пути HTTP-сервиса</summary>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">Проверка связи<input value={configForm.healthPath || ""} onChange={(event) => setConfigForm({ ...configForm, healthPath: event.target.value })} /></label>
          <label className="field">Контрагенты<input value={configForm.clientsPath || ""} onChange={(event) => setConfigForm({ ...configForm, clientsPath: event.target.value })} /></label>
          <label className="field">Номенклатура<input value={configForm.productsPath || ""} onChange={(event) => setConfigForm({ ...configForm, productsPath: event.target.value })} /></label>
          <label className="field">Черновик заказа<input value={configForm.draftOrderPath || ""} onChange={(event) => setConfigForm({ ...configForm, draftOrderPath: event.target.value })} /></label>
        </div>
      </details>

      <div className="setting-card" style={{ marginTop: 12 }}>
        <div>
          <h3>Разрешить создание черновика</h3>
          <p>Даже после включения здесь рабочая запись останется заблокированной, пока в server/.env не установлено ONEC_WRITE_ENABLED=true.</p>
        </div>
        <button
          className={configForm.allowDraftCreation ? "toggle active" : "toggle"}
          type="button"
          onClick={() => setConfigForm({ ...configForm, allowDraftCreation: !configForm.allowDraftCreation })}
          aria-label="Разрешить создание черновика"
        ><span /></button>
      </div>

      <div className="exchange-actions">
        <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={saveConnection}>Сохранить настройки</button>
        <button className="primary-button" disabled={Boolean(busyConnection)} type="button" onClick={testConnection}>{busyConnection === "test" ? "Проверяем…" : "Проверить связь"}</button>
        <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("clients")}>Контрагенты</button>
        <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("products")}>Номенклатура</button>
      </div>

      <div className="toolbar four" style={{ marginTop: 12 }}>
        <div className="warning-box" style={{ padding: 10 }}>Секрет в server/.env: {runtime.secretConfigured ? "настроен" : "не настроен"}</div>
        <div className="warning-box" style={{ padding: 10 }}>Чтение: {runtime.readyForRead ? "доступно" : "не готово"}</div>
        <div className="warning-box" style={{ padding: 10 }}>Запись: {runtime.readyForWrite ? "разрешена" : "заблокирована"}</div>
        <div className="warning-box" style={{ padding: 10 }}>База: УНФ 1.6 · документ ЗаказПокупателя</div>
      </div>

      {connectionResult && (
        <div className={connectionResult.ok === false ? "auth-error" : "success-box"} style={{ marginTop: 12 }}>
          {connectionResult.ok === false
            ? connectionResult.message
            : <><strong>Связь работает.</strong> {connectionResult.configuration || "1С:УНФ"}{connectionResult.database ? ` · база ${connectionResult.database}` : ""}{connectionResult.extensionVersion ? ` · расширение ${connectionResult.extensionVersion}` : ""}</>}
        </div>
      )}

      {preview && (
        <div className="comment-box" style={{ marginTop: 12 }}>
          <strong>{preview.type === "clients" ? "Контрагенты" : "Номенклатура"}: {preview.count || 0}</strong>
          <p className="muted small">Только просмотр. Данные Clover пока не изменяются.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {(preview.items || []).map((item, index) => (
              <div key={item.id || index} style={{ paddingBottom: 8, borderBottom: "1px solid #e5ebe3" }}>
                <strong>{item.name || item.presentation || item.code || "Без названия"}</strong>
                <small style={{ display: "block" }}>ID: {item.id || "—"}{item.article ? ` · артикул ${item.article}` : ""}{item.inn ? ` · ИНН ${item.inn}` : ""}</small>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </details>

    <div className="panel-heading">
      <div>
        <p className="eyebrow">Интеграция</p>
        <h2>Очередь обмена</h2>
        <p>Сводка и пакетные операции. Передача отдельного заказа — в карточке на вкладке «Заказы».</p>
      </div>
      <button className="secondary-button" type="button" onClick={load}>Обновить</button>
    </div>
    {error && <div className="auth-error">{error}</div>}
    <div className="exchange-grid">
      <article><span>Не отправлено</span><strong>{summary.notSent || 0}</strong></article>
      <article><span>Готово</span><strong>{summary.ready || 0}</strong></article>
      <article><span>Передано тестово</span><strong>{summary.sent || 0}</strong></article>
      <article><span>Черновики 1С</span><strong>{summary.draft || 0}</strong></article>
      <article><span>Ошибки</span><strong>{summary.error || 0}</strong></article>
    </div>
    <div className="toolbar four">
      <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value)}><option value="all">Все заказы</option>{Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
      <button className="secondary-button" type="button" onClick={() => downloadBatch("json")}>Скачать пакет JSON</button>
      <button className="secondary-button" type="button" onClick={() => downloadBatch("csv")}>Скачать пакет CSV</button>
      <div className="warning-box" style={{ padding: 10 }}>Не сопоставлено клиентов: {summary.missingClientLinks || 0} · товаров: {summary.missingProductLinks || 0}</div>
    </div>

    {(data?.matching?.clients?.length || data?.matching?.products?.length) > 0 && (
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Подготовка данных</p>
            <h2>Мастер сопоставления с 1С</h2>
            <p>Показаны только клиенты и товары, которые используются в заказах и ещё не имеют ID из 1С.</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="comment-box">
            <strong>Клиенты без связи с 1С: {data?.matching?.clients?.length || 0}</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {(data?.matching?.clients || []).slice(0, 8).map((client) => (
                <div key={client.id}>
                  <strong>{client.companyName || client.email}</strong>
                  <small style={{ display: "block" }}>{client.contactName || "Контакт не указан"} · {client.email}</small>
                </div>
              ))}
            </div>
            <button className="secondary-button" style={{ marginTop: 12 }} type="button" onClick={() => onNavigate("clients")}>Открыть клиентов</button>
          </div>
          <div className="comment-box">
            <strong>Товары без ID номенклатуры: {data?.matching?.products?.length || 0}</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {(data?.matching?.products || []).slice(0, 8).map((product) => (
                <div key={product.id}>
                  <strong>{product.name}</strong>
                  <small style={{ display: "block" }}>{product.code || "Без внутреннего кода"}</small>
                </div>
              ))}
            </div>
            <button className="secondary-button" style={{ marginTop: 12 }} type="button" onClick={() => onNavigate("products")}>Открыть товары</button>
          </div>
        </div>
      </section>
    )}

    <div className="exchange-order-list">
      {(data?.rows || []).map((row) => {
        const exchange = normalizeOrderExchange(row.exchange);
        const busy = busyId === row.id;
        return <article className="exchange-order-row" key={row.id}>
          <div className="exchange-order-head"><div><span className={`badge ${exchangeBadgeClass(exchange.status)}`}>{EXCHANGE_STATUS_LABELS[exchange.status]}</span><h3>Заказ № {row.number} · {row.customerName}</h3><p className="muted small">Создан {formatDateTime(row.createdAt)} · доставка {formatDate(row.deliveryDate)} · статус заказа: {row.orderStatus}</p></div><strong>{row.validation?.ready ? "Готов" : `${row.validation?.issues?.length || 0} ошибок`}</strong></div>
          {row.validation?.issues?.length > 0 && <ul className="exchange-issues">{row.validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          {exchange.message && <div className="exchange-message">{exchange.message}{exchange.receipt ? ` · ${exchange.receipt}` : ""}</div>}
          {exchange.remoteDocument && <div className="exchange-message">Документ: {exchange.remoteDocument.number || exchange.remoteDocument.id || "—"} · {exchange.remoteDocument.posted ? "проведён" : "не проведён"} · {exchange.remoteDocument.mode === "real" ? "рабочая 1С" : "симулятор"}</div>}
          <div className="exchange-actions">
            <button className="secondary-button" disabled={busy} type="button" onClick={() => action(row, "check")}>Проверить</button>
            <button className="secondary-button" disabled={busy || exchange.status === "sending"} type="button" onClick={() => action(row, "send")}>{exchange.status === "sending" ? "Ожидает ACK 1С" : "Проверить и передать тестово"}</button>
            <button className="primary-button" disabled={busy || !runtime.readyForWrite} title={!runtime.readyForWrite ? "Запись пока заблокирована настройками" : ""} type="button" onClick={() => action(row, "draft")}>{modeIsReal ? "Черновик в 1С" : "Черновик в симуляторе"}</button>
            <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOne(row, "json")}>JSON</button>
            <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOne(row, "csv")}>CSV</button>
            {exchange.status !== "not_sent" && <button className="secondary-button" disabled={busy || exchange.status === "sending"} type="button" onClick={() => action(row, "reset")}>Сбросить</button>}
          </div>
        </article>;
      })}
      {!loadingExchange && !(data?.rows || []).length && !error && <div className="empty-box">Заказов для обмена пока нет.</div>}
      {loadingExchange && <div className="empty-box">Загружаем центр обмена...</div>}
    </div>

    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">История</p><h2>Журнал обмена</h2></div></div>
      <div className="exchange-log">
        {(data?.log || []).map((item) => <article className="exchange-log-row" key={item.id}><h4>{AUDIT_ACTION_LABELS[item.action] || item.action}</h4><p>{formatDateTime(item.createdAt)} · заказ № {item.details?.orderNumber || "—"} · {item.userEmail || "Система"}</p></article>)}
        {!(data?.log || []).length && <div className="empty-box">Операций обмена пока нет.</div>}
      </div>
    </section>
  </section>;
}

function ManagerAudit() {
  const [items, setItems] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoadingAudit(true);
    try {
      const result = await api.listAudit(250);
      setItems(result.audit || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return <section className="panel" style={{ marginTop: 0 }}>
    <div className="panel-heading"><div><p className="eyebrow">Контроль</p><h2>Журнал действий</h2><p>Последние входы, изменения каталога, матриц, фотографий и резервных копий.</p></div><button className="secondary-button" type="button" onClick={load}>Обновить</button></div>
    {error && <div className="auth-error">{error}</div>}
    <div className="audit-list">
      {items.map((item) => <article className="audit-row" key={item.id}>
        <div><h3>{AUDIT_ACTION_LABELS[item.action] || item.action}</h3><p>{formatDateTime(item.createdAt)} · {item.userEmail || "Система"} · {item.userRole === "manager" ? "менеджер" : item.userRole === "client" ? "клиент" : "система"}</p>{formatAuditDetails(item) && <div className="audit-details">{formatAuditDetails(item)}</div>}</div>
      </article>)}
      {!loadingAudit && !items.length && !error && <div className="empty-box">Записей пока нет.</div>}
      {loadingAudit && <div className="empty-box">Загружаем журнал...</div>}
    </div>
  </section>;
}

const MANAGER_NOTIFICATION_META = {
  new_order: { label: "Новый заказ", tab: "orders" },
  order_changed: { label: "Заказ изменён", tab: "orders" },
  order_deleted: { label: "Заказ удалён", tab: "orders" },
  custom_item: { label: "Товар вне матрицы", tab: "orders" },
  reconciliation_request: { label: "Акт сверки", tab: "more", moreTab: "acts" },
  client_registration: { label: "Новый клиент", tab: "clients" },
  onec_error: { label: "Ошибка 1С", tab: "exchange" },
  test: { label: "Тест", tab: "more", moreTab: "settings" },
};

function managerNotificationTab(notification) {
  const meta = MANAGER_NOTIFICATION_META[notification?.type];
  if (meta?.moreTab) {
    writeManagerMoreTab(meta.moreTab);
  }
  return meta?.tab || "orders";
}

function ManagerNotificationBell({ notifications = [], open, onToggle, onOpen, onRead, onReadAll }) {
  const unread = notifications.filter((item) => !item.readAt);
  return (
    <div className="manager-bell">
      <button
        className="secondary-button"
        type="button"
        aria-expanded={open}
        aria-label={unread.length ? `Уведомления: ${unread.length}` : "Уведомления"}
        onClick={onToggle}
      >
        Уведомления
        {unread.length > 0 && <span className="manager-bell-count">{unread.length}</span>}
      </button>
      {open && (
        <div className="manager-bell-panel">
          <div className="manager-notification-header" style={{ marginBottom: 10 }}>
            <strong>Уведомления · {unread.length}</strong>
            {unread.length > 0 && (
              <button className="secondary-button" type="button" onClick={onReadAll}>
                Всё прочитано
              </button>
            )}
          </div>
          {unread.length ? (
            <div className="manager-notification-list">
              {unread.slice(0, 8).map((item) => (
                <article className="manager-notification-item" key={item.id} style={{ marginBottom: 10 }}>
                  <div>
                    <span className="badge yellow">{MANAGER_NOTIFICATION_META[item.type]?.label || "Событие"}</span>
                    <h3 style={{ fontSize: 14 }}>{item.title}</h3>
                    {item.body && <p>{item.body}</p>}
                    <small>{formatDateTime(item.createdAt)}</small>
                  </div>
                  <div className="inline-actions" style={{ marginTop: 8 }}>
                    <button className="primary-button" type="button" onClick={() => onOpen(item)}>Открыть</button>
                    <button className="secondary-button" type="button" onClick={() => onRead(item)}>Прочитано</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-box" style={{ margin: 0 }}>Новых уведомлений нет.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ManagerDashboard({ authUser, orders, products, setProducts, profile, addresses, serverClients, reconciliationRequests, managerNotifications, settings, setSettings, clientLinks, setClientLinks, managerNotice, onDismissNotice, onReadNotification, onReadAllNotifications, onUpdateOrder, onBulkUpdateOrders, onDeleteOrder, onCreateProductFromCustom, onImport, onClearOrders, onResetAll, onReload, onLogout }) {
  const [tab, setTab] = useState(readManagerActiveTab);
  const [moreTab, setMoreTab] = useState(readManagerMoreTab);
  const [headerSearch, setHeaderSearch] = useState("");
  const [bellOpen, setBellOpen] = useState(false);

  const selectTab = (nextTab) => {
    setTab(nextTab);
    writeManagerActiveTab(nextTab);
    if (nextTab !== "orders") setHeaderSearch("");
  };

  const selectMoreTab = (nextTab) => {
    setMoreTab(nextTab);
    writeManagerMoreTab(nextTab);
  };

  const openFromNotification = (item) => {
    selectTab(managerNotificationTab(item));
    if (MANAGER_NOTIFICATION_META[item?.type]?.moreTab) {
      setMoreTab(MANAGER_NOTIFICATION_META[item.type].moreTab);
    }
    setBellOpen(false);
    onReadNotification(item);
  };
  const clients = useMemo(() => {
    const map = new Map(
      (serverClients || []).map((client) => [
        client.id,
        {
          ...client,
          isRegistered: true,
          orders: [],
          addresses: normalizeManagerClientAddresses(client.addresses),
        },
      ])
    );

    orders.forEach((order) => {
      const id = order.clientId || `legacy-${order.customerEmail || order.customerName}`;
      const current = map.get(id) || {
        id,
        companyName: order.customerName || "",
        contactName: order.customerContact || "",
        phone: order.customerPhone || "",
        email: order.customerEmail || "",
        isRegistered: false,
        orders: [],
        addresses: [],
      };
      current.orders.push(order);
      if (
        order.address &&
        !current.addresses.some((item) =>
          String(typeof item === "string" ? item : item.address) ===
          String(order.address)
        )
      ) {
        current.addresses.push({
          id: `order-address-${order.id || current.addresses.length}`,
          label: "Адрес из заказа",
          address: order.address,
          isDefault: current.addresses.length === 0,
        });
      }
      map.set(id, current);
    });

    return [...map.values()].map((client) => ({
      ...client,
      lastOrder: [...client.orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0],
    }));
  }, [orders, serverClients]);

  const newCount = orders.filter((order) => order.status === "Новый").length;
  const exchangeErrors = orders.filter((order) => normalizeOrderExchange(order.exchange).status === "error").length;
  const unreadCount = (managerNotifications || []).filter((item) => !item.readAt).length;

  return <main className="clover-app">
    <Header title="Кабинет менеджера" subtitle="Заказы · клиенты · товары · 1С" onLogout={onLogout}>
      <div className="manager-header-tools">
        <input
          className="manager-search-input"
          type="search"
          placeholder="Поиск заказов…"
          value={headerSearch}
          onChange={(e) => {
            setHeaderSearch(e.target.value);
            if (tab !== "orders") selectTab("orders");
          }}
          aria-label="Поиск заказов"
        />
        <ManagerNotificationBell
          notifications={managerNotifications}
          open={bellOpen}
          onToggle={() => setBellOpen((current) => !current)}
          onOpen={openFromNotification}
          onRead={(item) => { onReadNotification(item); }}
          onReadAll={() => { onReadAllNotifications(); setBellOpen(false); }}
        />
      </div>
    </Header>
    <section className="page-content">
      {managerNotice && (
        <div className="exchange-notice" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong>{managerNotice.title}</strong>
              {managerNotice.body && <div>{managerNotice.body}</div>}
              <div>{formatDateTime(managerNotice.createdAt)}</div>
              {managerNotice.pendingCount > 1 && (
                <div>Непросмотренных событий: {managerNotice.pendingCount}</div>
              )}
            </div>
            <div className="exchange-actions">
              <button className="primary-button" type="button" onClick={() => { openFromNotification(managerNotice); onDismissNotice(); }}>
                Открыть
              </button>
              <button className="secondary-button" type="button" onClick={onDismissNotice}>Прочитано</button>
            </div>
          </div>
        </div>
      )}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <article className="stat-card"><span>Новые заказы</span><strong>{newCount}</strong></article>
        <article className="stat-card"><span>Ошибки 1С</span><strong>{exchangeErrors}</strong></article>
        <article className="stat-card"><span>Непрочитано</span><strong>{unreadCount}</strong></article>
      </div>
      <nav className="manager-nav">{MANAGER_TABS.map(([id,label]) => <button className={[tab === id ? "active" : "", id === "more" ? "nav-service" : ""].filter(Boolean).join(" ")} type="button" key={id} onClick={() => selectTab(id)}>{label}</button>)}</nav>
      {tab === "orders" && <ManagerOrders orders={orders} settings={settings} onUpdateOrder={onUpdateOrder} onBulkUpdateOrders={onBulkUpdateOrders} onDeleteOrder={onDeleteOrder} onCreateProductFromCustom={onCreateProductFromCustom} onReload={onReload} headerSearch={headerSearch} />}
      {tab === "exchange" && <ManagerExchange onReload={onReload} onNavigate={selectTab} />}
      {tab === "clients" && <ManagerClients clients={clients} products={products} setProducts={setProducts} clientLinks={clientLinks} setClientLinks={setClientLinks} onReload={onReload} />}
      {tab === "products" && <ManagerProducts products={products} setProducts={setProducts} />}
      {tab === "more" && (
        <section>
          <nav className="manager-more-nav" aria-label="Дополнительно">
            {MANAGER_MORE_TABS.map(([id, label]) => (
              <button
                className={moreTab === id ? "category-button active" : "category-button"}
                type="button"
                key={id}
                onClick={() => selectMoreTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {moreTab === "acts" && <ManagerReconciliation requests={reconciliationRequests} onReload={onReload} />}
          {moreTab === "settings" && <ManagerSettings settings={settings} setSettings={setSettings} authUser={authUser} />}
          {moreTab === "backup" && <ManagerBackup data={{ orders, products, profile, addresses, settings, clientLinks }} onImport={onImport} onClearOrders={onClearOrders} onResetAll={onResetAll} onReload={onReload} />}
          {moreTab === "audit" && <ManagerAudit />}
        </section>
      )}
    </section>
  </main>;
}

export function ManagerScreen(props) {
  return <ManagerDashboard {...props} />;
}
