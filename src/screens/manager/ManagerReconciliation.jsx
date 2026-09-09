import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел менеджера: акты сверки.
import { useState } from "react";
import { api } from "../../serverApi";
import { formatDateTime } from "../../shared/appHelpers";
import {
  reconciliationPeriodDisplayLabel,
  reconciliationStatusLabel,
} from "../../shared/i18n/displayLabels";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { OrderThankYouOverlay } from "../../shared/SharedPanels";

export function ManagerReconciliation({
  requests = [],
  onReload,
  staffRole = "manager",
  onApplyReconciliationRequests,
}) {
  const { t } = useLocalization();
  const [busyId, setBusyId] = useState("");
  const [pendingFiles, setPendingFiles] = useState({});
  const [successOpen, setSuccessOpen] = useState(false);
  const isAdmin = staffRole === "admin";

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
        title: t("manager.noFile"),
        message: t("manager.attachTheStatementPdfFirst"),
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
        title: t("shared.error.sendFailed"),
        message: errorDisplayMessage(error, t, "manager.failedToSendTheStatement"),
        tone: "danger",
      });
    } finally {
      setBusyId("");
    }
  };

  const remove = async (item) => {
    if (!isAdmin) return;
    const clientLabel = item.client?.companyName || item.client?.email || t("manager.client2");
    const ok = await appConfirm({
      title: t("manager.deleteTheStatement"),
      message: item.fileName
        ? t("manager.acts.deleteConfirmWithPdf", {
            period: reconciliationPeriodDisplayLabel(item, t),
            client: clientLabel,
          })
        : t("manager.acts.deleteConfirm", {
            period: reconciliationPeriodDisplayLabel(item, t),
            client: clientLabel,
          }),
      confirmLabel: t("shared.action.delete"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(item.id);
    try {
      const result = await api.deleteReconciliation(item.id);
      clearPending(item.id);
      if (Array.isArray(result?.reconciliationRequests)) {
        onApplyReconciliationRequests?.(result.reconciliationRequests);
      } else {
        await onReload();
      }
    } catch (error) {
      await appAlert({
        title: t("shared.error.deleteFailed"),
        message: errorDisplayMessage(error, t, "manager.failedToDeleteTheStatement"),
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
          <p className="eyebrow">{t("shared.section.documents")}</p>
          <h2>{t("manager.nav.acts")}</h2>
          <p>
            {t("manager.acts.attachPdfAndSend")}
            {isAdmin ? t("manager.anAdminCanDeleteTheStatement") : ""}
          </p>
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
                  {reconciliationStatusLabel(item.status, t)}
                </span>
                <h3>{item.client?.companyName || item.client?.email || t("shared.role.client")}</h3>
                <p>{reconciliationPeriodDisplayLabel(item, t)} · {formatDateTime(item.createdAt)}</p>
                {item.clientComment && <p>{t("manager.clientComment")} {item.clientComment}</p>}
                {alreadySent && (
                  <p className="muted small">{t("manager.acts.sentFile", { fileName: item.fileName })}</p>
                )}
              </div>

              <div className="manager-reconciliation-actions">
                {!alreadySent ? (
                  <>
                    {!pending ? (
                      <label className="import-label manager-reconciliation-attach">{
                        t("manager.attachAFile")
                        }<input
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
                          aria-label={t("manager.removeFile")}
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
                      {busy ? t("shared.status.sending") : t("shared.action.send")}
                    </button>
                  </>
                ) : null}

                {isAdmin ? (
                  <button
                    className="danger-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(item)}
                  >
                    {busy ? t("manager.deleting") : t("shared.action.delete")}
                  </button>
                ) : null}
              </div>
            </article>
          );
        }) : (
          <div className="empty-box">{t("manager.noNewReconciliationRequests")}</div>
        )}
      </div>
    </section>
    <OrderThankYouOverlay
      open={successOpen}
      onDone={() => setSuccessOpen(false)}
      title={t("manager.reconciliationStatementSent")}
      message={t("manager.theFileWasSentToThe")}
      confirmLabel={t("manager.great")}
    />
    </>
  );
}
