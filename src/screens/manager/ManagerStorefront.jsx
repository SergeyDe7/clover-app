import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert } from "../../shared/AppModal";
import { normalizeProduct, productArticle } from "../../shared/appHelpers";

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
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    description: "",
    composition: "",
    characteristics: "",
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
      };
      const same =
        prev.storefrontPricingMode === next.storefrontPricingMode &&
        prev.storefrontMarkupPercent === next.storefrontMarkupPercent &&
        prev.storefrontPriceTypeId === next.storefrontPriceTypeId &&
        prev.storefrontPriceTypeName === next.storefrontPriceTypeName &&
        prev.storefrontShowOnlyLinked === next.storefrontShowOnlyLinked &&
        prev.storefrontHeroTitle === next.storefrontHeroTitle &&
        prev.storefrontHeroLead === next.storefrontHeroLead;
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
  ]);

  const types = Array.isArray(oneCPriceTypes) ? oneCPriceTypes : [];

  const activeProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : [])
        .filter((item) => item?.active !== false)
        .slice()
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "ru")
        ),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLocaleLowerCase("ru-RU");
    if (!q) return activeProducts;
    return activeProducts.filter((item) => {
      const hay = `${item.name || ""} ${productArticle(item)} ${item.code || ""} ${item.category || ""}`
        .toLocaleLowerCase("ru-RU")
        .replaceAll("ё", "е");
      return hay.includes(q.replaceAll("ё", "е"));
    });
  }, [activeProducts, productQuery]);

  const onStorefrontCount = useMemo(
    () => activeProducts.filter((item) => item.showOnStorefront === true).length,
    [activeProducts]
  );

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

  const toggleProduct = (productId, checked) => {
    const next = (Array.isArray(products) ? products : []).map((item) =>
      String(item.id) === String(productId)
        ? { ...item, showOnStorefront: checked }
        : item
    );
    void persistProducts(
      next,
      checked
        ? "Товар добавлен на витрину сайта."
        : "Товар скрыт с витрины сайта."
    );
  };

  const setAllFiltered = (checked) => {
    const ids = new Set(filteredProducts.map((item) => String(item.id)));
    const next = (Array.isArray(products) ? products : []).map((item) =>
      ids.has(String(item.id)) ? { ...item, showOnStorefront: checked } : item
    );
    void persistProducts(
      next,
      checked
        ? `На витрину добавлено: ${ids.size}.`
        : `С витрины снято: ${ids.size}.`
    );
  };

  const openEditor = (item) => {
    const details =
      item.storefrontDetails && typeof item.storefrontDetails === "object"
        ? item.storefrontDetails
        : {};
    setEditingId(item.id);
    setEditDraft({
      description: String(details.description || ""),
      composition: String(details.composition || ""),
      characteristics: String(details.characteristics || ""),
    });
  };

  const closeEditor = () => {
    setEditingId(null);
    setEditDraft({ description: "", composition: "", characteristics: "" });
  };

  const saveProductCard = async (productId) => {
    const next = (Array.isArray(products) ? products : []).map((item) => {
      if (String(item.id) !== String(productId)) return item;
      return normalizeProduct({
        ...item,
        storefrontDetails: {
          description: String(editDraft.description || "").trim(),
          composition: String(editDraft.composition || "").trim(),
          characteristics: String(editDraft.characteristics || "").trim(),
        },
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
    if (!filled) return "Описание не заполнено";
    return `Заполнено полей: ${filled} из 3`;
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
        <h3>Текст на главной</h3>
        <div className="form-grid">
          <label className="field field-wide">
            Заголовок
            <input
              value={draft.storefrontHeroTitle || ""}
              placeholder="Оптовые поставки для HoReCa и бизнеса"
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
              placeholder="Каталог с артикулами из 1С…"
              onChange={(event) =>
                setField("storefrontHeroLead", event.target.value)
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
          href="/vitrina"
          target="_blank"
          rel="noreferrer"
        >
          Открыть превью
        </a>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 28 }}>
        <h3>Товары на витрине</h3>
        <p className="storefront-settings-hint">
          Отметьте товары для сайта и прямо здесь заполните описание, состав и
          характеристики. Сейчас на витрине:{" "}
          <strong>{onStorefrontCount}</strong> из {activeProducts.length}.
        </p>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label className="field field-wide">
            Поиск
            <input
              value={productQuery}
              placeholder="Название, код, категория"
              onChange={(event) => setProductQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="form-actions" style={{ marginBottom: 12 }}>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || filteredProducts.length === 0}
            onClick={() => setAllFiltered(true)}
          >
            Отметить найденные
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || filteredProducts.length === 0}
            onClick={() => setAllFiltered(false)}
          >
            Снять найденные
          </button>
        </div>
        <div className="storefront-product-pick-list">
          {filteredProducts.length === 0 ? (
            <p className="storefront-settings-hint">Нет товаров по фильтру.</p>
          ) : (
            filteredProducts.map((item) => {
              const open = String(editingId) === String(item.id);
              return (
                <div
                  className={`storefront-product-card${open ? " is-open" : ""}${
                    item.showOnStorefront ? " is-on" : ""
                  }`}
                  key={item.id}
                >
                  <div className="storefront-product-card-head">
                    <label className="storefront-check storefront-product-row">
                      <input
                        type="checkbox"
                        checked={item.showOnStorefront === true}
                        disabled={productBusy}
                        onChange={(event) =>
                          toggleProduct(item.id, event.target.checked)
                        }
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <span className="storefront-product-meta">
                          {[productArticle(item), item.category].filter(Boolean).join(" · ") ||
                            "—"}
                          {" · "}
                          {detailsPreview(item)}
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
                      </div>
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
