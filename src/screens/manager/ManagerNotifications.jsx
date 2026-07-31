// Раздел менеджера: центр уведомлений.
import { writeManagerMoreTab, formatDateTime } from "../../shared/appHelpers";

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

export function managerNotificationTab(notification) {
  const meta = MANAGER_NOTIFICATION_META[notification?.type];
  if (meta?.moreTab) {
    writeManagerMoreTab(meta.moreTab);
  }
  return meta?.tab || "orders";
}

export function ManagerNotificationBell({ notifications = [], open, onToggle, onOpen, onRead, onReadAll }) {
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
