// Раздел менеджера: обмен заказами с 1С.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import {
  EXCHANGE_STATUS_LABELS,
  normalizeOrderExchange,
  exchangeBadgeClass,
  downloadBlobFile,
  formatDate,
  formatDateTime,
} from "../../shared/appHelpers";
import { AUDIT_ACTION_LABELS } from "./ManagerAudit";
import { appAlert } from "../../shared/AppModal";

export function ManagerExchange({ onReload, onApplyManagerNotifications, onNavigate }) {
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
  const [busyBatch, setBusyBatch] = useState("");

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
      await appAlert({
        title: "Сохранено",
        message: "Настройки подключения к 1С сохранены.",
        tone: "success",
      });
    } catch (saveError) {
      await appAlert({ title: "Ошибка сохранения", message: saveError.message, tone: "danger" });
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
      await appAlert({ title: "Ошибка предпросмотра", message: previewError.message, tone: "danger" });
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
        if (Array.isArray(result?.managerNotifications)) {
          onApplyManagerNotifications?.(result.managerNotifications);
        }
      }
      if (type === "draft") {
        await api.checkExchangeOrder(row.id);
        result = await api.createOneCDraft(row.id);
      }
      if (type === "reset") result = await api.resetExchangeOrder(row.id);
      if (result?.result?.message) {
        await appAlert({ title: "Обмен с 1С", message: result.result.message, tone: "success" });
      }
      await onReload();
      await load();
    } catch (actionError) {
      await appAlert({ title: "Ошибка обмена", message: actionError.message, tone: "danger" });
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
      await appAlert({ title: "Ошибка скачивания", message: downloadError.message, tone: "danger" });
    } finally {
      setBusyId("");
    }
  };

  const downloadBatch = async (format) => {
    setBusyBatch(format);
    try {
      const blob = await api.downloadExchangeBatch(format, batchStatus);
      downloadBlobFile(blob, `clover-orders-1c.${format}`);
    } catch (downloadError) {
      await appAlert({ title: "Ошибка скачивания", message: downloadError.message, tone: "danger" });
    } finally {
      setBusyBatch("");
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
  const missingClients = summary.missingClientLinks || 0;
  const missingProducts = summary.missingProductLinks || 0;
  const matchingOk = missingClients === 0 && missingProducts === 0;
  const goToOrders = () => onNavigate?.("orders");

  return (
    <section className="manager-exchange">
      <div className="exchange-notice manager-home-notice-row">
        <p>
          <strong>Действия по заказу</strong> — в карточке на вкладке «Заказы». Здесь сводка очереди, подключение и пакетные операции.
        </p>
        <button className="secondary-button" type="button" onClick={goToOrders}>К заказам</button>
      </div>

      <div className="exchange-summary-strip">
        <article className="stat-card"><span>Очередь / не отправлено</span><strong>{summary.notSent || 0}</strong></article>
        <article className="stat-card"><span>Ошибки обмена</span><strong>{summary.error || 0}</strong></article>
        <article className="stat-card"><span>Связь 1С</span><strong>{connectionLabel}</strong></article>
      </div>

      <details className="panel manager-exchange-block" open={!modeIsReal || !runtime.readyForRead}>
        <summary className="manager-exchange-summary">
          Подключение к 1С · {connectionLabel}
        </summary>
        <div className="manager-exchange-block-body">
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

          <details className="manager-exchange-nested">
            <summary className="section-toggle">Технические пути HTTP-сервиса</summary>
            <div className="form-grid">
              <label className="field">Проверка связи<input value={configForm.healthPath || ""} onChange={(event) => setConfigForm({ ...configForm, healthPath: event.target.value })} /></label>
              <label className="field">Контрагенты<input value={configForm.clientsPath || ""} onChange={(event) => setConfigForm({ ...configForm, clientsPath: event.target.value })} /></label>
              <label className="field">Номенклатура<input value={configForm.productsPath || ""} onChange={(event) => setConfigForm({ ...configForm, productsPath: event.target.value })} /></label>
              <label className="field">Черновик заказа<input value={configForm.draftOrderPath || ""} onChange={(event) => setConfigForm({ ...configForm, draftOrderPath: event.target.value })} /></label>
            </div>
          </details>

          <div className="setting-card">
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
            <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={saveConnection}>{busyConnection === "save" ? "Сохраняем…" : "Сохранить настройки"}</button>
            <button className="primary-button" disabled={Boolean(busyConnection)} type="button" onClick={testConnection}>{busyConnection === "test" ? "Проверяем…" : "Проверить связь"}</button>
            <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("clients")}>{busyConnection === "clients" ? "Загружаем…" : "Контрагенты"}</button>
            <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("products")}>{busyConnection === "products" ? "Загружаем…" : "Номенклатура"}</button>
          </div>

          <div className="manager-exchange-status-row">
            <div className="warning-box">Секрет в server/.env: {runtime.secretConfigured ? "настроен" : "не настроен"}</div>
            <div className="warning-box">Чтение: {runtime.readyForRead ? "доступно" : "не готово"}</div>
            <div className="warning-box">Запись: {runtime.readyForWrite ? "разрешена" : "заблокирована"}</div>
            <div className="warning-box">База: УНФ 1.6 · документ ЗаказПокупателя</div>
          </div>

          {connectionResult && (
            <div className={connectionResult.ok === false ? "auth-error" : "success-box"}>
              {connectionResult.ok === false
                ? connectionResult.message
                : <><strong>Связь работает.</strong> {connectionResult.configuration || "1С:УНФ"}{connectionResult.database ? ` · база ${connectionResult.database}` : ""}{connectionResult.extensionVersion ? ` · расширение ${connectionResult.extensionVersion}` : ""}</>}
            </div>
          )}

          {preview && (
            <div className="comment-box">
              <strong>{preview.type === "clients" ? "Контрагенты" : "Номенклатура"}: {preview.count || 0}</strong>
              <p className="muted small">Только просмотр. Данные Clover пока не изменяются.</p>
              <div className="manager-exchange-preview-list">
                {(preview.items || []).map((item, index) => (
                  <div key={item.id || index} className="manager-exchange-preview-item">
                    <strong>{item.name || item.presentation || item.code || "Без названия"}</strong>
                    <small>ID: {item.id || "—"}{item.article ? ` · артикул ${item.article}` : ""}{item.inn ? ` · ИНН ${item.inn}` : ""}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      <section className="panel manager-exchange-block">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Интеграция</p>
            <h2>Очередь обмена</h2>
            <p>Сводка и пакетные операции. Передача отдельного заказа — в карточке на вкладке «Заказы».</p>
          </div>
          <div className="manager-exchange-heading-actions">
            <button className="secondary-button" type="button" onClick={goToOrders}>К заказам</button>
            <button className="secondary-button" type="button" onClick={load} disabled={loadingExchange}>{loadingExchange ? "Обновляем…" : "Обновить"}</button>
          </div>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="exchange-grid">
          <article><span>Не отправлено</span><strong>{summary.notSent || 0}</strong></article>
          <article><span>Готово</span><strong>{summary.ready || 0}</strong></article>
          <article><span>Передано тестово</span><strong>{summary.sent || 0}</strong></article>
          <article><span>Черновики 1С</span><strong>{summary.draft || 0}</strong></article>
          <article><span>Ошибки</span><strong>{summary.error || 0}</strong></article>
        </div>
        <div className="manager-exchange-batch">
          <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value)} aria-label="Фильтр пакета заказов" disabled={Boolean(busyBatch)}>
            <option value="all">Все заказы</option>
            {Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
          <button className="secondary-button" type="button" disabled={Boolean(busyBatch)} onClick={() => downloadBatch("json")}>{busyBatch === "json" ? "Скачиваем…" : "Скачать пакет JSON"}</button>
          <button className="secondary-button" type="button" disabled={Boolean(busyBatch)} onClick={() => downloadBatch("csv")}>{busyBatch === "csv" ? "Скачиваем…" : "Скачать пакет CSV"}</button>
        </div>
        <div className={`${matchingOk ? "success-box" : "warning-box"} manager-exchange-match-note`}>
          {matchingOk
            ? "Сопоставление с 1С: клиенты и товары в очереди связаны."
            : `Не сопоставлено клиентов: ${missingClients} · товаров: ${missingProducts}`}
        </div>
        <div className="exchange-order-list">
          {(data?.rows || []).map((row) => {
            const exchange = normalizeOrderExchange(row.exchange);
            const busy = busyId === row.id;
            return (
              <article className="exchange-order-row" key={row.id}>
                <div className="exchange-order-head">
                  <div>
                    <span className={`badge ${exchangeBadgeClass(exchange.status)}`}>{EXCHANGE_STATUS_LABELS[exchange.status]}</span>
                    <h3>Заказ № {row.number} · {row.customerName}</h3>
                    <p className="muted small">Создан {formatDateTime(row.createdAt)} · доставка {formatDate(row.deliveryDate)} · статус заказа: {row.orderStatus}</p>
                  </div>
                  <strong>{row.validation?.ready ? "Готов" : `${row.validation?.issues?.length || 0} ошибок`}</strong>
                </div>
                {row.validation?.issues?.length > 0 && <ul className="exchange-issues">{row.validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                {exchange.message && <div className="exchange-message">{exchange.message}{exchange.receipt ? ` · ${exchange.receipt}` : ""}</div>}
                {exchange.remoteDocument && <div className="exchange-message">Документ: {exchange.remoteDocument.number || exchange.remoteDocument.id || "—"} · {exchange.remoteDocument.posted ? "проведён" : "не проведён"} · {exchange.remoteDocument.mode === "real" ? "рабочая 1С" : "симулятор"}</div>}
                <div className="exchange-actions">
                  <button className="secondary-button" type="button" onClick={goToOrders}>В заказах</button>
                  <button className="secondary-button" disabled={busy} type="button" onClick={() => action(row, "check")}>Проверить</button>
                  <button className="secondary-button" disabled={busy || exchange.status === "sending"} type="button" onClick={() => action(row, "send")}>{exchange.status === "sending" ? "Ожидает ACK 1С" : "Проверить и передать тестово"}</button>
                  <button className="primary-button" disabled={busy || !runtime.readyForWrite} title={!runtime.readyForWrite ? "Запись пока заблокирована настройками" : ""} type="button" onClick={() => action(row, "draft")}>{modeIsReal ? "Черновик в 1С" : "Черновик в симуляторе"}</button>
                  <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOne(row, "json")}>JSON</button>
                  <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOne(row, "csv")}>CSV</button>
                  {exchange.status !== "not_sent" && exchange.status !== "sent" && !(
                    exchange.status === "draft" && (exchange.receipt || exchange.remoteDocument)
                  ) && (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      type="button"
                      onClick={() => action(row, "reset")}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!loadingExchange && !(data?.rows || []).length && !error && (
            <div className="empty-box">
              <p>Заказов для обмена пока нет.</p>
              <p className="muted small">Новые заказы появляются здесь после создания на вкладке «Заказы».</p>
              <button className="secondary-button" type="button" onClick={goToOrders}>Открыть заказы</button>
            </div>
          )}
          {loadingExchange && <div className="empty-box">Загружаем центр обмена…</div>}
        </div>
      </section>

      {(data?.matching?.clients?.length || data?.matching?.products?.length) > 0 && (
        <section className="panel manager-exchange-block">
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
              <div className="manager-exchange-preview-list">
                {(data?.matching?.clients || []).slice(0, 8).map((client) => (
                  <div key={client.id}>
                    <strong>{client.companyName || client.email}</strong>
                    <small>{client.contactName || "Контакт не указан"} · {client.email}</small>
                  </div>
                ))}
              </div>
              <button className="secondary-button" type="button" onClick={() => onNavigate("clients")}>Открыть клиентов</button>
            </div>
            <div className="comment-box">
              <strong>Товары без ID номенклатуры: {data?.matching?.products?.length || 0}</strong>
              <div className="manager-exchange-preview-list">
                {(data?.matching?.products || []).slice(0, 8).map((product) => (
                  <div key={product.id}>
                    <strong>{product.name}</strong>
                    <small>{product.code || "Без внутреннего кода"}</small>
                  </div>
                ))}
              </div>
              <button className="secondary-button" type="button" onClick={() => onNavigate("products")}>Открыть товары</button>
            </div>
          </div>
        </section>
      )}

      <section className="panel manager-exchange-block">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">История</p>
            <h2>Журнал обмена</h2>
            <p>Последние операции проверки, передачи и сброса по очереди 1С.</p>
          </div>
        </div>
        <div className="exchange-log">
          {(data?.log || []).map((item) => (
            <article className="exchange-log-row" key={item.id}>
              <h4>{AUDIT_ACTION_LABELS[item.action] || item.action}</h4>
              <p>{formatDateTime(item.createdAt)} · заказ № {item.details?.orderNumber || "—"} · {item.userEmail || "Система"}</p>
            </article>
          ))}
          {!(data?.log || []).length && (
            <div className="empty-box">
              <p>Операций обмена пока нет.</p>
              <p className="muted small">Записи появятся после проверки связи или передачи заказа.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
