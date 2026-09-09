import { useLocalization } from "../../shared/i18n/LocalizationProvider";
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
import { contactLabel, contactRoleLabel } from "../../shared/i18n/displayLabels";

const MAX_PROFILE_CONTACTS = 5;

function ensureEditableContacts(profile) {
  const normalized = normalizeProfileContacts(profile);
  if (normalized.contacts.length) return normalized.contacts;
  return [createEmptyProfileContact({ isPrimary: true })];
}

export function ProfilePanel({ profile, onChange }) {
  const { t } = useLocalization();
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
      if (current.length >= MAX_PROFILE_CONTACTS) return current;
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
          <p className="eyebrow">{t("manager.clientDetails")}</p>
          <h2>{t("shared.organizationProfile")}</h2>
          <p>{t("client.thisDataIsSavedInNew")}</p>
        </div>
        {!editing && (
          <button className="primary-button" type="button" onClick={() => setEditing(true)}>
            {complete ? t("shared.action.edit") : t("client.action.fillProfile")}
          </button>
        )}
      </div>

      {!editing && complete && (
        <div className="profile-summary profile-summary-contacts">
          <article>
            <span>{t("shared.organization")}</span>
            <strong>{viewProfile.companyName}</strong>
          </article>
          <article>
            <span>{t("shared.field.emailShort")}</span>
            <strong>{viewProfile.email}</strong>
          </article>
          {viewProfile.contacts.map((contact) => (
            <article key={contact.id} className={contact.isPrimary ? "is-primary" : ""}>
              <span>
                {contactLabel(contact.label, t) || (contact.isPrimary ? t("client.primaryContact") : t("client.extraContact"))}
              </span>
              <strong>{contact.name || "—"}</strong>
              <em>{contact.phone || "—"}</em>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <form className="profile-form" onSubmit={save}>
          <div className="form-grid profile-org-email-grid">
            <label className="field">{
              t("auth.register.company")
              }<input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
            <label className="field">{
              t("auth.register.email")
              }<input value={String(profile.email || "")} readOnly disabled />
            </label>
            <p className="muted small field-hint field-hint-email">{
              t("shared.emailIsTheAccountLoginAnd")
            }</p>
          </div>

          <div className="profile-contacts-block">
            <div className="profile-contacts-head">
              <div>
                <strong>{t("storefront.nav.contacts")}</strong>
                <p className="muted small">
                  {t("client.profile.contactsHint", { max: MAX_PROFILE_CONTACTS })}
                </p>
              </div>
              {contacts.length < MAX_PROFILE_CONTACTS ? (
                <button className="secondary-button" type="button" onClick={addContact}>{
                  t("client.extraContact2")
                }</button>
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
                      />{
                      t("shared.address.primary")
                    }</label>
                    <span className="muted small">{t("client.profile.contactNumbered", { n: index + 1 })}</span>
                    {contacts.length > 1 ? (
                      <button
                        className="secondary-button staff-edit-danger"
                        type="button"
                        onClick={() => removeContact(contact.id)}
                      >{
                        t("shared.action.delete")
                      }</button>
                    ) : null}
                  </div>

                  <div className="form-grid">
                    <label className="field">{
                      t("client.contactFullName")
                      }<input
                        value={contact.name}
                        placeholder={t("client.forExampleIvanIvanov")}
                        onChange={(event) =>
                          updateContact(contact.id, { name: event.target.value })
                        }
                        required={contact.isPrimary}
                      />
                    </label>
                    <label className="field">{
                      t("client.roleInTheCompany")
                      }<input
                        value={contact.label}
                        placeholder={t("client.forExampleDirectorWarehousePurchasing")}
                        onChange={(event) =>
                          updateContact(contact.id, { label: event.target.value })
                        }
                        list="profile-contact-labels"
                      />
                    </label>
                    <label className="field field-wide">{
                      t("auth.register.phone")
                      }<input
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
              <option value="Директор" label={contactRoleLabel("Директор", t)} />
              <option value="Бухгалтер" label={contactRoleLabel("Бухгалтер", t)} />
              <option value="Склад" label={contactRoleLabel("Склад", t)} />
              <option value="Закупки" label={contactRoleLabel("Закупки", t)} />
              <option value="Приём товара" label={contactRoleLabel("Приём товара", t)} />
              <option value="Менеджер" label={contactRoleLabel("Менеджер", t)} />
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
            >{
              t("shared.modal.cancel")
            }</button>
            <button className="primary-button" type="submit">{
              t("shared.saveProfile")
            }</button>
          </div>
        </form>
      )}
    </section>
  );
}
