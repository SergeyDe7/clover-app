// Панель запроса и списка актов сверки клиента.
import { useState } from "react";
import { api } from "../../serverApi";
import {
  downloadBlobFile,
  formatDateTime,
  reconciliationPeriodLabel,
  RECONCILIATION_STATUS_LABELS,
} from "../../shared/appHelpers";
import { appAlert } from "../../shared/AppModal";
import { OrderThankYouOverlay } from "../../shared/SharedPanels";

export function ReconciliationPanel({ requests = [], onReload }) {
  const nowDate = new Date();
  const [periodType, setPeriodType] = useState(`q${Math.floor(nowDate.getMonth() / 3) + 1}`);
  const [year, setYear] = useState(nowDate.getFullYear());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.createReconciliation({ periodType, year: Number(year), dateFrom, dateTo, comment });
      setComment("");
      await onReload();
      setSuccessOpen(true);
    } catch (error) {
      await appAlert({
        title: "Не удалось отправить",
        message: error.message || "Ошибка запроса акта сверки.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const download = async (item) => {
    try {
      const blob = await api.downloadReconciliationFile(item.id);
      downloadBlobFile(blob, item.fileName || `Акт-сверки-${item.id}.pdf`);
    } catch (error) {
      await appAlert({
        title: "Не удалось скачать",
        message: error.message || "Ошибка скачивания файла.",
        tone: "danger",
      });
    }
  };

  const showYear = periodType !== "all" && periodType !== "custom";
  const showDates = periodType === "custom";

  return (
    <>
      <section className="panel client-reconciliation" id="reconciliation">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Документы</p>
            <h2>Запросить акт сверки</h2>
            <p>Выберите период и отправьте запрос менеджеру.</p>
          </div>
        </div>

        <div className="period-buttons client-reconciliation-periods">
          {[
            ["q1", "1 кв."],
            ["q2", "2 кв."],
            ["q3", "3 кв."],
            ["q4", "4 кв."],
            ["all", "Весь период"],
            ["custom", "Свои даты"],
          ].map(([value, label]) => (
            <button
              className={periodType === value ? "category-button active" : "category-button"}
              type="button"
              key={value}
              onClick={() => setPeriodType(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="client-reconciliation-form">
          {showYear && (
            <label className="field client-reconciliation-year">
              Год
              <input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </label>
          )}
          {showDates && (
            <>
              <label className="field client-reconciliation-date">
                Дата с
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label className="field client-reconciliation-date">
                Дата по
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
            </>
          )}
          <label className="field client-reconciliation-comment">
            Комментарий
            <input
              type="text"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Если необходимо, продублируем на электронную почту. Напишите Ваш email"
            />
          </label>
          <div className="client-reconciliation-submit">
            <button
              className="client-request-act-button"
              type="button"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Отправляем…" : "Запросить акт сверки"}
            </button>
          </div>
        </div>

        <div className="reconciliation-list">
          {requests.length ? requests.map((item) => (
            <article className="reconciliation-row" key={item.id}>
              <div>
                <span className={`badge ${item.status === "ready" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>
                  {RECONCILIATION_STATUS_LABELS[item.status] || item.status}
                </span>
                <h3>{reconciliationPeriodLabel(item)}</h3>
                <p>
                  {formatDateTime(item.createdAt)}
                  {item.managerComment ? ` · ${item.managerComment}` : ""}
                </p>
              </div>
              {item.hasFile && (
                <button className="primary-button" type="button" onClick={() => void download(item)}>
                  Скачать PDF
                </button>
              )}
            </article>
          )) : (
            <div className="empty-box">Запросов актов сверки пока нет.</div>
          )}
        </div>
      </section>

      <OrderThankYouOverlay
        open={successOpen}
        onDone={() => setSuccessOpen(false)}
        title="Запрос отправлен"
        message="Менеджер подготовит акт сверки и пришлёт PDF в этот раздел."
        confirmLabel="Понятно"
      />
    </>
  );
}
