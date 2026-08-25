/** Оперативное хранилище логинов/паролей менеджеров и админов. Только для администратора. */

import { getGlobalState, setGlobalState } from "./db.js";

const VAULT_KEY = "staffAccessVault";

function cleanText(value) {
  return String(value ?? "").trim();
}

export function readStaffAccessVault() {
  const raw = getGlobalState(VAULT_KEY, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
}

export function writeStaffAccessVault(vault) {
  setGlobalState(VAULT_KEY, vault && typeof vault === "object" ? vault : {});
}

export function upsertStaffAccessEntry(userId, patch = {}, actor = {}) {
  const id = cleanText(userId);
  if (!id) return null;
  const vault = readStaffAccessVault();
  const previous = vault[id] && typeof vault[id] === "object" ? vault[id] : {};
  const next = {
    userId: id,
    login: cleanText(patch.login ?? previous.login),
    password: cleanText(patch.password ?? previous.password),
    role: cleanText(patch.role ?? previous.role),
    updatedAt: new Date().toISOString(),
    updatedBy: cleanText(actor.email || actor.id || previous.updatedBy),
  };
  if (!next.login && !next.password) {
    return previous.login || previous.password ? previous : null;
  }
  vault[id] = next;
  writeStaffAccessVault(vault);
  return next;
}

/**
 * Обязательное сохранение логина и пароля staff в журнал доступов админа.
 * Падает с ошибкой, если запись не подтвердилась чтением из БД.
 */
export function saveStaffAccessCredentials(userId, credentials = {}, actor = {}) {
  const id = cleanText(userId);
  const login = cleanText(credentials.login);
  const password = cleanText(credentials.password);
  if (!id) {
    throw new Error("Не удалось сохранить доступ: пустой id сотрудника.");
  }
  if (!login || !password) {
    throw new Error("Не удалось сохранить доступ: нужны логин и пароль.");
  }
  const saved = upsertStaffAccessEntry(
    id,
    {
      login,
      password,
      role: credentials.role,
    },
    actor
  );
  const verified = readStaffAccessVault()[id];
  if (
    !saved ||
    !verified ||
    cleanText(verified.login) !== login ||
    cleanText(verified.password) !== password
  ) {
    throw new Error("Не удалось сохранить логин и пароль менеджера в журнал доступов.");
  }
  return {
    userId: id,
    login: verified.login,
    hasPassword: true,
    role: verified.role || "",
    updatedAt: verified.updatedAt || "",
    updatedBy: verified.updatedBy || "",
  };
}

export function removeStaffAccessEntry(userId) {
  const id = cleanText(userId);
  if (!id) return false;
  const vault = readStaffAccessVault();
  if (!Object.prototype.hasOwnProperty.call(vault, id)) return false;
  delete vault[id];
  writeStaffAccessVault(vault);
  return true;
}

/** Дополняет список staff сохранённым паролем. Не вызывать для не-админов. */
export function attachStaffAccess(staff = []) {
  const vault = readStaffAccessVault();
  return (Array.isArray(staff) ? staff : []).map((user) => {
    const id = cleanText(user?.id);
    const saved = id && vault[id] && typeof vault[id] === "object" ? vault[id] : {};
    const password = cleanText(saved.password);
    return {
      ...user,
      login: cleanText(saved.login) || cleanText(user?.email),
      password,
      hasPassword: Boolean(password),
      passwordUpdatedAt: saved.updatedAt || "",
      passwordUpdatedBy: saved.updatedBy || "",
    };
  });
}
