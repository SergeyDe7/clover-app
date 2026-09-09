import { useLocalization } from "../../shared/i18n/LocalizationProvider";
// Раздел менеджера: клиенты, матрицы товаров и связи с 1С.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../serverApi";
import { PanelErrorBoundary } from "../../shared/SharedPanels";
import {
  EMPTY_LINK,
  writeOpenManagerClientId,
  UNIT_ORDER,
  UNIT_CONFIG,
  unitPriceField,
  hasManualUnitValue,
  prefillManualPriceFromProduct,
  calculateMarkupPreview,
  pickPurchaseMarkupCostForUi,
  formatMoney,
  formatDateTime,
  normalizeProduct,
  matchesTextSearch,
  buildClientSearchHaystack,
  buildOrderSearchHaystack,
  RUSSIAN_PHONE_PREFIX,
  formatRussianPhone,
  getRussianPhoneLocalDigits,
  normalizeProfileContacts,
  createEmptyProfileContact,
  productArticle,
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
  restoreWindowScroll,
} from "../../shared/appHelpers";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { addressLabel } from "../../shared/i18n/displayLabels";
import { MatrixOneCProductAdd } from "./MatrixOneCProductAdd";
import { MatrixCloverCatalogAdd } from "./MatrixCloverCatalogAdd";
import { ProductEditor } from "./ProductEditor";
import {
  growMatrixIdList,
  idsWithout,
  toggleMatrixProductId,
  uniqueMatrixProductIds,
} from "./matrixIds";
import { downloadClientMatrixExcel } from "../../shared/matrixExcelImport";
import { mergeProductsFromCatalogResponse } from "./matrixMembership";

