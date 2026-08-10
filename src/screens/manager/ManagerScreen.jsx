// Экран менеджера/администратора: заказы, клиенты, товары, обмен с 1С, настройки.
import { useMemo, useState } from "react";
import { Header } from "../../shared/SharedPanels";
import { StickyCabinetChrome } from "../../shared/StickyCabinetChrome";
import {
  MANAGER_TABS,
  MANAGER_MORE_TABS,
  readManagerActiveTab,
  writeManagerActiveTab,
  readManagerMoreTab,
  writeManagerMoreTab,
  normalizeOrderExchange,
  formatDateTime,
} from "../../shared/appHelpers";
import { ManagerOrders } from "./ManagerOrders";
import { ManagerExchange } from "./ManagerExchange";
import { ManagerClients, normalizeManagerClientAddresses } from "./ManagerClients";
import { ManagerReconciliation } from "./ManagerReconciliation";
import { ManagerProducts } from "./ManagerProducts";
import { ManagerSettings } from "./ManagerSettings";
import { ManagerStorefront } from "./ManagerStorefront";
import { ManagerBackup } from "./ManagerBackup";
import { ManagerAudit } from "./ManagerAudit";
import { managerNotificationTab, ManagerNotificationBell, parseManagerNotification, ManagerOrderSummaryLines } from "./ManagerNotifications";
import { ManagerAccessVault } from "./ManagerAccessVault";

