// Раздел менеджера: журнал действий.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { formatDateTime } from "../../shared/appHelpers";

export const AUDIT_ACTION_LABELS = {
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

export function ManagerAudit() {
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
