// Экран клиента: заказ, история, кабинет.
import { useEffect, useState } from "react";
import {
  OrderTimeline,
  Header,
  CustomRequestPhoto,
  PasswordSecurityPanel,
  PushSettings,
  OrderThankYouOverlay,
} from "../../shared/SharedPanels";
import {
  CLIENT_TABS,
  CLIENT_CABINET_SECTIONS,
  CLIENT_NARROW_MQ,
  writeClientActiveTab,
  readClientCabinetSection,
  writeClientCabinetSection,
  clientTabFromSection,
  clientCabinetSectionFromQuery,
  UNIT_CONFIG,
  formatDate,
  formatDateTime,
  formatMoney,
  getOrderTotal,
  getPositionCount,
  statusClass,
} from "../../shared/appHelpers";
import { canTrashOrder } from "../../shared/orderTrash";
import { ManagerContact } from "./ManagerContact";
import { ProfilePanel } from "./ProfilePanel";
import { AddressesPanel } from "./AddressesPanel";
import { OrderEditor } from "./OrderEditor";
import { ReconciliationPanel } from "./ReconciliationPanel";
import { ClientMatrixPanel } from "./ClientMatrixPanel";

const NARROW_MQ = CLIENT_NARROW_MQ;
const ORDER_HISTORY_FILTERS = ["Активные", "Все", "Выполнен", "Отменён"];

function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(NARROW_MQ).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia(NARROW_MQ);
    const onChange = () => setIsNarrow(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isNarrow;
}

