import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел менеджера: резервные копии.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { formatDateTime } from "../../shared/appHelpers";
import { appAlert, appConfirm } from "../../shared/AppModal";

function formatFileSize(value, t) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return t("shared.fileSize.bytes", { bytes });
  if (bytes < 1024 * 1024) return t("shared.fileSize.kilobytes", { value: Math.round(bytes / 1024) });
  return t("shared.fileSize.megabytes", { value: (bytes / 1024 / 1024).toFixed(1) });
}

export function ManagerBackup({ data, onImport, onClearOrders, onResetAll, onReload }) {
  const { t } = useLocalization();
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadBackups = async () => {
    try {
      const result = await api.listBackups();
      setBackups(result.backups || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const createBackup = async () => {
    setBusy(true);
    try {
      await api.createBackup({
        label: "manual",
        reason: "Ручная копия из кабинета менеджера",
      });
      await loadBackups();
      await appAlert({
        title: t("manager.copyCreated"),
        message: t("manager.backupCreatedOnTheServer"),
        tone: "success",
      });
    } catch (createError) {
      await appAlert({ title: t("shared.status.error"), message: createError.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const cleanupBackups = async () => {
    const ok = await appConfirm({
      title: t("manager.clearOldCopies"),
      message:
        t("manager.deleteAutomaticCopiesOlderThan30"),
      confirmLabel: t("shared.action.clear"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "warn",
    });
    if (!ok) {
      return;
    }

    setBusy(true);
    try {
      const result = await api.cleanupBackups({
        maxFiles: 50,
        automaticMaxAgeDays: 30,
      });
      await loadBackups();
      await appAlert({
        title: t("manager.cleanupFinished"),
        message: result.removed?.length
          ? t("manager.backup.removedOld", { count: result.removed.length })
          : t("manager.thereAreNoOldCopiesTo"),
        tone: "success",
      });
    } catch (cleanupError) {
      await appAlert({ title: t("manager.cleanupError"), message: cleanupError.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async (item) => {
    setBusy(true);
    try {
      const blob = await api.downloadBackup(item.fileName);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      await appAlert({ title: t("manager.downloadError"), message: downloadError.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (item) => {
    const ok = await appConfirm({
      title: t("manager.restoreTheData"),
      message: t("manager.backup.restoreConfirmNamed", { fileName: item.fileName }),
      confirmLabel: t("shared.action.restore"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) {
      return;
    }

    setBusy(true);
    try {
      await api.restoreBackup(item.fileName);
      await onReload();
      await loadBackups();
      await appAlert({
        title: t("manager.restored"),
        message: t("manager.dataRestoredTheCabinetWasRefreshed"),
        tone: "success",
      });
    } catch (restoreError) {
      await appAlert({ title: t("manager.restoreError"), message: restoreError.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clover-public-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        onImport(JSON.parse(String(reader.result)));
        await appAlert({ title: t("manager.uploaded"), message: t("manager.jsonCopyLoaded"), tone: "success" });
      } catch {
        await appAlert({
          title: t("manager.fileError"),
          message: "Не удалось прочитать файл резервной копии.",
          tone: "danger",
        });
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  return <section className="panel" style={{ marginTop: 0 }}>
    <div className="panel-heading"><div><p className="eyebrow">{t("manager.dataProtection")}</p><h2>{t("manager.fullBackups")}</h2><p>{t("manager.copiesIncludeClientsOrdersMatricesSettings")}</p></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={cleanupBackups}>{t("manager.cleanUpOldOnes")}</button><button className="primary-button" type="button" disabled={busy} onClick={createBackup}>{busy ? t("manager.pleaseWait") : t("manager.createAFullCopy")}</button></div></div>
    <div className="profile-summary">
      <article><span>{t("manager.serverCopies")}</span><strong>{backups.length}</strong></article><article><span>{t("manager.products")}</span><strong>{data.products.length}</strong></article><article><span>{t("manager.orders")}</span><strong>{data.orders.length}</strong></article><article><span>{t("manager.clientLinks")}</span><strong>{Object.keys(data.clientLinks).length}</strong></article>
    </div>
    <div className="server-safe-note">{t("manager.cloverAutomaticallyMakesAFullCopy")}</div>
    {error && <div className="auth-error" style={{ marginTop: 14 }}>{error}</div>}
    <div className="backup-list">
      {backups.map((item) => <article className="backup-row" key={item.fileName}>
        <div><h3>{item.reason}</h3><p>{formatDateTime(item.createdAt)} · {formatFileSize(item.size, t)} · {item.includesPhotos ? t("manager.backup.fullCopyPhotos", { count: item.photoCount || 0 }) : t("manager.oldJsonCopyWithoutPhotos")}<br />{item.fileName}</p></div>
        <div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => downloadBackup(item)}>{t("manager.download")}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => restoreBackup(item)}>{t("shared.action.restore")}</button></div>
      </article>)}
      {!backups.length && !error && <div className="empty-box">{t("manager.noCopiesCreatedYet")}</div>}
    </div>
    <details style={{ marginTop: 22 }}>
      <summary style={{ cursor: "pointer", color: "#4f8d4b", fontWeight: 800 }}>{t("manager.extraPortableJsonCopy")}</summary>
      <p className="muted small">{t("manager.thisCopyDoesNotIncludeAccounts")}</p>
      <div className="backup-actions"><button className="secondary-button" type="button" onClick={exportData}>{t("manager.downloadJsonCopy")}</button><label className="import-label">{t("manager.uploadJsonCopy")}<input type="file" accept="application/json" onChange={importFile} /></label><button className="danger-button" type="button" onClick={onClearOrders}>{t("manager.deleteAllOrders")}</button><button className="danger-button" type="button" onClick={onResetAll}>{t("manager.fullReset")}</button></div>
    </details>
  </section>;
}
