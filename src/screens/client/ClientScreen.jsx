// Экран клиента: заказ, история, кабинет.
import { useEffect, useState } from "react";
import { ORDER_STATUSES } from "../../config/orderConfig";
import {
  OrderTimeline,
  Header,
  CustomRequestPhoto,
  PasswordSecurityPanel,
  PushSettings,
} from "../../shared/SharedPanels";
import {
  CLIENT_TABS,
  writeClientActiveTab,
  clientTabFromSection,
  UNIT_CONFIG,
  formatDate,
  formatDateTime,
  formatMoney,
  getOrderTotal,
  getPositionCount,
  statusClass,
} from "../../shared/appHelpers";
import { ManagerContact } from "./ManagerContact";
import { ProfilePanel } from "./ProfilePanel";
import { AddressesPanel } from "./AddressesPanel";
import { OrderEditor } from "./OrderEditor";
import { ReconciliationPanel } from "./ReconciliationPanel";
import { ClientMatrixPanel } from "./ClientMatrixPanel";

function ClientDashboard({
  profile,
  setProfile,
  addresses,
  setAddresses,
  orders,
  settings,
  catalogPolicy,
  matrixProductCount,
  fullCatalogCount,
  reconciliationRequests,
  onReload,
  onNew,
  onEdit,
  onRepeat,
  onDelete,
  onLogout,
  catalogSession,
  products,
  matrixProducts,
  favorites,
  setFavorites,
  showFullCatalog,
  setShowFullCatalog,
  onSaveOrder,
  onCloseCatalog,
  canCreateOrder,
  profileComplete,
}) {
  const [tab, setTab] = useState("home");
  const [filter, setFilter] = useState("Активные");
  const active = orders.filter(
    (order) => !["Выполнен", "Отменён"].includes(order.status)
  );
  const visibleOrders =
    filter === "Активные"
      ? active
      : filter === "Все"
        ? orders
        : orders.filter((order) => order.status === filter);
  const orderSession = catalogSession || { mode: "new" };
  const orderEditorKey = `${orderSession.mode}-${orderSession.order?.id || "new"}`;

  const selectTab = (id) => {
    setTab(id);
    writeClientActiveTab(id);
    if (id === "home") {
      onNew?.({ silent: true });
    }
  };

  useEffect(() => {
    if (
      catalogSession &&
      (catalogSession.mode === "edit" || catalogSession.mode === "repeat")
    ) {
      setTab("home");
      writeClientActiveTab("home");
    }
  }, [catalogSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    const orderId = params.get("order");

    if (orderId || section) {
      const mapped = orderId ? "orders" : clientTabFromSection(section);
      if (mapped) {
        setTab(mapped);
        writeClientActiveTab(mapped);
      }
      const targetId = orderId
        ? `order-${orderId}`
        : section === "reconciliation"
          ? "reconciliation"
          : "";
      if (!targetId) return undefined;
      const timer = window.setTimeout(() => {
        document
          .getElementById(targetId)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
      return () => window.clearTimeout(timer);
    }

    setTab("home");
    writeClientActiveTab("home");
    onNew?.({ silent: true });
    return undefined;
  }, []);

  const navButtons = (
    <>
      {CLIENT_TABS.map(([id, label]) => (
        <button
          className={[tab === id ? "active" : "", id === "cabinet" ? "nav-service" : ""].filter(Boolean).join(" ")}
          type="button"
          key={id}
          onClick={() => selectTab(id)}
        >
          {label}
          {id === "orders" && active.length > 0 ? ` (${active.length})` : ""}
        </button>
      ))}
    </>
  );

  return (
    <main className="clover-app">
      <Header
        title={
          profile.contactName
            ? `Здравствуйте, ${profile.contactName}!`
            : "Личный кабинет клиента"
        }
        subtitle={profile.companyName}
        onLogout={onLogout}
      >
        <ManagerContact settings={settings} />
      </Header>
      <section className="page-content">
        <nav
          className="client-nav client-nav-desktop"
          aria-label="Разделы кабинета"
        >
          {navButtons}
        </nav>

        {tab === "home" && (
          <>
            {(catalogPolicy.matrixMode === "pending" ||
              matrixProductCount > 0) && (
              <div
                className={
                  catalogPolicy.matrixMode === "pending"
                    ? "matrix-catalog-note pending client-home-note"
                    : "matrix-catalog-note client-home-note"
                }
              >
                {catalogPolicy.matrixMode === "pending" ? (
                  <>
                    <strong>Ваш каталог готовится</strong>
                    <br />
                    Менеджер закрепит постоянные товары и цены. Заказ можно
                    оформить уже сейчас.
                  </>
                ) : (
                  <>
                    <strong>Ваши товары: {matrixProductCount}</strong>
                    {catalogPolicy.allowFullCatalog &&
                      ` · доступен весь каталог (${fullCatalogCount})`}
                  </>
                )}
              </div>
            )}

            {!canCreateOrder && (
              <div className="warning-box client-home-gate">
                {!profileComplete && settings.requireProfile && (
                  <p>
                    Сначала заполните профиль организации в{" "}
                    <button
                      className="linkish"
                      type="button"
                      onClick={() => selectTab("cabinet")}
                    >
                      Кабинете
                    </button>
                    .
                  </p>
                )}
                {settings.requireAddress && !addresses.length && (
                  <p>
                    Добавьте адрес доставки в{" "}
                    <button
                      className="linkish"
                      type="button"
                      onClick={() => selectTab("cabinet")}
                    >
                      Кабинете
                    </button>
                    .
                  </p>
                )}
              </div>
            )}

            {canCreateOrder ? (
              <OrderEditor
                key={orderEditorKey}
                embedded
                session={orderSession}
                products={products}
                addresses={addresses}
                favorites={favorites}
                setFavorites={setFavorites}
                settings={settings}
                profile={profile}
                orders={orders}
                catalogPolicy={catalogPolicy}
                showFullCatalog={showFullCatalog}
                setShowFullCatalog={setShowFullCatalog}
                onClose={onCloseCatalog}
                onSave={(payload) => {
                  onSaveOrder(payload);
                  setTab("orders");
                  writeClientActiveTab("orders");
                }}
              />
            ) : (
              <div className="empty-box">
                Оформление заказа станет доступно после заполнения обязательных данных.
                <div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => selectTab("cabinet")}
                  >
                    Открыть кабинет
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "orders" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">История</p>
                <h2>Мои заказы</h2>
                <p>
                  Активных: {active.length}
                  {active[0]
                    ? ` · ближайшая доставка ${formatDate(active[0].firstDeliveryDate)}`
                    : ""}
                </p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  onNew({ forceNew: true });
                  setTab("home");
                  writeClientActiveTab("home");
                }}
              >
                + Новый заказ
              </button>
            </div>
            <div className="category-list" style={{ marginBottom: 18 }}>
              {["Активные", "Все", ...ORDER_STATUSES].map((status) => (
                <button
                  className={
                    filter === status
                      ? "category-button active"
                      : "category-button"
                  }
                  type="button"
                  key={status}
                  onClick={() => setFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>

            {visibleOrders.length ? (
              <div className="order-list">
                {visibleOrders.map((order) => {
                  const total = getOrderTotal(order);
                  const canEdit =
                    settings.allowClientEdit && order.status === "Новый";
                  const canDelete =
                    settings.allowClientDelete && order.status === "Новый";
                  return (
                    <article
                      className="order-card"
                      id={`order-${order.id}`}
                      key={order.id}
                    >
                      <div className="order-card-header">
                        <div>
                          <span
                            className={`badge ${statusClass(order.status)}`}
                          >
                            {order.status}
                          </span>
                          <h3>Заказ № {order.number}</h3>
                          <p>Создан: {formatDateTime(order.createdAt)}</p>
                        </div>
                        <div className="nowrap">
                          <strong className="success-text">
                            {settings.showPrices && total > 0
                              ? formatMoney(total)
                              : `${getPositionCount(order)} поз.`}
                          </strong>
                        </div>
                      </div>
                      <div className="order-meta">
                        <div>
                          <span>Дата доставки</span>
                          <strong>{formatDate(order.firstDeliveryDate)}</strong>
                        </div>
                        <div>
                          <span>Адрес</span>
                          <strong>{order.address}</strong>
                        </div>
                        <div>
                          <span>Позиций</span>
                          <strong>{getPositionCount(order)}</strong>
                        </div>
                        <div>
                          <span>Обновлён</span>
                          <strong>
                            {formatDateTime(order.updatedAt || order.createdAt)}
                          </strong>
                        </div>
                      </div>
                      <details className="order-details">
                        <summary>Посмотреть состав заказа</summary>
                        <div className="order-products">
                          {(order.items || []).map((item) => (
                            <div
                              className="order-product"
                              key={`${order.id}-${item.productId ?? item.id}`}
                            >
                              <span>
                                {item.name}
                                <small>{item.code || item.category}</small>
                              </span>
                              <strong>
                                {item.quantity}{" "}
                                {UNIT_CONFIG[item.unit]?.shortLabel || item.unit}
                                <small>
                                  {item.multiplier > 1
                                    ? `${item.quantity * item.multiplier} шт. всего`
                                    : ""}
                                </small>
                              </strong>
                            </div>
                          ))}
                          {(order.customItems || []).map((item) => (
                            <div
                              className="order-product custom-line custom-request-order-row"
                              key={`${order.id}-${item.id}`}
                            >
                              <CustomRequestPhoto
                                photo={item.photo}
                                className="custom-request-photo-order"
                              />
                              <span>
                                <span className="badge yellow">
                                  {item.requestStatus || "Новый запрос"}
                                </span>
                                {item.name}
                                <small>{item.details}</small>
                                {item.managerComment && (
                                  <small>Менеджер: {item.managerComment}</small>
                                )}
                              </span>
                              <strong>
                                {item.quantity} {item.unit}
                                <small>
                                  {Number(item.unitPrice) > 0
                                    ? formatMoney(
                                        Number(item.unitPrice) * item.quantity
                                      )
                                    : "Цена уточняется"}
                                </small>
                              </strong>
                            </div>
                          ))}
                        </div>
                        {(order.clientComment || order.managerComment) && (
                          <div className="order-comments">
                            {order.clientComment && (
                              <div className="comment-box">
                                <strong>Ваш комментарий</strong>
                                <p>{order.clientComment}</p>
                              </div>
                            )}
                            {order.managerComment && (
                              <div className="comment-box">
                                <strong>Комментарий менеджера</strong>
                                <p>{order.managerComment}</p>
                              </div>
                            )}
                          </div>
                        )}
                        <OrderTimeline order={order} />
                      </details>
                      <div className="client-order-actions">
                        {canEdit && (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => onEdit(order)}
                          >
                            Редактировать
                          </button>
                        )}
                        {settings.allowRepeatOrder && (
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => onRepeat(order)}
                          >
                            Повторить заказ
                          </button>
                        )}
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => window.print()}
                        >
                          Печать
                        </button>
                        {canDelete && (
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() => onDelete(order)}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-box">
                {filter === "Активные"
                  ? "Активных заказов нет."
                  : "Заказов с таким статусом пока нет."}
                <div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      onNew({ forceNew: true });
                      selectTab("home");
                    }}
                  >
                    Оформить заказ
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "cabinet" && (
          <div className="client-cabinet-stack">
            <ProfilePanel profile={profile} onChange={setProfile} />
            <AddressesPanel addresses={addresses} onChange={setAddresses} />
            <ReconciliationPanel
              requests={reconciliationRequests}
              onReload={onReload}
            />
            <details className="panel" style={{ padding: 16 }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                Мои товары (справочно)
              </summary>
              <div style={{ marginTop: 14 }}>
                <ClientMatrixPanel
                  products={matrixProducts}
                  settings={settings}
                  catalogPolicy={catalogPolicy}
                  favorites={favorites}
                  setFavorites={setFavorites}
                  onCreateOrder={() => {
                    onNew({ forceNew: true });
                    selectTab("home");
                  }}
                />
              </div>
            </details>
            <PushSettings />
            <PasswordSecurityPanel />
          </div>
        )}
      </section>

      <nav className="client-bottom-nav" aria-label="Главное меню">
        {navButtons}
      </nav>
    </main>
  );
}

export function ClientScreen(props) {
  return <ClientDashboard {...props} />;
}
