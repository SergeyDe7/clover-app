import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел менеджера: журнал действий.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { formatDateTime } from "../../shared/appHelpers";
import { backupReasonLabel } from "../../shared/i18n/displayLabels";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";

export const AUDIT_ACTION_LABELS = {
  "auth.register": "manager.clientRegistered",
  "auth.login": "manager.cabinetSignIn",
  "orders.save": "manager.ordersSaved",
  "products.save": "manager.catalogChanged",
  "settings.save": "manager.settingsChanged",
  "localization.settings.save": "manager.languagesAndTranslationsSaved",
  "manager.notification": "manager.managerWasNotified",
  "manager.notification.read": "manager.notificationMarkedAsRead",
  "manager.notification.read_all": "manager.allNotificationsMarkedAsRead",
  "manager.notification.test": "manager.notificationChannelsChecked",
  "client.matrix.save": "manager.clientMatrixChanged",
  "client.profile.manager_update": "manager.managerChangedClientDetails",
  "product.image.upload": "manager.productPhotoUploaded",
  "product.image.delete": "manager.productPhotoDeleted",
  "product.delete": "manager.productDeletedFromTheCatalog",
  "backup.create": "manager.backupCreated",
  "backup.restore": "manager.backupRestored",
  "backup.cleanup": "manager.oldBackupsDeleted",
  "server.reset": "manager.fullResetCompleted",
  "exchange.check": "manager.orderCheckedFor1c",
  "exchange.send.test": "manager.orderQueuedFor1c",
  "exchange.send.error": "manager.exchange.send.testError",
  "exchange.reset": "manager.exchange.status.reset",
  "exchange.download.order": "manager.orderFileDownloadedFor1c",
  "exchange.download.batch": "manager.orderPackDownloadedFor1c",
  "exchange.config.save": "manager.exchange.config.saved",
  "exchange.connection.test": "manager.exchange.connection.checked",
  "exchange.connection.error": "manager.exchange.connection.error",
  "exchange.catalog.preview": "manager.exchange.catalog.previewed",
  "exchange.catalog.error": "manager.failedToReadThe1cCatalog",
  "one-c.products.receive": "manager.nomenclatureReceivedFrom1c",
  "one-c.products.auto-link": "manager.productsWereMatchedWith1cAutomatically",
  "exchange.send.draft": "manager.exchange.draft.created",
  "exchange.send.draft.error": "manager.failedToCreateA1cDraft",
};

