/** Оперативное хранилище метаданных доступов клиентов (без plaintext-паролей в новых записях). */

import {
  db,
  setGlobalState,
  getPasswordAuthMetaByIds,
  runInTransaction,
} from "./db.js";
import {
  readVaultStateStrict,
  stripForbiddenCredentialFields,
} from "./credentialVaultInspector.js";

const VAULT_KEY = "clientAccessVault";

function cleanText(value) {
  return String(value ?? "").trim();
}

function stripSecretFields(entry) {
  if (!entry || typeof entry !== "object") return {};
  return stripForbiddenCredentialFields(entry);
}

function vaultJsonInvalidError() {
  const err = new Error("clientAccessVault json invalid");
  err.code = "VAULT_JSON_INVALID";
  return err;
}

/** Exact vault from DB (may still contain legacy plaintext until opt-in migration). */
export function readClientAccessVaultRaw() {
  const state = readVaultStateStrict(db, VAULT_KEY);
  if (!state.parseOk) {
    throw vaultJsonInvalidError();
  }
  const raw = state.vault || {};
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

/**
 * Atomic read-modify-write of the vault under BEGIN IMMEDIATE.
 * Prevents lost updates when two writers touch different users.
 */
export function mutateClientAccessVault(mutator) {
  return runInTransaction(() => {
    const vault = readClientAccessVaultRaw();
    const result = mutator(vault);
    writeClientAccessVault(vault);
    return result;
  });
}

export function upsertClientAccessEntry(clientId, patch = {}, actor = {}) {
  const id = cleanText(clientId);
  if (!id) return null;
  return mutateClientAccessVault((vault) => {
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
    return next;
  });
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
  return mutateClientAccessVault((vault) => {
    if (!Object.prototype.hasOwnProperty.call(vault, id)) return false;
    delete vault[id];
    return true;
  });
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
