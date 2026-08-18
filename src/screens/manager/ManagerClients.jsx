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
} from "../../shared/appHelpers";
import { appAlert, appConfirm } from "../../shared/AppModal";
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
  if (Number.isFinite(direct) && direct >= 0) return direct;
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
            {link.oneCId ? "Связан с 1С" : "Будет определён при заказе"}
          </span>
          <p className="muted small" style={{ marginTop: 8 }}>
            {link.oneCId
              ? `${link.oneCName || "Контрагент 1С"} · ${link.oneCCode || "без кода"}`
              : "Clover передаст название, телефон и email. Если 1С вернёт ID контрагента, связь сохранится автоматически."}
          </p>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={loadCandidates}>
            {link.oneCId ? "Изменить контрагента" : "Выбрать контрагента 1С"}
          </button>
          {link.oneCId && (
            <button className="secondary-button" type="button" onClick={clearLink}>Убрать связь</button>
          )}
        </div>
      </div>

      {open && (
        <div className="one-c-picker">
          <div className="one-c-products-search">
            <input
              type="search"
              value={search}
              placeholder="Название, ИНН, телефон, email или код"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
            <button className="secondary-button" type="button" disabled={loading} onClick={runSearch}>
              {loading ? "Поиск..." : "Найти"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setOpen(false)}>Закрыть</button>
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
                    <span>Код: {item.code || "—"} · ИНН: {item.inn || "—"}</span>
                    {(item.phone || item.email) && <span>{item.phone || ""} {item.email || ""}</span>}
                    {Number(item.score) > 0 && <span className="muted small">Совпадение: {Math.round(Number(item.score) * 100)}%</span>}
                    {linkedElsewhere && <span className="warning-text">Уже связан с клиентом Clover: {item.cloverLink.clientName}</span>}
                  </div>
                  <button
                    className={linkedToCurrent ? "secondary-button" : "primary-button"}
                    type="button"
                    disabled={loading || Boolean(linkedElsewhere)}
                    onClick={() => selectClient(item)}
                  >
                    {linkedToCurrent ? "Выбрано" : linkedElsewhere ? "Уже связан" : "Выбрать"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">
                Контрагент ещё не загружен. Заказ всё равно передаст данные клиента в 1С, а точная связь сохранится автоматически после подтверждения 1С.
              </div>
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
        };
      }

      const address = String(item?.address || "").trim();
      if (!address) return null;

      return {
        id: String(item?.id || `address-${index}`),
        label: String(item?.label || `Адрес ${index + 1}`).trim(),
        address,
        isDefault: Boolean(item?.isDefault),
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

function ManagerClientEditor({ client, onReload, onClose }) {
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
    }));

    if (!companyName && !contactName) {
      setError("Укажите название компании или имя клиента.");
      return;
    }
    if (!email) {
      setError("Укажите email клиента.");
      return;
    }
    if (addresses.some((item) => !item.label || !item.address)) {
      setError("Заполните название и полный адрес во всех строках.");
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
      setMessage("Данные клиента сохранены в Clover.");
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
        title: "Короткий пароль",
        message: "Пароль должен быть не короче 6 символов.",
        tone: "warn",
      });
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await api.setClientPassword(client.id, password);
      await onReload();
      setPasswordDraft("");
      await appAlert({
        title: "Пароль обновлён",
        message: `Логин: ${result.login || client.email}\nПароль: ${password}\n\nСохранено в «Ещё → Доступы». Передайте клиенту.`,
        tone: "success",
      });
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
          <p className="eyebrow">Профиль</p>
          <h3>Данные клиента</h3>
          <p className="muted small">Телефон, email, адреса и заметка менеджера</p>
        </div>
        {onClose && (
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        )}
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">
          Компания или торговая точка
          <input
            value={form.companyName}
            onChange={(event) => setProfileField("companyName", event.target.value)}
          />
        </label>
        <label className="field">
          Контактное лицо
          <input
            value={form.contactName}
            onChange={(event) => setProfileField("contactName", event.target.value)}
          />
        </label>
        <label className="field">
          Телефон
          <input
            value={form.phone}
            onChange={(event) => setProfileField("phone", event.target.value)}
          />
        </label>
        <label className="field">
          Email для входа клиента
          <input
            type="email"
            value={form.email}
            onChange={(event) => setProfileField("email", event.target.value)}
          />
        </label>
      </div>

      <div className="profile-contacts-block" style={{ marginTop: 14 }}>
        <div className="profile-contacts-head">
          <div>
            <strong>Доп. номера</strong>
            <p className="muted small">
              Кроме основного телефона выше можно добавить ещё номера для связи. До {MAX_PROFILE_CONTACTS} контактов всего.
            </p>
          </div>
          {form.contacts.length < MAX_PROFILE_CONTACTS ? (
            <button className="secondary-button" type="button" onClick={addExtraPhone}>
              + Доп. номер
            </button>
          ) : null}
        </div>
        {extraClientContacts(form.contacts).length ? (
          <div className="profile-contacts-list" style={{ marginTop: 8 }}>
            {extraClientContacts(form.contacts).map((item, index) => (
              <div className="profile-contact-card" key={item.id || `${item.phone}-${index}`}>
                <div className="profile-contact-card-top">
                  <span className="badge yellow">{item.label || "Дополнительный"}</span>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => removeExtraContact(item.id)}
                  >
                    Удалить
                  </button>
                </div>
                <div className="form-grid">
                  <label className="field">
                    Подпись
                    <input
                      value={item.name || ""}
                      placeholder="Например: склад, бухгалтер"
                      onChange={(event) =>
                        updateExtraContact(item.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Телефон
                    <input
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
          <p className="muted small" style={{ marginTop: 8 }}>
            Дополнительных номеров пока нет.
          </p>
        )}
      </div>

      <div className="manager-client-addresses">
        <div className="manager-client-addresses-heading">
          <strong>Адреса доставки</strong>
          <button className="secondary-button" type="button" onClick={addAddress}>
            + Добавить адрес
          </button>
        </div>
        {form.addresses.map((item) => (
          <div className="manager-client-address-row" key={item.id}>
            <label className="field">
              Название
              <input
                value={item.label}
                placeholder="Например: Основной магазин"
                onChange={(event) => updateAddress(item.id, { label: event.target.value })}
              />
            </label>
            <label className="field manager-client-address-field">
              Полный адрес
              <input
                value={item.address}
                placeholder="Город, улица, дом, помещение"
                onChange={(event) => updateAddress(item.id, { address: event.target.value })}
              />
            </label>
            <label className="manager-client-default-address">
              <input
                type="radio"
                name={`default-address-${client.id}`}
                checked={Boolean(item.isDefault)}
                onChange={() => updateAddress(item.id, { isDefault: true })}
              />
              Основной
            </label>
            <button
              className="danger-button"
              type="button"
              onClick={() => removeAddress(item.id)}
            >
              Удалить
            </button>
          </div>
        ))}
        {!form.addresses.length && (
          <div className="empty-box">Адресов пока нет.</div>
        )}
      </div>

      <label className="field" style={{ marginTop: 14 }}>
        Комментарий менеджера
        <textarea
          rows="4"
          maxLength="2000"
          placeholder="Например: звонить перед доставкой, принимает товар до 16:00"
          value={form.managerNote}
          onChange={(event) => setProfileField("managerNote", event.target.value)}
        />
        <small>Виден только менеджерам Clover. Клиенту и в 1С не передаётся.</small>
      </label>

      <div className="matrix-catalog-note" style={{ marginTop: 14 }}>
        Изменения используются в новых заказах Clover. Данные контрагента в 1С автоматически не перезаписываются. При изменении email клиент будет входить по новому адресу.
      </div>

      <div className="client-password-block" style={{ marginTop: 18 }}>
        <strong>Сменить пароль</strong>
        <p className="muted small" style={{ marginTop: 4 }}>
          Логин остаётся {client.email}. Матрица и заказы не меняются.
        </p>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="field">
            Новый пароль
            <input
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
          >
            Сгенерировать пароль
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={passwordBusy}
            onClick={() => void savePassword()}
          >
            {passwordBusy ? "Сохраняем..." : "Сохранить пароль"}
          </button>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="sync-success" style={{ marginTop: 12 }}>{message}</div>}
      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary-button" type="button" disabled={saving} onClick={save}>
          {saving ? "Сохраняем..." : "Сохранить данные клиента"}
        </button>
      </div>
    </section>
  );
}

function ClientCardMenu({ open, onToggle, onClose, items = [] }) {
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
        aria-label="Действия с клиентом"
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

  useEffect(() => {
    writeOpenManagerClientId("");
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
      await appAlert({ title: "Ошибка доступа", message: error.message, tone: "danger" });
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
        title: "Проверьте поля",
        message: "Заполните все поля. Пароль — не короче 6 символов.",
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
      await appAlert({
        title: "Доступ выдан",
        message: `Логин: ${result.login || email}\nПароль: ${password}\n\nСохранено в «Ещё → Доступы». Передайте клиенту. Матрицу можно настроить в карточке.`,
        tone: "success",
      });
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
          "Есть несохранённые изменения. Нажмите «Сохранить матрицу», иначе после F5 они пропадут.",
      },
    }));
  };

  const saveCatalogProduct = async (value) => {
    const normalized = normalizeProduct(value);
    let nextProducts;
    let targetId;

    if (normalized.id) {
      targetId = String(normalized.id);
      nextProducts = products.map((item) =>
        String(item.id) === targetId ? normalized : item
      );
    } else {
      const id =
        Math.max(0, ...products.map((item) => Number(item.id) || 0)) + 1;
      targetId = String(id);
      nextProducts = [
        normalizeProduct({
          ...normalized,
          id,
          code: normalized.code || normalized.oneCCode || "",
        }),
        ...products,
      ];
    }

    const oneCId = String(normalized.oneCId || "").trim();
    if (oneCId) {
      nextProducts = nextProducts.map((item) => {
        if (String(item.id) === targetId) return item;
        if (String(item.oneCId || "").trim() !== oneCId) return item;
        return normalizeProduct({
          ...item,
          oneCId: "",
          oneCCode: "",
          oneCName: "",
          oneCMatchCode: "",
          oneCMatchName: "",
          oneCSearchQuery: "",
          oneCSearchRequestedAt: "",
          oneCLinkMode: "",
          oneCLinkedAt: "",
        });
      });
    }

    try {
      const result = await api.saveProducts(nextProducts);
      setProducts((result.products || nextProducts).map(normalizeProduct));
      setEditorProduct(undefined);
    } catch (error) {
      void appAlert({
        title: "Не удалось сохранить",
        message: `Не удалось сохранить товар: ${error.message}`,
        tone: "danger",
      });
    }
  };

  const deleteCatalogProduct = async (product) => {
    if (!product?.id) return;
    const ok = await appConfirm({
      title: "Удалить товар из каталога?",
      message: `«${product.name || "товар"}» будет удалён из каталога Clover, с витрины сайта и из матриц всех клиентов. Заказы с этим товаром не меняются.`,
      confirmLabel: "Удалить",
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
      [clientId]: { status: "saving", message: "Сохраняем матрицу..." },
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
              `Для «${product.name}» выбрана фиксированная цена, но сумма не указана. Введите цену или верните «По матрице».`,
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
        [clientId]: { status: "saved", message: "Матрица сохранена." },
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
    <PanelErrorBoundary label="Ошибка раздела «Клиенты»">
    <section>
      <div className="toolbar two manager-clients-toolbar">
        <div className="manager-search-block">
          <input
            type="search"
            placeholder="Поиск по клиенту, заказу, ИНН, телефону, адресу и email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Поиск по клиенту, заказу, ИНН, телефону, адресу и email"
          />
        </div>
        <div className="mini-card">
          <span className="mini-label">Клиентов</span>
          <strong>{clients.length}</strong>
        </div>
      </div>

      <div className="approval-box" style={{ marginTop: 12 }}>
        <div>
          <strong>Создать доступ для клиента</strong>
          <p>
            Создайте логин и пароль сами — без письма и подтверждения почты.
            Логин и пароль сразу сохраняются в «Ещё → Доступы».
            Матрицу настраиваете в карточке; при смене менеджера достаточно
            сменить пароль у того же клиента.
          </p>
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
            {provisionOpen ? "Скрыть форму" : "Создать доступ для клиента"}
          </button>
        </div>
      </div>

      {provisionOpen ? (
        <form className="client-profile-panel" onSubmit={createClientAccess} style={{ marginTop: 12 }}>
          <div className="form-grid">
            <label className="field">
              Компания
              <input
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
            <label className="field">
              Контактное лицо
              <input
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
            <label className="field">
              Телефон
              <input
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
            <label className="field">
              Логин (email)
              <input
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
            <label className="field">
              Пароль
              <input
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
            >
              Сгенерировать пароль
            </button>
            <button className="primary-button" type="submit" disabled={provisionBusy}>
              {provisionBusy ? "Создаём..." : "Создать и выдать доступ"}
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
                ? String(matrixSearch || "").trim().toLocaleLowerCase("ru-RU")
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
                const haystack = [
                  product.name,
                  product.code,
                  product.oneCCode,
                  product.oneCMatchCode,
                  product.oneCName,
                  product.category,
                  productArticle(product),
                ]
                  .map((value) => String(value || "").toLocaleLowerCase("ru-RU"))
                  .join(" ");
                return haystack.includes(searchQuery);
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
                        ? "Связан с 1С"
                        : "Не сопоставлен"}
                    </span>
                    <h3>
                      {client.companyName || "Клиент без названия"}
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
                                {item.isPrimary ? "Основной" : item.label || "Дополнительный"}
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
                    <strong>{client.orders.length} заказов</strong>
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
                                label: "Данные клиента",
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
                          label: "Матрица",
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
                                label: "Заблокировать доступ",
                                danger: true,
                                disabled: approvalBusyId === client.id,
                                onSelect: async () => {
                                  const ok = await appConfirm({
                                    title: "Заблокировать доступ?",
                                    message:
                                      "Заблокировать доступ этому клиенту? Он не сможет войти в Clover, пока вы снова не разрешите доступ.",
                                    confirmLabel: "Заблокировать",
                                    cancelLabel: "Отмена",
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
                                label: "Разрешить доступ",
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
                                label: "Удалить клиента",
                                danger: true,
                                onSelect: async () => {
                                  const ok = await appConfirm({
                                    title: "Удалить клиента?",
                                    message: `Удалить «${
                                      client.companyName || client.email || "клиента"
                                    }»?\n\nБудут удалены аккаунт, матрица, журнал доступов и связанные заказы. Это необратимо.`,
                                    confirmLabel: "Удалить клиента",
                                    cancelLabel: "Отмена",
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
                                      title: "Клиент удалён",
                                      message: result.message || "Аккаунт клиента удалён.",
                                      tone: "success",
                                    });
                                  } catch (deleteError) {
                                    await appAlert({
                                      title: "Не удалось удалить",
                                      message:
                                        deleteError.message || "Ошибка удаления клиента.",
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
                    <span>Заказов</span>
                    <strong>{client.orders.length}</strong>
                  </article>
                  <article>
                    <span>Активных</span>
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
                    <span>Товаров в матрице</span>
                    <strong>
                      {link.matrixMode === "all"
                        ? products.filter((item) => item.active !== false).length
                        : matrixProductIds.length}
                    </strong>
                  </article>
                  <article>
                    <span>Персональных цен</span>
                    <strong>{personalPriceCount}</strong>
                  </article>
                </div>

                {client.isRegistered !== false && client.approvalStatus === "pending" && (
                  <div className="approval-box">
                    <div>
                      <strong>Новая регистрация</strong>
                      <p>
                        {client.emailVerified
                          ? "Почта подтверждена — можно разрешить вход в Clover."
                          : "Сначала клиент должен подтвердить электронную почту."}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={approvalBusyId === client.id || !client.emailVerified}
                        onClick={() => setApproval(client, "approved")}
                      >
                        Разрешить вход
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={approvalBusyId === client.id}
                        onClick={async () => {
                          const ok = await appConfirm({
                            title: "Отклонить регистрацию?",
                            message:
                              "Отклонить регистрацию? Клиент не сможет войти, пока доступ не разрешат снова.",
                            confirmLabel: "Отклонить",
                            cancelLabel: "Отмена",
                            tone: "danger",
                          });
                          if (ok) {
                            setApproval(client, "rejected");
                          }
                        }}
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                )}

                {client.isRegistered !== false && client.approvalStatus === "rejected" && (
                  <div className="approval-box approval-box-rejected">
                    <div>
                      <strong>Вход заблокирован</strong>
                      <p>Клиент не может авторизоваться в Clover.</p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={approvalBusyId === client.id || !client.emailVerified}
                        onClick={() => setApproval(client, "approved")}
                      >
                        Разрешить вход
                      </button>
                    </div>
                  </div>
                )}

                {client.isRegistered !== false &&
                String(profileOpenId) === String(client.id) ? (
                  <ManagerClientEditor
                    client={client}
                    onReload={onReload}
                    onClose={() => setProfileOpenId("")}
                  />
                ) : null}

                {client.isRegistered === false && (
                  <div className="matrix-catalog-note" style={{ marginTop: 15 }}>
                    Это клиент из старого заказа без отдельного аккаунта Clover. Его данные в заказе сохранены, но карточка станет редактируемой после регистрации клиента.
                  </div>
                )}

                {matrixWindowOpen && (
                  <PanelErrorBoundary label="Ошибка блока матрицы клиента">
                  {(() => {
                    const pricingLabel =
                      link.defaultPricingMode === "purchase_markup"
                        ? `Наценка ${normalizePercentInput(getDefaultMarkupDraft(client.id, link))}%` +
                          (link.oneCPriceTypeName
                            ? ` · ${link.oneCPriceTypeName}`
                            : "")
                        : link.defaultPricingMode === "one_c_price_type"
                          ? link.oneCPriceTypeName || "Вид цен 1С"
                          : "Базовая цена Clover";
                    const modeLabel =
                      link.matrixMode === "all"
                        ? "Все товары"
                        : link.matrixMode === "selected"
                          ? "Выбранные товары"
                          : "Матрица не готова";

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
                                <p className="eyebrow">Матрица</p>
                                <h3 id={`matrix-window-title-${client.id}`}>
                                  {client.companyName || "Клиент без названия"}
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
                                    });
                                  }}
                                >
                                  Скачать Excel
                                </button>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => setMatrixWindowClientId("")}
                                >
                                  Закрыть
                                </button>
                              </div>
                            </div>
                            <div className="matrix-window-body">
                  <div className="client-matrix-toolbar">
                    <div className="client-matrix-toolbar-meta">
                      <span className="badge green">{modeLabel}</span>
                      <span className="muted small">{pricingLabel}</span>
                      {link.oneCId ? (
                        <span className="muted small">
                          1С: {link.oneCName || link.oneCCode || "связан"}
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

                  <details className="client-matrix-settings" open={link.matrixMode === "pending"}>
                      <summary>1С и цены</summary>
                      <p className="muted small" style={{ marginTop: 0 }}>
                        Связь с контрагентом, режим матрицы, вид цен и наценка.
                        После «Обновить цены» в 1С ЛК клиента подтягивает каталог автоматически.
                      </p>

                      <OneCClientPicker
                        client={client}
                        link={link}
                        onChange={(patch) => updateLink(client.id, patch)}
                      />

                      <div className="form-grid" style={{ marginTop: 14 }}>
                        <label className="field">
                          Точное название в 1С — необязательно
                          <input
                            value={link.oneCMatchName || ""}
                            placeholder={client.companyName || "Название контрагента"}
                            onChange={(event) =>
                              updateLink(client.id, {
                                oneCMatchName: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="field">
                          ИНН для точного сопоставления
                          <input
                            value={link.oneCMatchInn || ""}
                            inputMode="numeric"
                            onChange={(event) =>
                              updateLink(client.id, {
                                oneCMatchInn: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="field">
                          Код контрагента в 1С — необязательно
                          <input
                            value={link.oneCMatchCode || ""}
                            onChange={(event) =>
                              updateLink(client.id, {
                                oneCMatchCode: event.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="field">
                          Режим товарной матрицы
                          <select
                            value={link.matrixMode}
                            onChange={(event) =>
                              updateLink(client.id, {
                                matrixMode: event.target.value,
                              })
                            }
                          >
                            <option value="pending">Матрица подготавливается</option>
                            <option value="selected">Только выбранные товары</option>
                            <option value="all">Все активные товары</option>
                          </select>
                        </label>

                        <label className="field">
                          Полный каталог для клиента
                          <select
                            value={link.allowFullCatalog ? "yes" : "no"}
                            onChange={(event) =>
                              updateLink(client.id, {
                                allowFullCatalog: event.target.value === "yes",
                              })
                            }
                          >
                            <option value="no">Скрыт — только матрица</option>
                            <option value="yes">Разрешить просмотр</option>
                          </select>
                        </label>
                      </div>

                      <div className="client-pricing-panel" style={{ marginTop: 14 }}>
                        <label className="field">
                          Категория цен 1С (вид цен)
                          <select
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
                            <option value="">Не задана</option>
                            {(oneCPriceTypes || []).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name || "Без названия"}
                              </option>
                            ))}
                          </select>
                          <small>
                            Для наценки обычно выбирают вид «Закупочная цена».
                          </small>
                        </label>

                        <label className="field">
                          Цена по умолчанию для матрицы
                          <select
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
                            <option value="base">Базовая цена Clover</option>
                            <option value="purchase_markup">
                              Категория/закупка + наценка %
                            </option>
                            <option
                              value="one_c_price_type"
                              disabled={
                                !link.oneCPriceTypeId &&
                                !(oneCPriceTypes || []).length
                              }
                            >
                              Категория цен 1С без наценки
                            </option>
                          </select>
                          <small>
                            «+ наценка %»: цена вида или закупка × (1 + %/100), с копейками.
                          </small>
                        </label>

                        {(link.defaultPricingMode === "purchase_markup" ||
                          Number(link.defaultMarkupPercent) > 0) && (
                          <label className="field client-markup-field">
                            Наценка для клиента, %
                            <input
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
                            <small>
                              Пример: 65,47 ₽ + 5% → 68,74 ₽. Затем «Сохранить матрицу».
                            </small>
                          </label>
                        )}
                      </div>

                      <label className="field matrix-manager-note">
                        Заметка по матрице
                        <textarea
                          rows="2"
                          value={link.managerNote}
                          placeholder="Кратко: особенности матрицы или связи с 1С"
                          onChange={(event) =>
                            updateLink(client.id, {
                              managerNote: event.target.value,
                            })
                          }
                        />
                        <small>Только для менеджеров</small>
                      </label>
                    </details>

                  {link.matrixMode === "pending" ? (
                    <div className="matrix-catalog-note pending" style={{ marginTop: 14 }}>
                      Выберите режим матрицы выше, затем сохраните матрицу.
                    </div>
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
                          placeholder="Поиск товара в матрице"
                          value={matrixSearch}
                          onChange={(event) =>
                            setMatrixSearch(event.target.value)
                          }
                        />
                        {link.oneCPriceTypeName || link.oneCPriceTypeId ? (
                          <span className="client-matrix-price-chip">
                            {link.oneCPriceTypeName || "Вид цен 1С"}
                            {link.defaultPricingMode === "purchase_markup"
                              ? ` · +${normalizePercentInput(getDefaultMarkupDraft(client.id, link))}%`
                              : ""}
                          </span>
                        ) : (
                          <span className="client-matrix-price-chip muted">
                            Категория цен не задана
                          </span>
                        )}
                        {matrixPricesStatus[client.id]?.status === "ok" &&
                          Number(matrixPricesStatus[client.id]?.missingPrices) >
                            0 && (
                          <span className="client-matrix-price-chip muted">
                            Без цены: {matrixPricesStatus[client.id].missingPrices} — дождитесь
                            «Обновить цены» в 1С
                          </span>
                        )}
                        {matrixPricesStatus[client.id]?.status === "loading" && (
                          <span className="client-matrix-price-chip muted">
                            Загрузка цен…
                          </span>
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
                            {matrixPricesStatus[client.id]?.message || "Ошибка цен"} · повторить
                          </button>
                        )}
                      </div>
                      ) : null}

                      <div className="matrix-summary">
                        <span>
                          {link.matrixMode === "all"
                            ? `Товаров в матрице: ${products.filter((item) => item.active).length}`
                            : `В матрице: ${matrixProductIds.length}`}
                        </span>
                        <span>
                          Индивидуальных исключений: {personalPriceCount}
                        </span>
                        {link.matrixMode === "selected" ? (
                          <span className="muted small">
                            Галочка — выбор для удаления из матрицы. Снятие галочки товар не убирает.
                          </span>
                        ) : null}
                      </div>
                      {link.matrixMode === "selected" && (
                        <div className="matrix-pick-actions">
                          <span>Отмечено: {pickedIds.length}</span>
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
                          >
                            Выбрать все
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => {
                              setMatrixPickIds((current) => ({
                                ...current,
                                [client.id]: [],
                              }));
                            }}
                          >
                            Снять все
                          </button>
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
                          >
                            Удалить выбранные из матрицы
                          </button>
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
                                    title="Отметить, чтобы удалить из матрицы этого клиента. Снятие галочки товар из матрицы не убирает."
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
                                >
                                  Изменить товар
                                </button>
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
                                                  "Категория 1С"
                                                : "Закупка"}
                                              : {formatMoney(costPrice)}
                                            </small>
                                            <strong>
                                              Клиенту:{" "}
                                              {formatMoney(calculatedPrice)}
                                            </strong>
                                          </>
                                        ) : (
                                          <strong className="danger-text">
                                            Нет цены категории
                                          </strong>
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
                                              ? `Категория: ${typedPrice}`
                                              : `Цена: ${
                                                  Number(product[priceField]) || 0
                                                }`
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
                                            "Категория цен 1С"
                                          : "Базовая цена Clover"}
                                      </small>
                                      <strong>
                                        {hasDisplay
                                          ? formatMoney(displayPrice)
                                          : "Нет цены"}
                                      </strong>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="matrix-price-mode">
                                <label className="matrix-price-field">
                                  Способ расчёта
                                  <select
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
                                    <option value="inherit">По матрице</option>
                                    <option value="manual">
                                      Фиксированная цена вручную
                                    </option>
                                    <option value="purchase_markup">
                                      Индивидуальный процент
                                    </option>
                                  </select>
                                </label>
                                {priceMode === "purchase_markup" && (
                                  <label className="matrix-price-field">
                                    Индивидуальная наценка, %
                                    <input
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
                                      Общая наценка клиента: {markupPercent}%
                                    </small>
                                  )}
                                {effectiveMode === "purchase_markup" && (
                                  <small className="price-update-time">
                                    Цена 1С обновлена:{" "}
                                    {formatDateTime(
                                      product.salePriceReceivedAt ||
                                        product.purchasePriceUpdatedAt
                                    )}
                                  </small>
                                )}
                                {effectiveMode === "one_c_price_type" && (
                                  <small className="price-update-time">
                                    Категория обновлена:{" "}
                                    {formatDateTime(product.salePriceReceivedAt)}
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
                          ? "Дождитесь загрузки товаров из Excel"
                          : undefined
                      }
                      onClick={() => saveClientMatrix(client.id, link)}
                    >
                      {matrixSaveState[client.id]?.status === "saving"
                        ? "Сохраняем..."
                        : matrixSaveState[client.id]?.status === "saved"
                          ? "Сохранено"
                          : "Сохранить матрицу"}
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
        <div className="empty-box">Клиенты не найдены.</div>
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
