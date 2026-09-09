import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел менеджера: журнал действий.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { formatDateTime } from "../../shared/appHelpers";

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
  "exchange.send.error": "manager.text8",
  "exchange.reset": "manager.text12",
  "exchange.download.order": "manager.orderFileDownloadedFor1c",
  "exchange.download.batch": "manager.orderPackDownloadedFor1c",
  "exchange.config.save": "manager.text15",
  "exchange.connection.test": "manager.text10",
  "exchange.connection.error": "manager.text7",
  "exchange.catalog.preview": "manager.text11",
  "exchange.catalog.error": "manager.failedToReadThe1cCatalog",
  "one-c.products.receive": "manager.nomenclatureReceivedFrom1c",
  "one-c.products.auto-link": "manager.productsWereMatchedWith1cAutomatically",
  "exchange.send.draft": "manager.text13",
  "exchange.send.draft.error": "manager.failedToCreateA1cDraft",
};

function formatAuditDetails(item, t) {
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
        : t("manager.photoUploaded");
    case "product.image.delete":
      return details.productName
        ? `Товар: ${details.productName}`
        : t("manager.photoDeleted");
    case "product.delete":
      return details.productName
        ? `Товар: ${details.productName} · матриц: ${Number(details.matricesChanged) || 0}`
        : t("manager.productRemovedFromTheCatalog");
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
      return t("manager.cabinetSettingsUpdated");
    case "auth.login":
      return t("manager.successfulSignIn");
    case "auth.register":
      return t("manager.newClientAccountCreated");
    case "server.reset":
      return t("manager.dataWasResetAfterASafety");
    case "exchange.check":
      return `Заказ № ${details.orderNumber || "—"} · ${details.ready ? "готов к передаче" : `ошибок: ${(details.issues || []).length}`}`;
    case "exchange.send.test":
      return `Заказ № ${details.orderNumber || "—"} · Заказ покупателя: ${details.receipt || "—"}`;
    case "exchange.send.error":
      return `Заказ № ${details.orderNumber || "—"} · ошибок: ${(details.issues || []).length}`;
    case "exchange.reset":
      return `Заказ № ${details.orderNumber || "—"}`;
    case "exchange.download.order":
      return `Заказ № ${details.orderNumber || "—"} · формат: ${String(details.format || "json").toUpperCase()}`;
    case "exchange.download.batch":
      return `Формат: ${String(details.format || "json").toUpperCase()} · заказов: ${Number(details.count) || 0}`;
    case "exchange.config.save":
      return `Режим: ${details.mode === "real" ? "реальная 1С" : t("manager.simulator")} · адрес: ${details.baseUrlConfigured ? "заполнен" : "не заполнен"}`;
    case "exchange.connection.test":
      return `${details.mode === "real" ? "Реальная 1С" : "Симулятор"} · ${details.configuration || "подключение проверено"}`;
    case "exchange.connection.error":
      return details.message || t("manager.connectionError");
    case "exchange.catalog.preview":
      return `${details.type === "clients" ? t("manager.counterparties") : t("manager.nomenclature")} · записей: ${Number(details.count) || 0}`;
    case "exchange.catalog.error":
      return `${details.type || "Справочник"} · ${details.message || "ошибка"}`;
    case "one-c.products.receive":
      return `Получено: ${Number(details.received) || 0} · новых связей: ${Number(details.newlyLinked) || 0} · без совпадения: ${Number(details.unmatched) || 0}`;
    case "one-c.products.auto-link":
      return `Товаров Clover: ${Number(details.cloverTotal) || 0} · связанных: ${Number(details.linked) || 0} · новых связей: ${Number(details.newlyLinked) || 0}`;
    case "exchange.send.draft":
      return `Заказ № ${details.orderNumber || "—"} · документ ${details.documentNumber || details.documentId || "создан"} · ${details.mode === "real" ? t("manager.nav.exchange") : t("manager.simulator")}`;
    case "exchange.send.draft.error":
      return `Заказ № ${details.orderNumber || "—"} · ${details.message || "ошибка"}`;
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
      setError(loadError.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
