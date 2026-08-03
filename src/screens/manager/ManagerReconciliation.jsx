// Раздел менеджера: акты сверки.
import { useState } from "react";
import { api } from "../../serverApi";
import { reconciliationPeriodLabel, RECONCILIATION_STATUS_LABELS, formatDateTime } from "../../shared/appHelpers";
import { appAlert } from "../../shared/AppModal";
import { OrderThankYouOverlay } from "../../shared/SharedPanels";

export function ManagerReconciliation({ requests = [], onReload }) {
  const [busyId, setBusyId] = useState("");
  const [pendingFiles, setPendingFiles] = useState({});
  const [successOpen, setSuccessOpen] = useState(false);

  const attachFile = (itemId, file) => {
    if (!file) return;
    setPendingFiles((current) => ({ ...current, [itemId]: file }));
  };

  const clearPending = (itemId) => {
    setPendingFiles((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  };

  const send = async (item) => {
    const file = pendingFiles[item.id];
    if (!file) {
      await appAlert({
        title: "Нет файла",
        message: "Сначала прикрепите PDF акта сверки.",
        tone: "warn",
      });
      return;
    }

    setBusyId(item.id);
    try {
      await api.uploadReconciliationFile(item.id, file, item.managerComment || "");
      clearPending(item.id);
      await onReload();
      setSuccessOpen(true);
    } catch (error) {
      await appAlert({
        title: "Не удалось отправить",
        message: error.message || "Ошибка отправки акта сверки.",
        tone: "danger",
      });
    } finally {
      setBusyId("");
    }
  };

  return (
    <>
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Документы</p>
          <h2>Акты сверок</h2>
          <p>Прикрепите PDF акта из 1С и нажмите «Отправить».</p>
        </div>
      </div>
      <div className="reconciliation-list">
        {requests.length ? requests.map((item) => {
          const pending = pendingFiles[item.id];
          const busy = busyId === item.id;
          const canSend = Boolean(pending) && !busy;
          const alreadySent = item.status === "ready" && item.fileName;

          return (
            <article className="manager-reconciliation-row" key={item.id}>
              <div className="manager-reconciliation-info">
                <span className={`badge ${item.status === "ready" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>
                  {RECONCILIATION_STATUS_LABELS[item.status] || item.status}
                </span>
                <h3>{item.client?.companyName || item.client?.email || "Клиент"}</h3>
                <p>{reconciliationPeriodLabel(item)} · {formatDateTime(item.createdAt)}</p>
                {item.clientComment && <p>Комментарий клиента: {item.clientComment}</p>}
                {alreadySent && (
                  <p className="muted small">Отправлено: {item.fileName}</p>
                )}
              </div>

              {!alreadySent && (
                <div className="manager-reconciliation-actions">
                  {!pending ? (
                    <label className="import-label manager-reconciliation-attach">
                      Прикрепить файл
                      <input
                        type="file"
                        accept="application/pdf"
                        disabled={busy}
                        onChange={(event) => {
                          attachFile(item.id, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  ) : (
                    <div className="manager-reconciliation-filechip" title={pending.name}>
                      <span className="manager-reconciliation-filename">{pending.name}</span>
                      <button
                        className="danger-text"
                        type="button"
                        disabled={busy}
                        onClick={() => clearPending(item.id)}
                        aria-label="Убрать файл"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <button
                    className="primary-button"
                    type="button"
                    disabled={!canSend}
                    onClick={() => void send(item)}
                  >
                    {busy ? "Отправка…" : "Отправить"}
                  </button>
                </div>
              )}
            </article>
          );
        }) : (
          <div className="empty-box">Новых запросов актов сверки нет.</div>
        )}
      </div>
    </section>
    <OrderThankYouOverlay
      open={successOpen}
      onDone={() => setSuccessOpen(false)}
      title="Акт сверки отправлен"
      message="Файл доступен клиенту в разделе «Акт сверки»."
      confirmLabel="Отлично"
    />
    </>
  );
}