/** Цена из вида цен 1С (категория клиента), с масштабом от шт. */
function typedSalePriceForUnit(product, priceTypeId, unit) {
  const typeId = String(priceTypeId || "").trim();
  if (!typeId) return null;
  const byType =
    product?.salePricesByType && typeof product.salePricesByType === "object"
      ? product.salePricesByType
      : null;
  const entry = byType?.[typeId];
  if (!entry || typeof entry !== "object") return null;
  const direct = Number(entry[unit]);
  if (entry[unit] != null && entry[unit] !== "" && Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  if (unit === "piece" || unit === "pair" || unit === "roll") return null;
  const piece = Number(entry.piece);
  if (!Number.isFinite(piece) || piece < 0) return null;
  const sizeField =
    unit === "pack"
      ? "packSize"
      : unit === "bundle"
        ? "bundleSize"
        : unit === "box"
          ? "boxSize"
          : "pieceSize";
  return piece * Math.max(1, Number(product?.[sizeField]) || 1);
}

function generateAccessPassword(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(length))
      : Array.from({ length }, (_, index) => (Date.now() + index * 17) % 256);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function OneCClientPicker({ client, link, onChange }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(client.companyName || "");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCandidates = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const candidates = await api.getOneCClientCandidates(client.id);
      if ((candidates.items || []).length) {
        setItems(candidates.items || []);
        return;
      }
      const result = await api.getOneCClients({ search: client.companyName || "", limit: 30 });
      setItems(result.items || []);
    } catch (loadError) {
      setError(loadError.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCClients({ search, limit: 50 });
      setItems(result.items || []);
    } catch (searchError) {
      setError(searchError.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const selectClient = async (item) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.linkOneCClient(client.id, item.id, item);
      onChange(result.clientLink || {});
      setOpen(false);
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setLoading(false);
    }
  };

  const clearLink = () => {
    onChange({
      matched1C: false,
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCInn: "",
      oneCLinkMode: "manual-cleared",
      oneCLinkedAt: "",
    });
  };

  return (
    <div className="one-c-client-picker">
      <div className="one-c-link-editor-head">
        <div>
          <span className={link.oneCId ? "badge green" : "badge yellow"}>
            {link.oneCId ? t("manager.linkedTo1c") : t("manager.willBeSetWhenOrdering")}
          </span>
          <p className="muted small" style={{ marginTop: 8 }}>
            {link.oneCId
              ? `${link.oneCName || t("manager.clients.oneCCounterparty")} · ${link.oneCCode || t("manager.clients.noCode")}`
              : t("manager.cloverWillSendTheNamePhone")}
          </p>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={loadCandidates}>
            {link.oneCId ? t("manager.changeCounterparty") : t("manager.chooseA1cCounterparty")}
          </button>
          {link.oneCId && (
            <button className="secondary-button" type="button" onClick={clearLink}>{t("manager.unlink")}</button>
          )}
        </div>
      </div>

      {open && (
        <div className="one-c-picker">
          <div className="one-c-products-search">
            <input
              type="search"
              value={search}
              placeholder={t("manager.nameTaxIdPhoneEmailOr")}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
            <button className="secondary-button" type="button" disabled={loading} onClick={runSearch}>
              {loading ? t("manager.search.ellipsis") : t("shared.action.find")}
            </button>
            <button className="secondary-button" type="button" onClick={() => setOpen(false)}>{t("shared.action.close")}</button>
          </div>
          {error && <div className="sync-error">{error}</div>}
          <div className="one-c-products-list one-c-picker-list">
            {items.map((item) => {
              const linkedToCurrent = item.cloverLink && String(item.cloverLink.clientId) === String(client.id);
              const linkedElsewhere = item.cloverLink && !linkedToCurrent;
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span> {t("manager.clients.codeAndInn", { code: item.code || "—", inn: item.inn || "—" })}</span>
                    {(item.phone || item.email) && <span>{item.phone || ""} {item.email || ""}</span>}
                    {Number(item.score) > 0 && <span className="muted small">{t("manager.matchPercent", { percent: Math.round(Number(item.score) * 100) })}</span>}
                    {linkedElsewhere && <span className="warning-text">{t("manager.clients.alreadyLinkedToClient", { name: item.cloverLink.clientName })}</span>}
                  </div>
                  <button
                    className={linkedToCurrent ? "secondary-button" : "primary-button"}
                    type="button"
                    disabled={loading || Boolean(linkedElsewhere)}
                    onClick={() => selectClient(item)}
                  >
                    {linkedToCurrent ? t("manager.selected") : linkedElsewhere ? t("manager.alreadyLinked") : t("shared.action.choose")}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">{
                t("manager.theCounterpartyIsNotLoadedYet")
              }</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function normalizeManagerClientAddresses(addresses = []) {
  const normalized = (Array.isArray(addresses) ? addresses : [])
    .map((item, index) => {
      if (typeof item === "string") {
        const address = item.trim();
        if (!address) return null;
        return {
          id: `legacy-address-${index}`,
          label: index === 0 ? "Основной адрес" : `Адрес ${index + 1}`,
          address,
          isDefault: index === 0,
          deliveryZoneId: "",
        };
      }

      const address = String(item?.address || "").trim();
      if (!address) return null;

      return {
        id: String(item?.id || `address-${index}`),
        label: String(item?.label || `Адрес ${index + 1}`).trim(),
        address,
        isDefault: Boolean(item?.isDefault),
        deliveryZoneId: String(item?.deliveryZoneId || "").trim(),
      };
    })
    .filter(Boolean);

  if (normalized.length && !normalized.some((item) => item.isDefault)) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }

  let defaultFound = false;
  return normalized.map((item) => {
    if (!item.isDefault) return item;
    if (defaultFound) return { ...item, isDefault: false };
    defaultFound = true;
    return item;
  });
}

const MAX_PROFILE_CONTACTS = 5;

function extraClientContacts(contacts) {
  return (Array.isArray(contacts) ? contacts : []).filter((item) => !item.isPrimary);
}

function createManagerClientForm(client) {
  const normalized = normalizeProfileContacts({
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
    contacts: Array.isArray(client.contacts) ? client.contacts : [],
  });
  return {
    companyName: normalized.companyName || "",
    contactName: normalized.contactName || "",
    phone: normalized.phone || "",
    email: client.email || "",
    contacts: normalized.contacts,
    managerNote: client.managerNote || "",
    addresses: normalizeManagerClientAddresses(client.addresses),
  };
}

function ManagerClientEditor({
  client,
  link,
  onLinkChange,
  onReload,
  onClose,
  deliveryZones = [],
}) {
  const { t } = useLocalization();
  const [form, setForm] = useState(() => createManagerClientForm(client));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const clientVersion = JSON.stringify({
    id: client.id,
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
    contacts: Array.isArray(client.contacts) ? client.contacts : [],
    managerNote: client.managerNote || "",
    addresses: normalizeManagerClientAddresses(client.addresses),
  });

  useEffect(() => {
    setForm(createManagerClientForm(client));
  }, [clientVersion]);

  const setProfileField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  };

  const updateAddress = (addressId, patch) => {
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((item) => {
        if (patch.isDefault === true) {
          return item.id === addressId
            ? { ...item, ...patch, isDefault: true }
            : { ...item, isDefault: false };
        }
        return item.id === addressId ? { ...item, ...patch } : item;
      }),
    }));
    setMessage("");
    setError("");
  };

  const addAddress = () => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `address-${Date.now()}`;
    setForm((current) => ({
      ...current,
      addresses: [
        ...current.addresses,
        {
          id,
          label: "",
          address: "",
          isDefault: current.addresses.length === 0,
          deliveryZoneId: "",
        },
      ],
    }));
    setMessage("");
    setError("");
  };

  const addExtraPhone = () => {
    setForm((current) => {
      const contacts = Array.isArray(current.contacts) ? current.contacts : [];
      if (contacts.length >= MAX_PROFILE_CONTACTS) return current;
      const withPrimary =
        contacts.length > 0
          ? contacts
          : [
              {
                id: "contact-primary",
                name: current.contactName || "",
                label: "Основной",
                phone: current.phone || "",
                isPrimary: true,
              },
            ];
      return {
        ...current,
        contacts: [...withPrimary, createEmptyProfileContact({ isPrimary: false })],
      };
    });
    setMessage("");
    setError("");
  };

  const updateExtraContact = (contactId, patch) => {
    setForm((current) => ({
      ...current,
      contacts: (Array.isArray(current.contacts) ? current.contacts : []).map((item) =>
        String(item.id) === String(contactId) ? { ...item, ...patch } : item
      ),
    }));
    setMessage("");
    setError("");
  };

  const removeExtraContact = (contactId) => {
    setForm((current) => ({
      ...current,
      contacts: (Array.isArray(current.contacts) ? current.contacts : []).filter(
        (item) => item.isPrimary || String(item.id) !== String(contactId)
      ),
    }));
    setMessage("");
    setError("");
  };

  const removeAddress = (addressId) => {
    setForm((current) => {
      const removed = current.addresses.find((item) => item.id === addressId);
      const addresses = current.addresses.filter((item) => item.id !== addressId);
      if (removed?.isDefault && addresses.length) {
        addresses[0] = { ...addresses[0], isDefault: true };
      }
      return { ...current, addresses };
    });
    setMessage("");
    setError("");
  };

  const save = async () => {
    const companyName = form.companyName.trim();
    const contactName = form.contactName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();
    const managerNote = form.managerNote.trim();
    const addresses = form.addresses.map((item) => ({
      ...item,
      label: item.label.trim(),
      address: item.address.trim(),
      deliveryZoneId: String(item.deliveryZoneId || "").trim(),
    }));

    if (!companyName && !contactName) {
      setError(t("manager.enterTheCompanyNameOrThe"));
      return;
    }
    if (!email) {
      setError(t("manager.enterTheClientEmail"));
      return;
    }
    if (addresses.some((item) => !item.label || !item.address)) {
      setError(t("manager.fillInTheNameAndFull"));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const existingContacts = Array.isArray(form.contacts) ? form.contacts : [];
      const extras = extraClientContacts(existingContacts)
        .filter((item) => getRussianPhoneLocalDigits(item.phone) || String(item.name || "").trim())
        .slice(0, MAX_PROFILE_CONTACTS - 1)
        .map((item) => ({
          ...item,
          isPrimary: false,
          label:
            !item.label || item.label === "Основной" || item.label === "Дополнительный"
              ? "Дополнительный"
              : item.label,
        }));
      const contacts = normalizeProfileContacts({
        companyName,
        email,
        contacts: [
          {
            id: existingContacts.find((item) => item.isPrimary)?.id || "contact-primary",
            name: contactName,
            label:
              existingContacts.find((item) => item.isPrimary)?.label &&
              existingContacts.find((item) => item.isPrimary)?.label !== "Дополнительный"
                ? existingContacts.find((item) => item.isPrimary).label
                : "Основной",
            phone,
            isPrimary: true,
          },
          ...extras,
        ],
      }).contacts;
      await api.updateClient(client.id, {
        profile: {
          companyName,
          contactName,
          phone,
          email,
          contacts,
        },
        addresses,
        managerNote,
      });
      setMessage(t("manager.clientDetailsWereSavedInClover"));
      await onReload();
    } catch (saveError) {
      setError(saveError.message || "Не удалось сохранить данные клиента.");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    const password = passwordDraft.trim();
    if (password.length < 6) {
      await appAlert({
        title: t("manager.passwordTooShort"),
        message: t("shared.passwordMustBeAtLeast6"),
        tone: "warn",
      });
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await api.setClientPassword(client.id, password);
      void result;
      await onReload();
      setPasswordDraft("");
    } catch (saveError) {
      await appAlert({
        title: "Не удалось сменить пароль",
        message: saveError.message,
        tone: "danger",
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <section className="client-profile-panel" id={`client-profile-${client.id}`}>
      <div className="client-profile-panel-head">
        <div>
          <p className="eyebrow">{t("client.nav.profile")}</p>
          <h3>{t("manager.clientDetails")}</h3>
          <p className="muted small">{
            t("manager.phoneEmail1cCounterpartyAddressesAnd")
          }</p>
        </div>
        {onClose && (
          <button className="secondary-button" type="button" onClick={onClose}>{
            t("shared.action.close")
          }</button>
        )}
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">{
          t("manager.companyOrStore")
          }<input
            value={form.companyName}
            onChange={(event) => setProfileField("companyName", event.target.value)}
          />
        </label>
        <label className="field">{
          t("auth.register.contact")
          }<input
            value={form.contactName}
            onChange={(event) => setProfileField("contactName", event.target.value)}
          />
        </label>
        <label className="field">{
          t("auth.register.phone")
          }<input
            value={form.phone}
            onChange={(event) => setProfileField("phone", event.target.value)}
          />
        </label>
        <label className="field">{
          t("manager.clientSignInEmail")
          }<input
            type="email"
            value={form.email}
            onChange={(event) => setProfileField("email", event.target.value)}
          />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <strong>{t("manager.clients.oneCCounterparty")}</strong>
        <p className="muted small" style={{ marginTop: 4 }}>{
          t("manager.requiredSoThisClientSOrders")
        }</p>
        <OneCClientPicker
          client={client}
          link={link || EMPTY_LINK}
          onChange={(patch) => onLinkChange?.(patch)}
        />
      </div>

      <div className="profile-contacts-block" style={{ marginTop: 14 }}>
        <div className="profile-contacts-head">
          <div>
            <strong>{t("manager.extraNumbers")}</strong>
            <p className="muted small">
              {t("manager.clients.extraPhonesHint", { max: MAX_PROFILE_CONTACTS })}
            </p>
          </div>
          {form.contacts.length < MAX_PROFILE_CONTACTS ? (
            <button className="secondary-button" type="button" onClick={addExtraPhone}>{
              t("manager.extraNumber")
            }</button>
          ) : null}
        </div>
        {extraClientContacts(form.contacts).length ? (
          <div className="profile-contacts-list" style={{ marginTop: 8 }}>
            {extraClientContacts(form.contacts).map((item, index) => (
              <div className="profile-contact-card" key={item.id || `${item.phone}-${index}`}>
                <div className="profile-contact-card-top">
                  <span className="badge yellow">{addressLabel(item.label || "Дополнительный", t)}</span>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => removeExtraContact(item.id)}
                  >{
                    t("shared.action.delete")
                  }</button>
                </div>
                <div className="form-grid">
                  <label className="field">{
                    t("manager.clients.contactCaption")
                    }<input
                      value={item.name || ""}
                      placeholder={t("manager.forExampleWarehouseAccountant")}
                      onChange={(event) =>
                        updateExtraContact(item.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">{
                    t("auth.register.phone")
                    }<input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+7 (999) 000-00-00"
                      maxLength="18"
                      value={item.phone || RUSSIAN_PHONE_PREFIX}
                      onFocus={(event) => {
                        if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                          updateExtraContact(item.id, { phone: RUSSIAN_PHONE_PREFIX });
                        }
                      }}
                      onChange={(event) =>
                        updateExtraContact(item.id, {
                          phone: formatRussianPhone(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 8 }}>{
            t("manager.noExtraNumbersYet")
          }</p>
        )}
      </div>

      <div className="manager-client-addresses">
        <div className="manager-client-addresses-heading">
          <strong>{t("manager.deliveryAddresses")}</strong>
          <button className="secondary-button" type="button" onClick={addAddress}>{
            t("client.action.addAddress")
          }</button>
        </div>
        {form.addresses.map((item) => (
          <div className="manager-client-address-row" key={item.id}>
            <label className="field">{
              t("shared.field.name")
              }<input
                value={item.label}
                placeholder={t("manager.forExampleMainStore")}
                onChange={(event) => updateAddress(item.id, { label: event.target.value })}
              />
            </label>
            <label className="field manager-client-address-field">{
              t("shared.fullAddress")
              }<input
                value={item.address}
                placeholder={t("shared.cityStreetBuildingPremises")}
                onChange={(event) => updateAddress(item.id, { address: event.target.value })}
              />
            </label>
            <label className="field">{
              t("manager.deliveryZone")
              }<select
                value={item.deliveryZoneId || ""}
                onChange={(event) =>
                  updateAddress(item.id, { deliveryZoneId: event.target.value })
                }
              >
                <option value="">{t("manager.default")}</option>
                {(Array.isArray(deliveryZones) ? deliveryZones : [])
                  .filter((zone) => zone && zone.enabled !== false)
                  .map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name || zone.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="manager-client-default-address">
              <input
                type="radio"
                name={`default-address-${client.id}`}
                checked={Boolean(item.isDefault)}
                onChange={() => updateAddress(item.id, { isDefault: true })}
              />{
              t("shared.address.primary")
            }</label>
            <button
              className="danger-button"
              type="button"
              onClick={() => removeAddress(item.id)}
            >{
              t("shared.action.delete")
            }</button>
          </div>
        ))}
        {!form.addresses.length && (
          <div className="empty-box">{t("client.address.empty")}</div>
        )}
      </div>

      <label className="field" style={{ marginTop: 14 }}>{
        t("client.managerComment")
        }<textarea
          rows="4"
          maxLength="2000"
          placeholder={t("manager.forExampleCallBeforeDeliveryAccepts")}
          value={form.managerNote}
          onChange={(event) => setProfileField("managerNote", event.target.value)}
        />
        <small>{t("manager.visibleOnlyToCloverManagersNot")}</small>
      </label>

      <div className="matrix-catalog-note" style={{ marginTop: 14 }}>{
        t("manager.changesApplyToNewCloverOrders")
      }</div>

      <div className="client-password-block" style={{ marginTop: 18 }}>
        <strong>{t("shared.changePassword2")}</strong>
        <p className="muted small" style={{ marginTop: 4 }}>
          {t("manager.clients.loginStaysEmail", { email: client.email })}
        </p>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="field">{
            t("auth.reset.title")
            }<input
              type="text"
              autoComplete="new-password"
              value={passwordDraft}
              onChange={(event) => setPasswordDraft(event.target.value)}
              minLength={6}
              disabled={passwordBusy}
            />
          </label>
        </div>
        <div className="form-actions" style={{ marginTop: 10 }}>
          <button
            className="secondary-button"
            type="button"
            disabled={passwordBusy}
            onClick={() => setPasswordDraft(generateAccessPassword())}
          >{
            t("manager.generatePassword")
          }</button>
          <button
            className="primary-button"
            type="button"
            disabled={passwordBusy}
            onClick={() => void savePassword()}
          >
            {passwordBusy ? t("shared.status.savingDots") : t("auth.reset.submit")}
          </button>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="sync-success" style={{ marginTop: 12 }}>{message}</div>}
      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary-button" type="button" disabled={saving} onClick={save}>
          {saving ? t("shared.status.savingDots") : t("manager.saveClientDetails")}
        </button>
      </div>
    </section>
  );
}

function ClientCardMenu({ open, onToggle, onClose, items = [] }) {
  const { t } = useLocalization();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose?.();
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="client-card-menu" ref={menuRef}>
      <button
        className="client-card-menu-trigger"
        type="button"
        aria-label={t("manager.clientActions")}
        aria-expanded={open}
        onClick={onToggle}
      >
        ⋮
      </button>
      {open && (
        <div className="client-card-menu-panel" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              className={item.danger ? "client-card-menu-item danger" : "client-card-menu-item"}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                onClose?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManagerClients({
  clients,
  orders = [],
  products,
  setProducts,
  clientLinks,
  setClientLinks,
  dirtyClientLinkIdsRef,
  oneCPriceTypes = [],
  catalogPricesVersion = "",
  onReload,
}) {
  const { t } = useLocalization();
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [search, setSearch] = useState("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [defaultMarkupDrafts, setDefaultMarkupDrafts] = useState({});
  const [individualMarkupDrafts, setIndividualMarkupDrafts] = useState({});
  const [matrixSaveState, setMatrixSaveState] = useState({});
  const [matrixPricePreview, setMatrixPricePreview] = useState({});
  const [matrixPricesStatus, setMatrixPricesStatus] = useState({});
  /** idle | busy | review | done — блокирует «Сохранить матрицу» на время Excel-импорта */
  const [excelImportState, setExcelImportState] = useState({});
  const [oneCAddPanelOpen, setOneCAddPanelOpen] = useState({});
  const [cloverAddPanelOpen, setCloverAddPanelOpen] = useState({});
  /** Снимок id позиций матрицы — чтобы новые из Excel сразу были в списке. */
  const [matrixListSnapshot, setMatrixListSnapshot] = useState({});
  const snapshotClientRef = useRef("");
  /** Отмеченные в списке матрицы для удаления. Не равно составу матрицы. */
  const [matrixPickIds, setMatrixPickIds] = useState({});
  const [matrixWindowClientId, setMatrixWindowClientId] = useState("");
  const [openClientId, setOpenClientId] = useState("");
  const [approvalBusyId, setApprovalBusyId] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [profileOpenId, setProfileOpenId] = useState("");
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [provisionForm, setProvisionForm] = useState({
    companyName: "",
    contactName: "",
    phone: RUSSIAN_PHONE_PREFIX,
    email: "",
    password: "",
  });
  const [editorProduct, setEditorProduct] = useState(undefined);
  const restoredOpenClient = useRef(false);
  const [managerOptions, setManagerOptions] = useState([]);

  useEffect(() => {
    writeOpenManagerClientId("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.bootstrap();
        if (cancelled) return;
        setDeliveryZones(
          Array.isArray(data?.settings?.deliveryZones)
            ? data.settings.deliveryZones
            : []
        );
      } catch {
        if (!cancelled) setDeliveryZones([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.getStaffUsers();
        if (cancelled) return;
        const list = (Array.isArray(result.staff) ? result.staff : [])
          .filter(
            (item) =>
              String(item.role) === "manager" &&
              !item.disabled &&
              !item.disabledAt
          )
          .map((item) => ({
            id: String(item.id),
            label:
              String(item.fullName || "").trim() ||
              String(item.email || item.login || item.id),
            email: String(item.email || ""),
          }));
        setManagerOptions(list);
      } catch {
        if (!cancelled) setManagerOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!matrixWindowClientId) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setMatrixWindowClientId("");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [matrixWindowClientId]);

  const ordersByClientId = useMemo(() => {
    const map = {};
    for (const order of orders) {
      const clientId = order?.clientId;
      if (!clientId) continue;
      if (!map[clientId]) map[clientId] = [];
      map[clientId].push(order);
    }
    return map;
  }, [orders]);

  useEffect(() => {
    if (matrixWindowClientId || restoredOpenClient.current || !openClientId) return;
    const target = document.getElementById(`client-matrix-${openClientId}`);
    if (!target) return;

    restoredOpenClient.current = true;
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }, [openClientId, clients, matrixWindowClientId]);

  const openLink = openClientId ? clientLinks[openClientId] : null;
  const matrixPricesKey = openClientId
    ? [
        openClientId,
        openLink?.defaultPricingMode || "",
        openLink?.defaultMarkupPercent ?? "",
        openLink?.oneCPriceTypeId || "",
        openLink?.matrixMode || "",
        (openLink?.matrixProductIds || []).map(String).sort().join(","),
        Object.keys(openLink?.personalPrices || {}).length,
        String(catalogPricesVersion || ""),
      ].join(":")
    : "";

  useEffect(() => {
    if (!openClientId || !matrixPricesKey) return undefined;
    let cancelled = false;

    const loadPrices = async ({ silent = false } = {}) => {
      if (!silent) {
        setMatrixPricesStatus((current) => ({
          ...current,
          [openClientId]: { status: "loading" },
        }));
      }
      try {
        const result = await api.getClientMatrixPrices(openClientId);
        if (cancelled) return;
        const items = result.items || {};
        setMatrixPricePreview((current) => ({
          ...current,
          [openClientId]: items,
        }));
        setProducts((prev) => {
          let changed = false;
          const next = (Array.isArray(prev) ? prev : []).map((product) => {
            const row = items[String(product.id)];
            if (!row?.typed) return product;
            const typeId = String(result.priceTypeId || "").trim();
            if (!typeId) return product;
            const prevByType =
              product.salePricesByType && typeof product.salePricesByType === "object"
                ? product.salePricesByType
                : {};
            changed = true;
            return {
              ...product,
              salePricesByType: {
                ...prevByType,
                [typeId]: {
                  ...(prevByType[typeId] || {}),
                  ...row.typed,
                  priceTypeId: typeId,
                  receivedAt: row.salePriceReceivedAt || "",
                },
              },
              salePriceReceivedAt:
                row.salePriceReceivedAt || product.salePriceReceivedAt || "",
            };
          });
          return changed ? next : prev;
        });
        setMatrixPricesStatus((current) => ({
          ...current,
          [openClientId]: {
            status: "ok",
            count: Object.keys(items).length,
            priceTypeName: result.priceTypeName || "",
            missingPrices: Object.values(items).filter((row) => {
              const typed = row?.typed || {};
              return !Object.values(typed).some(
                (value) => Number(value) > 0
              ) && !(Number(row?.pricePiece) > 0);
            }).length,
          },
        }));
      } catch (error) {
        if (cancelled) return;
        setMatrixPricesStatus((current) => ({
          ...current,
          [openClientId]: {
            status: "error",
            message: error.message || "Не удалось загрузить цены",
          },
        }));
      }
    };

    // Debounce при пакетном Excel-добавлении.
    const timer = window.setTimeout(() => {
      void loadPrices({ silent: false });
    }, 350);

    // Пока матрица открыта — тихо подтягиваем цены после обмена с 1С.
    const poll = window.setInterval(() => {
      void loadPrices({ silent: true });
    }, 12000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [openClientId, matrixPricesKey, catalogPricesVersion, setProducts]);

  // Снимок состава матрицы: при смене клиента — замена, при правках — только рост.
  // Иначе снятие галочки сразу перезаписывает снимок и строка пропадает из списка.
  useEffect(() => {
    if (!openClientId) return;
    const ids = (clientLinks[openClientId]?.matrixProductIds || []).map(String);
    if (snapshotClientRef.current !== String(openClientId)) {
      snapshotClientRef.current = String(openClientId);
      setMatrixListSnapshot((current) => ({
        ...current,
        [openClientId]: ids,
      }));
      return;
    }
    setMatrixListSnapshot((current) => {
      const existing = Array.isArray(current[openClientId])
        ? current[openClientId]
        : [];
      const merged = growMatrixIdList(existing, ids);
      if (
        merged.length === existing.length &&
        merged.every((id, index) => String(id) === String(existing[index]))
      ) {
        return current;
      }
      return { ...current, [openClientId]: merged };
    });
  }, [openClientId, clientLinks]);

  const setApproval = async (client, status) => {
    setApprovalBusyId(client.id);
    try {
      await api.setClientApproval(client.id, status);
      await onReload();
    } catch (error) {
      await appAlert({ title: t("manager.accessError"), message: error.message, tone: "danger" });
    } finally {
      setApprovalBusyId("");
    }
  };

  const createClientAccess = async (event) => {
    event.preventDefault();
    const companyName = provisionForm.companyName.trim();
    const contactName = provisionForm.contactName.trim();
    const phone = provisionForm.phone.trim();
    const email = provisionForm.email.trim().toLowerCase();
    const password = provisionForm.password.trim();
    if (!companyName || !contactName || !phone || !email || password.length < 6) {
      await appAlert({
        title: t("manager.checkTheFields"),
        message: t("manager.fillInAllFieldsThePassword"),
        tone: "warn",
      });
      return;
    }
    setProvisionBusy(true);
    try {
      const result = await api.createClientAccess({
        companyName,
        contactName,
        phone,
        email,
        password,
      });
      if (result.clientLinks && typeof result.clientLinks === "object") {
        setClientLinks(result.clientLinks);
      }
      await onReload();
      setProvisionOpen(false);
      setProvisionForm({
        companyName: "",
        contactName: "",
        phone: RUSSIAN_PHONE_PREFIX,
        email: "",
        password: "",
      });
      if (result.client?.id) {
        writeOpenManagerClientId(String(result.client.id));
        setOpenClientId(String(result.client.id));
      }
    } catch (error) {
      await appAlert({
        title: "Не удалось создать клиента",
        message: error.message,
        tone: "danger",
      });
    } finally {
      setProvisionBusy(false);
    }
  };

  const visible = clients.filter((client) => {
    const needle = search.trim();
    if (!needle) return true;
    const link = clientLinks[client.id] || {};
    if (matchesTextSearch(buildClientSearchHaystack(client, link), needle)) {
      return true;
    }
    return (ordersByClientId[client.id] || []).some((order) =>
      matchesTextSearch(buildOrderSearchHaystack(order, link), needle)
    );
  });

  const updateLink = (clientId, patch) => {
    setClientLinks((current) => ({
      ...current,
      [clientId]: {
        ...EMPTY_LINK,
        ...(current[clientId] || {}),
        ...patch,
      },
    }));
    dirtyClientLinkIdsRef?.current?.add(clientId);
    setMatrixSaveState((current) => ({
      ...current,
      [clientId]: {
        status: "dirty",
        message:
          t("manager.youHaveUnsavedChangesTapSave"),
      },
    }));
  };

  const saveCatalogProduct = async (value) => {
    const normalized = normalizeProduct(value);
    const pageY = window.scrollY;
    try {
      const result = await api.saveProduct(normalized);
      const incoming =
        Array.isArray(result.products) && result.products.length
          ? result.products
          : result.product
            ? [result.product]
            : [normalized];
      setProducts((current) => mergeProductsFromCatalogResponse(current, incoming));
      setEditorProduct(undefined);
      restoreWindowScroll(pageY);
    } catch (error) {
      void appAlert({
        title: "Не удалось сохранить",
        message: t("manager.products.saveFailedNamed", { message: error.message }),
        tone: "danger",
      });
    }
  };

  const deleteCatalogProduct = async (product) => {
    if (!product?.id) return;
    const ok = await appConfirm({
      title: t("manager.deleteTheProductFromTheCatalog"),
      message: t("manager.products.deleteNamed", {
        name: product.name || t("storefront.product"),
      }),
      confirmLabel: t("shared.action.delete"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      const result = await api.deleteProduct(product.id);
      setProducts((result.products || []).map(normalizeProduct));
      if (result.clientLinks && typeof result.clientLinks === "object") {
        setClientLinks(result.clientLinks);
      }
      setEditorProduct(undefined);
    } catch (error) {
      void appAlert({
        title: "Не удалось удалить",
        message: error.message || "Не удалось удалить товар.",
        tone: "danger",
      });
    }
  };

  const updatePersonalPrice = (
    clientId,
    link,
    productId,
    patch,
    product = null
  ) => {
    const key = String(productId);
    const currentPrice = {
      source: "inherit",
      ...(link.personalPrices?.[key] || {}),
    };

    let nextPrice = {
      ...currentPrice,
      ...patch,
    };

    if (nextPrice.source === "manual" && product) {
      nextPrice = prefillManualPriceFromProduct(product, nextPrice);
    }

    const nextPrices = {
      ...(link.personalPrices || {}),
    };

    if (nextPrice.source === "inherit") {
      delete nextPrices[key];
      setIndividualMarkupDrafts((current) => {
        const clientDrafts = { ...(current[clientId] || {}) };
        delete clientDrafts[key];
        const next = { ...current };
        if (Object.keys(clientDrafts).length) next[clientId] = clientDrafts;
        else delete next[clientId];
        return next;
      });
    } else {
      nextPrices[key] = nextPrice;
    }

    updateLink(clientId, {
      personalPrices: nextPrices,
    });
  };

  const parsePriceInput = (value) =>
    value === "" ? null : Math.max(0, Number(value) || 0);

  const normalizePercentInput = (value) => {
    if (value === "" || value === null || value === undefined) return 0;
    return Math.max(0, Number(value) || 0);
  };

  const getDefaultMarkupDraft = (clientId, link) =>
    Object.prototype.hasOwnProperty.call(defaultMarkupDrafts, clientId)
      ? defaultMarkupDrafts[clientId]
      : String(link.defaultMarkupPercent ?? "");

  const getIndividualMarkupDraft = (clientId, productId, price) => {
    const clientDrafts = individualMarkupDrafts[clientId] || {};
    const key = String(productId);
    return Object.prototype.hasOwnProperty.call(clientDrafts, key)
      ? clientDrafts[key]
      : String(price.markupPercent ?? "");
  };

  const saveClientMatrix = async (clientId, link) => {
    setMatrixSaveState((current) => ({
      ...current,
      [clientId]: { status: "saving", message: t("manager.savingTheMatrix") },
    }));

    const nextLink = {
      ...link,
      defaultMarkupPercent: normalizePercentInput(
        getDefaultMarkupDraft(clientId, link)
      ),
      personalPrices: { ...(link.personalPrices || {}) },
      // Полный снимок выбранных id. Не фильтруем по локальному каталогу и не
      // схлопываем по имени — иначе только что загруженные позиции пропадают.
      matrixProductIds: uniqueMatrixProductIds(link.matrixProductIds || []),
    };

    const productDrafts = individualMarkupDrafts[clientId] || {};
    for (const [productId, rawValue] of Object.entries(productDrafts)) {
      const currentPrice = nextLink.personalPrices[productId];
      if (currentPrice?.source === "purchase_markup") {
        nextLink.personalPrices[productId] = {
          ...currentPrice,
          markupPercent: normalizePercentInput(rawValue),
        };
      }
    }

    const productsById = new Map(
      (Array.isArray(products) ? products : []).map((item) => [
        String(item.id),
        item,
      ])
    );
    for (const [productId, config] of Object.entries(nextLink.personalPrices)) {
      if (config?.source !== "manual") continue;
      const product = productsById.get(String(productId));
      if (!product) continue;
      const filled = prefillManualPriceFromProduct(product, config);
      if (!hasManualUnitValue(filled)) {
        setMatrixSaveState((current) => ({
          ...current,
          [clientId]: {
            status: "error",
            message:
              t("manager.clients.fixedPriceMissing", { name: product.name }),
          },
        }));
        return;
      }
      nextLink.personalPrices[productId] = filled;
    }

    const nextLinks = {
      ...clientLinks,
      [clientId]: nextLink,
    };

    try {
      setClientLinks(nextLinks);
      const saved = await api.saveClientLinks(nextLinks);
      if (saved?.clientLinks && typeof saved.clientLinks === "object") {
        // Берём сохранённую матрицу клиента целиком — иначе bootstrap/merge
        // может вернуть устаревший полный словарь со старыми id.
        const savedLink = saved.clientLinks[clientId];
        setClientLinks((current) => ({
          ...current,
          ...(saved.clientLinks || {}),
          [clientId]: savedLink
            ? {
                ...EMPTY_LINK,
                ...savedLink,
                matrixProductIds: Array.isArray(savedLink.matrixProductIds)
                  ? savedLink.matrixProductIds
                  : [],
              }
            : {
                ...EMPTY_LINK,
                ...(current[clientId] || {}),
                ...nextLink,
              },
        }));
        const savedIds = savedLink?.matrixProductIds;
        setMatrixListSnapshot((current) => ({
          ...current,
          [clientId]: Array.isArray(savedIds) ? savedIds.map(String) : [],
        }));
      } else {
        setMatrixListSnapshot((current) => ({
          ...current,
          [clientId]: (nextLink.matrixProductIds || []).map(String),
        }));
      }
      setMatrixPickIds((current) => ({
        ...current,
        [clientId]: [],
      }));
      setDefaultMarkupDrafts((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
      setIndividualMarkupDrafts((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
      dirtyClientLinkIdsRef?.current?.delete(clientId);
      setMatrixSaveState((current) => ({
        ...current,
        [clientId]: { status: "saved", message: t("manager.matrixSaved") },
      }));
      try {
        const preview = await api.getClientMatrixPrices(clientId);
        setMatrixPricePreview((current) => ({
          ...current,
          [clientId]: preview.items || {},
        }));
      } catch {
        /* ignore */
      }
    } catch (error) {
      setMatrixSaveState((current) => ({
        ...current,
        [clientId]: {
          status: "error",
          message: error.message || "Не удалось сохранить матрицу.",
        },
      }));
    }
  };

  return (
    <PanelErrorBoundary label={t("manager.clientsSectionError")}>
    <section>
      <div className="toolbar two manager-clients-toolbar">
        <div className="manager-search-block">
          <input
            type="search"
            placeholder={t("manager.searchByClientOrderTaxId")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("manager.searchByClientOrderTaxId")}
          />
        </div>
        <div className="mini-card">
          <span className="mini-label">{t("manager.clients")}</span>
          <strong>{clients.length}</strong>
        </div>
      </div>

      <div className="approval-box" style={{ marginTop: 12 }}>
        <div>
          <strong>{t("manager.createClientAccess")}</strong>
          <p>{
            t("manager.createTheLoginAndPasswordYourself")
          }</p>
        </div>
        <div className="inline-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setProvisionOpen((current) => !current);
              if (!provisionForm.password) {
                setProvisionForm((current) => ({
                  ...current,
                  password: generateAccessPassword(),
                }));
              }
            }}
          >
            {provisionOpen ? t("manager.hideForm") : t("manager.createClientAccess")}
          </button>
        </div>
      </div>

      {provisionOpen ? (
        <form className="client-profile-panel" onSubmit={createClientAccess} style={{ marginTop: 12 }}>
          <div className="form-grid">
            <label className="field">{
              t("checkout.company")
              }<input
                value={provisionForm.companyName}
                onChange={(event) =>
                  setProvisionForm((current) => ({
                    ...current,
                    companyName: event.target.value,
                  }))
                }
                required
                disabled={provisionBusy}
              />
            </label>
            <label className="field">{
              t("auth.register.contact")
              }<input
                value={provisionForm.contactName}
                onChange={(event) =>
                  setProvisionForm((current) => ({
                    ...current,
                    contactName: event.target.value,
                  }))
                }
                required
                disabled={provisionBusy}
              />
            </label>
            <label className="field">{
              t("auth.register.phone")
              }<input
                type="tel"
                value={provisionForm.phone}
                onChange={(event) =>
                  setProvisionForm((current) => ({
                    ...current,
                    phone: formatRussianPhone(event.target.value),
                  }))
                }
                required
                disabled={provisionBusy}
              />
            </label>
            <label className="field">{
              t("manager.loginEmail")
              }<input
                type="email"
                value={provisionForm.email}
                onChange={(event) =>
                  setProvisionForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
                disabled={provisionBusy}
              />
            </label>
            <label className="field">{
              t("auth.login.password")
              }<input
                type="text"
                autoComplete="new-password"
                value={provisionForm.password}
                onChange={(event) =>
                  setProvisionForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                required
                minLength={6}
                disabled={provisionBusy}
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button
              className="secondary-button"
              type="button"
              disabled={provisionBusy}
              onClick={() =>
                setProvisionForm((current) => ({
                  ...current,
                  password: generateAccessPassword(),
                }))
              }
            >{
              t("manager.generatePassword")
            }</button>
            <button className="primary-button" type="submit" disabled={provisionBusy}>
              {provisionBusy ? t("manager.creating") : t("manager.createAndGrantAccess")}
            </button>
          </div>
        </form>
      ) : null}

      {visible.length ? (
        <div className="client-list">
          {visible.map((client) => {
            const rawLink = {
              ...EMPTY_LINK,
              ...(clientLinks[client.id] || {}),
            };
            const link = {
              ...rawLink,
              matrixProductIds: Array.isArray(rawLink.matrixProductIds)
                ? rawLink.matrixProductIds
                : [],
              personalPrices:
                rawLink.personalPrices && typeof rawLink.personalPrices === "object"
                  ? { ...rawLink.personalPrices }
                  : {},
            };
            const matrixProductIds = link.matrixProductIds;
            const matrixIdSet = new Set(matrixProductIds.map(String));
            const snapshotIds = Array.isArray(matrixListSnapshot[client.id])
              ? matrixListSnapshot[client.id]
              : [];
            const pickedIds = Array.isArray(matrixPickIds[client.id])
              ? matrixPickIds[client.id]
              : [];
            const pickedSet = new Set(pickedIds.map(String));
            // Список матрицы = состав матрицы. Галочки — отдельный выбор на удаление.
            const displayIdSet = matrixIdSet;
            const matrixOpen = String(openClientId) === String(client.id);
            const matrixWindowOpen =
              String(matrixWindowClientId) === String(client.id);
            const searchQuery =
              matrixOpen || matrixWindowOpen
                ? String(matrixSearch || "").trim()
                : "";
            const matrixProductsRaw = (Array.isArray(products) ? products : []).filter(
              (product) => {
                if (product.active === false) return false;
                if (
                  link.matrixMode === "selected" &&
                  displayIdSet.size > 0 &&
                  !displayIdSet.has(String(product.id))
                ) {
                  return false;
                }
                if (
                  link.matrixMode === "selected" &&
                  displayIdSet.size === 0
                ) {
                  return false;
                }
                if (!searchQuery) return true;
                return matchesCatalogPrefixSearch(
                  productCatalogSearchHaystack(product, { includeAdminFields: true }),
                  searchQuery
                );
              }
            );
            // В списке матрицы убираем только полные дубли по oneCId (не по имени),
            // чтобы новый товар из Excel не пропадал из поиска.
            const matrixProducts = (() => {
              const preferred = new Set(matrixProductIds.map(String));
              const seenOneC = new Set();
              const seenId = new Set();
              const ordered = [...matrixProductsRaw].sort((a, b) => {
                const ap = preferred.has(String(a.id)) ? 0 : 1;
                const bp = preferred.has(String(b.id)) ? 0 : 1;
                return ap - bp;
              });
              const result = [];
              for (const product of ordered) {
                const id = String(product.id);
                if (seenId.has(id)) continue;
                const oneCId = String(product.oneCId || "").trim();
                if (oneCId) {
                  if (seenOneC.has(oneCId)) continue;
                  seenOneC.add(oneCId);
                }
                seenId.add(id);
                result.push(product);
              }
              return result;
            })();
            const matrixExportProducts = (() => {
              if (link.matrixMode === "all") {
                return (Array.isArray(products) ? products : []).filter(
                  (item) => item.active !== false
                );
              }
              const byId = new Map(
                (Array.isArray(products) ? products : []).map((item) => [
                  String(item.id),
                  item,
                ])
              );
              const list = [];
              const seen = new Set();
              for (const raw of matrixProductIds) {
                const id = String(raw);
                if (seen.has(id)) continue;
                const product = byId.get(id);
                if (!product || product.active === false) continue;
                seen.add(id);
                list.push(product);
              }
              return list;
            })();
            const personalPriceCount = Object.keys(
              link.personalPrices || {}
            ).length;

            return (
              <article className="client-card" key={client.id} id={`client-card-${client.id}`}>
                <div className="client-card-header">
                  <div>
                    <span
                      className={
                        link.matched1C
                          ? "badge green"
                          : "badge yellow"
                      }
                    >
                      {link.matched1C
                        ? t("manager.linkedTo1c")
                        : t("manager.notMatched")}
                    </span>
                    <h3>
                      {client.companyName || t("manager.untitledClient")}
                    </h3>
                    <p className="muted small">{client.email}</p>
                    {(() => {
                      const contacts = normalizeProfileContacts({
                        companyName: client.companyName || "",
                        contactName: client.contactName || "",
                        phone: client.phone || "",
                        email: client.email || "",
                        contacts: Array.isArray(client.contacts) ? client.contacts : [],
                      }).contacts;
                      if (!contacts.length) {
                        return client.contactName || client.phone ? (
                          <p className="muted small">
                            {client.contactName} · {client.phone}
                          </p>
                        ) : null;
                      }
                      return (
                        <div className="client-card-contacts">
                          {contacts.map((item) => (
                            <p className="muted small client-card-contact-row" key={item.id}>
                              <span className={item.isPrimary ? "badge green" : "badge yellow"}>
                                {addressLabel(
                                  item.isPrimary ? "Основной" : item.label || "Дополнительный",
                                  t
                                )}
                              </span>
                              <span>
                                {[item.name, item.phone].filter(Boolean).join(" · ") || "—"}
                              </span>
                            </p>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="client-card-header-actions">
                    <strong>{t("manager.clients.ordersCount", { count: client.orders.length })}</strong>
                    <ClientCardMenu
                      open={String(openMenuId) === String(client.id)}
                      onToggle={() =>
                        setOpenMenuId((current) =>
                          String(current) === String(client.id) ? "" : client.id
                        )
                      }
                      onClose={() => setOpenMenuId("")}
                      items={[
                        ...(client.isRegistered !== false
                          ? [
                              {
                                id: "profile",
                                label: t("manager.clientDetails"),
                                onSelect: () => {
                                  setProfileOpenId(client.id);
                                  window.setTimeout(() => {
                                    document
                                      .getElementById(`client-profile-${client.id}`)
                                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                  }, 50);
                                },
                              },
                            ]
                          : []),
                        {
                          id: "matrix",
                          label: t("client.matrix.short"),
                          onSelect: () => {
                            restoredOpenClient.current = true;
                            setOpenClientId(client.id);
                            setMatrixWindowClientId(String(client.id));
                          },
                        },
                        ...(client.isRegistered !== false &&
                        client.approvalStatus === "approved"
                          ? [
                              {
                                id: "block",
                                label: t("manager.blockAccess"),
                                danger: true,
                                disabled: approvalBusyId === client.id,
                                onSelect: async () => {
                                  const ok = await appConfirm({
                                    title: t("manager.blockAccess2"),
                                    message:
                                      t("manager.blockThisClientSAccessThey"),
                                    confirmLabel: t("manager.block"),
                                    cancelLabel: t("shared.modal.cancel"),
                                    tone: "danger",
                                  });
                                  if (ok) {
                                    setApproval(client, "rejected");
                                  }
                                },
                              },
                            ]
                          : []),
                        ...(client.isRegistered !== false &&
                        client.approvalStatus === "rejected"
                          ? [
                              {
                                id: "allow",
                                label: t("manager.allowAccess"),
                                disabled:
                                  approvalBusyId === client.id ||
                                  !client.emailVerified,
                                onSelect: () => setApproval(client, "approved"),
                              },
                            ]
                          : []),
                        ...(client.isRegistered !== false
                          ? [
                              {
                                id: "delete",
                                label: t("manager.deleteClient"),
                                danger: true,
                                onSelect: async () => {
                                  const ok = await appConfirm({
                                    title: t("manager.deleteTheClient"),
                                    message: t("manager.clients.deleteNamed", {
                                      name:
                                        client.companyName ||
                                        client.email ||
                                        t("manager.client2"),
                                    }),
                                    confirmLabel: t("manager.deleteClient"),
                                    cancelLabel: t("shared.modal.cancel"),
                                    tone: "danger",
                                  });
                                  if (!ok) return;
                                  try {
                                    const result = await api.deleteClient(client.id);
                                    if (result.clientLinks) {
                                      setClientLinks(result.clientLinks);
                                    }
                                    if (String(openClientId) === String(client.id)) {
                                      setOpenClientId("");
                                      writeOpenManagerClientId("");
                                    }
                                    if (String(profileOpenId) === String(client.id)) {
                                      setProfileOpenId("");
                                    }
                                    await onReload();
                                    await appAlert({
                                      title: t("manager.clientDeleted"),
                                      message: result.message || t("manager.theClientAccountHasBeenDeleted"),
                                      tone: "success",
                                    });
                                  } catch (deleteError) {
                                    await appAlert({
                                      title: "Не удалось удалить",
                                      message:
                                        deleteError.message || t("manager.failedToDeleteTheClient"),
                                      tone: "danger",
                                    });
                                  }
                                },
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>

                <div className="client-metrics">
                  <article>
                    <span>{t("manager.orders")}</span>
                    <strong>{client.orders.length}</strong>
                  </article>
                  <article>
                    <span>{t("manager.active3")}</span>
                    <strong>
                      {
                        client.orders.filter(
                          (order) =>
                            !["Выполнен", "Отменён"].includes(
                              order.status
                            )
                        ).length
                      }
                    </strong>
                  </article>
                  <article>
                    <span>{t("manager.productsInTheMatrix")}</span>
                    <strong>
                      {link.matrixMode === "all"
                        ? products.filter((item) => item.active !== false).length
                        : matrixProductIds.length}
                    </strong>
                  </article>
                  <article>
                    <span>{t("manager.personalPrices")}</span>
                    <strong>{personalPriceCount}</strong>
                  </article>
                </div>

                {client.isRegistered !== false && client.approvalStatus === "pending" && (
                  <div className="approval-box">
                    <div>
                      <strong>{t("manager.newRegistration")}</strong>
                      <p>
                        {client.emailVerified
                          ? t("manager.emailIsConfirmedYouCanAllow")
                          : t("manager.theClientMustConfirmTheEmail")}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={approvalBusyId === client.id || !client.emailVerified}
                        onClick={() => setApproval(client, "approved")}
                      >{
                        t("manager.allowSignIn")
                      }</button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={approvalBusyId === client.id}
                        onClick={async () => {
                          const ok = await appConfirm({
                            title: t("manager.rejectRegistration"),
                            message:
                              t("manager.rejectRegistrationTheClientCannotSign"),
                            confirmLabel: t("manager.reject"),
                            cancelLabel: t("shared.modal.cancel"),
                            tone: "danger",
                          });
                          if (ok) {
                            setApproval(client, "rejected");
                          }
                        }}
                      >{
                        t("manager.reject")
                      }</button>
                    </div>
                  </div>
                )}

                {client.isRegistered !== false && client.approvalStatus === "rejected" && (
                  <div className="approval-box approval-box-rejected">
                    <div>
                      <strong>{t("manager.signInBlocked")}</strong>
                      <p>{t("manager.theClientCannotSignInTo")}</p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={approvalBusyId === client.id || !client.emailVerified}
                        onClick={() => setApproval(client, "approved")}
                      >{
                        t("manager.allowSignIn")
                      }</button>
                    </div>
                  </div>
                )}

                {client.isRegistered !== false &&
                String(profileOpenId) === String(client.id) ? (
                  <ManagerClientEditor
                    client={client}
                    link={link}
                    deliveryZones={deliveryZones}
                    onLinkChange={(patch) => {
                      setClientLinks((current) => ({
                        ...current,
                        [client.id]: {
                          ...EMPTY_LINK,
                          ...(current[client.id] || {}),
                          ...patch,
                        },
                      }));
                    }}
                    onReload={onReload}
                    onClose={() => setProfileOpenId("")}
                  />
                ) : null}

                {client.isRegistered === false && (
                  <div className="matrix-catalog-note" style={{ marginTop: 15 }}>{
                    t("manager.thisIsAClientFromAn")
                  }</div>
                )}

                {matrixWindowOpen && (
                  <PanelErrorBoundary label={t("manager.clientMatrixBlockError")}>
                  {(() => {
                    const pricingLabel =
                      link.defaultPricingMode === "purchase_markup"
                        ? t("manager.clients.markupPercent", {
                            percent: normalizePercentInput(getDefaultMarkupDraft(client.id, link)),
                          }) +
                          (link.oneCPriceTypeName
                            ? ` · ${link.oneCPriceTypeName}`
                            : "")
                        : link.defaultPricingMode === "one_c_price_type"
                          ? link.oneCPriceTypeName || t("manager.oneC.priceType")
                          : t("manager.cloverBasePrice");
                    const modeLabel =
                      link.matrixMode === "all"
                        ? t("manager.allProducts")
                        : link.matrixMode === "selected"
                          ? t("manager.selectedProducts")
                          : t("manager.matrixIsNotReady");

                    return (
                      <>
                  {matrixWindowOpen && typeof document !== "undefined"
                    ? createPortal(
                        <div
                          className="matrix-window"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby={`matrix-window-title-${client.id}`}
                          onClick={() => setMatrixWindowClientId("")}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setMatrixWindowClientId("");
                            }
                          }}
                        >
                          <div
                            className="matrix-window-card"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="matrix-window-head">
                              <div>
                                <p className="eyebrow">{t("client.matrix.short")}</p>
                                <h3 id={`matrix-window-title-${client.id}`}>
                                  {client.companyName || t("manager.untitledClient")}
                                </h3>
                              </div>
                              <div className="matrix-window-head-actions">
                                <button
                                  className="secondary-button"
                                  type="button"
                                  disabled={
                                    link.matrixMode === "pending" ||
                                    matrixExportProducts.length === 0
                                  }
                                  onClick={() => {
                                    downloadClientMatrixExcel({
                                      clientName: client.companyName,
                                      products: matrixExportProducts,
                                      t,
                                    });
                                  }}
                                >{
                                  t("manager.downloadExcel")
                                }</button>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => setMatrixWindowClientId("")}
                                >{
                                  t("shared.action.close")
                                }</button>
                              </div>
                            </div>
                            <div className="matrix-window-body">
                  <div className="client-matrix-toolbar">
                    <div className="client-matrix-toolbar-meta">
                      <span className="badge green">{modeLabel}</span>
                      <span className="muted small">{pricingLabel}</span>
                      {link.oneCId ? (
                        <span className="muted small">
                          {t("manager.clients.oneCNamed", {
                            name: link.oneCName || link.oneCCode || t("manager.linked"),
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {matrixSaveState[client.id]?.message && (
                    <span
                      className={`matrix-save-message ${
                        matrixSaveState[client.id]?.status || ""
                      }`}
                      style={{ display: "block", marginTop: 8 }}
                    >
                      {matrixSaveState[client.id].message}
                    </span>
                  )}

                  <div className="form-grid" style={{ marginTop: 12 }}>
                    <label className="field">{
                      t("manager.personalManager")
                      }<select
                        value={String(link.personalManagerId || "")}
                        onChange={(event) =>
                          updateLink(client.id, {
                            personalManagerId: event.target.value,
                          })
                        }
                      >
                        <option value="">{t("manager.notAssignedSharedContact")}</option>
                        {managerOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                            {item.email && item.label !== item.email
                              ? ` · ${item.email}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <details className="client-matrix-settings" open={link.matrixMode === "pending"}>
                      <summary>{t("manager.clients.oneCAndPrices")}</summary>
                      <p className="muted small" style={{ marginTop: 0 }}>{
                        t("manager.matrixModePriceTypeAndMarkup")
                      }</p>
                      {link.oneCId ? (
                        <p className="muted small">
                          {t("manager.clients.counterparty1c", {
                            name: link.oneCName || link.oneCCode || t("manager.linked"),
                          })}
                        </p>
                      ) : (
                        <p className="muted small">{
                          t("manager.clients.oneCCounterpartyMissing")
                        }</p>
                      )}

                      <div className="form-grid" style={{ marginTop: 14 }}>
                        <label className="field">{
                          t("manager.exactNameIn1cOptional")
                          }<input
                            value={link.oneCMatchName || ""}
                            placeholder={client.companyName || t("manager.counterpartyName")}
                            onChange={(event) =>
                              updateLink(client.id, {
                                oneCMatchName: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="field">{
                          t("manager.tinForExactMatching")
                          }<input
                            value={link.oneCMatchInn || ""}
                            inputMode="numeric"
                            onChange={(event) =>
                              updateLink(client.id, {
                                oneCMatchInn: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="field">{
                          t("manager.counterpartyCodeIn1cOptional")
                          }<input
                            value={link.oneCMatchCode || ""}
                            onChange={(event) =>
                              updateLink(client.id, {
                                oneCMatchCode: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="field">{
                          t("manager.productMatrixMode")
                          }<select
                            value={link.matrixMode}
                            onChange={(event) =>
                              updateLink(client.id, {
                                matrixMode: event.target.value,
                              })
                            }
                          >
                            <option value="pending">{t("manager.matrixIsBeingPrepared")}</option>
                            <option value="selected">{t("manager.selectedProductsOnly")}</option>
                            <option value="all">{t("manager.allActiveProducts")}</option>
                          </select>
                        </label>

                        <label className="field">{
                          t("manager.fullCatalogForTheClient")
                          }<select
                            value={link.allowFullCatalog ? "yes" : "no"}
                            onChange={(event) =>
                              updateLink(client.id, {
                                allowFullCatalog: event.target.value === "yes",
                              })
                            }
                          >
                            <option value="no">{t("manager.hiddenMatrixOnly")}</option>
                            <option value="yes">{t("manager.allowViewing")}</option>
                          </select>
                        </label>
                      </div>

                      <div className="client-pricing-panel" style={{ marginTop: 14 }}>
                        <label className="field">{
                          t("manager.clients.oneCPriceType")
                          }<select
                            value={link.oneCPriceTypeId || ""}
                            onChange={(event) => {
                              const nextId = event.target.value;
                              const selected = (oneCPriceTypes || []).find(
                                (item) => String(item.id) === String(nextId)
                              );
                              const keepMarkup =
                                link.defaultPricingMode === "purchase_markup" ||
                                Number(link.defaultMarkupPercent) > 0;
                              updateLink(client.id, {
                                oneCPriceTypeId: nextId,
                                oneCPriceTypeName: selected?.name || "",
                                defaultPricingMode: nextId
                                  ? keepMarkup
                                    ? "purchase_markup"
                                    : "one_c_price_type"
                                  : keepMarkup
                                    ? "purchase_markup"
                                    : link.defaultPricingMode === "one_c_price_type"
                                      ? "base"
                                      : link.defaultPricingMode || "base",
                              });
                            }}
                          >
                            <option value="">{t("manager.notSet")}</option>
                            {(oneCPriceTypes || []).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name || t("manager.untitled")}
                              </option>
                            ))}
                          </select>
                          <small>{
                            t("manager.forMarkupThePurchasePriceType")
                          }</small>
                        </label>

                        <label className="field">{
                          t("manager.defaultMatrixPrice")
                          }<select
                            value={link.defaultPricingMode || "base"}
                            onChange={(event) => {
                              const mode = event.target.value;
                              updateLink(client.id, {
                                defaultPricingMode: mode,
                                ...(mode === "one_c_price_type"
                                  ? { defaultMarkupPercent: 0 }
                                  : {}),
                              });
                            }}
                          >
                            <option value="base">{t("manager.cloverBasePrice")}</option>
                            <option value="purchase_markup">{
                              t("manager.categoryPurchaseMarkup")
                            }</option>
                            <option
                              value="one_c_price_type"
                              disabled={
                                !link.oneCPriceTypeId &&
                                !(oneCPriceTypes || []).length
                              }
                            >{
                              t("manager.clients.oneCPriceTypeNoMarkup")
                            }</option>
                          </select>
                          <small>{
                            t("manager.markupPriceTypeOrPurchase1")
                          }</small>
                        </label>

                        {(link.defaultPricingMode === "purchase_markup" ||
                          Number(link.defaultMarkupPercent) > 0) && (
                          <label className="field client-markup-field">{
                            t("manager.clientMarkup")
                            }<input
                              type="number"
                              min="0"
                              max="10000"
                              step="0.1"
                              value={getDefaultMarkupDraft(client.id, link)}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDefaultMarkupDrafts((current) => ({
                                  ...current,
                                  [client.id]: value,
                                }));
                                updateLink(client.id, {
                                  defaultMarkupPercent: normalizePercentInput(value),
                                  defaultPricingMode: "purchase_markup",
                                });
                              }}
                            />
                            <small>{
                              t("manager.example654756874")
                            }</small>
                          </label>
                        )}
                      </div>

                      <label className="field matrix-manager-note">{
                        t("manager.matrixNote")
                        }<textarea
                          rows="2"
                          value={link.managerNote}
                          placeholder={t("manager.brieflyMatrixNotesOr1cLink")}
                          onChange={(event) =>
                            updateLink(client.id, {
                              managerNote: event.target.value,
                            })
                          }
                        />
                        <small>{t("manager.managersOnly")}</small>
                      </label>
                    </details>

                  {link.matrixMode === "pending" ? (
                    <div className="matrix-catalog-note pending" style={{ marginTop: 14 }}>{
                      t("manager.chooseTheMatrixModeAboveThen")
                    }</div>
                  ) : (
                    <div className="client-matrix-products">
                      <div className="matrix-add-compact">
                      <MatrixOneCProductAdd
                        clientId={client.id}
                        link={link}
                        products={products}
                        setProducts={setProducts}
                        setClientLinks={setClientLinks}
                        onPanelChange={(open) => {
                          setOneCAddPanelOpen((current) => ({
                            ...current,
                            [client.id]: Boolean(open),
                          }));
                        }}
                        onExcelImportStateChange={(state) => {
                          const next =
                            state && typeof state === "object"
                              ? state
                              : { status: "idle" };
                          setExcelImportState((current) => ({
                            ...current,
                            [client.id]: next,
                          }));
                        }}
                        onAfterAdd={() => {
                          // Сбрасываем поиск, чтобы новый товар из Excel сразу был виден в списке.
                          setMatrixSearch("");
                        }}
                      />
                      <MatrixCloverCatalogAdd
                        clientId={client.id}
                        link={link}
                        products={products}
                        onPanelChange={(open) => {
                          setCloverAddPanelOpen((current) => ({
                            ...current,
                            [client.id]: Boolean(open),
                          }));
                        }}
                        onAddToMatrix={(ids) => {
                          const nextIds = uniqueMatrixProductIds([
                            ...(matrixProductIds || []),
                            ...(Array.isArray(ids) ? ids : []),
                          ]);
                          setMatrixListSnapshot((current) => ({
                            ...current,
                            [client.id]: growMatrixIdList(
                              current[client.id],
                              nextIds
                            ),
                          }));
                          updateLink(client.id, {
                            matrixMode:
                              link.matrixMode === "all" ? "all" : "selected",
                            matrixProductIds: nextIds,
                          });
                          setMatrixSearch("");
                        }}
                      />
                      </div>
                      {!oneCAddPanelOpen[client.id] &&
                      !cloverAddPanelOpen[client.id] ? (
                      <div className="client-matrix-search-bar">
                        <input
                          type="search"
                          className="client-matrix-search-input"
                          placeholder={t("manager.searchProductsInTheMatrix")}
                          value={matrixSearch}
                          onChange={(event) =>
                            setMatrixSearch(event.target.value)
                          }
                        />
                        {link.oneCPriceTypeName || link.oneCPriceTypeId ? (
                          <span className="client-matrix-price-chip">
                            {link.oneCPriceTypeName || t("manager.oneC.priceType")}
                            {link.defaultPricingMode === "purchase_markup"
                              ? ` · +${normalizePercentInput(getDefaultMarkupDraft(client.id, link))}%`
                              : ""}
                          </span>
                        ) : (
                          <span className="client-matrix-price-chip muted">{
                            t("manager.priceCategoryIsNotSet")
                          }</span>
                        )}
                        {matrixPricesStatus[client.id]?.status === "ok" &&
                          Number(matrixPricesStatus[client.id]?.missingPrices) >
                            0 && (
                          <span className="client-matrix-price-chip muted">
                            {t("manager.clients.missingPriceWaitRefresh", {
                              count: matrixPricesStatus[client.id].missingPrices,
                            })}
                          </span>
                        )}
                        {matrixPricesStatus[client.id]?.status === "loading" && (
                          <span className="client-matrix-price-chip muted">{
                            t("manager.loadingPrices")
                          }</span>
                        )}
                        {matrixPricesStatus[client.id]?.status === "error" && (
                          <button
                            type="button"
                            className="client-matrix-price-chip danger-text"
                            style={{ cursor: "pointer", border: "1px solid #e8c4c4", background: "#fff5f5" }}
                            onClick={() => {
                              // Триггерим refetch сменой ключа через touch openClientId.
                              setMatrixPricePreview((current) => {
                                const next = { ...current };
                                delete next[client.id];
                                return next;
                              });
                              setOpenClientId("");
                              window.requestAnimationFrame(() => {
                                setOpenClientId(String(client.id));
                              });
                            }}
                          >
                            {t("manager.clients.retryWithMessage", {
                              message: matrixPricesStatus[client.id]?.message || t("manager.priceError"),
                            })}
                          </button>
                        )}
                      </div>
                      ) : null}

                      <div className="matrix-summary">
                        <span>
                          {link.matrixMode === "all"
                            ? t("manager.clients.matrixProductCount", {
                                count: products.filter((item) => item.active).length,
                              })
                            : t("manager.clients.matrixSelectedCount", { count: matrixProductIds.length })}
                        </span>
                        <span>
                          {t("manager.clients.personalExceptionsCount", { count: personalPriceCount })}
                        </span>
                        {link.matrixMode === "selected" ? (
                          <span className="muted small">{
                            t("manager.theCheckboxSelectsItemsToRemove")
                          }</span>
                        ) : null}
                      </div>
                      {link.matrixMode === "selected" && (
                        <div className="matrix-pick-actions">
                          <span>{t("manager.markedCount", { count: pickedIds.length })}</span>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => {
                              const visibleIds = matrixProducts.map(
                                (product) => String(product.id)
                              );
                              setMatrixPickIds((current) => ({
                                ...current,
                                [client.id]: uniqueMatrixProductIds([
                                  ...(current[client.id] || []),
                                  ...visibleIds,
                                ]).map(String),
                              }));
                            }}
                          >{
                            t("shared.action.selectAll")
                          }</button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => {
                              setMatrixPickIds((current) => ({
                                ...current,
                                [client.id]: [],
                              }));
                            }}
                          >{
                            t("shared.action.clearAll")
                          }</button>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={pickedIds.length === 0}
                            onClick={() => {
                              if (!pickedIds.length) return;
                              const nextIds = idsWithout(
                                matrixProductIds,
                                pickedIds
                              );
                              setMatrixListSnapshot((current) => ({
                                ...current,
                                [client.id]: idsWithout(
                                  current[client.id] || snapshotIds,
                                  pickedIds
                                ),
                              }));
                              setMatrixPickIds((current) => ({
                                ...current,
                                [client.id]: [],
                              }));
                              updateLink(client.id, {
                                matrixMode: "selected",
                                matrixProductIds: nextIds,
                              });
                            }}
                          >{
                            t("manager.removeSelectedFromTheMatrix")
                          }</button>
                        </div>
                      )}

                      <div className="matrix-editor-list">
                        {matrixProducts.map((product) => {
                          const price =
                            link.personalPrices?.[String(product.id)] || {};
                          const picked = pickedSet.has(String(product.id));
                          const priceMode = ["manual", "purchase_markup"].includes(
                            price.source
                          )
                            ? price.source
                            : "inherit";
                          const effectiveMode =
                            priceMode === "inherit"
                              ? link.defaultPricingMode || "base"
                              : priceMode;
                          const markupPercent =
                            priceMode === "purchase_markup"
                              ? normalizePercentInput(
                                  getIndividualMarkupDraft(
                                    client.id,
                                    product.id,
                                    price
                                  )
                                )
                              : normalizePercentInput(
                                  getDefaultMarkupDraft(client.id, link)
                                );
                          const saleUnits = Array.isArray(product.saleUnits)
                            ? product.saleUnits
                            : ["piece"];
                          const allowedUnits = UNIT_ORDER.filter((unit) =>
                            saleUnits.includes(unit)
                          );
                          const preview =
                            matrixPricePreview[client.id]?.[String(product.id)] ||
                            null;

                          return (
                            <div
                              className="matrix-editor-row"
                              key={product.id}
                            >
                              <div className="matrix-editor-product">
                                <label className="matrix-editor-product-check">
                                  <input
                                    type="checkbox"
                                    checked={picked}
                                    disabled={link.matrixMode === "all"}
                                    title={t("manager.checkToRemoveFromThisClient")}
                                    onChange={(event) => {
                                      // Галочка в списке матрицы — выбор для удаления, а не членство. Снятие не убирает товар из матрицы.
                                      setMatrixPickIds((current) => ({
                                        ...current,
                                        [client.id]: toggleMatrixProductId(
                                          current[client.id] || [],
                                          product.id,
                                          event.target.checked
                                        ).map(String),
                                      }));
                                    }}
                                  />
                                  <span>
                                    <strong>{product.name}</strong>
                                    <small
                                      style={{
                                        display: "block",
                                        marginTop: 3,
                                      }}
                                    >
                                      {productArticle(product)} · {product.category}
                                    </small>
                                  </span>
                                </label>
                                <button
                                  className="secondary-button matrix-edit-product-btn"
                                  type="button"
                                  onClick={() => setEditorProduct(product)}
                                >{
                                  t("manager.editProduct")
                                }</button>
                              </div>

                              <div className="matrix-editor-units">
                                {allowedUnits.map((unit) => {
                                  const priceField = unitPriceField(unit);
                                  const purchasePrice =
                                    product.purchasePrices?.[unit];
                                  const typedFromProduct = typedSalePriceForUnit(
                                    product,
                                    link.oneCPriceTypeId,
                                    unit
                                  );
                                  const typedPrice =
                                    preview?.typed?.[unit] ?? typedFromProduct;
                                  const clientUnitPrice = preview
                                    ? Number(preview[priceField])
                                    : null;
                                  const typeId = String(
                                    link.oneCPriceTypeId || ""
                                  ).trim();
                                  const typedReceivedAt =
                                    product.salePricesByType?.[typeId]
                                      ?.receivedAt ||
                                    preview?.salePriceReceivedAt ||
                                    product.salePriceReceivedAt ||
                                    "";
                                  const { cost: costPrice, kind: costKind } =
                                    pickPurchaseMarkupCostForUi({
                                      purchasePrice,
                                      typedPrice,
                                      purchaseUpdatedAt:
                                        product.purchasePriceReceivedAt ||
                                        product.purchasePriceUpdatedAt ||
                                        "",
                                      typedReceivedAt,
                                      priceSource:
                                        preview?.priceSources?.[unit] || "",
                                    });
                                  const calculatedPrice =
                                    clientUnitPrice != null &&
                                    Number.isFinite(clientUnitPrice) &&
                                    clientUnitPrice > 0
                                      ? clientUnitPrice
                                      : calculateMarkupPreview(
                                          costPrice,
                                          markupPercent
                                        );

                                  if (effectiveMode === "purchase_markup") {
                                    return (
                                      <div
                                        className="matrix-price-field matrix-price-calculated"
                                        key={unit}
                                      >
                                        <span>{UNIT_CONFIG[unit].label}</span>
                                        {costPrice != null &&
                                        Number.isFinite(Number(costPrice)) ? (
                                          <>
                                            <small>
                                              {costKind === "one_c_price_type"
                                                ? link.oneCPriceTypeName ||
                                                  t("manager.oneC.category")
                                                : t("manager.purchasing")}
                                              : {formatMoney(costPrice)}
                                            </small>
                                            <strong>
                                              {t("manager.clients.priceForClient", {
                                                price: formatMoney(calculatedPrice),
                                              })}
                                            </strong>
                                          </>
                                        ) : (
                                          <strong className="danger-text">{
                                            t("manager.noCategoryPrice")
                                          }</strong>
                                        )}
                                      </div>
                                    );
                                  }

                                  if (priceMode === "manual") {
                                    return (
                                      <label
                                        className="matrix-price-field"
                                        key={unit}
                                      >
                                        {UNIT_CONFIG[unit].label}
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          placeholder={
                                            typedPrice != null
                                              ? t("manager.clients.categoryPricePlaceholder", { price: typedPrice })
                                              : t("manager.clients.catalogPricePlaceholder", {
                                                  price: Number(product[priceField]) || 0,
                                                })
                                          }
                                          value={price[unit] ?? ""}
                                          onChange={(event) =>
                                            updatePersonalPrice(
                                              client.id,
                                              link,
                                              product.id,
                                              {
                                                [unit]: parsePriceInput(
                                                  event.target.value
                                                ),
                                              }
                                            )
                                          }
                                        />
                                      </label>
                                    );
                                  }

                                  const displayPrice =
                                    clientUnitPrice != null &&
                                    Number.isFinite(clientUnitPrice) &&
                                    clientUnitPrice > 0
                                      ? clientUnitPrice
                                      : typedPrice != null
                                        ? typedPrice
                                        : Number(product[priceField]) || 0;
                                  const hasDisplay =
                                    displayPrice != null &&
                                    Number.isFinite(Number(displayPrice)) &&
                                    Number(displayPrice) > 0;

                                  return (
                                    <div
                                      className="matrix-price-field matrix-price-calculated"
                                      key={unit}
                                    >
                                      <span>{UNIT_CONFIG[unit].label}</span>
                                      <small>
                                        {link.oneCPriceTypeId
                                          ? link.oneCPriceTypeName ||
                                            t("manager.clients.oneCPriceCategory")
                                          : t("manager.cloverBasePrice")}
                                      </small>
                                      <strong>
                                        {hasDisplay
                                          ? formatMoney(displayPrice)
                                          : t("manager.noPrice")}
                                      </strong>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="matrix-price-mode">
                                <label className="matrix-price-field">{
                                  t("manager.calculationMethod")
                                  }<select
                                    value={priceMode}
                                    onChange={(event) =>
                                      updatePersonalPrice(
                                        client.id,
                                        link,
                                        product.id,
                                        {
                                          source: event.target.value,
                                        },
                                        product
                                      )
                                    }
                                  >
                                    <option value="inherit">{t("manager.byMatrix")}</option>
                                    <option value="manual">{
                                      t("manager.fixedPriceManually")
                                    }</option>
                                    <option value="purchase_markup">{
                                      t("manager.individualPercent")
                                    }</option>
                                  </select>
                                </label>
                                {priceMode === "purchase_markup" && (
                                  <label className="matrix-price-field">{
                                    t("manager.individualMarkup")
                                    }<input
                                      type="number"
                                      min="0"
                                      max="10000"
                                      step="0.1"
                                      value={getIndividualMarkupDraft(
                                        client.id,
                                        product.id,
                                        price
                                      )}
                                      onChange={(event) =>
                                        setIndividualMarkupDrafts((current) => ({
                                          ...current,
                                          [client.id]: {
                                            ...(current[client.id] || {}),
                                            [String(product.id)]:
                                              event.target.value,
                                          },
                                        }))
                                      }
                                      onBlur={() =>
                                        updatePersonalPrice(
                                          client.id,
                                          link,
                                          product.id,
                                          {
                                            markupPercent:
                                              normalizePercentInput(
                                                getIndividualMarkupDraft(
                                                  client.id,
                                                  product.id,
                                                  price
                                                )
                                              ),
                                          }
                                        )
                                      }
                                    />
                                  </label>
                                )}
                                {priceMode === "inherit" &&
                                  effectiveMode === "purchase_markup" && (
                                    <small className="price-update-time">
                                      {t("manager.clients.sharedMarkupPercent", { percent: markupPercent })}
                                    </small>
                                  )}
                                {effectiveMode === "purchase_markup" && (
                                  <small className="price-update-time">
                                    {t("manager.clients.oneCPriceUpdated", {
                                      datetime: formatDateTime(
                                        product.salePriceReceivedAt ||
                                          product.purchasePriceUpdatedAt
                                      ),
                                    })}
                                  </small>
                                )}
                                {effectiveMode === "one_c_price_type" && (
                                  <small className="price-update-time">
                                    {t("manager.clients.categoryUpdated", {
                                      datetime: formatDateTime(product.salePriceReceivedAt),
                                    })}
                                  </small>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="client-matrix-save-fab">
                    <button
                      className={
                        ["busy", "review"].includes(
                          excelImportState[client.id]?.status
                        )
                          ? "primary-button matrix-save-fab-excel-locked"
                          : "primary-button"
                      }
                      type="button"
                      disabled={
                        matrixSaveState[client.id]?.status === "saving" ||
                        ["busy", "review"].includes(
                          excelImportState[client.id]?.status
                        )
                      }
                      title={
                        ["busy", "review"].includes(
                          excelImportState[client.id]?.status
                        )
                          ? t("manager.waitUntilProductsFinishLoadingFrom")
                          : undefined
                      }
                      onClick={() => saveClientMatrix(client.id, link)}
                    >
                      {matrixSaveState[client.id]?.status === "saving"
                        ? t("shared.status.savingDots")
                        : matrixSaveState[client.id]?.status === "saved"
                          ? t("shared.status.saved")
                          : t("manager.saveMatrix")}
                    </button>
                  </div>
                            </div>
                          </div>
                        </div>,
                        document.querySelector(".clover-app") || document.documentElement
                      )
                    : null}
                      </>
                    );
                  })()}
                  </PanelErrorBoundary>
                  )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-box">{t("manager.noClientsFound")}</div>
      )}
      {editorProduct !== undefined && (
        <ProductEditor
          product={editorProduct}
          products={products}
          oneCPriceTypes={oneCPriceTypes}
          onClose={() => setEditorProduct(undefined)}
          onSave={saveCatalogProduct}
          onDelete={deleteCatalogProduct}
          onProductLiveUpdate={(updated) => {
            if (!updated?.id) return;
            setProducts((current) =>
              current.map((item) =>
                String(item.id) === String(updated.id) ? updated : item
              )
            );
            setEditorProduct(updated);
          }}
        />
      )}
    </section>
    </PanelErrorBoundary>
  );
}