function ClientDashboard({
  profile,
  setProfile,
  addresses,
  setAddresses,
  orders,
  settings,
  catalogPolicy,
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
  const isNarrow = useIsNarrow();
  const [tab, setTab] = useState("home");
  const [cabinetSection, setCabinetSection] = useState(readClientCabinetSection);
  const [filter, setFilter] = useState("Активные");
  const [thankYouOpen, setThankYouOpen] = useState(false);
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

  const selectCabinetSection = (id) => {
    setCabinetSection(id);
    writeClientCabinetSection(id);
  };

  const openOrders = () => {
    if (isNarrow) {
      setTab("cabinet");
      writeClientActiveTab("cabinet");
      selectCabinetSection("history");
      return;
    }
    setTab("orders");
    writeClientActiveTab("orders");
  };

  const finishOrderThankYou = () => {
    setThankYouOpen(false);
    openOrders();
  };

  const selectTab = (id) => {
    if (isNarrow && id === "orders") {
      openOrders();
      return;
    }
    setTab(id);
    writeClientActiveTab(id);
    if (id === "home") {
      onNew?.({ silent: true });
    }
    if (id === "cabinet" && isNarrow && !cabinetSection) {
      selectCabinetSection("history");
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
      const cabinetMapped =
        orderId
          ? "history"
          : clientCabinetSectionFromQuery(section) || readClientCabinetSection();

      if (mapped === "orders" || mapped === "cabinet") {
        if (window.matchMedia?.(NARROW_MQ).matches && (mapped === "orders" || orderId)) {
          setTab("cabinet");
          writeClientActiveTab("cabinet");
          selectCabinetSection("history");
        } else if (mapped === "cabinet") {
          setTab("cabinet");
          writeClientActiveTab("cabinet");
          if (cabinetMapped) selectCabinetSection(cabinetMapped);
        } else if (mapped) {
          setTab(mapped);
          writeClientActiveTab(mapped);
        }
      } else if (mapped) {
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

  useEffect(() => {
    if (!isNarrow && tab === "cabinet" && cabinetSection === "history") {
      setTab("orders");
      writeClientActiveTab("orders");
    }
    if (isNarrow && tab === "orders") {
      setTab("cabinet");
      writeClientActiveTab("cabinet");
      selectCabinetSection("history");
    }
  }, [isNarrow]);

  const primaryTabs = isNarrow
    ? [
        ["home", "Заказ"],
        ["cabinet", "Кабинет"],
      ]
    : CLIENT_TABS;

  const navButtons = (
    <>
      {primaryTabs.map(([id, label]) => (
        <button
          className={[
            tab === id ? "active" : "",
            id === "cabinet" ? "nav-service" : "",
          ]
            .filter(Boolean)
            .join(" ")}
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

  const openNewOrder = () => {
    onNew({ forceNew: true });
    selectTab("home");
  };

  const ordersPanel = (
    <section className="panel client-orders-panel">
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
      </div>
      <div className="category-list order-history-filters" style={{ marginBottom: 18 }}>
        {ORDER_HISTORY_FILTERS.map((status) => (
          <button
            className={
              filter === status ? "category-button active" : "category-button"
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
              settings.allowClientDelete && canTrashOrder(order, "client").ok;
            return (
              <article
                className="order-card"
                id={`order-${order.id}`}
                key={order.id}
              >
                <div className="order-card-header">
                  <div>
                    <span className={`badge ${statusClass(order.status)}`}>
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
                      className="secondary-button"
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
        </div>
      )}

      <button
        className="client-new-order-fab"
        type="button"
        onClick={openNewOrder}
      >
        + Новый заказ
      </button>
    </section>
  );

  const cabinetDesktop = (
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
  );

  const cabinetMobile = (
    <div className="client-cabinet-stack">
      <nav className="client-cabinet-nav" aria-label="Разделы кабинета">
        {CLIENT_CABINET_SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={
              cabinetSection === id
                ? "category-button active"
                : "category-button"
            }
            onClick={() => selectCabinetSection(id)}
          >
            {label}
            {id === "history" && active.length > 0 ? ` (${active.length})` : ""}
          </button>
        ))}
      </nav>

      {cabinetSection === "history" && ordersPanel}
      {cabinetSection === "matrix" && (
        <div className="panel" style={{ padding: 16 }}>
          <div className="panel-heading" style={{ marginBottom: 14 }}>
            <div>
              <p className="eyebrow">Каталог</p>
              <h2>Товарная матрица</h2>
              <p className="muted small">Ваши постоянные товары и цены</p>
            </div>
          </div>
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
      )}
      {cabinetSection === "addresses" && (
        <AddressesPanel addresses={addresses} onChange={setAddresses} />
      )}
      {cabinetSection === "reconciliation" && (
        <ReconciliationPanel
          requests={reconciliationRequests}
          onReload={onReload}
        />
      )}
      {cabinetSection === "settings" && (
        <div className="client-settings-stack">
          <ProfilePanel profile={profile} onChange={setProfile} />
          <PushSettings />
          <PasswordSecurityPanel />
        </div>
      )}
    </div>
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
      <section className="page-content page-content-client">
        <nav className="client-nav" aria-label="Разделы кабинета">
          {navButtons}
        </nav>

        {tab === "home" && (
          <>
            {!canCreateOrder && (
              <div className="warning-box client-home-gate">
                {!profileComplete && settings.requireProfile && (
                  <p>
                    Сначала заполните профиль организации в{" "}
                    <button
                      className="linkish"
                      type="button"
                      onClick={() => {
                        selectTab("cabinet");
                        if (isNarrow) selectCabinetSection("settings");
                      }}
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
                      onClick={() => {
                        selectTab("cabinet");
                        if (isNarrow) selectCabinetSection("addresses");
                      }}
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
                  Promise.resolve(onSaveOrder(payload))
                    .then(() => {
                      setThankYouOpen(true);
                    })
                    .catch(() => {
                      // Ошибка уже показана в saveOrder (alert).
                    });
                }}
              />
            ) : (
              <div className="empty-box">
                Оформление заказа станет доступно после заполнения обязательных
                данных.
                <div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      selectTab("cabinet");
                      if (isNarrow) selectCabinetSection("settings");
                    }}
                  >
                    Открыть кабинет
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "orders" && !isNarrow && ordersPanel}

        {tab === "cabinet" && (isNarrow ? cabinetMobile : cabinetDesktop)}
      </section>
      <OrderThankYouOverlay open={thankYouOpen} onDone={finishOrderThankYou} />
    </main>
  );
}

export function ClientScreen(props) {
  return <ClientDashboard {...props} />;
}
