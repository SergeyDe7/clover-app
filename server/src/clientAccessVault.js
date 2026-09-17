/** Оперативное хранилище метаданных доступов клиентов (без plaintext-паролей в новых записях). */

import { getGlobalState, setGlobalState, getPasswordAuthMetaByIds } from "./db.js";

const VAULT_KEY = "clientAccessVault";

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
export function readClientAccessVaultRaw() {
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
 * Does NOT write back — legacy plaintext remains until CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS.
 */
export function readClientAccessVault() {
  const vault = readClientAccessVaultRaw();
  const safe = {};
  for (const [id, entry] of Object.entries(vault)) {
    safe[id] = stripSecretFields(entry);
  }
  return safe;
}

/**
 * Persist vault as provided. Callers must not add passwords on new/updated entries.
 * Does not globally strip other entries (migration owns full plaintext removal).
 */
export function writeClientAccessVault(vault) {
  setGlobalState(VAULT_KEY, vault && typeof vault === "object" ? vault : {});
}

export function upsertClientAccessEntry(clientId, patch = {}, actor = {}) {
  const id = cleanText(clientId);
  if (!id) return null;
  const vault = readClientAccessVaultRaw();
  const previousRaw =
    vault[id] && typeof vault[id] === "object" ? vault[id] : {};
  const previous = stripSecretFields(previousRaw);
  const next = stripSecretFields({
    clientId: id,
    login: cleanText(patch.login ?? previous.login),
    companyName: cleanText(patch.companyName ?? previous.companyName),
    contactName: cleanText(patch.contactName ?? previous.contactName),
    note: cleanText(patch.note ?? previous.note),
    resetRequired:
      typeof patch.resetRequired === "boolean"
        ? patch.resetRequired
        : Boolean(previous.resetRequired),
    updatedAt: new Date().toISOString(),
    updatedBy: cleanText(actor.email || actor.id || previous.updatedBy),
  });
  if (!next.login && !next.companyName && !next.contactName && !next.note) {
    return previous.login || previous.companyName ? previous : null;
  }
  // Replace only this entry without password; leave other entries untouched.
  vault[id] = next;
  writeClientAccessVault(vault);
  return next;
}

/**
 * Сохраняет только безопасную metadata журнала доступов.
 * Пароль в vault не пишется — авторитет users.password_hash.
 */
export function saveClientAccessCredentials(clientId, credentials = {}, actor = {}) {
  const id = cleanText(clientId);
  const login = cleanText(credentials.login);
  if (!id) {
    throw new Error("Не удалось сохранить доступ: пустой id клиента.");
  }
  if (!login) {
    throw new Error("Не удалось сохранить доступ: нужен логин.");
  }
  const saved = upsertClientAccessEntry(
    id,
    {
      login,
      companyName: credentials.companyName,
      contactName: credentials.contactName,
      note: credentials.note,
      resetRequired: Boolean(credentials.resetRequired),
    },
    actor
  );
  const verified = readClientAccessVaultRaw()[id];
  if (!saved || !verified || cleanText(verified.login) !== login) {
    throw new Error("Не удалось сохранить логин в журнал доступов.");
  }
  if (cleanText(verified.password)) {
    // Should never happen: upsert strips this entry's password.
    throw new Error("Отказ: попытка сохранить пароль в журнал доступов.");
  }
  const authMeta = getPasswordAuthMetaByIds([id]).get(id) || {
    hasPassword: false,
    updatedAt: "",
    resetRequired: false,
  };
  return {
    clientId: id,
    login: cleanText(verified.login),
    hasPassword: Boolean(authMeta.hasPassword),
    resetRequired: Boolean(verified.resetRequired || authMeta.resetRequired),
    companyName: cleanText(verified.companyName),
    contactName: cleanText(verified.contactName),
    updatedAt: verified.updatedAt || "",
    updatedBy: verified.updatedBy || "",
  };
}

export function removeClientAccessEntry(clientId) {
  const id = cleanText(clientId);
  if (!id) return false;
  const vault = readClientAccessVaultRaw();
  if (!Object.prototype.hasOwnProperty.call(vault, id)) return false;
  delete vault[id];
  writeClientAccessVault(vault);
  return true;
}

/** Список доступов без plaintext/hash. hasPassword — из users.password_hash. */
export function listClientAccessEntries(clients = []) {
  const vault = readClientAccessVaultRaw();
  const ids = new Set();
  for (const client of Array.isArray(clients) ? clients : []) {
    const id = cleanText(client?.id);
    if (id) ids.add(id);
  }
  for (const id of Object.keys(vault)) ids.add(id);
  const authMeta = getPasswordAuthMetaByIds([...ids]);
  const byId = new Map();

  for (const client of Array.isArray(clients) ? clients : []) {
    const id = cleanText(client?.id);
    if (!id) continue;
    const saved = stripSecretFields(vault[id] || {});
    const meta = authMeta.get(id) || { hasPassword: false };
    byId.set(id, {
      clientId: id,
      login: cleanText(saved.login) || cleanText(client.email),
      companyName:
        cleanText(saved.companyName) ||
        cleanText(client.companyName) ||
        "Без названия",
      contactName:
        cleanText(saved.contactName) || cleanText(client.contactName),
      note: cleanText(saved.note),
      updatedAt: saved.updatedAt || "",
      updatedBy: saved.updatedBy || "",
      hasPassword: Boolean(meta.hasPassword),
      resetRequired: Boolean(saved.resetRequired),
      isRegistered: client.isRegistered !== false,
      email: cleanText(client.email),
      phone: cleanText(client.phone),
    });
  }

  for (const [id, raw] of Object.entries(vault)) {
    if (byId.has(id)) continue;
    const saved = stripSecretFields(raw);
    const meta = authMeta.get(id) || { hasPassword: false };
    byId.set(id, {
      clientId: id,
      login: cleanText(saved.login),
      companyName: cleanText(saved.companyName) || "Клиент",
      contactName: cleanText(saved.contactName),
      note: cleanText(saved.note),
      updatedAt: saved.updatedAt || "",
      updatedBy: saved.updatedBy || "",
      hasPassword: Boolean(meta.hasPassword),
      resetRequired: Boolean(saved.resetRequired),
      isRegistered: false,
      email: cleanText(saved.login),
      phone: "",
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName, "ru", { sensitivity: "base" })
  );
}
