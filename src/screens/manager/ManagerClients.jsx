// Раздел менеджера: клиенты, матрицы товаров и связи с 1С.
import { useEffect, useRef, useState } from "react";
import { api } from "../../serverApi";
import { PanelErrorBoundary } from "../../shared/SharedPanels";
import {
  EMPTY_LINK,
  readOpenManagerClientId,
  writeOpenManagerClientId,
  UNIT_ORDER,
  UNIT_CONFIG,
  hasPurchasePrice,
  hasManualUnitValue,
  prefillManualPriceFromProduct,
  calculateMarkupPreview,
  formatMoney,
  formatDateTime,
  normalizeProduct,
} from "../../shared/appHelpers";

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

function MatrixOneCProductAdd({ clientId, link, setProducts, setClientLinks, onAfterAdd }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const runSearch = async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCProducts({
        search: String(query || "").trim(),
        limit: 50,
        offset: 0,
      });
      setItems(result.items || []);
      setTotal(Number(result.total) || 0);
    } catch (searchError) {
      setError(searchError.message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const openPicker = async () => {
    setOpen(true);
    setNotice("");
    await runSearch(search);
  };

  const selectItem = async (item) => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await api.createProductFromOneCCatalog({
        oneCId: item.id,
        item,
        clientId,
      });
      if (Array.isArray(result.products)) {
        setProducts(result.products.map(normalizeProduct));
      }
      if (result.clientLinks) {
        setClientLinks(result.clientLinks);
      } else if (result.clientLink) {
        setClientLinks((current) => ({
          ...current,
          [clientId]: {
            ...EMPTY_LINK,
            ...(current[clientId] || {}),
            ...result.clientLink,
          },
        }));
      }
      setNotice(
        result.created
          ? `Товар «${result.product?.name || item.name}» добавлен в Clover и в матрицу.`
          : `Товар уже был в Clover — добавлен в матрицу: «${result.product?.name || item.name}».`
      );
      onAfterAdd?.(result);
      setOpen(false);
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="matrix-onec-add" style={{ marginTop: 12 }}>
      <div className="toolbar two">
        <p className="muted small" style={{ margin: 0 }}>
          Можно взять позицию прямо из каталога 1С: товар появится в разделе «Товары» и в матрице клиента.
          {link.matrixMode === "all" ? " В режиме «все товары» позиция сразу доступна клиенту." : ""}
        </p>
        <button className="secondary-button" type="button" onClick={openPicker} disabled={loading}>
          Добавить из 1С
        </button>
      </div>
      {notice && <div className="matrix-save-message saved" style={{ marginTop: 8 }}>{notice}</div>}
      {open && (
        <div className="one-c-picker" style={{ marginTop: 10 }}>
          <div className="one-c-products-search">
            <input
              type="search"
              value={search}
              placeholder="Название или код номенклатуры 1С"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
            <button className="secondary-button" type="button" disabled={loading} onClick={() => runSearch()}>
              {loading ? "Поиск..." : "Найти"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
          {error && <div className="sync-error">{error}</div>}
          <p className="muted small">Найдено: {total}. Показаны первые {items.length || 0}.</p>
          <div className="one-c-products-list one-c-picker-list">
            {items.map((item) => {
              const alreadyInClover = Boolean(item.cloverLink?.productId);
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>Код: {item.code || "—"}</span>
                    {alreadyInClover && (
                      <span className="muted small">
                        Уже в Clover: {item.cloverLink.productName || `ID ${item.cloverLink.productId}`}
                      </span>
                    )}
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={loading}
                    onClick={() => selectItem(item)}
                  >
                    {alreadyInClover ? "В матрицу" : "Добавить"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">Номенклатура не найдена. Уточните запрос или обновите выгрузку из 1С.</div>
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

function createManagerClientForm(client) {
  return {
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
    managerNote: client.managerNote || "",
    addresses: normalizeManagerClientAddresses(client.addresses),
  };
}

function ManagerClientEditor({ client, onReload, onClose }) {
  const [form, setForm] = useState(() => createManagerClientForm(client));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const clientVersion = JSON.stringify({
    id: client.id,
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
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
      await api.updateClient(client.id, {
        profile: {
          companyName,
          contactName,
          phone,
          email,
          managerNote,
        },
        addresses,
      });
      setMessage("Данные клиента сохранены в Clover.");
      await onReload();
    } catch (saveError) {
      setError(saveError.message || "Не удалось сохранить данные клиента.");
    } finally {
      setSaving(false);
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
  products,
  setProducts,
  clientLinks,
  setClientLinks,
  onReload,
}) {
  const [search, setSearch] = useState("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [defaultMarkupDrafts, setDefaultMarkupDrafts] = useState({});
  const [individualMarkupDrafts, setIndividualMarkupDrafts] = useState({});
  const [matrixSaveState, setMatrixSaveState] = useState({});
  const [openClientId, setOpenClientId] = useState(readOpenManagerClientId);
  const [approvalBusyId, setApprovalBusyId] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [profileOpenId, setProfileOpenId] = useState("");
  const restoredOpenClient = useRef(false);

  useEffect(() => {
    if (restoredOpenClient.current || !openClientId) return;
    const target = document.getElementById(`client-matrix-${openClientId}`);
    if (!target) return;

    restoredOpenClient.current = true;
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }, [openClientId, clients]);

  const setApproval = async (client, status) => {
    setApprovalBusyId(client.id);
    try {
      await api.setClientApproval(client.id, status);
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setApprovalBusyId("");
    }
  };

  const visible = clients.filter((client) =>
    `${client.companyName} ${client.contactName} ${client.phone} ${client.email}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  const updateLink = (clientId, patch) => {
    setClientLinks((current) => ({
      ...current,
      [clientId]: {
        ...EMPTY_LINK,
        ...(current[clientId] || {}),
        ...patch,
      },
    }));
    setMatrixSaveState((current) => ({
      ...current,
      [clientId]: {
        status: "dirty",
        message:
          "Есть несохранённые изменения. Нажмите «Сохранить матрицу», иначе после F5 они пропадут.",
      },
    }));
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
              `Для «${product.name}» выбрана фиксированная цена, но сумма не указана. Введите цену или верните «По умолчанию клиента».`,
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
      await api.saveClientLinks(nextLinks);
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
      setMatrixSaveState((current) => ({
        ...current,
        [clientId]: { status: "saved", message: "Матрица сохранена." },
      }));
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
      <div className="toolbar two">
        <input
          type="search"
          placeholder="Поиск клиента"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="mini-card">
          <span className="mini-label">Клиентов</span>
          <strong>{clients.length}</strong>
        </div>
      </div>

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
            const orderedIds = [
              ...new Set(
                (Array.isArray(client.orders) ? client.orders : []).flatMap((order) =>
                  (order.items || []).map(
                    (item) => item.productId ?? item.id
                  )
                )
              ),
            ];
            const matrixProducts = (Array.isArray(products) ? products : []).filter(
              (product) =>
                product.active !== false &&
                (!matrixSearch ||
                  String(product.name || "")
                    .toLowerCase()
                    .includes(matrixSearch.toLowerCase()) ||
                  String(product.code || "")
                    .toLowerCase()
                    .includes(matrixSearch.toLowerCase()))
            );
            const personalPriceCount = Object.keys(
              link.personalPrices || {}
            ).length;
            const matrixOpen = String(openClientId) === String(client.id);

            return (
              <article className="client-card" key={client.id}>
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
                    <p className="muted small">
                      {client.contactName} · {client.phone} ·{" "}
                      {client.email}
                    </p>
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
                          label: "Матрица и 1С",
                          onSelect: () => {
                            setOpenClientId(client.id);
                            writeOpenManagerClientId(client.id);
                            window.setTimeout(() => {
                              const target = document.getElementById(
                                `client-matrix-${client.id}`
                              );
                              if (target instanceof HTMLDetailsElement) {
                                target.open = true;
                              }
                              target?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }, 50);
                          },
                        },
                        ...(client.isRegistered !== false &&
                        client.approvalStatus === "approved"
                          ? [
                              {
                                id: "block",
                                label: "Заблокировать вход",
                                danger: true,
                                disabled: approvalBusyId === client.id,
                                onSelect: () => {
                                  if (
                                    window.confirm(
                                      "Заблокировать вход этому клиенту? Он не сможет войти в Clover, пока вы снова не разрешите доступ."
                                    )
                                  ) {
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
                                label: "Разрешить вход",
                                disabled:
                                  approvalBusyId === client.id ||
                                  !client.emailVerified,
                                onSelect: () => setApproval(client, "approved"),
                              },
                            ]
                          : []),
                        ...(client.isRegistered !== false &&
                        client.approvalStatus === "pending"
                          ? [
                              {
                                id: "approve",
                                label: "Разрешить вход",
                                disabled:
                                  approvalBusyId === client.id ||
                                  !client.emailVerified,
                                onSelect: () => setApproval(client, "approved"),
                              },
                              {
                                id: "reject",
                                label: "Отклонить регистрацию",
                                danger: true,
                                disabled: approvalBusyId === client.id,
                                onSelect: () => {
                                  if (
                                    window.confirm(
                                      "Отклонить регистрацию? Клиент не сможет войти, пока доступ не разрешат снова."
                                    )
                                  ) {
                                    setApproval(client, "rejected");
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
                        onClick={() => {
                          if (
                            window.confirm(
                              "Отклонить регистрацию? Клиент не сможет войти, пока доступ не разрешат снова."
                            )
                          ) {
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

                <details
                  id={`client-matrix-${client.id}`}
                  className="order-details"
                  style={{ marginTop: 15 }}
                  open={matrixOpen}
                  onToggle={(event) => {
                    const isOpen = Boolean(event.currentTarget.open);
                    setOpenClientId((current) => {
                      const value = isOpen
                        ? String(client.id)
                        : String(current) === String(client.id)
                          ? ""
                          : current;
                      writeOpenManagerClientId(value);
                      return value;
                    });
                  }}
                >
                  <summary>
                    Товарная матрица, цены и связь с 1С
                  </summary>

                  {matrixOpen && (
                  <PanelErrorBoundary label="Ошибка блока матрицы клиента">
                  <OneCClientPicker
                    client={client}
                    link={link}
                    onChange={(patch) => updateLink(client.id, patch)}
                  />

                  <div
                    className="form-grid"
                    style={{ marginTop: 14 }}
                  >
                    <label className="field">
                      Точное название в 1С — необязательно
                      <input
                        value={link.oneCMatchName || ""}
                        placeholder={client.companyName || "Название контрагента"}
                        onChange={(event) => updateLink(client.id, { oneCMatchName: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      ИНН для точного сопоставления
                      <input
                        value={link.oneCMatchInn || ""}
                        inputMode="numeric"
                        onChange={(event) => updateLink(client.id, { oneCMatchInn: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      Код контрагента в 1С — необязательно
                      <input
                        value={link.oneCMatchCode || ""}
                        onChange={(event) => updateLink(client.id, { oneCMatchCode: event.target.value })}
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
                        <option value="pending">
                          Матрица подготавливается
                        </option>
                        <option value="selected">
                          Только выбранные товары
                        </option>
                        <option value="all">
                          Все активные товары
                        </option>
                      </select>
                    </label>

                    <label className="field">
                      Полный каталог для клиента
                      <select
                        value={
                          link.allowFullCatalog ? "yes" : "no"
                        }
                        onChange={(event) =>
                          updateLink(client.id, {
                            allowFullCatalog:
                              event.target.value === "yes",
                          })
                        }
                      >
                        <option value="no">
                          Скрыт — только матрица
                        </option>
                        <option value="yes">
                          Разрешить просмотр
                        </option>
                      </select>
                    </label>


                    <label className="field">
                      Цена по умолчанию для матрицы
                      <select
                        value={link.defaultPricingMode || "base"}
                        onChange={(event) =>
                          updateLink(client.id, {
                            defaultPricingMode: event.target.value,
                          })
                        }
                      >
                        <option value="base">
                          Базовая цена Clover
                        </option>
                        <option value="purchase_markup">
                          Закупка 1С + общий процент
                        </option>
                      </select>
                    </label>

                    {link.defaultPricingMode === "purchase_markup" && (
                      <label className="field">
                        Общая наценка для клиента, %
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="0.1"
                          value={getDefaultMarkupDraft(client.id, link)}
                          onChange={(event) =>
                            setDefaultMarkupDrafts((current) => ({
                              ...current,
                              [client.id]: event.target.value,
                            }))
                          }
                          onBlur={() =>
                            updateLink(client.id, {
                              defaultMarkupPercent: normalizePercentInput(
                                getDefaultMarkupDraft(client.id, link)
                              ),
                            })
                          }
                        />
                        <small>
                          Применяется ко всем товарам без индивидуального исключения.
                        </small>
                      </label>
                    )}
                  </div>

                  <label
                    className="field"
                    style={{ marginTop: 12 }}
                  >
                    Заметка по матрице и связи с 1С
                    <textarea
                      rows="3"
                      value={link.managerNote}
                      onChange={(event) =>
                        updateLink(client.id, {
                          managerNote: event.target.value,
                        })
                      }
                    />
                    <small>Видна только менеджерам и относится к настройкам матрицы/1С.</small>
                  </label>

                  {link.matrixMode === "pending" && (
                    <div className="matrix-catalog-note pending" style={{ marginTop: 14 }}>
                      Сначала выберите режим товарной матрицы. Настройки цен сохранятся вместе с матрицей.
                    </div>
                  )}

                  {link.matrixMode !== "pending" && (
                    <div style={{ marginTop: 14 }}>
                      <MatrixOneCProductAdd
                        clientId={client.id}
                        link={link}
                        setProducts={setProducts}
                        setClientLinks={setClientLinks}
                      />
                      <div className="toolbar two">
                        <input
                          type="search"
                          placeholder="Поиск товара в матрице"
                          value={matrixSearch}
                          onChange={(event) =>
                            setMatrixSearch(event.target.value)
                          }
                        />
                        {link.matrixMode === "selected" ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              updateLink(client.id, {
                                matrixMode: "selected",
                                matrixProductIds: orderedIds,
                              })
                            }
                          >
                            Заполнить по истории заказов
                          </button>
                        ) : (
                          <div className="matrix-catalog-note">
                            Все активные товары используют общую схему цены, кроме индивидуальных исключений.
                          </div>
                        )}
                      </div>

                      <div className="matrix-summary">
                        <span>
                          {link.matrixMode === "all"
                            ? `Товаров в матрице: ${products.filter((item) => item.active).length}`
                            : `Выбрано: ${matrixProductIds.length}`}
                        </span>
                        <span>
                          Индивидуальных исключений: {personalPriceCount}
                        </span>
                        {link.matrixMode === "selected" && (
                          <>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                updateLink(client.id, {
                                  matrixMode: "selected",
                                  matrixProductIds: products
                                    .filter((item) => item.active)
                                    .map((item) => item.id),
                                })
                              }
                            >
                              Выбрать все
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                updateLink(client.id, {
                                  matrixProductIds: [],
                                })
                              }
                            >
                              Снять все
                            </button>
                          </>
                        )}
                      </div>

                      <div className="matrix-editor-list">
                        {matrixProducts.map((product) => {
                          const price =
                            link.personalPrices?.[
                              String(product.id)
                            ] || {};
                          const selected =
                            link.matrixMode === "all" ||
                            matrixProductIds.some(
                              (id) => String(id) === String(product.id)
                            );
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

                          return (
                            <div
                              className="matrix-editor-row"
                              key={product.id}
                            >
                              <label className="matrix-editor-product">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={link.matrixMode === "all"}
                                  onChange={(event) =>
                                    updateLink(client.id, {
                                      matrixMode: "selected",
                                      matrixProductIds:
                                        event.target.checked
                                          ? [
                                              ...new Set([
                                                ...matrixProductIds,
                                                product.id,
                                              ]),
                                            ]
                                          : matrixProductIds.filter(
                                              (id) => String(id) !== String(product.id)
                                            ),
                                    })
                                  }
                                />
                                <span>
                                  <strong>{product.name}</strong>
                                  <small
                                    style={{
                                      display: "block",
                                      marginTop: 3,
                                    }}
                                  >
                                    {product.code} · {product.category}
                                  </small>
                                </span>
                              </label>

                              {UNIT_ORDER.map(
                                (unit) => {
                                  const priceField =
                                    unit === "piece"
                                      ? "pricePiece"
                                      : unit === "pack"
                                        ? "pricePack"
                                        : "priceBundle";
                                  const unitAllowed = Array.isArray(product.saleUnits)
                                    ? product.saleUnits.includes(unit)
                                    : false;
                                  const purchasePrice =
                                    product.purchasePrices?.[unit];
                                  const calculatedPrice =
                                    calculateMarkupPreview(
                                      purchasePrice,
                                      markupPercent
                                    );

                                  if (effectiveMode === "purchase_markup") {
                                    return (
                                      <div
                                        className="matrix-price-field matrix-price-calculated"
                                        key={unit}
                                      >
                                        <span>{UNIT_CONFIG[unit].label}</span>
                                        {!unitAllowed ? (
                                          <strong>Не продаётся</strong>
                                        ) : hasPurchasePrice(purchasePrice) ? (
                                          <>
                                            <small>
                                              Закупка: {formatMoney(purchasePrice)}
                                            </small>
                                            <strong>
                                              Клиенту: {formatMoney(calculatedPrice)}
                                            </strong>
                                          </>
                                        ) : (
                                          <strong className="danger-text">
                                            Нет цены из 1С
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
                                          disabled={!unitAllowed}
                                          placeholder={
                                            unitAllowed
                                              ? `Цена: ${
                                                  Number(product[priceField]) || 0
                                                }`
                                              : "Не продаётся"
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

                                  return (
                                    <div
                                      className="matrix-price-field matrix-price-calculated"
                                      key={unit}
                                    >
                                      <span>{UNIT_CONFIG[unit].label}</span>
                                      {!unitAllowed ? (
                                        <strong>Не продаётся</strong>
                                      ) : (
                                        <>
                                          <small>Базовая цена Clover</small>
                                          <strong>
                                            {formatMoney(product[priceField])}
                                          </strong>
                                        </>
                                      )}
                                    </div>
                                  );
                                }
                              )}

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
                                    <option value="inherit">
                                      По умолчанию клиента
                                    </option>
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
                                            [String(product.id)]: event.target.value,
                                          },
                                        }))
                                      }
                                      onBlur={() =>
                                        updatePersonalPrice(
                                          client.id,
                                          link,
                                          product.id,
                                          {
                                            markupPercent: normalizePercentInput(
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
                                    Цена 1С обновлена: {formatDateTime(product.purchasePriceUpdatedAt)}
                                  </small>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="matrix-save-bar" style={{ marginTop: 14 }}>
                    <div>
                      <strong>Сохранение товарной матрицы</strong>
                      <small>
                        После изменения режима, цен или состава нажмите кнопку справа.
                        Добавление из каталога 1С и выбор контрагента пишутся сразу.
                      </small>
                      {matrixSaveState[client.id]?.message && (
                        <span
                          className={`matrix-save-message ${
                            matrixSaveState[client.id]?.status || ""
                          }`}
                        >
                          {matrixSaveState[client.id].message}
                        </span>
                      )}
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={matrixSaveState[client.id]?.status === "saving"}
                      onClick={() => saveClientMatrix(client.id, link)}
                    >
                      {matrixSaveState[client.id]?.status === "saving"
                        ? "Сохраняем..."
                        : "Сохранить матрицу"}
                    </button>
                  </div>

                  <div
                    className="comment-box"
                    style={{ marginTop: 14 }}
                  >
                    <strong>Адреса клиента</strong>
                    <p>
                      {(() => {
                        const addresses = Array.isArray(client.addresses)
                          ? client.addresses
                          : [];
                        const text = addresses
                          .map((item) =>
                            typeof item === "string" ? item : item?.address
                          )
                          .filter(Boolean)
                          .join("; ");
                        return text || "Нет адресов";
                      })()}
                    </p>
                  </div>
                  </PanelErrorBoundary>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-box">Клиенты не найдены.</div>
      )}
    </section>
    </PanelErrorBoundary>
  );
}