function ManagerDashboard({ authUser, orders, trashedOrders = [], products, setProducts, profile, addresses, serverClients, reconciliationRequests, managerNotifications, settings, setSettings, clientLinks, setClientLinks, dirtyClientLinkIdsRef, oneCPriceTypes = [], catalogPricesVersion = "", managerNotice, onDismissNotice, onReadNotification, onReadAllNotifications, onUpdateOrder, onBulkUpdateOrders, onDeleteOrder, onRestoreOrder, onPurgeOrder, onCreateProductFromCustom, onImport, onClearOrders, onResetAll, onReload, onApplyManagerNotifications, onLogout }) {
  const [tab, setTab] = useState(readManagerActiveTab);
  const [moreTab, setMoreTab] = useState(() => {
    const saved = readManagerMoreTab();
    return saved === "managers" ? "access" : saved;
  });
  const [headerSearch, setHeaderSearch] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [ordersView, setOrdersView] = useState("active");

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
    setMoreTab(readManagerMoreTab());
    setBellOpen(false);
    onReadNotification(item);
  };

  const newActsCount = useMemo(
    () => (reconciliationRequests || []).filter((item) => item.status === "new").length,
    [reconciliationRequests]
  );
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
    <StickyCabinetChrome>
      <Header
        title={authUser?.role === "admin" ? "Кабинет админа" : "Кабинет менеджера"}
        onLogout={onLogout}
        nav={
          <nav className="manager-nav" aria-label={authUser?.role === "admin" ? "Разделы админа" : "Разделы менеджера"}>
            {MANAGER_TABS.map(([id, label]) => (
              <button
                className={tab === id ? "active" : ""}
                type="button"
                key={id}
                onClick={() => selectTab(id)}
              >
                {label}
                {id === "acts" && newActsCount > 0 ? (
                  <span className="manager-nav-count" aria-label={`Новых запросов: ${newActsCount}`}>
                    {newActsCount}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        }
      >
        <div className="manager-header-tools">
          <input
            className="manager-search-input"
            type="search"
            placeholder="Поиск заказа"
            value={headerSearch}
            onChange={(e) => {
              setHeaderSearch(e.target.value);
              if (tab !== "orders") selectTab("orders");
            }}
            aria-label="Поиск по клиенту, заказу, ИНН, телефону, адресу и email"
          />
          <ManagerNotificationBell
            notifications={managerNotifications}
            open={bellOpen}
            onToggle={() => {
              setBellOpen((current) => !current);
            }}
            onOpen={openFromNotification}
            onRead={(item) => { onReadNotification(item); }}
            onReadAll={() => { onReadAllNotifications(); setBellOpen(false); }}
          />
        </div>
      </Header>
    </StickyCabinetChrome>
    <section className="page-content">
      {managerNotice && (() => {
        const parsed = parseManagerNotification(managerNotice);
        const hasOrderSummary = Boolean(
          parsed.clientName || parsed.amount || parsed.positions || parsed.deliveryDate || parsed.orderDate || parsed.orderNumber
        );
        return (
        <div className="exchange-notice manager-home-notice">
          <div className="manager-home-notice-row">
            <div>
              {hasOrderSummary ? (
                <ManagerOrderSummaryLines
                  clientName={parsed.clientName || parsed.headline}
                  amount={parsed.amount}
                  positions={parsed.positions}
                  deliveryDate={parsed.deliveryDate}
                  orderDate={parsed.orderDate}
                  orderNumber={parsed.orderNumber}
                  detail={parsed.detail}
                />
              ) : (
                <>
                  <strong>{managerNotice.title}</strong>
                  {parsed.detail && <div className="manager-notification-meta">{parsed.detail}</div>}
                </>
              )}
              {!parsed.hideFooterTime && (
                <div className="manager-notification-time">{formatDateTime(managerNotice.createdAt)}</div>
              )}
              {managerNotice.pendingCount > 1 && (
                <div className="muted small">Ещё непросмотренных: {managerNotice.pendingCount - 1}</div>
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
        );
      })()}
      <div className="stats-grid manager-stats-strip" aria-label="Сводка">
        <article className="stat-card"><span>Новые заказы</span><strong>{newCount}</strong></article>
        <article className="stat-card"><span>Всего заказов</span><strong>{orders.length}</strong></article>
        <article className="stat-card"><span>Ошибки 1С</span><strong>{exchangeErrors}</strong></article>
        <article className="stat-card"><span>Непрочитано</span><strong>{unreadCount}</strong></article>
      </div>
      {tab === "orders" && (
        <ManagerOrders
          orders={orders}
          trashedOrders={trashedOrders}
          ordersView={ordersView}
          onOrdersViewChange={setOrdersView}
          settings={settings}
          clientLinks={clientLinks}
          onUpdateOrder={onUpdateOrder}
          onBulkUpdateOrders={onBulkUpdateOrders}
          onDeleteOrder={onDeleteOrder}
          onRestoreOrder={onRestoreOrder}
          onPurgeOrder={onPurgeOrder}
          onCreateProductFromCustom={onCreateProductFromCustom}
          onReload={onReload}
          onApplyManagerNotifications={onApplyManagerNotifications}
          headerSearch={headerSearch}
        />
      )}
      {tab === "exchange" && <ManagerExchange onReload={onReload} onApplyManagerNotifications={onApplyManagerNotifications} onNavigate={selectTab} />}
      {tab === "clients" && <ManagerClients clients={clients} orders={orders} products={products} setProducts={setProducts} clientLinks={clientLinks} setClientLinks={setClientLinks} dirtyClientLinkIdsRef={dirtyClientLinkIdsRef} oneCPriceTypes={oneCPriceTypes} catalogPricesVersion={catalogPricesVersion} onReload={onReload} />}
      {tab === "products" && (
        <ManagerProducts
          products={products}
          setProducts={setProducts}
          oneCPriceTypes={oneCPriceTypes}
        />
      )}
      {tab === "acts" && <ManagerReconciliation requests={reconciliationRequests} onReload={onReload} />}
      {tab === "more" && (
        <section>
          <nav className="manager-more-nav" aria-label="Дополнительно">
            {MANAGER_MORE_TABS.filter(([id]) => {
              if (id === "storefront") return authUser?.role === "admin";
              return true;
            }).map(([id, label]) => (
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
          {moreTab === "storefront" && authUser?.role === "admin" && (
            <ManagerStorefront
              settings={settings}
              setSettings={setSettings}
              oneCPriceTypes={oneCPriceTypes}
              products={products}
              setProducts={setProducts}
            />
          )}
          {moreTab === "access" && <ManagerAccessVault authUser={authUser} />}
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
