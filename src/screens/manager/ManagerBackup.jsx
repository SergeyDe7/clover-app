// Раздел менеджера: резервные копии.
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { formatDateTime } from "../../shared/appHelpers";

function formatFileSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function ManagerBackup({ data, onImport, onClearOrders, onResetAll, onReload }) {
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
      alert("Резервная копия создана на сервере.");
    } catch (createError) {
      alert(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const cleanupBackups = async () => {
    if (!window.confirm(
      "Удалить автоматические копии старше 30 дней и оставить не больше 50 копий? Ручные свежие копии сохранятся."
    )) {
      return;
    }

    setBusy(true);
    try {
      const result = await api.cleanupBackups({
        maxFiles: 50,
        automaticMaxAgeDays: 30,
      });
      await loadBackups();
      alert(
        result.removed?.length
          ? `Удалено старых копий: ${result.removed.length}.`
          : "Старых копий для удаления нет."
      );
    } catch (cleanupError) {
      alert(cleanupError.message);
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
      alert(downloadError.message);
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (item) => {
    if (!window.confirm(
      `Восстановить данные из копии «${item.fileName}»? Перед восстановлением сервер автоматически создаст страховочную копию.`
    )) {
      return;
    }

    setBusy(true);
    try {
      await api.restoreBackup(item.fileName);
      await onReload();
      await loadBackups();
      alert("Данные восстановлены. Кабинет обновлён.");
    } catch (restoreError) {
      alert(restoreError.message);
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
    reader.onload = () => {
      try { onImport(JSON.parse(String(reader.result))); alert("JSON-копия загружена."); }
      catch { alert("Не удалось прочитать файл резервной копии."); }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  return <section className="panel" style={{ marginTop: 0 }}>
    <div className="panel-heading"><div><p className="eyebrow">Защита данных</p><h2>Полные резервные копии</h2><p>Копии включают клиентов, заказы, матрицы, настройки, пароли и фотографии товаров. Они хранятся только на вашем компьютере.</p></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={cleanupBackups}>Очистить старые</button><button className="primary-button" type="button" disabled={busy} onClick={createBackup}>{busy ? "Подождите..." : "Создать полную копию"}</button></div></div>
    <div className="profile-summary">
      <article><span>Серверных копий</span><strong>{backups.length}</strong></article><article><span>Товаров</span><strong>{data.products.length}</strong></article><article><span>Заказов</span><strong>{data.orders.length}</strong></article><article><span>Связей с клиентами</span><strong>{Object.keys(data.clientLinks).length}</strong></article>
    </div>
    <div className="server-safe-note">Clover автоматически создаёт полную копию при первом запуске каждого дня, перед полным сбросом и перед восстановлением. Перед восстановлением всегда создаётся страховочная копия.</div>
    {error && <div className="auth-error" style={{ marginTop: 14 }}>{error}</div>}
    <div className="backup-list">
      {backups.map((item) => <article className="backup-row" key={item.fileName}>
        <div><h3>{item.reason}</h3><p>{formatDateTime(item.createdAt)} · {formatFileSize(item.size)} · {item.includesPhotos ? `полная копия, фото: ${item.photoCount || 0}` : "старая JSON-копия без фото"}<br />{item.fileName}</p></div>
        <div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => downloadBackup(item)}>Скачать</button><button className="secondary-button" type="button" disabled={busy} onClick={() => restoreBackup(item)}>Восстановить</button></div>
      </article>)}
      {!backups.length && !error && <div className="empty-box">Копии пока не созданы.</div>}
    </div>
    <details style={{ marginTop: 22 }}>
      <summary style={{ cursor: "pointer", color: "#4f8d4b", fontWeight: 800 }}>Дополнительная переносимая JSON-копия</summary>
      <p className="muted small">Эта копия не содержит аккаунты и пароли. Она нужна только для переноса каталога, заказов и настроек.</p>
      <div className="backup-actions"><button className="secondary-button" type="button" onClick={exportData}>Скачать JSON-копию</button><label className="import-label">Загрузить JSON-копию<input type="file" accept="application/json" onChange={importFile} /></label><button className="danger-button" type="button" onClick={onClearOrders}>Удалить все заказы</button><button className="danger-button" type="button" onClick={onResetAll}>Полный сброс</button></div>
    </details>
  </section>;
}
