import { useLocalization } from "../../shared/i18n/LocalizationProvider";
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
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import { exchangeStatusLabel, orderStatusLabel } from "../../shared/i18n/displayLabels";

export function ManagerExchange({ onReload, onApplyManagerNotifications, onNavigate }) {
  const { t } = useLocalization();
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
      setError(errorDisplayMessage(loadError, t, "shared.error.loadFailed"));
    } finally {
      setLoadingExchange(false);
    }
  };

  useEffect(() => { load(); }, [t]);

  const saveConnection = async () => {
    setBusyConnection("save");
    try {
      const result = await api.saveOneCConfig(configForm);
      applyOneCState(result);
      setConnectionResult(null);
      setPreview(null);
      await appAlert({
        title: t("shared.status.saved"),
        message: t("manager.exchange.connection.saved"),
        tone: "success",
      });
    } catch (saveError) {
      await appAlert({ title: t("manager.saveError2"), message: errorDisplayMessage(saveError, t, "manager.saveError2"), tone: "danger" });
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
      setConnectionResult({ ok: false, message: errorDisplayMessage(testError, t, "manager.connectionError") });
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
      await appAlert({ title: t("manager.previewError"), message: errorDisplayMessage(previewError, t, "manager.previewError"), tone: "danger" });
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
        await appAlert({ title: t("manager.exchange.title"), message: result.result.message, tone: "success" });
      }
      await onReload();
      await load();
    } catch (actionError) {
      await appAlert({ title: t("manager.exchangeError"), message: errorDisplayMessage(actionError, t, "manager.exchangeError"), tone: "danger" });
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
      await appAlert({ title: t("manager.downloadError"), message: errorDisplayMessage(downloadError, t, "manager.downloadError"), tone: "danger" });
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
      await appAlert({ title: t("manager.downloadError"), message: errorDisplayMessage(downloadError, t, "manager.downloadError"), tone: "danger" });
    } finally {
      setBusyBatch("");
    }
  };

  const summary = data?.summary || {};
  const runtime = oneC?.runtime || {};
  const exchangeContour = data?.exchangeContour || oneC?.exchangeContour || {
    prodEnabled: false,
    allowedDatabases: ["TEST"],
    defaultDatabase: "TEST",
  };
  const allowedDatabases = (exchangeContour.allowedDatabases || ["TEST"]).join(", ");
  const modeIsReal = configForm.mode === "real";
  const connectionLabel = modeIsReal
    ? runtime.readyForRead
      ? t("manager.live1cMode")
      : t("manager.publicationAddressIsRequired")
    : t("manager.safeSimulator");
  const missingClients = summary.missingClientLinks || 0;
  const missingProducts = summary.missingProductLinks || 0;
  const matchingOk = missingClients === 0 && missingProducts === 0;
  const goToOrders = () => onNavigate?.("orders");

  return (
    <section className="manager-exchange">
      <div className="exchange-notice manager-home-notice-row">
        <p>
          <strong>{t("manager.orderActions")}</strong>{ t("manager.onTheCardInTheOrders")
        }</p>
        <button className="secondary-button" type="button" onClick={goToOrders}>{t("manager.toOrders")}</button>
      </div>

      <div className="exchange-summary-strip">
        <article className="stat-card"><span>{t("manager.queueNotSent")}</span><strong>{summary.notSent || 0}</strong></article>
        <article className="stat-card"><span>{t("manager.exchangeErrors")}</span><strong>{summary.error || 0}</strong></article>
        <article className="stat-card"><span>{t("manager.exchange.linkStatus")}</span><strong>{connectionLabel}</strong></article>
      </div>

      <details className="panel manager-exchange-block" open={!modeIsReal || !runtime.readyForRead}>
        <summary className="manager-exchange-summary">
          {t("manager.exchange.connectionTo1c", { status: connectionLabel })}
        </summary>
        <div className="manager-exchange-block-body">
          <div className="form-grid">
            <label className="field">{
              t("manager.connectionMode")
              }<select value={configForm.mode} onChange={(event) => setConfigForm({ ...configForm, mode: event.target.value })}>
                <option value="simulation">{t("manager.safeSimulator")}</option>
                <option value="real">{t("manager.real1cOnTheLocalNetwork")}</option>
              </select>
            </label>
            <label className="field">{
              t("manager.published1cBaseUrl")
              }<input
                value={configForm.baseUrl || ""}
                disabled={Boolean(runtime.baseUrlFromEnv)}
                placeholder="http://192.168.1.10/clover"
                onChange={(event) => setConfigForm({ ...configForm, baseUrl: event.target.value })}
              />
            </label>
            <label className="field">{
              t("manager.exchange.user")
              }<input
                value={configForm.username || ""}
                disabled={Boolean(runtime.usernameFromEnv)}
                placeholder="CloverExchange"
                onChange={(event) => setConfigForm({ ...configForm, username: event.target.value })}
              />
            </label>
            <label className="field">{
              t("manager.timeoutMs")
              }<input
                type="number"
                min="3000"
                max="30000"
                value={configForm.timeoutMs || 10000}
                onChange={(event) => setConfigForm({ ...configForm, timeoutMs: Number(event.target.value) || 10000 })}
              />
            </label>
          </div>

          <details className="manager-exchange-nested">
            <summary className="section-toggle">{t("manager.httpServiceTechnicalPaths")}</summary>
            <div className="form-grid">
              <label className="field">{t("manager.connectionCheck")}<input value={configForm.healthPath || ""} onChange={(event) => setConfigForm({ ...configForm, healthPath: event.target.value })} /></label>
              <label className="field">{t("manager.counterparties")}<input value={configForm.clientsPath || ""} onChange={(event) => setConfigForm({ ...configForm, clientsPath: event.target.value })} /></label>
              <label className="field">{t("manager.nomenclature")}<input value={configForm.productsPath || ""} onChange={(event) => setConfigForm({ ...configForm, productsPath: event.target.value })} /></label>
              <label className="field">{t("manager.orderDraft")}<input value={configForm.draftOrderPath || ""} onChange={(event) => setConfigForm({ ...configForm, draftOrderPath: event.target.value })} /></label>
            </div>
          </details>

          <div className="setting-card">
            <div>
              <h3>{t("manager.allowDraftCreation")}</h3>
              <p>{t("manager.evenAfterEnablingHereLiveWrites")}</p>
            </div>
            <button
              className={configForm.allowDraftCreation ? "toggle active" : "toggle"}
              type="button"
              onClick={() => setConfigForm({ ...configForm, allowDraftCreation: !configForm.allowDraftCreation })}
              aria-label={t("manager.allowDraftCreation")}
            ><span /></button>
          </div>

          <div className="exchange-actions">
            <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={saveConnection}>{busyConnection === "save" ? t("shared.status.saving") : t("shared.action.saveSettings")}</button>
            <button className="primary-button" disabled={Boolean(busyConnection)} type="button" onClick={testConnection}>{busyConnection === "test" ? t("manager.checking") : t("manager.testConnection")}</button>
            <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("clients")}>{busyConnection === "clients" ? t("manager.loading") : t("manager.counterparties")}</button>
            <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("products")}>{busyConnection === "products" ? t("manager.loading") : t("manager.nomenclature")}</button>
          </div>

          <div className="manager-exchange-status-row">
            <div className="warning-box">{t("manager.exchange.secretInEnv", { status: runtime.secretConfigured ? t("manager.configured") : t("manager.notConfigured") })}</div>
            <div className="warning-box">{t("manager.exchange.readStatus", { status: runtime.readyForRead ? t("manager.available") : t("manager.notReady") })}</div>
            <div className="warning-box">{t("manager.exchange.writeStatus", { status: runtime.readyForWrite ? t("manager.allowed") : t("manager.blocked") })}</div>
            <div className="warning-box">{t("manager.baseUnf16Document")}</div>
            <div className={exchangeContour.prodEnabled ? "success-box" : "warning-box"}>
              {t("manager.exchange.ordersContour", {
                status: exchangeContour.prodEnabled
                  ? t("manager.exchange.prodEnabledDatabases", { databases: allowedDatabases })
                  : t("manager.exchange.prodDisabled"),
              })}
            </div>
          </div>

          {connectionResult && (
            <div className={connectionResult.ok === false ? "auth-error" : "success-box"}>
              {connectionResult.ok === false
                ? connectionResult.message
                : <><strong>{t("manager.connectionWorks")}</strong> {connectionResult.configuration || "1С:УНФ"}{connectionResult.database ? t("manager.exchange.databaseName", { database: connectionResult.database }) : ""}{connectionResult.extensionVersion ? t("manager.exchange.extensionVersion", { version: connectionResult.extensionVersion }) : ""}</>}
            </div>
          )}

          {preview && (
            <div className="comment-box">
              <strong>{preview.type === "clients" ? t("manager.counterparties") : t("manager.nomenclature")}: {preview.count || 0}</strong>
              <p className="muted small">{t("manager.viewOnlyCloverDataIsNot")}</p>
              <div className="manager-exchange-preview-list">
                {(preview.items || []).map((item, index) => (
                  <div key={item.id || index} className="manager-exchange-preview-item">
                    <strong>{item.name || item.presentation || item.code || t("manager.untitled")}</strong>
                    <small>ID: {item.id || "—"}{item.article ? t("manager.exchange.articleNamed", { article: item.article }) : ""}{item.inn ? t("manager.exchange.innNamed", { inn: item.inn }) : ""}</small>
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
            <p className="eyebrow">{t("manager.integration")}</p>
            <h2>{t("manager.exchangeQueue")}</h2>
            <p>{t("manager.summaryAndBatchOperationsSendingA")}</p>
          </div>
          <div className="manager-exchange-heading-actions">
            <button className="secondary-button" type="button" onClick={goToOrders}>{t("manager.toOrders")}</button>
            <button className="secondary-button" type="button" onClick={load} disabled={loadingExchange}>{loadingExchange ? t("manager.updating") : t("shared.action.refresh")}</button>
          </div>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="exchange-grid">
          <article><span>{t("manager.notSent2")}</span><strong>{summary.notSent || 0}</strong></article>
          <article><span>{t("shared.status.done")}</span><strong>{summary.ready || 0}</strong></article>
          <article><span>{t("manager.sentAsATest")}</span><strong>{summary.sent || 0}</strong></article>
          <article><span>{t("manager.exchange.drafts")}</span><strong>{summary.draft || 0}</strong></article>
          <article><span>{t("manager.errors")}</span><strong>{summary.error || 0}</strong></article>
        </div>
        <div className="manager-exchange-batch">
          <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value)} aria-label={t("manager.orderPackFilter")} disabled={Boolean(busyBatch)}>
            <option value="all">{t("manager.allOrders")}</option>
            {Object.entries(EXCHANGE_STATUS_LABELS).map(([id]) => <option value={id} key={id}>{exchangeStatusLabel(id, t)}</option>)}
          </select>
          <button className="secondary-button" type="button" disabled={Boolean(busyBatch)} onClick={() => downloadBatch("json")}>{busyBatch === "json" ? t("manager.downloading") : t("manager.downloadJsonPack")}</button>
          <button className="secondary-button" type="button" disabled={Boolean(busyBatch)} onClick={() => downloadBatch("csv")}>{busyBatch === "csv" ? t("manager.downloading") : t("manager.downloadCsvPack")}</button>
        </div>
        <div className={`${matchingOk ? "success-box" : "warning-box"} manager-exchange-match-note`}>
          {matchingOk
            ? t("manager.exchange.match.linked")
            : t("manager.exchange.unmatchedCounts", { clients: missingClients, products: missingProducts })}
        </div>
        <div className="exchange-order-list">
          {(data?.rows || []).map((row) => {
            const exchange = normalizeOrderExchange(row.exchange);
            const busy = busyId === row.id;
            return (
              <article className="exchange-order-row" key={row.id}>
                <div className="exchange-order-head">
                  <div>
                    <span className={`badge ${exchangeBadgeClass(exchange.status)}`}>{exchangeStatusLabel(exchange.status, t)}</span>
                    <h3>{t("manager.order.numberHeading", { number: row.number })} · {row.customerName}</h3>
                    <p className="muted small">{t("manager.exchange.orderCreatedMeta", {
                      datetime: formatDateTime(row.createdAt),
                      date: formatDate(row.deliveryDate),
                      status: orderStatusLabel(row.orderStatus, t),
                    })}</p>
                  </div>
                  <strong>{row.validation?.ready ? t("manager.ready2") : t("manager.exchange.errorCount", { count: row.validation?.issues?.length || 0 })}</strong>
                </div>
                {row.validation?.issues?.length > 0 && <ul className="exchange-issues">{row.validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                {exchange.message && <div className="exchange-message">{exchange.message}{exchange.receipt ? ` · ${exchange.receipt}` : ""}</div>}
                {exchange.remoteDocument && <div className="exchange-message">{t("manager.exchange.documentLine", {
                  document: exchange.remoteDocument.number || exchange.remoteDocument.id || "—",
                  posted: exchange.remoteDocument.posted ? t("manager.posted") : t("manager.notPosted"),
                  mode: exchange.remoteDocument.mode === "real" ? t("manager.production1c") : t("manager.simulator"),
                })}</div>}
                <div className="exchange-actions">
                  <button className="secondary-button" type="button" onClick={goToOrders}>{t("manager.inOrders")}</button>
                  <button className="secondary-button" disabled={busy} type="button" onClick={() => action(row, "check")}>{t("manager.check")}</button>
                  <button className="secondary-button" disabled={busy || exchange.status === "sending"} type="button" onClick={() => action(row, "send")}>{exchange.status === "sending" ? t("manager.waitingFor1cAck") : t("manager.checkAndSendAsATest")}</button>
                  <button className="primary-button" disabled={busy || !runtime.readyForWrite} title={!runtime.readyForWrite ? t("manager.savingIsBlockedBySettings") : ""} type="button" onClick={() => action(row, "draft")}>{modeIsReal ? t("manager.draftIn1c") : t("manager.draftInTheSimulator")}</button>
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
                    >{
                      t("shared.action.reset")
                    }</button>
                  )}
                </div>
              </article>
            );
          })}
          {!loadingExchange && !(data?.rows || []).length && !error && (
            <div className="empty-box">
              <p>{t("manager.noOrdersForExchangeYet")}</p>
              <p className="muted small">{t("manager.newOrdersAppearHereAfterThey")}</p>
              <button className="secondary-button" type="button" onClick={goToOrders}>{t("manager.openOrders")}</button>
            </div>
          )}
          {loadingExchange && <div className="empty-box">{t("manager.loadingTheExchangeCenter")}</div>}
        </div>
      </section>

      {(data?.matching?.clients?.length || data?.matching?.products?.length) > 0 && (
        <section className="panel manager-exchange-block">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{t("manager.dataPreparation")}</p>
              <h2>{t("manager.exchange.matchWizard")}</h2>
              <p>{t("manager.onlyClientsAndProductsUsedIn")}</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="comment-box">
              <strong>{t("manager.exchange.clientsUnlinkedCount", { count: data?.matching?.clients?.length || 0 })}</strong>
              <div className="manager-exchange-preview-list">
                {(data?.matching?.clients || []).slice(0, 8).map((client) => (
                  <div key={client.id}>
                    <strong>{client.companyName || client.email}</strong>
                    <small>{client.contactName || t("manager.noContactGiven")} · {client.email}</small>
                  </div>
                ))}
              </div>
              <button className="secondary-button" type="button" onClick={() => onNavigate("clients")}>{t("manager.openClients")}</button>
            </div>
            <div className="comment-box">
              <strong>{t("manager.exchange.productsWithoutNomenclatureId", { count: data?.matching?.products?.length || 0 })}</strong>
              <div className="manager-exchange-preview-list">
                {(data?.matching?.products || []).slice(0, 8).map((product) => (
                  <div key={product.id}>
                    <strong>{product.name}</strong>
                    <small>{product.code || t("manager.noInternalCode")}</small>
                  </div>
                ))}
              </div>
              <button className="secondary-button" type="button" onClick={() => onNavigate("products")}>{t("manager.openProducts")}</button>
            </div>
          </div>
        </section>
      )}

      <section className="panel manager-exchange-block">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("shared.section.history")}</p>
            <h2>{t("manager.exchangeLog")}</h2>
            <p>{t("manager.recentCheckSendAndResetOperations")}</p>
          </div>
        </div>
        <div className="exchange-log">
          {(data?.log || []).map((item) => (
            <article className="exchange-log-row" key={item.id}>
              <h4>{AUDIT_ACTION_LABELS[item.action] ? t(AUDIT_ACTION_LABELS[item.action]) : item.action}</h4>
              <p>{t("manager.exchange.logOrderLine", {
                datetime: formatDateTime(item.createdAt),
                number: item.details?.orderNumber || "—",
                user: item.userEmail || t("shared.role.system"),
              })}</p>
            </article>
          ))}
          {!(data?.log || []).length && (
            <div className="empty-box">
              <p>{t("manager.noExchangeOperationsYet")}</p>
              <p className="muted small">{t("manager.recordsWillAppearAfterAConnection")}</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
