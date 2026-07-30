// Панель запроса и списка актов сверки клиента.
import { useState } from "react";
import { api } from "../../serverApi";
import {
  downloadBlobFile,
  formatDateTime,
  reconciliationPeriodLabel,
  RECONCILIATION_STATUS_LABELS,
} from "../../shared/appHelpers";

export function ReconciliationPanel({ requests = [], onReload }) {
  const nowDate = new Date();
  const [periodType, setPeriodType] = useState(`q${Math.floor(nowDate.getMonth() / 3) + 1}`);
  const [year, setYear] = useState(nowDate.getFullYear());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.createReconciliation({ periodType, year: Number(year), dateFrom, dateTo, comment });
      setComment("");
      setMessage("Запрос отправлен менеджеру.");
      await onReload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (item) => {
    try {
      const blob = await api.downloadReconciliationFile(item.id);
      downloadBlobFile(blob, item.fileName || `Акт-сверки-${item.id}.pdf`);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <section className="panel" id="reconciliation">
      <div className="panel-heading"><div><p className="eyebrow">Документы</p><h2>Запросить акт сверки</h2><p>Выберите готовый период или укажите собственный диапазон дат.</p></div></div>
      <div className="period-buttons">
        {[['q1','1 квартал'],['q2','2 квартал'],['q3','3 квартал'],['q4','4 квартал'],['all','За весь период'],['custom','Определённый период']].map(([value,label]) => (
          <button className={periodType === value ? "category-button active" : "category-button"} type="button" key={value} onClick={() => setPeriodType(value)}>{label}</button>
        ))}
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        {periodType !== "all" && periodType !== "custom" && <label className="field">Год<input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} /></label>}
        {periodType === "custom" && <><label className="field">Дата с<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="field">Дата по<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></>}
        <label className="field field-wide">Комментарий — необязательно<textarea rows="2" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: прошу отдельно проверить возвраты" /></label>
      </div>
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy} onClick={submit}>{busy ? "Отправляем…" : "Отправить запрос"}</button></div>
      {message && <div className="request-photo-status">{message}</div>}
      <div className="reconciliation-list">
        {requests.length ? requests.map((item) => (
          <article className="reconciliation-row" key={item.id}>
            <div><span className={`badge ${item.status === "ready" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>{RECONCILIATION_STATUS_LABELS[item.status] || item.status}</span><h3>{reconciliationPeriodLabel(item)}</h3><p>{formatDateTime(item.createdAt)}{item.managerComment ? ` · ${item.managerComment}` : ""}</p></div>
            {item.hasFile && <button className="primary-button" type="button" onClick={() => download(item)}>Скачать PDF</button>}
          </article>
        )) : <div className="empty-box">Запросов актов сверки пока нет.</div>}
      </div>
    </section>
  );
}
