// Экран клиента: заказ, история, кабинет.
import { useEffect, useMemo, useState } from "react";
import {
  OrderTimeline,
  Header,
  CustomRequestPhoto,
  PasswordSecurityPanel,
  PushSettings,
  OrderThankYouOverlay,
} from "../../shared/SharedPanels";
import { StickyCabinetChrome } from "../../shared/StickyCabinetChrome";
import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { orderHistoryFilterLabel, orderStatusLabel, requestStatusLabel } from "../../shared/i18n/displayLabels";
import {
  CLIENT_TABS,
  CLIENT_CABINET_SECTIONS,
  CLIENT_NARROW_MQ,
  writeClientActiveTab,
  readClientCabinetSection,
  writeClientCabinetSection,
  clientTabFromSection,
  clientCabinetSectionFromQuery,
  countUnseenReadyActs,
  markReadyActsSeen,
  UNIT_CONFIG,
  formatDate,
  formatDateTime,
  formatMoney,
  getOrderTotal,
  getPositionCount,
  statusClass,
} from "../../shared/appHelpers";
import { canTrashOrder } from "../../shared/orderTrash";
import { EmptyState } from "../../shared/uxFeedback";
import { ManagerContact } from "./ManagerContact";
import { ClientSectionMenu } from "./ClientSectionMenu";
import { ProfilePanel } from "./ProfilePanel";
import { AddressesPanel } from "./AddressesPanel";
import { OrderEditor } from "./OrderEditor";
import { ClientCatalogAddPanel } from "./ClientCatalogAddPanel";
import { ReconciliationPanel } from "./ReconciliationPanel";

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
  fullCatalogProducts = [],
  favorites,
  setFavorites,
  showFullCatalog: _showFullCatalog,
  setShowFullCatalog,
  onSaveOrder,
  onCloseCatalog,
  onAddToMatrix,
  onRemoveFromMatrix,
  canCreateOrder,
  profileComplete,
}) {
  const isNarrow = useIsNarrow();
  const { t } = useLocalization();
  const [tab, setTab] = useState("matrix");
  const [cabinetSection, setCabinetSection] = useState(readClientCabinetSection);
  const [filter, setFilter] = useState("Активные");
  const [thankYouOpen, setThankYouOpen] = useState(false);
  const [seenActsTick, setSeenActsTick] = useState(0);
  const [matrixAddBusyId, setMatrixAddBusyId] = useState("");
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
  // instanceId меняется при «Новый» / после успешного оформления — иначе React
  // переиспользует OrderEditor и показывает корзину прошлого заказа.
  const orderEditorKey = `${orderSession.mode}-${orderSession.order?.id || "new"}-${orderSession.instanceId || "0"}`;

  const selectCabinetSection = (id) => {
    setCabinetSection(id);
    writeClientCabinetSection(id);
  };

  const finishOrderThankYou = () => {
    setThankYouOpen(false);
    setTab("matrix");
    writeClientActiveTab("matrix");
    onNew?.({ silent: true });
  };

  const selectTab = (id) => {
    setTab(id);
    writeClientActiveTab(id);
    if (id === "matrix") {
      onNew?.({ silent: true });
    }
    if (id === "reconciliation") {
      markReadyActsSeen(reconciliationRequests);
      setSeenActsTick((value) => value + 1);
    }
    if (id === "cabinet" && isNarrow && !CLIENT_CABINET_SECTIONS.some(([sectionId]) => sectionId === cabinetSection)) {
      selectCabinetSection("settings");
    }
  };

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = themeMeta?.getAttribute("content") || "";
    html.classList.add("clover-client-lk");
    body.classList.add("clover-client-lk");
    if (themeMeta) themeMeta.setAttribute("content", "#ffffff");
    return () => {
      html.classList.remove("clover-client-lk");
      body.classList.remove("clover-client-lk");
      if (themeMeta) themeMeta.setAttribute("content", prevTheme || "#ffffff");
    };
  }, []);

  useEffect(() => {
    if (
      catalogSession &&
      (catalogSession.mode === "edit" || catalogSession.mode === "repeat")
    ) {
      setTab("matrix");
      writeClientActiveTab("matrix");
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
          ? ""
          : clientCabinetSectionFromQuery(section) || readClientCabinetSection();

      if (mapped === "cabinet") {
        setTab("cabinet");
        writeClientActiveTab("cabinet");
        if (cabinetMapped) selectCabinetSection(cabinetMapped);
      } else if (mapped) {
        setTab(mapped);
        writeClientActiveTab(mapped);
        if (mapped === "reconciliation") {
          markReadyActsSeen(reconciliationRequests);
          setSeenActsTick((value) => value + 1);
        }
      }

      const targetId = orderId
        ? `order-${orderId}`
        : section === "reconciliation" || section === "acts"
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

    setTab("matrix");
    writeClientActiveTab("matrix");
    onNew?.({ silent: true });
    return undefined;
  }, []);

  const primaryTabs = CLIENT_TABS;
  const readyActsBadge = useMemo(
    () => countUnseenReadyActs(reconciliationRequests),
    [reconciliationRequests, seenActsTick]
  );

  const navButtons = (
    <>
      {primaryTabs.map(([id, label]) => (
        <button
          className={tab === id ? "active" : ""}
          type="button"
          key={id}
          onClick={() => selectTab(id)}
        >
          {t(label)}
          {id === "orders" && active.length > 0 ? ` (${active.length})` : ""}
          {id === "reconciliation" && readyActsBadge > 0 ? (
            <span
              className="client-nav-count"
              aria-label={t("client.acts.readyCount", { count: readyActsBadge })}
            >
              {readyActsBadge}
            </span>
          ) : null}
        </button>
      ))}
    </>
  );

  const openNewOrder = () => {
    onNew({ forceNew: true });
    selectTab("matrix");
  };

  const addProductToMatrix = async (product) => {
    if (!product?.id || !onAddToMatrix) return;
    setMatrixAddBusyId(product.id);
    try {
      await onAddToMatrix(product.id);
    } finally {
      setMatrixAddBusyId("");
    }
  };

  const removeProductFromMatrix = async (product) => {
    if (!product?.id || !onRemoveFromMatrix) return;
    setMatrixAddBusyId(product.id);
    try {
      await onRemoveFromMatrix(product.id);
    } finally {
      setMatrixAddBusyId("");
    }
  };

  const ordersPanel = (
    <section className="panel client-orders-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("shared.section.history")}</p>
          <h2>{t("client.nav.orders")}</h2>
          <p>
            {t("client.orders.activeCount", { count: active.length })}
            {active[0]
              ? t("client.orders.nextDelivery", { date: formatDate(active[0].firstDeliveryDate) })
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
            {orderHistoryFilterLabel(status, t)}
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
              settings.allowClientDelete && canTrashOrder(order, "client", t).ok;
            return (
              <article
                className="order-card"
                id={`order-${order.id}`}
                key={order.id}
              >
                <div className="order-card-header">
                  <div>
                    <span className={`badge ${statusClass(order.status)}`}>
                      {orderStatusLabel(order.status, t)}
                    </span>
                    <h3>{t("client.order.numberHeading", { number: order.number })}</h3>
                    <p>{t("client.order.createdAt", { datetime: formatDateTime(order.createdAt) })}</p>
                  </div>
                  <div className="nowrap">
                    <strong className="success-text">
                      {settings.showPrices && total > 0
                        ? formatMoney(total)
                        : t("client.orders.positionCount", { count: getPositionCount(order) })}
                    </strong>
                  </div>
                </div>
                <div className="order-meta">
                  <div>
                    <span>{t("checkout.deliveryDate")}</span>
                    <strong>{formatDate(order.firstDeliveryDate)}</strong>
                  </div>
                  <div>
                    <span>{t("shared.field.address")}</span>
                    <strong>{order.address}</strong>
                  </div>
                  <div>
                    <span>{t("shared.field.positions")}</span>
                    <strong>{getPositionCount(order)}</strong>
                  </div>
                  <div>
                    <span>{t("client.updated")}</span>
                    <strong>
                      {formatDateTime(order.updatedAt || order.createdAt)}
                    </strong>
                  </div>
                </div>
                <details className="order-details">
                  <summary>{t("client.viewOrderContents")}</summary>
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
                              ? t("client.orders.pieceTotal", { count: item.quantity * item.multiplier })
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
                            {requestStatusLabel(item.requestStatus || "Новый запрос", t)}
                          </span>
                          {item.name}
                          <small>{item.details}</small>
                          {item.managerComment && (
                            <small>{t("client.order.managerCommentPrefix", { comment: item.managerComment })}</small>
                          )}
                        </span>
                        <strong>
                          {item.quantity} {item.unit}
                          <small>
                            {Number(item.unitPrice) > 0
                              ? formatMoney(
                                  Number(item.unitPrice) * item.quantity
                                )
                              : t("shared.price.pending")}
                          </small>
                        </strong>
                      </div>
                    ))}
                  </div>
                  {(order.clientComment || order.managerComment) && (
                    <div className="order-comments">
                      {order.clientComment && (
                        <div className="comment-box">
                          <strong>{t("client.yourComment")}</strong>
                          <p>{order.clientComment}</p>
                        </div>
                      )}
                      {order.managerComment && (
                        <div className="comment-box">
                          <strong>{t("client.managerComment")}</strong>
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
                    >{
                      t("client.edit")
                    }</button>
                  )}
                  {settings.allowRepeatOrder && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onRepeat(order)}
                    >{
                      t("client.reorder")
                    }</button>
                  )}
                  {canDelete && (
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => onDelete(order)}
                    >{
                      t("shared.action.delete")
                    }</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={filter === "Активные" ? t("client.noOrdersYet") : t("client.noOrdersFound")}
          message={
            filter === "Активные"
              ? t("client.createTheFirstOrderItWill")
              : t("client.thereAreNoOrdersForThis")
          }
          actionLabel={t("client.order.new")}
          onAction={openNewOrder}
        />
      )}

      <button
        className="client-new-order-fab"
        type="button"
        onClick={openNewOrder}
      >{
        t("client.action.newOrder")
      }</button>
    </section>
  );

  const cabinetDesktop = (
    <div className="client-cabinet-stack">
      <ProfilePanel profile={profile} onChange={setProfile} />
      <AddressesPanel addresses={addresses} onChange={setAddresses} />
      <PushSettings />
      <PasswordSecurityPanel allowPasswordChange={false} />
    </div>
  );

  const cabinetMobile = (
    <div className="client-cabinet-stack">
      <nav className="client-cabinet-nav" aria-label={t("client.settingsSections")}>
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
            {t(label)}
          </button>
        ))}
      </nav>

      {cabinetSection === "addresses" && (
        <AddressesPanel addresses={addresses} onChange={setAddresses} />
      )}
      {cabinetSection === "settings" && (
        <div className="client-settings-stack">
          <ProfilePanel profile={profile} onChange={setProfile} />
          <PushSettings />
          <PasswordSecurityPanel allowPasswordChange={false} />
        </div>
      )}
    </div>
  );

  return (
    <main className="clover-app clover-app-client">
      <StickyCabinetChrome className="app-top-chrome-client">
        <Header
          title={
            profile.contactName
              ? t("client.profile.helloNamed", { name: profile.contactName })
              : t("client.clientPersonalCabinet")
          }
          subtitle={profile.companyName}
          onLogout={onLogout}
          nav={
            !isNarrow ? (
              <nav className="client-nav" aria-label={t("client.cabinetSections")}>
                {navButtons}
              </nav>
            ) : null
          }
          between={
            isNarrow ? (
              <ClientSectionMenu
                tabs={primaryTabs}
                activeId={tab}
                onSelect={selectTab}
                ordersBadge={active.length}
                actsBadge={readyActsBadge}
              />
            ) : null
          }
        >
          <ManagerContact settings={settings} />
        </Header>
      </StickyCabinetChrome>
      <section className="page-content page-content-client">
        {(tab === "matrix" || tab === "home") && (
          <>
            {!canCreateOrder && (
              <div className="warning-box client-home-gate">
                {!profileComplete && settings.requireProfile && (
                  <p>
                    {(() => {
                      const token = "\u0001";
                      const [before, after = ""] = t("client.gate.fillOrgProfileInSettings", {
                        settings: token,
                      }).split(token);
                      return (
                        <>
                          {before}
                          <button
                            className="linkish"
                            type="button"
                            onClick={() => {
                              selectTab("cabinet");
                              if (isNarrow) selectCabinetSection("settings");
                            }}
                          >
                            {t("client.settings")}
                          </button>
                          {after}
                        </>
                      );
                    })()}
                  </p>
                )}
                {settings.requireAddress && !addresses.length && (
                  <p>
                    {(() => {
                      const token = "\u0001";
                      const [before, after = ""] = t("client.gate.addDeliveryAddressInSettings", {
                        settings: token,
                      }).split(token);
                      return (
                        <>
                          {before}
                          <button
                            className="linkish"
                            type="button"
                            onClick={() => {
                              selectTab("cabinet");
                              if (isNarrow) selectCabinetSection("addresses");
                            }}
                          >
                            {t("client.settings")}
                          </button>
                          {after}
                        </>
                      );
                    })()}
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
                showFullCatalog={false}
                setShowFullCatalog={setShowFullCatalog}
                onClose={onCloseCatalog}
                onOpenCatalogAdd={() => selectTab("catalog")}
                onSave={(payload) =>
                  Promise.resolve(onSaveOrder(payload)).then(() => {
                    // Дозаказ: уже был confirm — без второго thank-you экрана.
                    if (payload?.addendumToOrderId) {
                      setThankYouOpen(false);
                      setTab("matrix");
                      writeClientActiveTab("matrix");
                      onNew?.({ silent: true });
                      return;
                    }
                    setThankYouOpen(true);
                  })
                }
              />
            ) : (
              <div className="empty-box">{
                t("client.checkoutWillBecomeAvailableAfterRequired")
                }<div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      selectTab("cabinet");
                      if (isNarrow) selectCabinetSection("settings");
                    }}
                  >{
                    t("client.openSettings")
                  }</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "catalog" && (
          <ClientCatalogAddPanel
            products={fullCatalogProducts}
            matrixProductIds={catalogPolicy?.matrixProductIds}
            matrixMode={catalogPolicy?.matrixMode}
            settings={settings}
            busyId={matrixAddBusyId}
            onAdd={addProductToMatrix}
            onRemove={removeProductFromMatrix}
          />
        )}

        {tab === "orders" && ordersPanel}

        {tab === "reconciliation" && (
          <ReconciliationPanel
            requests={reconciliationRequests}
            onReload={onReload}
          />
        )}

        {tab === "cabinet" && (isNarrow ? cabinetMobile : cabinetDesktop)}
      </section>
      <OrderThankYouOverlay
        open={thankYouOpen}
        onDone={finishOrderThankYou}
        confirmLabel={t("storefront.nav.homeLink")}
      />
    </main>
  );
}

export function ClientScreen(props) {
  return <ClientDashboard {...props} />;
}
