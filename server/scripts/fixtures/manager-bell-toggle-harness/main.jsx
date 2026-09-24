import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import "../../../../src/styles/clover-theme.css";
import { LocalizationProvider } from "../../../../src/shared/i18n/LocalizationProvider.jsx";
import { StickyCabinetChrome } from "../../../../src/shared/StickyCabinetChrome.jsx";
import { Header } from "../../../../src/shared/SharedPanels.jsx";
import { ManagerNotificationBell } from "../../../../src/screens/manager/ManagerNotifications.jsx";
import { APP_STYLES } from "../../../../src/shared/appHelpers.js";

const SAMPLE = Array.from({ length: 5 }, (_, i) => ({
  id: `n-${i + 1}`,
  type: "new_order",
  title: `Клиент ${i + 1}`,
  body: `Сумма: 1000 ₽\nКол-во позиций: 2\nДата заказа: 14.09.2026\n№ CL-${i + 1}`,
  createdAt: new Date().toISOString(),
  readAt: null,
}));

function Harness() {
  const [bellOpen, setBellOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [log, setLog] = useState([]);
  const notifications = useMemo(() => SAMPLE, []);
  const push = (msg) => setLog((rows) => [...rows.slice(-40), msg]);

  useEffect(() => {
    window.__bellOpen = () => bellOpen;
    window.__setBell = setBellOpen;
    window.__openModal = () => setModalOpen(true);
  }, [bellOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setModalOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    const onPd = (e) => {
      const t = e.target;
      push(`pd:${t?.className || t?.tagName}`);
    };
    const onClick = (e) => {
      const t = e.target;
      push(`click:${t?.className || t?.tagName}`);
    };
    document.addEventListener("pointerdown", onPd, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPd, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <LocalizationProvider>
      <style>{APP_STYLES}</style>
      <main className="clover-app">
        <StickyCabinetChrome>
          <Header title="Кабинет" onLogout={() => {}} nav={<nav className="manager-nav"><button type="button">Заказы</button></nav>}>
            <div className="manager-header-tools">
              <ManagerNotificationBell
                notifications={notifications}
                open={bellOpen}
                onToggle={() => {
                  setBellOpen((v) => {
                    push(`toggle:${v}->${!v}`);
                    return !v;
                  });
                }}
                onClose={() => {
                  push("close:explicit");
                  setBellOpen(false);
                }}
                onOpen={() => setBellOpen(false)}
                onRead={() => {}}
                onReadAll={() => setBellOpen(false)}
              />
            </div>
          </Header>
        </StickyCabinetChrome>
        <section className="page-content">
          <p data-testid="open-state">open:{String(bellOpen)}</p>
          <pre data-testid="event-log">{log.join("\n")}</pre>
          <button type="button" data-testid="open-modal" onClick={() => setModalOpen(true)}>modal</button>
          <div style={{ height: 800 }} />
        </section>
      </main>
      {modalOpen
        ? createPortal(
            <div className="app-modal-shell" role="dialog" aria-modal="true" data-testid="harness-modal"
              style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center" }}
              onClick={() => setModalOpen(false)}>
              <div style={{ background: "#fff", padding: 20 }} onClick={(e) => e.stopPropagation()}>modal</div>
            </div>,
            document.body
          )
        : null}
    </LocalizationProvider>
  );
}
createRoot(document.getElementById("root")).render(<Harness />);
