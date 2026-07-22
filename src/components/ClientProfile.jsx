import { useEffect, useState } from "react";
import "./ClientProfile.css";

const EMPTY_PROFILE = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
};

function ClientProfile({ profile, onChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(profile);

  useEffect(() => {
    setForm(profile);
  }, [profile]);

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextProfile = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    };

    if (
      !nextProfile.companyName ||
      !nextProfile.contactName ||
      !nextProfile.phone ||
      !nextProfile.email
    ) {
      return;
    }

    onChange(nextProfile);
    setIsEditing(false);
  };

  const isFilled =
    profile.companyName &&
    profile.contactName &&
    profile.phone &&
    profile.email;

  return (
    <section className="client-profile">
      <div className="client-profile-heading">
        <div>
          <p className="small-title">Данные клиента</p>
          <h2>Профиль организации</h2>
          <p>
            Эти данные менеджер увидит вместе с заказом.
          </p>
        </div>

        {!isEditing && (
          <button
            className="profile-edit-button"
            type="button"
            onClick={() => {
              setForm(isFilled ? profile : EMPTY_PROFILE);
              setIsEditing(true);
            }}
          >
            {isFilled ? "Изменить" : "+ Заполнить профиль"}
          </button>
        )}
      </div>

      {!isEditing && isFilled && (
        <div className="profile-summary">
          <article>
            <span>Организация</span>
            <strong>{profile.companyName}</strong>
          </article>

          <article>
            <span>Контактное лицо</span>
            <strong>{profile.contactName}</strong>
          </article>

          <article>
            <span>Телефон</span>
            <strong>{profile.phone}</strong>
          </article>

          <article>
            <span>Электронная почта</span>
            <strong>{profile.email}</strong>
          </article>
        </div>
      )}

      {!isEditing && !isFilled && (
        <div className="profile-empty">
          <p>
            Заполните профиль перед созданием первого заказа.
          </p>
        </div>
      )}

      {isEditing && (
        <form className="client-profile-form" onSubmit={handleSubmit}>
          <div className="profile-form-grid">
            <label>
              Название организации
              <input
                type="text"
                placeholder="Например: ООО Ромашка"
                value={form.companyName}
                onChange={(event) =>
                  updateField("companyName", event.target.value)
                }
                required
              />
            </label>

            <label>
              Контактное лицо
              <input
                type="text"
                placeholder="Имя сотрудника"
                value={form.contactName}
                onChange={(event) =>
                  updateField("contactName", event.target.value)
                }
                required
              />
            </label>

            <label>
              Телефон
              <input
                type="tel"
                placeholder="+7 999 000-00-00"
                value={form.phone}
                onChange={(event) =>
                  updateField("phone", event.target.value)
                }
                required
              />
            </label>

            <label>
              Электронная почта
              <input
                type="email"
                placeholder="company@mail.ru"
                value={form.email}
                onChange={(event) =>
                  updateField("email", event.target.value)
                }
                required
              />
            </label>
          </div>

          <div className="profile-form-actions">
            <button
              className="profile-cancel-button"
              type="button"
              onClick={() => {
                setForm(profile);
                setIsEditing(false);
              }}
            >
              Отмена
            </button>

            <button
              className="profile-save-button"
              type="submit"
            >
              Сохранить профиль
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default ClientProfile;
