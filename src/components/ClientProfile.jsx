import { useLocalization } from "../shared/i18n/LocalizationProvider";
import { useEffect, useState } from "react";
import "./ClientProfile.css";

const EMPTY_PROFILE = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
};

function ClientProfile({ profile, onChange }) {
  const { t } = useLocalization();
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
      // Почта = логин аккаунта; клиент не может её менять.
      email: String(profile.email || "").trim(),
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
          <p className="small-title">{t("manager.clientDetails")}</p>
          <h2>{t("shared.organizationProfile")}</h2>
          <p>{
            t("shared.theManagerWillSeeThisInformation")
          }</p>
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
            {isFilled ? t("shared.action.edit") : t("client.action.fillProfile")}
          </button>
        )}
      </div>

      {!isEditing && isFilled && (
        <div className="profile-summary">
          <article>
            <span>{t("shared.organization")}</span>
            <strong>{profile.companyName}</strong>
          </article>

          <article>
            <span>{t("auth.register.contact")}</span>
            <strong>{profile.contactName}</strong>
          </article>

          <article>
            <span>{t("auth.register.phone")}</span>
            <strong>{profile.phone}</strong>
          </article>

          <article>
            <span>{t("auth.register.email")}</span>
            <strong>{profile.email}</strong>
          </article>
        </div>
      )}

      {!isEditing && !isFilled && (
        <div className="profile-empty">
          <p>{
            t("shared.fillInTheProfileBeforeCreating")
          }</p>
        </div>
      )}

      {isEditing && (
        <form className="client-profile-form" onSubmit={handleSubmit}>
          <div className="profile-form-grid">
            <label>{
              t("auth.register.company")
              }<input
                type="text"
                placeholder={t("shared.forExampleRomashkaLlc")}
                value={form.companyName}
                onChange={(event) =>
                  updateField("companyName", event.target.value)
                }
                required
              />
            </label>

            <label>{
              t("auth.register.contact")
              }<input
                type="text"
                placeholder={t("shared.employeeName")}
                value={form.contactName}
                onChange={(event) =>
                  updateField("contactName", event.target.value)
                }
                required
              />
            </label>

            <label>{
              t("auth.register.phone")
              }<input
                type="tel"
                placeholder="+7 999 000-00-00"
                value={form.phone}
                onChange={(event) =>
                  updateField("phone", event.target.value)
                }
                required
              />
            </label>

            <label>{
              t("auth.register.email")
              }<input
                type="email"
                placeholder="company@mail.ru"
                value={profile.email || ""}
                readOnly
                title={t("shared.accountLoginCannotBeChanged")}
                aria-readonly="true"
              />
              <span className="small-title" style={{ display: "block", marginTop: 6 }}>{
                t("shared.emailIsTheAccountLoginAnd")
              }</span>
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
            >{
              t("shared.modal.cancel")
            }</button>

            <button
              className="profile-save-button"
              type="submit"
            >{
              t("shared.saveProfile")
            }</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default ClientProfile;
