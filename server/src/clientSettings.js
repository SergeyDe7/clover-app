/** Поля settings, нужные клиенту в UI (ManagerContact, флаги кабинета). */
const CLIENT_SETTINGS_KEYS = [
  "showPrices",
  "allowCustomItems",
  "allowClientEdit",
  "allowClientDelete",
  "allowRepeatOrder",
  "requireProfile",
  "requireAddress",
  "showFavorites",
  "enableDrafts",
  "managerFullName",
  "managerPhone",
  "managerMax",
  "managerTelegram",
];

/**
 * Урезанные settings для bootstrap клиента — без notify/email/telegram/chat id менеджера.
 */
export function publicClientSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const result = {};
  for (const key of CLIENT_SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
}

export { CLIENT_SETTINGS_KEYS };
