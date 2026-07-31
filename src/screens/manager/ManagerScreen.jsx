// Экран менеджера/администратора: заказы, клиенты, товары, обмен с 1С, настройки.
import { useMemo, useState } from "react";
import { Header } from "../../shared/SharedPanels";
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
import { ManagerBackup } from "./ManagerBackup";
import { ManagerAudit } from "./ManagerAudit";
import { managerNotificationTab, ManagerNotificationBell } from "./ManagerNotifications";

function ManagerDashboard({ authUser, orders, products, setProducts, profile, addresses, serverClients, reconciliationRequests, managerNotifications, settings, setSettings, clientLinks, setClientLinks, managerNotice, onDismissNotice, onReadNotification, onReadAllNotifications, onUpdateOrder, onBulkUpdateOrders, onDeleteOrder, onCreateProductFromCustom, onImport, onClearOrders, onResetAll, onReload, onLogout }) {
  const [tab, setTab] = useState(readManagerActiveTab);
  const [moreTab, setMoreTab] = useState(readManagerMoreTab);
  const [headerSearch, setHeaderSearch] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("Все");
  const [ordersExchangeFilter, setOrdersExchangeFilter] = useState("all");

  const selectTab = (nextTab) => {
    setTab(nextTab);
    writeManagerActiveTab(nextTab);
    if (nextTab !== "orders") setHeaderSearch("");
  };

  const openNewOrders = () => {
    setOrdersStatusFilter("Новый");
    setOrdersExchangeFilter("all");
    selectTab("orders");
  };

  const openExchangeErrors = () => {
    setOrdersStatusFilter("Все");
    setOrdersExchangeFilter("error");
    selectTab("orders");
  };

  const openUnread = () => {
    setBellOpen(true);
  };

  const renderStatCard = ({ label, value, hint, onActivate, title }) => (
    <article
      className="stat-card stat-card-action"
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      title={title}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small className="stat-card-hint">{hint}</small> : null}
      <small className="stat-card-open">Открыть →</small>
    </article>
  );

  const selectMoreTab = (nextTab) => {
    setMoreTab(nextTab);
    writeManagerMoreTab(nextTab);
  };

  const openFromNotification = (item) => {
    selectTab(managerNotificationTab(item));
    // managerNotificationTab уже пишет moreTab в localStorage при acts/settings
    setMoreTab(readManagerMoreTab());
    setBellOpen(false);
    onReadNotification(item);
  };
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
  const newAlreadyInOneC = orders.filter((order) => {
    if (order.status !== "Новый") return false;
    const exchangeStatus = normalizeOrderExchange(order.exchange).status;
    return exchangeStatus === "sent" || exchangeStatus === "sending" || exchangeStatus === "draft";
  }).length;
  const exchangeErrors = orders.filter((order) => normalizeOrderExchange(order.exchange).status === "error").length;
  const unreadCount = (managerNotifications || []).filter((item) => !item.readAt).length;

  return <main className="clover-app">
    <Header title="Кабинет менеджера" subtitle="Заказы · клиенты · товары · 1С" onLogout={onLogout}>
      <div className="manager-header-tools">
        <input
          className="manager-search-input"
          type="search"
          placeholder="№ Clover / № 1С / клиент…"
          value={headerSearch}
          onChange={(e) => {
            setHeaderSearch(e.target.value);
            if (tab !== "orders") selectTab("orders");
          }}
          aria-label="Поиск заказов по номеру Clover или 1С"
        />
        <ManagerNotificationBell
          notifications={managerNotifications}
          open={bellOpen}
          onToggle={() => setBellOpen((current) => !current)}
          onOpen={openFromNotification}
          onRead={(item) => { onReadNotification(item); }}
          onReadAll={() => { onReadAllNotifications(); setBellOpen(false); }}
        />
      </div>
    </Header>
    <section className="page-content">
      {managerNotice && (
        <div className="exchange-notice" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong>{managerNotice.title}</strong>
              {managerNotice.body && <div>{managerNotice.body}</div>}
              <div>{formatDateTime(managerNotice.createdAt)}</div>
              {managerNotice.pendingCount > 1 && (
                <div>Непросмотренных событий: {managerNotice.pendingCount}</div>
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
      )}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {renderStatCard({
          label: "Новые заказы",
          value: newCount,
          hint: newAlreadyInOneC > 0 ? `уже в 1С без «Принят»: ${newAlreadyInOneC}` : "",
          onActivate: openNewOrders,
          title: "Открыть заказы со статусом «Новый»",
        })}
        {renderStatCard({
          label: "Ошибки 1С",
          value: exchangeErrors,
          onActivate: openExchangeErrors,
          title: "Открыть заказы с ошибкой обмена 1С",
        })}
        {renderStatCard({
          label: "Непрочитано",
          value: unreadCount,
          onActivate: openUnread,
          title: "Открыть уведомления",
        })}
      </div>
      <nav className="manager-nav">{MANAGER_TABS.map(([id,label]) => <button className={[tab === id ? "active" : "", id === "more" ? "nav-service" : ""].filter(Boolean).join(" ")} type="button" key={id} onClick={() => selectTab(id)}>{label}</button>)}</nav>
      {tab === "orders" && (
        <ManagerOrders
          orders={orders}
          settings={settings}
          onUpdateOrder={onUpdateOrder}
          onBulkUpdateOrders={onBulkUpdateOrders}
          onDeleteOrder={onDeleteOrder}
          onCreateProductFromCustom={onCreateProductFromCustom}
          onReload={onReload}
          onNavigate={selectTab}
          headerSearch={headerSearch}
          statusFilter={ordersStatusFilter}
          onStatusFilterChange={setOrdersStatusFilter}
          exchangeFilter={ordersExchangeFilter}
          onExchangeFilterChange={setOrdersExchangeFilter}
        />
      )}
      {tab === "exchange" && <ManagerExchange onReload={onReload} onNavigate={selectTab} />}
      {tab === "clients" && <ManagerClients clients={clients} products={products} setProducts={setProducts} clientLinks={clientLinks} setClientLinks={setClientLinks} onReload={onReload} />}
      {tab === "products" && <ManagerProducts products={products} setProducts={setProducts} />}
      {tab === "more" && (
        <section>
          <nav className="manager-more-nav" aria-label="Дополнительно">
            {MANAGER_MORE_TABS.map(([id, label]) => (
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
          {moreTab === "acts" && <ManagerReconciliation requests={reconciliationRequests} onReload={onReload} />}
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