function formatAuditDetails(item, t) {
  const details = item?.details || {};
  const dash = "—";

  switch (item?.action) {
    case "orders.save":
      return t("shared.ordersSavedCount", { count: Number(details.count) || 0 });
    case "products.save":
      return t("shared.productsInCatalogCount", { count: Number(details.count) || 0 });
    case "client.matrix.save":
      return t("shared.clientsChangedCount", { count: Number(details.clients) || 0 });
    case "client.profile.manager_update":
      return details.changedEmail
        ? t("manager.audit.clientAddressesEmailChanged", {
            clientId: details.clientId || dash,
            addresses: Number(details.addresses) || 0,
          })
        : t("manager.audit.clientAddresses", {
            clientId: details.clientId || dash,
            addresses: Number(details.addresses) || 0,
          });
    case "product.image.upload":
      return details.productName
        ? t("shared.productName2", { name: details.productName })
        : t("manager.photoUploaded");
    case "product.image.delete":
      return details.productName
        ? t("shared.productName2", { name: details.productName })
        : t("manager.photoDeleted");
    case "product.delete":
      return details.productName
        ? t("manager.audit.productMatrices", {
            name: details.productName,
            count: Number(details.matricesChanged) || 0,
          })
        : t("manager.productRemovedFromTheCatalog");
    case "backup.create": {
      const reason = backupReasonLabel(details.reason, t) || t("manager.audit.backupFallback");
      return details.photoCount !== undefined
        ? t("manager.audit.backupWithPhotos", { reason, photoCount: details.photoCount })
        : reason;
    }
    case "backup.restore":
      return t("manager.audit.backupRestored", {
        fileName: details.fileName || t("manager.audit.backupCopyFallback"),
        count: Number(details.restoredPhotos) || 0,
      });
    case "backup.cleanup":
      return t("manager.audit.backupCleanup", {
        removed: Array.isArray(details.removed) ? details.removed.length : 0,
        remaining: Number(details.remaining) || 0,
      });
    case "settings.save":
      return t("manager.cabinetSettingsUpdated");
    case "auth.login":
      return t("manager.successfulSignIn");
    case "auth.register":
      return t("manager.newClientAccountCreated");
    case "server.reset":
      return t("manager.dataWasResetAfterASafety");
    case "exchange.check":
      return details.ready
        ? t("manager.audit.orderReady", { number: details.orderNumber || dash })
        : t("manager.audit.orderIssues", {
            number: details.orderNumber || dash,
            count: (details.issues || []).length,
          });
    case "exchange.send.test":
      return t("manager.audit.orderReceipt", {
        number: details.orderNumber || dash,
        receipt: details.receipt || dash,
      });
    case "exchange.send.error":
      return t("manager.audit.orderIssues", {
        number: details.orderNumber || dash,
        count: (details.issues || []).length,
      });
    case "exchange.reset":
      return t("shared.print.orderHeading", { number: details.orderNumber || dash });
    case "exchange.download.order":
      return t("manager.audit.orderFormat", {
        number: details.orderNumber || dash,
        format: String(details.format || "json").toUpperCase(),
      });
    case "exchange.download.batch":
      return t("manager.audit.batchFormat", {
        format: String(details.format || "json").toUpperCase(),
        count: Number(details.count) || 0,
      });
    case "exchange.config.save":
      return t("manager.audit.exchangeConfig", {
        mode: details.mode === "real" ? t("manager.audit.modeReal") : t("manager.simulator"),
        address: details.baseUrlConfigured
          ? t("manager.audit.addressFilled")
          : t("manager.audit.addressEmpty"),
      });
    case "exchange.connection.test":
      return t("manager.audit.connectionOk", {
        mode: details.mode === "real" ? t("manager.audit.modeRealTitle") : t("manager.audit.modeSimulatorTitle"),
        detail: details.configuration || t("manager.audit.connectionChecked"),
      });
    case "exchange.connection.error":
      return details.message || t("manager.connectionError");
    case "exchange.catalog.preview":
      return t("manager.audit.catalogPreview", {
        type: details.type === "clients" ? t("manager.counterparties") : t("manager.nomenclature"),
        count: Number(details.count) || 0,
      });
    case "exchange.catalog.error":
      return t("manager.audit.catalogError", {
        type: details.type || t("manager.audit.directory"),
        message: details.message || t("manager.audit.errorWord"),
      });
    case "one-c.products.receive":
      return t("manager.audit.nomenclatureReceived", {
        received: Number(details.received) || 0,
        newlyLinked: Number(details.newlyLinked) || 0,
        unmatched: Number(details.unmatched) || 0,
      });
    case "one-c.products.auto-link":
      return t("manager.audit.autoLinkSummary", {
        cloverTotal: Number(details.cloverTotal) || 0,
        linked: Number(details.linked) || 0,
        newlyLinked: Number(details.newlyLinked) || 0,
      });
    case "exchange.send.draft":
      return t("manager.audit.draftCreated", {
        number: details.orderNumber || dash,
        document: details.documentNumber || details.documentId || t("manager.audit.documentCreated"),
        mode: details.mode === "real" ? t("manager.nav.exchange") : t("manager.simulator"),
      });
    case "exchange.send.draft.error":
      return t("manager.audit.orderError", {
        number: details.orderNumber || dash,
        message: details.message || t("manager.audit.errorWord"),
      });
    default:
      return "";
  }
}

export function ManagerAudit() {
  const { t } = useLocalization();
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
      setError(errorDisplayMessage(loadError, t, "shared.error.loadFailed"));
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    load();
  }, [t]);

  return <section className="panel" style={{ marginTop: 0 }}>
    <div className="panel-heading"><div><p className="eyebrow">{t("manager.control")}</p><h2>{t("manager.activityLog")}</h2><p>{t("manager.recentSignInsCatalogMatrixPhoto")}</p></div><button className="secondary-button" type="button" onClick={load}>{t("shared.action.refresh")}</button></div>
    {error && <div className="auth-error">{error}</div>}
    <div className="audit-list">
      {items.map((item) => <article className="audit-row" key={item.id}>
        <div><h3>{AUDIT_ACTION_LABELS[item.action] ? t(AUDIT_ACTION_LABELS[item.action]) : item.action}</h3><p>{formatDateTime(item.createdAt)} · {item.userEmail || t("shared.role.system")} · {item.userRole === "manager" ? t("manager.manager") : item.userRole === "client" ? t("manager.client") : t("manager.system")}</p>{formatAuditDetails(item, t) && <div className="audit-details">{formatAuditDetails(item, t)}</div>}</div>
      </article>)}
      {!loadingAudit && !items.length && !error && <div className="empty-box">{t("manager.noRecordsYet")}</div>}
      {loadingAudit && <div className="empty-box">{t("manager.loadingTheLog")}</div>}
    </div>
  </section>;
}
