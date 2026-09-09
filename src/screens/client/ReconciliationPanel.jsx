import { useLocalization } from "../../shared/i18n/LocalizationProvider";
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
  const { t } = useLocalization();
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
        message: error.message || t("client.statementRequestError"),
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
        message: error.message || t("client.fileDownloadError"),
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
            <p className="eyebrow">{t("shared.section.documents")}</p>
            <h2>{t("client.requestAStatement")}</h2>
            <p>{t("client.chooseAPeriodAndSendA")}</p>
          </div>
        </div>

        <div className="period-buttons client-reconciliation-periods">
          {[
            ["q1", t("client.q1")],
            ["q2", t("client.q2")],
            ["q3", t("client.q3")],
            ["q4", t("client.q4")],
            ["all", t("client.allTime")],
            ["custom", t("client.customDates")],
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
            <label className="field client-reconciliation-year">{
              t("client.year")
              }<input
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
              <label className="field client-reconciliation-date">{
                t("client.dateFrom")
                }<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label className="field client-reconciliation-date">{
                t("client.dateTo")
                }<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
            </>
          )}
          <label className="field client-reconciliation-comment">{
            t("checkout.comment")
            }<input
              type="text"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t("client.optional")}
            />
          </label>
          <div className="client-reconciliation-submit">
            <button
              className="client-request-act-button"
              type="button"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? t("client.sending") : t("client.requestAStatement")}
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
                <button className="primary-button" type="button" onClick={() => void download(item)}>{
                  t("manager.downloadPdf")
                }</button>
              )}
            </article>
          )) : (
            <div className="empty-box">{t("client.noReconciliationRequestsYet")}</div>
          )}
        </div>
      </section>

      <OrderThankYouOverlay
        open={successOpen}
        onDone={() => setSuccessOpen(false)}
        title={t("client.requestSent")}
        message={t("client.aManagerWillPrepareTheStatement")}
        confirmLabel={t("shared.modal.ok")}
      />
    </>
  );
}
