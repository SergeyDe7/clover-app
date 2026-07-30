import { useEffect, useState } from "react";
import { api } from "../serverApi";

/**
 * UI назначения ролей manager/admin.
 * Работает после миграции CHECK users.role (+ 'admin').
 */
export function AdminRolePanel({ currentUser }) {
  const [staff, setStaff] = useState([]);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [adminCount, setAdminCount] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setError("");
    try {
      const result = await api.getStaffUsers();
      setStaff(Array.isArray(result.staff) ? result.staff : []);
      setCanManageRoles(Boolean(result.canManageRoles));
      setAdminCount(Number(result.adminCount) || 0);
    } catch (err) {
      setStaff([]);
      setCanManageRoles(false);
      setAdminCount(0);
      if (err.status === 401) {
        setError("Сессия устарела. Выйдите и войдите снова, затем нажмите «Обновить список».");
      } else {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const changeRole = async (userId, role) => {
    setBusyId(userId);
    setError("");
    setNotice("");
    try {
      await api.setUserRole(userId, role);
      setNotice(`Роль обновлена: ${role}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Администрирование</p>
          <h3>Роли менеджеров</h3>
          <p>
            Администратор = права менеджера + управление ролями. Пока в базе нет
            admin, первый менеджер может назначить себя. После появления admin —
            только он.
          </p>
        </div>
      </div>

      {error && <div className="sync-error" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <p className="muted" style={{ marginTop: 12 }}>{notice}</p>}
      <p className="muted small">Администраторов сейчас: {adminCount}</p>

      {!canManageRoles && !error && (
        <p className="muted">Недостаточно прав для смены ролей.</p>
      )}

      {!staff.length && !error && (
        <p className="muted" style={{ marginTop: 12 }}>
          Список менеджеров пуст или сервер ещё не обновился. Нажмите «Обновить список».
        </p>
      )}

      <div className="exchange-actions" style={{ marginTop: 10 }}>
        <button className="secondary-button" type="button" onClick={() => void load()}>
          Обновить список
        </button>
      </div>

      <div className="stack" style={{ marginTop: 12, gap: 10 }}>
        {staff.map((user) => (
          <div
            key={user.id}
            className="toolbar"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <strong>{user.email}</strong>
              <div className="muted small">
                роль: {user.role}
                {String(user.id) === String(currentUser?.id) ? " · вы" : ""}
              </div>
            </div>
            {canManageRoles && (
              <div className="exchange-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busyId === user.id || user.role === "manager"}
                  onClick={() => changeRole(user.id, "manager")}
                >
                  Менеджер
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={busyId === user.id || user.role === "admin"}
                  onClick={() => changeRole(user.id, "admin")}
                >
                  Админ
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
