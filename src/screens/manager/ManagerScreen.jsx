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
  const exchangeErrors = orders.filter((order) => normalizeOrderExchange(order.exchange).status === "error").length;
  const unreadCount = (managerNotifications || []).filter((item) => !item.readAt).length;

  return <main className="clover-app">
    <Header title="Кабинет менеджера" subtitle="Заказы · клиенты · товары · 1С" onLogout={onLogout}>
      <div className="manager-header-tools">
        <input
          className="manager-search-input"
          type="search"
          placeholder="Поиск заказов…"
          value={headerSearch}
          onChange={(e) => {
            setHeaderSearch(e.target.value);
            if (tab !== "orders") selectTab("orders");
          }}
          aria-label="Поиск заказов"
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
        <article className="stat-card"><span>Новые заказы</span><strong>{newCount}</strong></article>
        <article className="stat-card"><span>Ошибки 1С</span><strong>{exchangeErrors}</strong></article>
        <article className="stat-card"><span>Непрочитано</span><strong>{unreadCount}</strong></article>
      </div>
      <nav className="manager-nav">{MANAGER_TABS.map(([id,label]) => <button className={[tab === id ? "active" : "", id === "more" ? "nav-service" : ""].filter(Boolean).join(" ")} type="button" key={id} onClick={() => selectTab(id)}>{label}</button>)}</nav>
      {tab === "orders" && <ManagerOrders orders={orders} settings={settings} onUpdateOrder={onUpdateOrder} onBulkUpdateOrders={onBulkUpdateOrders} onDeleteOrder={onDeleteOrder} onCreateProductFromCustom={onCreateProductFromCustom} onReload={onReload} headerSearch={headerSearch} />}
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
