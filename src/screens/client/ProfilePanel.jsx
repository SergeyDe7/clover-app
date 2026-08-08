// Панель профиля организации клиента.
import { useEffect, useState } from "react";
import {
  RUSSIAN_PHONE_PREFIX,
  getRussianPhoneLocalDigits,
  formatRussianPhone,
  normalizeProfileContacts,
  createEmptyProfileContact,
  isClientProfileComplete,
  syncContactRoleLabel,
} from "../../shared/appHelpers";

function ensureEditableContacts(profile) {
  const normalized = normalizeProfileContacts(profile);
  if (normalized.contacts.length) return normalized.contacts;
  return [createEmptyProfileContact({ isPrimary: true })];
}

export function ProfilePanel({ profile, onChange }) {
  const [editing, setEditing] = useState(false);
  const [companyName, setCompanyName] = useState(profile.companyName || "");
  const [contacts, setContacts] = useState(() => ensureEditableContacts(profile));
  const complete = isClientProfileComplete(profile);
  const viewProfile = normalizeProfileContacts(profile);

  useEffect(() => {
    if (editing) return;
    setCompanyName(profile.companyName || "");
    setContacts(ensureEditableContacts(profile));
  }, [profile, editing]);

  const updateContact = (contactId, patch) => {
    setContacts((current) =>
      current.map((item) =>
        String(item.id) === String(contactId) ? { ...item, ...patch } : item
      )
    );
  };

  const setPrimaryContact = (contactId) => {
    setContacts((current) =>
      current.map((item) => {
        const isPrimary = String(item.id) === String(contactId);
        return {
          ...item,
          isPrimary,
          label: syncContactRoleLabel(item.label, isPrimary),
        };
      })
    );
  };

  const addContact = () => {
    setContacts((current) => {
      if (current.length >= 2) return current;
      return [
        ...current,
        createEmptyProfileContact({ isPrimary: false }),
      ];
    });
  };

  const removeContact = (contactId) => {
    setContacts((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((item) => String(item.id) !== String(contactId));
      if (!next.some((item) => item.isPrimary) && next[0]) {
        next[0] = {
          ...next[0],
          isPrimary: true,
          label: syncContactRoleLabel(next[0].label, true),
        };
      }
      return next.map((item) => ({
        ...item,
        label: syncContactRoleLabel(item.label, Boolean(item.isPrimary)),
      }));
    });
  };

  const save = (event) => {
    event.preventDefault();
    const next = normalizeProfileContacts({
      companyName: companyName.trim(),
      email: String(profile.email || "").trim(),
      contacts,
    });
    if (!isClientProfileComplete(next)) return;
    onChange(next);
    setEditing(false);
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Данные клиента</p>
          <h2>Профиль организации</h2>
          <p>Эти данные сохраняются в новых заказах и видны менеджеру.</p>
        </div>
        {!editing && (
          <button className="primary-button" type="button" onClick={() => setEditing(true)}>
            {complete ? "Изменить" : "+ Заполнить профиль"}
          </button>
        )}
      </div>

      {!editing && complete && (
        <div className="profile-summary profile-summary-contacts">
          <article>
            <span>Организация</span>
            <strong>{viewProfile.companyName}</strong>
          </article>
          <article>
            <span>Почта</span>
            <strong>{viewProfile.email}</strong>
          </article>
          {viewProfile.contacts.map((contact) => (
            <article key={contact.id} className={contact.isPrimary ? "is-primary" : ""}>
              <span>
                {contact.label || (contact.isPrimary ? "Основной контакт" : "Доп. контакт")}
                {contact.isPrimary ? " · основной" : ""}
              </span>
              <strong>{contact.name || "Без подписи"}</strong>
              <em>{contact.phone || "—"}</em>
            </article>
          ))}
        </div>
      )}

      {!editing && !complete && (
        <div className="warning-box">Заполните профиль перед созданием первого заказа.</div>
      )}

      {editing && (
        <form onSubmit={save}>
          <div className="form-grid">
            <label className="field">
              Название организации
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              Электронная почта
              <input
                type="email"
                value={profile.email || ""}
                readOnly
                title="Логин аккаунта — изменить нельзя"
                aria-readonly="true"
              />
            </label>
          </div>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            Электронная почта — логин аккаунта, изменить нельзя. Нужна смена? Обратитесь к менеджеру.
          </p>

          <div className="profile-contacts-block">
            <div className="profile-contacts-head">
              <div>
                <strong>Контакты</strong>
                <p className="muted small">
                  Подпишите контакт, укажите номер и отметьте основной. Можно добавить ещё один.
                </p>
              </div>
              {contacts.length < 2 ? (
                <button className="secondary-button" type="button" onClick={addContact}>
                  + Доп. контакт
                </button>
              ) : null}
            </div>

            <div className="profile-contacts-list">
              {contacts.map((contact, index) => (
                <div
                  key={contact.id}
                  className={
                    contact.isPrimary
                      ? "profile-contact-card is-primary"
                      : "profile-contact-card"
                  }
                >
                  <div className="profile-contact-card-top">
                    <label className="profile-contact-primary">
                      <input
                        type="radio"
                        name="profile-primary-contact"
                        checked={Boolean(contact.isPrimary)}
                        onChange={() => setPrimaryContact(contact.id)}
                      />
                      Основной
                    </label>
                    <span className="muted small">
                      {index === 0 ? "Контакт 1" : "Контакт 2"}
                    </span>
                    {contacts.length > 1 ? (
                      <button
                        className="secondary-button staff-edit-danger"
                        type="button"
                        onClick={() => removeContact(contact.id)}
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      Подпись контакта
                      <input
                        value={contact.name}
                        placeholder="Например: Иван Иванов"
                        onChange={(event) =>
                          updateContact(contact.id, { name: event.target.value })
                        }
                        required={contact.isPrimary}
                      />
                    </label>
                    <label className="field">
                      Метка
                      <input
                        value={contact.label}
                        placeholder={contact.isPrimary ? "Основной" : "Дополнительный"}
                        onChange={(event) =>
                          updateContact(contact.id, { label: event.target.value })
                        }
                        list="profile-contact-labels"
                      />
                    </label>
                    <label className="field field-wide">
                      Телефон
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+7 (999) 000-00-00"
                        maxLength="18"
                        value={contact.phone || RUSSIAN_PHONE_PREFIX}
                        onFocus={(event) => {
                          if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                            updateContact(contact.id, { phone: RUSSIAN_PHONE_PREFIX });
                          }
                        }}
                        onChange={(event) =>
                          updateContact(contact.id, {
                            phone: formatRussianPhone(event.target.value),
                          })
                        }
                        required={contact.isPrimary}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <datalist id="profile-contact-labels">
              <option value="Основной" />
              <option value="Дополнительный" />
              <option value="Директор" />
              <option value="Бухгалтер" />
              <option value="Склад" />
              <option value="Закупки" />
            </datalist>
          </div>

          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setCompanyName(profile.companyName || "");
                setContacts(ensureEditableContacts(profile));
                setEditing(false);
              }}
            >
              Отмена
            </button>
            <button className="primary-button" type="submit">
              Сохранить профиль
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
