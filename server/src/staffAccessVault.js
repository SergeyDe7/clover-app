/** Оперативное хранилище метаданных доступов staff. Без plaintext в новых записях. */

import { getGlobalState, setGlobalState, getPasswordAuthMetaByIds } from "./db.js";

const VAULT_KEY = "staffAccessVault";

function cleanText(value) {
  return String(value ?? "").trim();
}

function stripSecretFields(entry) {
  if (!entry || typeof entry !== "object") return {};
  const next = { ...entry };
  delete next.password;
  delete next.passwordHash;
  delete next.password_hash;
  delete next.plainPassword;
  delete next.temporaryPassword;
  return next;
}

/** Exact vault from DB (may still contain legacy plaintext until opt-in migration). */
export function readStaffAccessVaultRaw() {
  const raw = getGlobalState(VAULT_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const copy = {};
  for (const [id, entry] of Object.entries(raw)) {
    copy[id] =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? { ...entry }
        : entry;
  }
  return copy;
}

/**
 * Public/safe in-memory view: secrets stripped.
 * Does NOT write back — legacy plaintext remains until opt-in migration.
 */
export function readStaffAccessVault() {
  const vault = readStaffAccessVaultRaw();
  const safe = {};
  for (const [id, entry] of Object.entries(vault)) {
    safe[id] = stripSecretFields(entry);
  }
  return safe;
}

export function writeStaffAccessVault(vault) {
  setGlobalState(VAULT_KEY, vault && typeof vault === "object" ? vault : {});
}

export function upsertStaffAccessEntry(userId, patch = {}, actor = {}) {
  const id = cleanText(userId);
  if (!id) return null;
  const vault = readStaffAccessVaultRaw();
  const previousRaw =
    vault[id] && typeof vault[id] === "object" ? vault[id] : {};
  const previous = stripSecretFields(previousRaw);
  const next = stripSecretFields({
    userId: id,
    login: cleanText(patch.login ?? previous.login),
    role: cleanText(patch.role ?? previous.role),
    resetRequired:
      typeof patch.resetRequired === "boolean"
        ? patch.resetRequired
        : Boolean(previous.resetRequired),
    updatedAt: new Date().toISOString(),
    updatedBy: cleanText(actor.email || actor.id || previous.updatedBy),
  });
  if (!next.login && !next.role) {
    return previous.login || previous.role ? previous : null;
  }
  vault[id] = next;
  writeStaffAccessVault(vault);
  return next;
}

/**
 * Сохраняет только безопасную metadata журнала staff.
 * Пароль в vault не пишется.
 */
export function saveStaffAccessCredentials(userId, credentials = {}, actor = {}) {
  const id = cleanText(userId);
  const login = cleanText(credentials.login);
  if (!id) {
    throw new Error("Не удалось сохранить доступ: пустой id сотрудника.");
  }
  if (!login) {
    throw new Error("Не удалось сохранить доступ: нужен логин.");
  }
  const saved = upsertStaffAccessEntry(
    id,
    {
      login,
      role: credentials.role,
      resetRequired: Boolean(credentials.resetRequired),
    },
    actor
  );
  const verified = readStaffAccessVaultRaw()[id];
  if (!saved || !verified || cleanText(verified.login) !== login) {
    throw new Error("Не удалось сохранить логин менеджера в журнал доступов.");
  }
  if (cleanText(verified.password)) {
    throw new Error("Отказ: попытка сохранить пароль менеджера в журнал доступов.");
  }
  const authMeta = getPasswordAuthMetaByIds([id]).get(id) || {
    hasPassword: false,
  };
  return {
    userId: id,
    login: cleanText(verified.login),
    hasPassword: Boolean(authMeta.hasPassword),
    resetRequired: Boolean(verified.resetRequired),
    role: cleanText(verified.role),
    updatedAt: verified.updatedAt || "",
    updatedBy: verified.updatedBy || "",
  };
}

export function removeStaffAccessEntry(userId) {
  const id = cleanText(userId);
  if (!id) return false;
  const vault = readStaffAccessVaultRaw();
  if (!Object.prototype.hasOwnProperty.call(vault, id)) return false;
  delete vault[id];
  writeStaffAccessVault(vault);
  return true;
}

/** Дополняет список staff metadata пароля. Никогда не добавляет plaintext/hash. */
export function attachStaffAccess(staff = []) {
  const vault = readStaffAccessVaultRaw();
  const list = Array.isArray(staff) ? staff : [];
  const ids = list.map((user) => cleanText(user?.id)).filter(Boolean);
  const authMeta = getPasswordAuthMetaByIds(ids);
  return list.map((user) => {
    const id = cleanText(user?.id);
    const saved = stripSecretFields(
      id && vault[id] && typeof vault[id] === "object" ? vault[id] : {}
    );
    const meta = authMeta.get(id) || { hasPassword: false };
    return {
      ...user,
      login: cleanText(saved.login) || cleanText(user?.email),
      hasPassword: Boolean(meta.hasPassword),
      resetRequired: Boolean(saved.resetRequired),
      passwordUpdatedAt: saved.updatedAt || "",
      passwordUpdatedBy: saved.updatedBy || "",
    };
  });
}
