/** Оперативное хранилище логинов/паролей клиентов для менеджеров. */

import { getGlobalState, setGlobalState } from "./db.js";

const VAULT_KEY = "clientAccessVault";

function cleanText(value) {
  return String(value ?? "").trim();
}

export function readClientAccessVault() {
  const raw = getGlobalState(VAULT_KEY, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
}

export function writeClientAccessVault(vault) {
  setGlobalState(VAULT_KEY, vault && typeof vault === "object" ? vault : {});
}

export function upsertClientAccessEntry(clientId, patch = {}, actor = {}) {
  const id = cleanText(clientId);
  if (!id) return null;
  const vault = readClientAccessVault();
  const previous = vault[id] && typeof vault[id] === "object" ? vault[id] : {};
  const next = {
    clientId: id,
    login: cleanText(patch.login ?? previous.login),
    password: cleanText(patch.password ?? previous.password),
    companyName: cleanText(patch.companyName ?? previous.companyName),
    contactName: cleanText(patch.contactName ?? previous.contactName),
    note: cleanText(patch.note ?? previous.note),
    updatedAt: new Date().toISOString(),
    updatedBy: cleanText(actor.email || actor.id || previous.updatedBy),
  };
  if (!next.login && !next.password) {
    return previous.login || previous.password ? previous : null;
  }
  vault[id] = next;
  writeClientAccessVault(vault);
  return next;
}

/**
 * Обязательное сохранение логина и пароля в журнал доступов менеджера.
 * Падает с ошибкой, если запись не подтвердилась чтением из БД.
 */
export function saveClientAccessCredentials(clientId, credentials = {}, actor = {}) {
  const id = cleanText(clientId);
  const login = cleanText(credentials.login);
  const password = cleanText(credentials.password);
  if (!id) {
    throw new Error("Не удалось сохранить доступ: пустой id клиента.");
  }
  if (!login || !password) {
    throw new Error("Не удалось сохранить доступ: нужны логин и пароль.");
  }
  const saved = upsertClientAccessEntry(
    id,
    {
      login,
      password,
      companyName: credentials.companyName,
      contactName: credentials.contactName,
      note: credentials.note,
    },
    actor
  );
  const verified = readClientAccessVault()[id];
  if (
    !saved ||
    !verified ||
    cleanText(verified.login) !== login ||
    cleanText(verified.password) !== password
  ) {
    throw new Error("Не удалось сохранить логин и пароль в журнал доступов.");
  }
  return {
    clientId: id,
    login: verified.login,
    hasPassword: true,
    companyName: verified.companyName || "",
    contactName: verified.contactName || "",
    updatedAt: verified.updatedAt || "",
    updatedBy: verified.updatedBy || "",
  };
}

export function removeClientAccessEntry(clientId) {
  const id = cleanText(clientId);
  if (!id) return false;
  const vault = readClientAccessVault();
  if (!Object.prototype.hasOwnProperty.call(vault, id)) return false;
  delete vault[id];
  writeClientAccessVault(vault);
  return true;
}

/** Список доступов, дополненный карточками клиентов без сохранённого пароля. */
export function listClientAccessEntries(clients = []) {
  const vault = readClientAccessVault();
  const byId = new Map();

  for (const client of Array.isArray(clients) ? clients : []) {
    const id = cleanText(client?.id);
    if (!id) continue;
    const saved = vault[id] || {};
    byId.set(id, {
      clientId: id,
      login: cleanText(saved.login) || cleanText(client.email),
      password: cleanText(saved.password),
      companyName:
        cleanText(saved.companyName) ||
        cleanText(client.companyName) ||
        "Без названия",
      contactName:
        cleanText(saved.contactName) || cleanText(client.contactName),
      note: cleanText(saved.note),
      updatedAt: saved.updatedAt || "",
      updatedBy: saved.updatedBy || "",
      hasPassword: Boolean(cleanText(saved.password)),
      isRegistered: client.isRegistered !== false,
      email: cleanText(client.email),
      phone: cleanText(client.phone),
    });
  }

  // Записи в vault без активного клиента (редко) — тоже показываем.
  for (const [id, saved] of Object.entries(vault)) {
    if (byId.has(id)) continue;
    byId.set(id, {
      clientId: id,
      login: cleanText(saved.login),
      password: cleanText(saved.password),
      companyName: cleanText(saved.companyName) || "Клиент",
      contactName: cleanText(saved.contactName),
      note: cleanText(saved.note),
      updatedAt: saved.updatedAt || "",
      updatedBy: saved.updatedBy || "",
      hasPassword: Boolean(cleanText(saved.password)),
      isRegistered: false,
      email: cleanText(saved.login),
      phone: "",
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName, "ru", { sensitivity: "base" })
  );
}
