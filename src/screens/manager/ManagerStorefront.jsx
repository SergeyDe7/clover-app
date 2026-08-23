import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert } from "../../shared/AppModal";
import { normalizeProduct, productArticle, UNIT_ORDER, UNIT_CONFIG, unitPriceField, selectDefaultNumber, matchesCatalogPrefixSearch, productCatalogSearchHaystack, formatRussianPhone, getRussianPhoneLocalDigits } from "../../shared/appHelpers";
import { StorefrontProductAdd } from "./StorefrontProductAdd";
import { STOREFRONT_HERO_LEAD, STOREFRONT_HERO_TITLE } from "../storefront/siteCopy.js";

function formatMarkupDraft(value) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function parseMarkupPercent(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.min(1000, Math.max(0, n));
}

/**
 * Редактирование витрины clover-spb.ru — только admin.
 */
export function ManagerStorefront({
  settings,
  setSettings,
  oneCPriceTypes = [],
  products = [],
  setProducts,
}) {
  const [busy, setBusy] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [storefrontFilter, setStorefrontFilter] = useState("Все");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    description: "",
    composition: "",
    characteristics: "",
    pricingSource: "inherit",
    prices: {},
  });
  const [draft, setDraft] = useState({
    storefrontPricingMode:
      settings?.storefrontPricingMode === "purchase_markup"
        ? "purchase_markup"
        : "price_type",
    storefrontMarkupPercent: formatMarkupDraft(settings?.storefrontMarkupPercent),
    storefrontPriceTypeId: settings?.storefrontPriceTypeId || "",
    storefrontPriceTypeName: settings?.storefrontPriceTypeName || "",
    storefrontShowOnlyLinked: settings?.storefrontShowOnlyLinked !== false,
    storefrontHeroTitle: settings?.storefrontHeroTitle || "",
    storefrontHeroLead: settings?.storefrontHeroLead || "",
    storefrontContactPhone: formatRussianPhone(settings?.storefrontContactPhone || ""),
    storefrontContactEmail: settings?.storefrontContactEmail || "",
    storefrontOneCClientId: settings?.storefrontOneCClientId || "",
    storefrontOneCClientName:
      settings?.storefrontOneCClientName || "Интернет магазин Clover",
  });

  useEffect(() => {
    setDraft((prev) => {
      const next = {
        storefrontPricingMode:
          settings?.storefrontPricingMode === "purchase_markup"
            ? "purchase_markup"
            : "price_type",
        storefrontMarkupPercent: formatMarkupDraft(
          settings?.storefrontMarkupPercent
        ),
        storefrontPriceTypeId: settings?.storefrontPriceTypeId || "",
        storefrontPriceTypeName: settings?.storefrontPriceTypeName || "",
        storefrontShowOnlyLinked: settings?.storefrontShowOnlyLinked !== false,
        storefrontHeroTitle: settings?.storefrontHeroTitle || "",
        storefrontHeroLead: settings?.storefrontHeroLead || "",
        storefrontContactPhone: formatRussianPhone(settings?.storefrontContactPhone || ""),
        storefrontContactEmail: settings?.storefrontContactEmail || "",
        storefrontOneCClientId: settings?.storefrontOneCClientId || "",
        storefrontOneCClientName:
          settings?.storefrontOneCClientName || "Интернет магазин Clover",
      };
      const same =
        prev.storefrontPricingMode === next.storefrontPricingMode &&
        prev.storefrontMarkupPercent === next.storefrontMarkupPercent &&
        prev.storefrontPriceTypeId === next.storefrontPriceTypeId &&
        prev.storefrontPriceTypeName === next.storefrontPriceTypeName &&
        prev.storefrontShowOnlyLinked === next.storefrontShowOnlyLinked &&
        prev.storefrontHeroTitle === next.storefrontHeroTitle &&
        prev.storefrontHeroLead === next.storefrontHeroLead &&
        prev.storefrontContactPhone === next.storefrontContactPhone &&
        prev.storefrontContactEmail === next.storefrontContactEmail &&
        prev.storefrontOneCClientId === next.storefrontOneCClientId &&
        prev.storefrontOneCClientName === next.storefrontOneCClientName;
      return same ? prev : next;
    });
  }, [
    settings?.storefrontPricingMode,
    settings?.storefrontMarkupPercent,
    settings?.storefrontPriceTypeId,
    settings?.storefrontPriceTypeName,
    settings?.storefrontShowOnlyLinked,
    settings?.storefrontHeroTitle,
    settings?.storefrontHeroLead,
    settings?.storefrontContactPhone,
    settings?.storefrontContactEmail,
    settings?.storefrontOneCClientId,
    settings?.storefrontOneCClientName,
  ]);

  const types = Array.isArray(oneCPriceTypes) ? oneCPriceTypes : [];

  const activeProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : [])
        .filter((item) => item?.active !== false)
        .slice()
        .sort((a, b) => {
          const aOn = a.showOnStorefront === true ? 0 : 1;
          const bOn = b.showOnStorefront === true ? 0 : 1;
          if (aOn !== bOn) return aOn - bOn;
          return String(a.name || "").localeCompare(String(b.name || ""), "ru");
        }),
    [products]
  );

  const filteredProducts = useMemo(() => {
    return activeProducts.filter((item) => {
      const onStorefront = item.showOnStorefront === true;
      if (storefrontFilter === "На витрине" && !onStorefront) return false;
      if (storefrontFilter === "Не на витрине" && onStorefront) return false;
      return matchesCatalogPrefixSearch(
        productCatalogSearchHaystack(item, { includeAdminFields: true }),
        productQuery
      );
    });
  }, [activeProducts, productQuery, storefrontFilter]);

  const onStorefrontCount = useMemo(
    () => activeProducts.filter((item) => item.showOnStorefront === true).length,
    [activeProducts]
  );

  const selectedCount = selectedIds.size;

  const setField = (key, value) => {
    setSettingsSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const onPriceTypeChange = (event) => {
    const id = event.target.value;
    const found = types.find((item) => String(item.id) === String(id));
    setSettingsSaved(false);
    setDraft((prev) => ({
      ...prev,
      storefrontPriceTypeId: id,
      storefrontPriceTypeName: found?.name || "",
    }));
  };

  const save = async () => {
    setBusy(true);
    setSettingsSaved(false);
    try {
      const payload = {
        ...draft,
        storefrontMarkupPercent: parseMarkupPercent(draft.storefrontMarkupPercent),
        storefrontContactPhone: getRussianPhoneLocalDigits(draft.storefrontContactPhone)
          ? draft.storefrontContactPhone
          : "",
        storefrontContactEmail: String(draft.storefrontContactEmail || "").trim(),
      };
      const result = await api.saveStorefrontSettings(payload);
      const next = result.settings || { ...settings, ...payload };
      setSettings(next);
      setSettingsSaved(true);
    } catch (error) {
      await appAlert({
        title: "Не удалось сохранить",
        message: error.message || "Ошибка сохранения.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const persistProducts = async (nextProducts, message) => {
    setProductBusy(true);
    try {
      const result = await api.saveProducts(nextProducts);
      const saved = result.products || nextProducts;
      setProducts?.(saved);
      await appAlert({
        title: "Сохранено",
        message,
        tone: "success",
      });
      return saved;
    } catch (error) {
      await appAlert({
        title: "Не удалось сохранить товары",
        message: error.message || "Ошибка сохранения.",
        tone: "danger",
      });
      return null;
    } finally {
      setProductBusy(false);
    }
  };

  const toggleSelected = (productId, checked) => {
    const key = String(productId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredProducts.map((item) => String(item.id))));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const applySelectionToStorefront = async (checked) => {
    if (!selectedIds.size) return;
    const ids = selectedIds;
    let touched = 0;
    const next = (Array.isArray(products) ? products : []).map((item) => {
      if (!ids.has(String(item.id))) return item;
      const on = item.showOnStorefront === true;
      if (checked && on) return item;
      if (!checked && !on) return item;
      touched += 1;
      return { ...item, showOnStorefront: checked };
    });
    if (!touched) {
      await appAlert({
        title: checked ? "Уже на витрине" : "Не на витрине",
        message: checked
          ? "Выбранные позиции уже добавлены на витрину."
          : "Среди выбранных нет позиций на витрине.",
      });
      clearSelection();
      return;
    }
    const saved = await persistProducts(
      next,
      checked
        ? `На витрину добавлено: ${touched}.`
        : `С витрины снято: ${touched}.`
    );
    if (saved) clearSelection();
  };

  const openEditor = (item) => {
    const details =
      item.storefrontDetails && typeof item.storefrontDetails === "object"
        ? item.storefrontDetails
        : {};
    const pricing =
      item.storefrontPricing && typeof item.storefrontPricing === "object"
        ? item.storefrontPricing
        : {};
    const prices = {};
    for (const unit of UNIT_ORDER) {
      prices[unit] =
        pricing[unit] == null || pricing[unit] === ""
          ? ""
          : String(pricing[unit]);
    }
    setEditingId(item.id);
    setEditDraft({
      description: String(details.description || ""),
      composition: String(details.composition || ""),
      characteristics: String(details.characteristics || ""),
      pricingSource: pricing.source === "manual" ? "manual" : "inherit",
      prices,
    });
  };

  const closeEditor = () => {
    setEditingId(null);
    setEditDraft({
      description: "",
      composition: "",
      characteristics: "",
      pricingSource: "inherit",
      prices: {},
    });
  };

  const saveProductCard = async (productId) => {
    const next = (Array.isArray(products) ? products : []).map((item) => {
      if (String(item.id) !== String(productId)) return item;
      const storefrontPricing = {
        source: editDraft.pricingSource === "manual" ? "manual" : "inherit",
      };
      for (const unit of UNIT_ORDER) {
        const raw = editDraft.prices?.[unit];
        if (raw === "" || raw == null) {
          storefrontPricing[unit] = null;
          continue;
        }
        const numeric = Number(String(raw).replace(",", "."));
        storefrontPricing[unit] =
          Number.isFinite(numeric) && numeric >= 0
            ? Math.round(numeric * 100) / 100
            : null;
      }
      return normalizeProduct({
        ...item,
        storefrontDetails: {
          description: String(editDraft.description || "").trim(),
          composition: String(editDraft.composition || "").trim(),
          characteristics: String(editDraft.characteristics || "").trim(),
        },
        storefrontPricing,
      });
    });
    const saved = await persistProducts(
      next,
      "Карточка товара на витрине обновлена."
    );
    if (saved) closeEditor();
  };

  const detailsPreview = (item) => {
    const details =
      item.storefrontDetails && typeof item.storefrontDetails === "object"
        ? item.storefrontDetails
        : {};
    const filled = [
      details.description,
      details.composition,
      details.characteristics,
    ].filter((value) => String(value || "").trim()).length;
    const manual = item.storefrontPricing?.source === "manual";
    const parts = [];
    if (filled) parts.push(`описание ${filled}/3`);
    else parts.push("описание не заполнено");
    if (manual) parts.push("своя цена");
    return parts.join(" · ");
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Витрина сайта</h2>
          <p>
            Редактирование публичного сайта (clover-spb.ru / превью /vitrina).
            Доступно только администратору.
          </p>
        </div>
      </div>

      <div className="manager-contact-settings storefront-settings-card">
        <h3>Цены на сайте</h3>
        <p className="storefront-settings-hint">
          Как считать цену на витрине. В ЛК у клиентов — персональные цены матрицы.
        </p>

        <div className="storefront-pricing-modes" role="radiogroup" aria-label="Режим цен витрины">
          <label className="storefront-check">
            <input
              type="radio"
              name="storefront-pricing-mode"
              checked={draft.storefrontPricingMode !== "purchase_markup"}
              onChange={() => setField("storefrontPricingMode", "price_type")}
            />
            <span>Вид цен 1С</span>
          </label>
          <label className="storefront-check">
            <input
              type="radio"
              name="storefront-pricing-mode"
              checked={draft.storefrontPricingMode === "purchase_markup"}
              onChange={() => setField("storefrontPricingMode", "purchase_markup")}
            />
            <span>Закупочная + %</span>
          </label>
        </div>

        {draft.storefrontPricingMode === "purchase_markup" ? (
          <>
            <label className="storefront-price-field">
              <span>Наценка, %</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={draft.storefrontMarkupPercent}
                onChange={(event) => {
                  const raw = String(event.target.value).replace(",", ".");
                  if (raw === "") {
                    setField("storefrontMarkupPercent", "");
                    return;
                  }
                  // Разрешаем промежуточный ввод: 0, 0., 12.5
                  if (!/^\d{0,4}(\.\d{0,2})?$/.test(raw)) return;
                  setField("storefrontMarkupPercent", raw);
                }}
                onBlur={() => {
                  setField(
                    "storefrontMarkupPercent",
                    String(parseMarkupPercent(draft.storefrontMarkupPercent))
                  );
                }}
              />
            </label>
            <p className="storefront-settings-hint">
              База — закупочная цена из выгрузки 1С (и вид «Закупочная», если он
              свежее). Итог: закупка × (1 + % / 100), округление вверх как в ЛК.
            </p>
          </>
        ) : (
          <>
            <label className="storefront-price-field">
              <span>Вид цен витрины</span>
              <select
                value={draft.storefrontPriceTypeId || ""}
                onChange={onPriceTypeChange}
              >
                <option value="">Не выбран</option>
                {types.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="storefront-price-field" style={{ marginTop: 12 }}>
              <span>Запасная наценка, %, если вида цен нет</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={draft.storefrontMarkupPercent}
                onChange={(event) => {
                  const raw = String(event.target.value).replace(",", ".");
                  if (raw === "") {
                    setField("storefrontMarkupPercent", "");
                    return;
                  }
                  if (!/^\d{0,4}(\.\d{0,2})?$/.test(raw)) return;
                  setField("storefrontMarkupPercent", raw);
                }}
                onBlur={() => {
                  setField(
                    "storefrontMarkupPercent",
                    String(parseMarkupPercent(draft.storefrontMarkupPercent))
                  );
                }}
              />
            </label>
            <p className="storefront-settings-hint">
              Сначала берётся выбранный вид цен 1С. Если его нет у товара —
              цена = закупка / «Закупочная» × (1 + запасная наценка / 100).
            </p>
          </>
        )}

        <label className="storefront-check">
          <input
            type="checkbox"
            checked={Boolean(draft.storefrontShowOnlyLinked)}
            onChange={(event) =>
              setField("storefrontShowOnlyLinked", event.target.checked)
            }
          />
          <span>Только товары, связанные с 1С</span>
        </label>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 20 }}>
        <h3>Контрагент 1С для заказов с сайта</h3>
        <p className="storefront-settings-hint">
          Гостевые заказы без регистрации уходят в 1С на одного контрагента.
          Контакт покупателя остаётся в комментарии заказа. В 1С у этого
          контрагента должен быть договор «Основной договор».
        </p>
        <div className="form-grid">
          <label className="field field-wide">
            Название в 1С
            <input
              value={draft.storefrontOneCClientName || ""}
              placeholder="Интернет магазин Clover"
              onChange={(event) =>
                setField("storefrontOneCClientName", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">
            ID контрагента 1С (необязательно)
            <input
              value={draft.storefrontOneCClientId || ""}
              placeholder="если известен GUID из выгрузки"
              onChange={(event) =>
                setField("storefrontOneCClientId", event.target.value)
              }
            />
          </label>
        </div>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 20 }}>
        <h3>Текст на главной</h3>
        <div className="form-grid">
          <label className="field field-wide">
            Заголовок
            <input
              value={draft.storefrontHeroTitle || ""}
              placeholder={STOREFRONT_HERO_TITLE}
              onChange={(event) =>
                setField("storefrontHeroTitle", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">
            Подзаголовок
            <textarea
              rows={3}
              value={draft.storefrontHeroLead || ""}
              placeholder={STOREFRONT_HERO_LEAD}
              onChange={(event) =>
                setField("storefrontHeroLead", event.target.value)
              }
            />
          </label>
        </div>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 20 }}>
        <h3>Контакты на витрине</h3>
        <p className="storefront-settings-hint">
          Кнопка «Контакты» в шапке сайта показывает телефон и почту. Пустые
          поля на витрине скрываются.
        </p>
        <div className="form-grid">
          <label className="field">
            Телефон
            <input
              inputMode="tel"
              autoComplete="tel"
              value={draft.storefrontContactPhone || ""}
              placeholder="+7 (___) ___-__-__"
              onFocus={(event) => {
                if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                  requestAnimationFrame(() => {
                    const end = event.currentTarget.value.length;
                    event.currentTarget.setSelectionRange(end, end);
                  });
                }
              }}
              onChange={(event) =>
                setField(
                  "storefrontContactPhone",
                  formatRussianPhone(event.target.value)
                )
              }
            />
          </label>
          <label className="field">
            Почта
            <input
              type="email"
              autoComplete="email"
              value={draft.storefrontContactEmail || ""}
              placeholder="hello@clover-spb.ru"
              onChange={(event) =>
                setField("storefrontContactEmail", event.target.value)
              }
            />
          </label>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button
          className={`primary-button${settingsSaved && !busy ? " is-saved" : ""}`}
          type="button"
          disabled={busy || settingsSaved}
          onClick={() => void save()}
        >
          {busy ? "Сохранение…" : settingsSaved ? "Сохранено" : "Сохранить витрину"}
        </button>
        <a
          className="secondary-button"
          href="/"
          target="_blank"
          rel="noreferrer"
        >
          Открыть превью
        </a>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 28 }}>
        <h3>Товары на витрине</h3>
        <p className="storefront-settings-hint">
          На сайте имя товара = как в матрице Clover (не сырое название 1С).
          Можно выбрать из каталога ниже или добавить из 1С / Excel, даже если
          позиции ещё нет ни у одного клиента. Сейчас на витрине:{" "}
          <strong>{onStorefrontCount}</strong> из {activeProducts.length}.
          Выбрано: <strong>{selectedCount}</strong>.
        </p>
        <StorefrontProductAdd
          products={products}
          setProducts={setProducts}
          onAfterAdd={() => {
            setSelectedIds(new Set());
          }}
        />
        <div className="form-grid storefront-catalog-filters" style={{ marginBottom: 12 }}>
          <label className="field">
            Поиск по каталогу Clover
            <input
              value={productQuery}
              placeholder="Название, артикул, категория"
              onChange={(event) => setProductQuery(event.target.value)}
            />
          </label>
          <label className="field">
            На витрине
            <select
              value={storefrontFilter}
              onChange={(event) => setStorefrontFilter(event.target.value)}
            >
              <option>Все</option>
              <option>На витрине</option>
              <option>Не на витрине</option>
            </select>
          </label>
        </div>
        <div className="storefront-pick-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || filteredProducts.length === 0}
            onClick={selectAllFiltered}
          >
            Выбрать все
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || selectedCount === 0}
            onClick={clearSelection}
          >
            Снять выбор
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={productBusy || selectedCount === 0}
            onClick={() => void applySelectionToStorefront(true)}
          >
            Добавить на витрину
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || selectedCount === 0}
            onClick={() => void applySelectionToStorefront(false)}
          >
            Убрать с витрины
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || onStorefrontCount === 0}
            onClick={() => {
              void (async () => {
                setProductBusy(true);
                try {
                  const result = await api.enrichStorefrontAll({
                    forceCopy: true,
                  });
                  await appAlert({
                    title: "Очередь запущена",
                    message:
                      result.message ||
                      `Обновление описаний: ${result.queued || 0} товар(ов). Старые тексты сохраняются до замены.`,
                    tone: "success",
                  });
                } catch (error) {
                  await appAlert({
                    title: "Не удалось обновить описания",
                    message: error.message || "Ошибка очереди enrichment.",
                    tone: "danger",
                  });
                } finally {
                  setProductBusy(false);
                }
              })();
            }}
          >
            Обновить описания
          </button>
        </div>
        <div className="storefront-product-pick-list">
          {filteredProducts.length === 0 ? (
            <p className="storefront-settings-hint">Нет товаров по фильтру.</p>
          ) : (
            filteredProducts.map((item) => {
              const open = String(editingId) === String(item.id);
              const selected = selectedIds.has(String(item.id));
              const onStorefront = item.showOnStorefront === true;
              return (
                <div
                  className={`storefront-product-card${open ? " is-open" : ""}${
                    onStorefront ? " is-on" : ""
                  }${selected ? " is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="storefront-product-card-head">
                    <label className="storefront-check storefront-product-row">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={productBusy}
                        onChange={(event) =>
                          toggleSelected(item.id, event.target.checked)
                        }
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <span className="storefront-product-meta">
                          {onStorefront ? (
                            <span className="badge green" style={{ marginRight: 6 }}>
                              На витрине
                            </span>
                          ) : (
                            <span className="badge yellow" style={{ marginRight: 6 }}>
                              Не на витрине
                            </span>
                          )}
                          {[productArticle(item), item.category].filter(Boolean).join(" · ") ||
                            "—"}
                          {" · "}
                          {detailsPreview(item)}
                          {item.imageUrl ? " · фото есть" : " · без фото"}
                        </span>
                      </span>
                    </label>
                    <button
                      className="secondary-button storefront-product-edit-btn"
                      type="button"
                      disabled={productBusy}
                      onClick={() => (open ? closeEditor() : openEditor(item))}
                    >
                      {open ? "Свернуть" : "Карточка"}
                    </button>
                  </div>
                  {open ? (
                    <div className="storefront-product-card-editor">
                      <div className="form-grid">
                        <label className="field field-wide">
                          Описание
                          <textarea
                            rows={3}
                            value={editDraft.description}
                            placeholder="Кратко о товаре для витрины"
                            disabled={productBusy}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field field-wide">
                          Состав
                          <textarea
                            rows={2}
                            value={editDraft.composition}
                            placeholder="Состав / материалы"
                            disabled={productBusy}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                composition: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field field-wide">
                          Характеристики
                          <textarea
                            rows={3}
                            value={editDraft.characteristics}
                            placeholder="Размеры, плотность, упаковка и т.п."
                            disabled={productBusy}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                characteristics: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field field-wide">
                          Цена на сайте
                          <select
                            value={editDraft.pricingSource}
                            disabled={productBusy}
                            onChange={(event) => {
                              const pricingSource =
                                event.target.value === "manual"
                                  ? "manual"
                                  : "inherit";
                              setEditDraft((prev) => {
                                const prices = { ...(prev.prices || {}) };
                                if (pricingSource === "manual") {
                                  const units =
                                    Array.isArray(item.saleUnits) &&
                                    item.saleUnits.length
                                      ? item.saleUnits
                                      : ["piece"];
                                  for (const unit of units) {
                                    if (prices[unit] === "" || prices[unit] == null) {
                                      const catalog =
                                        Number(item[unitPriceField(unit)]) || 0;
                                      prices[unit] =
                                        catalog > 0 ? String(catalog) : "";
                                    }
                                  }
                                }
                                return { ...prev, pricingSource, prices };
                              });
                            }}
                          >
                            <option value="inherit">
                              Как в настройках витрины
                            </option>
                            <option value="manual">
                              Своя цена для этого товара
                            </option>
                          </select>
                        </label>
                        {editDraft.pricingSource === "manual"
                          ? (Array.isArray(item.saleUnits) && item.saleUnits.length
                              ? item.saleUnits
                              : ["piece"]
                            ).map((unit) => (
                              <label className="field" key={`sf-m-${item.id}-${unit}`}>
                                {UNIT_CONFIG[unit]?.label || unit}, ₽
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={productBusy}
                                  value={editDraft.prices?.[unit] ?? ""}
                                  placeholder="0"
                                  onFocus={selectDefaultNumber}
                                  onChange={(event) =>
                                    setEditDraft((prev) => ({
                                      ...prev,
                                      prices: {
                                        ...(prev.prices || {}),
                                        [unit]: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            ))
                          : null}
                      </div>
                      {editDraft.pricingSource === "manual" &&
                      draft.storefrontPricingMode === "purchase_markup" ? (
                        <p className="storefront-settings-hint" style={{ marginTop: 8 }}>
                          Перекрывает расчёт «закупочная + %» только на сайте.
                        </p>
                      ) : null}
                      <div className="form-actions" style={{ marginTop: 10 }}>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={productBusy}
                          onClick={() => void saveProductCard(item.id)}
                        >
                          {productBusy ? "Сохранение…" : "Сохранить карточку"}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={productBusy}
                          onClick={closeEditor}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
