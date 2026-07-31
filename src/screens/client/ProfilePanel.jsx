// Панель профиля организации клиента.
import { useEffect, useState } from "react";
import {
  RUSSIAN_PHONE_PREFIX,
  getRussianPhoneLocalDigits,
  formatRussianPhone,
} from "../../shared/appHelpers";

export function ProfilePanel({ profile, onChange }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const complete = Object.values(profile).every((value) => String(value || "").trim());

  useEffect(() => setForm(profile), [profile]);

  const save = (event) => {
    event.preventDefault();
    const next = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    };
    if (!Object.values(next).every(Boolean)) return;
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
        <div className="profile-summary">
          <article><span>Организация</span><strong>{profile.companyName}</strong></article>
          <article><span>Контактное лицо</span><strong>{profile.contactName}</strong></article>
          <article><span>Телефон</span><strong>{profile.phone}</strong></article>
          <article><span>Почта</span><strong>{profile.email}</strong></article>
        </div>
      )}

      {!editing && !complete && <div className="warning-box">Заполните профиль перед созданием первого заказа.</div>}

      {editing && (
        <form onSubmit={save}>
          <div className="form-grid">
            <label className="field">Название организации
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
            </label>
            <label className="field">Контактное лицо
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
            </label>
            <label className="field">Телефон
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 (999) 000-00-00"
                maxLength="18"
                value={form.phone || RUSSIAN_PHONE_PREFIX}
                onFocus={(event) => {
                  if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                    setForm((current) => ({ ...current, phone: RUSSIAN_PHONE_PREFIX }));
                  }
                }}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: formatRussianPhone(event.target.value),
                  }))
                }
                required
              />
            </label>
            <label className="field">Электронная почта
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => { setForm(profile); setEditing(false); }}>Отмена</button>
            <button className="primary-button" type="submit">Сохранить профиль</button>
          </div>
        </form>
      )}
    </section>
  );
}
