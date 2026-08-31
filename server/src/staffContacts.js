/**
 * Контакты сотрудников (manager/admin) для «Связаться с менеджером».
 * Хранятся в app_state.staffContacts, не дублируют пароли/права.
 */

export function normalizeStaffContact(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    fullName: String(source.fullName || "").trim().slice(0, 160),
    phone: String(source.phone || "").trim().slice(0, 50),
    max: String(source.max || "").trim().slice(0, 120),
    telegram: String(source.telegram || "").trim().slice(0, 120),
  };
}

export function normalizeStaffContactsMap(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [userId, contact] of Object.entries(raw)) {
    const id = String(userId || "").trim();
    if (!id) continue;
    out[id] = normalizeStaffContact(contact);
  }
  return out;
}

/** Публичные поля контакта для клиентского ЛК / кнопки связи. */
export function publicStaffContact(raw = {}) {
  return normalizeStaffContact(raw);
}
