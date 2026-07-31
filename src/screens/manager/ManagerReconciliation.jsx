// Раздел менеджера: акты сверки.
import { useState } from "react";
import { api } from "../../serverApi";
import { reconciliationPeriodLabel, RECONCILIATION_STATUS_LABELS, formatDateTime } from "../../shared/appHelpers";

export function ManagerReconciliation({ requests = [], onReload }) {
  const [busyId, setBusyId] = useState("");
  const [comments, setComments] = useState({});

  const update = async (item, status) => {
    setBusyId(item.id);
    try {
      await api.updateReconciliation(item.id, { status, managerComment: comments[item.id] ?? item.managerComment ?? "" });
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusyId("");
    }
  };

  const upload = async (item, file) => {
    if (!file) return;
    setBusyId(item.id);
    try {
      await api.uploadReconciliationFile(item.id, file, comments[item.id] ?? item.managerComment ?? "");
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading"><div><p className="eyebrow">Документы</p><h2>Запросы актов сверки</h2><p>Подготовьте акт в 1С, прикрепите PDF и клиент получит уведомление.</p></div></div>
      <div className="reconciliation-list">
        {requests.length ? requests.map((item) => (
          <article className="manager-reconciliation-row" key={item.id}>
            <div><span className={`badge ${item.status === "ready" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>{RECONCILIATION_STATUS_LABELS[item.status] || item.status}</span><h3>{item.client?.companyName || item.client?.email || "Клиент"}</h3><p>{reconciliationPeriodLabel(item)} · {formatDateTime(item.createdAt)}</p>{item.clientComment && <p>Комментарий клиента: {item.clientComment}</p>}</div>
            <label className="field">Комментарий менеджера<input value={comments[item.id] ?? item.managerComment ?? ""} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
            <div className="inline-actions">
              <button className="secondary-button" type="button" disabled={busyId === item.id} onClick={() => update(item, "processing")}>В работу</button>
              <label className="import-label">Прикрепить PDF<input type="file" accept="application/pdf" disabled={busyId === item.id} onChange={(event) => upload(item, event.target.files?.[0])} /></label>
              <button className="danger-button" type="button" disabled={busyId === item.id} onClick={() => update(item, "rejected")}>Отклонить</button>
            </div>
          </article>
        )) : <div className="empty-box">Новых запросов актов сверки нет.</div>}
      </div>
    </section>
  );
}
