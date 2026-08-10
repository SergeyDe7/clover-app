// Модалка редактирования товара каталога: поля, ед. измерения, фото, связь с 1С.
import { useMemo, useState } from "react";
import { api } from "../../serverApi";
import {
  UNIT_ORDER,
  UNIT_CONFIG,
  unitSizeField,
  unitPriceField,
  unitConvertsOneToOneToPieces,
  selectDefaultNumber,
  hasPurchasePrice,
  formatMoney,
  formatDateTime,
  normalizeProduct,
  inferProductCategory,
  pickProductCardOneCCost,
} from "../../shared/appHelpers";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { normalizeProductPhotoFile, productImageSrc } from "../../shared/productPhoto";
import {
  CLOVER_PRODUCT_GROUPS,
  getGroupChildren,
  getSubgroupFacets,
  groupRequiresSubgroup,
  canonicalizeProductCategory,
} from "../storefront/productGroups.js";

function sortOneCPickerResults(items, currentProductId) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const aLinkedElsewhere =
      a.cloverLink?.productId &&
      String(a.cloverLink.productId) !== String(currentProductId || "");
    const bLinkedElsewhere =
      b.cloverLink?.productId &&
      String(b.cloverLink.productId) !== String(currentProductId || "");
    if (aLinkedElsewhere !== bLinkedElsewhere) {
      return aLinkedElsewhere ? 1 : -1;
    }
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  });
}

/** Кандидаты сверху, затем полный каталог; без дублей по id. */
function mergeOneCPickerResults(candidates, catalogItems, currentProductId) {
  const seen = new Set();
  const merged = [];
  for (const item of [...(candidates || []), ...(catalogItems || [])]) {
    const id = String(item?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return sortOneCPickerResults(merged, currentProductId);
}

/** Категории: канон витрины + уже используемые в каталоге + текущее значение. */
function buildCategoryOptions(products, currentCategory) {
  const fromCatalog = new Set();
  for (const item of Array.isArray(products) ? products : []) {
    const name = String(item?.category || "").trim();
    if (name) fromCatalog.add(name);
  }
  const current = String(currentCategory || "").trim();
  if (current) fromCatalog.add(current);

  const options = [...CLOVER_PRODUCT_GROUPS];
  const extras = [...fromCatalog]
    .filter((name) => !options.includes(name))
    .sort((a, b) => a.localeCompare(b, "ru"));
  options.push(...extras);
  return options;
}

export function ProductEditor({
  product,
  products = [],
  oneCPriceTypes = [],
  onClose,
  onSave,
  onProductLiveUpdate,
}) {
  const isNew = !product;
  const [form, setForm] = useState(
    product || {
      name: "",
      category: "Новые товары",
      code: "",
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCMatchCode: "",
      oneCMatchName: "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "",
      oneCLinkedAt: "",
      active: true,
      showOnStorefront: false,
      subcategory: "",
      facet: "",
      storefrontDetails: {
        description: "",
        composition: "",
        characteristics: "",
      },
      storefrontPricing: {
        source: "inherit",
      },
      pieceSize: 1,
      pieceOrderMultiple: 1,
      packSize: 1,
      bundleSize: 1,
      boxSize: 1,
      pairSize: 1,
      meterSize: 1,
      rollSize: 1,
      pricePiece: 0,
      pricePack: 0,
      priceBundle: 0,
      priceBox: 0,
      pricePair: 0,
      priceMeter: 0,
      priceRoll: 0,
      saleUnits: ["piece"],
    }
  );
  const [oneCOpen, setOneCOpen] = useState(false);
  const [oneCSearch, setOneCSearch] = useState(product?.oneCName || product?.name || "");
  const [oneCResults, setOneCResults] = useState([]);
  const [oneCTotal, setOneCTotal] = useState(0);
  const [oneCLoading, setOneCLoading] = useState(false);
  const [oneCError, setOneCError] = useState("");
  const [oneCNotice, setOneCNotice] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [certificateBusy, setCertificateBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);

  const productId = form.id || product?.id;
  const categoryOptions = useMemo(
    () => buildCategoryOptions(products, form.category),
    [products, form.category]
  );
  const categoryKey = canonicalizeProductCategory(form.category || "");
  const subcategoryOptions = useMemo(
    () => getGroupChildren(categoryKey).map((item) => item.name),
    [categoryKey]
  );
  const facetOptions = useMemo(
    () =>
      getSubgroupFacets(categoryKey, form.subcategory || "").map(
        (item) => item.name
      ),
    [categoryKey, form.subcategory]
  );
  const needsSubcategory = groupRequiresSubgroup(categoryKey);

  const applyLiveProduct = (nextProduct) => {
    const normalized = normalizeProduct(nextProduct);
    setForm(normalized);
    onProductLiveUpdate?.(normalized);
  };

  const toggleUnit = (unit, checked) => {
    const next = checked
      ? [...new Set([...form.saleUnits, unit])]
      : form.saleUnits.filter((item) => item !== unit);
    setForm({ ...form, saleUnits: next.length ? next : ["piece"] });
  };

  const searchOneCProducts = async (query = oneCSearch) => {
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      const needle = String(query || "").trim();
      const result = await api.getOneCProducts({
        search: needle,
        limit: 100,
        offset: 0,
      });
      setOneCResults(sortOneCPickerResults(result.items || [], productId));
      setOneCTotal(Number(result.total) || 0);
      if (!needle) {
        setOneCNotice(
          "Полная выгрузка 1С. Свободные позиции сверху. Введите название или код и нажмите «Найти»."
        );
      }
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const openOneCSearch = async () => {
    const hintQuery =
      form.oneCSearchQuery ||
      form.oneCCode ||
      form.oneCMatchCode ||
      form.oneCName ||
      form.oneCMatchName ||
      form.name ||
      "";
    setOneCSearch(hintQuery);
    setOneCOpen(true);
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      let candidates = [];
      if (productId) {
        try {
          const candidateResult = await api.getOneCProductCandidates(productId);
          candidates = candidateResult.items || [];
        } catch {
          candidates = [];
        }
      }

      // Ищем по названию товара Clover (токены на сервере: ×≈х и т.п.),
      // а не по «первым 100 алфавитом» — иначе кажется, что каталога нет.
      const result = await api.getOneCProducts({
        search: String(hintQuery || "").trim(),
        limit: 100,
        offset: 0,
      });
      let catalogItems = result.items || [];
      let total = Number(result.total) || catalogItems.length;

      // Если по полному названию пусто — всё равно показать срез каталога.
      if (!catalogItems.length && hintQuery) {
        const fallback = await api.getOneCProducts({
          search: "",
          limit: 100,
          offset: 0,
        });
        catalogItems = fallback.items || [];
        total = Number(fallback.total) || catalogItems.length;
        setOneCNotice(
          `По «${hintQuery}» точных совпадений нет. Показан каталог 1С (${total}). Уточните слова и нажмите «Найти».`
        );
      } else {
        setOneCNotice(
          total
            ? `Найдено в выгрузке 1С: ${total}. Свободные сверху. Можно править строку поиска и жать «Найти» / «Весь каталог».`
            : "В выгрузке 1С пока пусто — сначала «Отправить товары» из VLAVKA."
        );
      }

      setOneCResults(mergeOneCPickerResults(candidates, catalogItems, productId));
      setOneCTotal(total);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const applyOneCProduct = (item) => {
    const nextName = item.name || form.name || "";
    const keepCategory =
      form.category &&
      form.category !== "Новые товары" &&
      form.category !== "Из 1С";
    const nextProduct = normalizeProduct({
      ...form,
      name: nextName || form.name,
      category: keepCategory
        ? form.category
        : inferProductCategory(nextName, products),
      oneCId: item.id,
      oneCCode: item.code || "",
      oneCName: item.name || "",
      oneCMatchCode: item.code || "",
      oneCMatchName: item.name || "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual",
      oneCLinkedAt: new Date().toISOString(),
    });

    setForm(nextProduct);
    setOneCOpen(false);
    setOneCError("");
    setOneCNotice(
      `Позиция 1С выбрана. Категория: «${nextProduct.category}». Проверьте единицы и цены, затем «Сохранить товар».`
    );
  };

  const selectOneCProduct = async (item) => {
    const linkedToCurrent =
      item.cloverLink &&
      String(item.cloverLink.productId) === String(productId);
    if (linkedToCurrent) {
      setOneCOpen(false);
      return;
    }

    const linkedElsewhere = Boolean(item.cloverLink?.productId);
    if (linkedElsewhere) {
      const ok = await appConfirm({
        title: "Позиция уже связана",
        message: `«${item.name}» уже связана с товаром «${item.cloverLink.productName || item.cloverLink.productId}». Перепривязать к текущему товару?`,
        confirmLabel: "Перепривязать",
        cancelLabel: "Отмена",
        tone: "warn",
      });
      if (!ok) return;
    }

    applyOneCProduct(item);
  };

  const requestOneCSearch = async () => {
    if (!productId) {
      setForm((current) => ({
        ...current,
        oneCSearchQuery: oneCSearch || current.name,
      }));
      setOneCNotice("Запрос будет сохранён вместе с новым товаром.");
      return;
    }
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.requestOneCProduct(productId, {
        query: oneCSearch || form.name,
        code: form.oneCMatchCode || "",
        name: form.oneCMatchName || "",
      });
      const updatedProduct = normalizeProduct({
        ...form,
        ...(result.product || {}),
        oneCSearchQuery: oneCSearch || form.name,
      });
      setForm(updatedProduct);
      setOneCNotice(result.message || "Запрос сохранён.");
      await onSave(updatedProduct);
    } catch (error) {
      setOneCError(error.message);
    } finally {
      setOneCLoading(false);
    }
  };

  const clearOneCProduct = () => {
    setForm((current) => ({
      ...current,
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCMatchCode: "",
      oneCMatchName: "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual-cleared",
      oneCLinkedAt: "",
    }));
  };

  const uploadImage = async (file) => {
    if (!file || !productId) return;

    setImageBusy(true);
    try {
      const normalized = await normalizeProductPhotoFile(file);
      const result = await api.uploadProductImage(productId, normalized);
      applyLiveProduct({ ...form, ...result.product });
      await appAlert({
        title: "Фото сохранено",
        message: "Фото приведено к единому формату каталога и сохранено.",
        tone: "success",
      });
    } catch (error) {
      await appAlert({
        title: "Ошибка загрузки",
        message: error.message,
        tone: "danger",
      });
    } finally {
      setImageBusy(false);
    }
  };

  const deleteImage = async () => {
    if (!productId || !form.imageUrl) return;
    const ok = await appConfirm({
      title: "Удалить фото?",
      message: `Удалить фотографию товара «${form.name || "товар"}»?`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;

    setImageBusy(true);
    try {
      const result = await api.deleteProductImage(productId);
      applyLiveProduct({ ...form, ...result.product });
    } catch (error) {
      await appAlert({
        title: "Ошибка удаления",
        message: error.message,
        tone: "danger",
      });
    } finally {
      setImageBusy(false);
    }
  };

  const uploadCertificate = async (file) => {
    if (!file || !productId) return;
    setCertificateBusy(true);
    try {
      const result = await api.uploadProductCertificate(productId, file);
      applyLiveProduct({ ...form, ...result.product });
      await appAlert({
        title: "Сертификат сохранён",
        message: "Файл сертификата загружен на сервер.",
        tone: "success",
      });
    } catch (error) {
      await appAlert({
        title: "Ошибка загрузки",
        message: error.message,
        tone: "danger",
      });
    } finally {
      setCertificateBusy(false);
    }
  };

  const deleteCertificate = async () => {
    if (!productId || !form.certificateUrl) return;
    const ok = await appConfirm({
      title: "Удалить сертификат?",
      message: `Удалить сертификат товара «${form.name || "товар"}»?`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;

    setCertificateBusy(true);
    try {
      const result = await api.deleteProductCertificate(productId);
      applyLiveProduct({ ...form, ...result.product });
    } catch (error) {
      await appAlert({
        title: "Ошибка удаления",
        message: error.message,
        tone: "danger",
      });
    } finally {
      setCertificateBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim()) return;
    if (needsSubcategory && !String(form.subcategory || "").trim()) {
      void appAlert({
        title: "Выберите подкатегорию",
        message: `Для группы «${categoryKey}» нужно указать подкатегорию.`,
      });
      return;
    }

    onSave(
      normalizeProduct({
        ...form,
        name: form.name.trim(),
        category: form.category.trim(),
        subcategory: String(form.subcategory || "").trim(),
        facet: String(form.facet || "").trim(),
        oneCId: String(form.oneCId || "").trim(),
        oneCCode: String(form.oneCCode || "").trim(),
        oneCName: String(form.oneCName || "").trim(),
        oneCMatchCode: String(form.oneCMatchCode || "").trim(),
        oneCMatchName: String(form.oneCMatchName || "").trim(),
        oneCSearchQuery: String(form.oneCSearchQuery || "").trim(),
        oneCSearchRequestedAt: String(form.oneCSearchRequestedAt || "").trim(),
      })
    );
  };

  return (
    <div
      className="product-editor"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="product-editor-card" onSubmit={submit}>
        <div className="product-editor-scroll">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Каталог</p>
            <h2>{isNew ? "Новый товар" : "Редактирование товара"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="product-editor-photo">
          <div className="product-editor-photo-preview">
            {form.imageUrl ? (
              <img src={productImageSrc(form)} alt={form.name || "Фото товара"} />
            ) : (
              <span>Нет фото</span>
            )}
          </div>
          <div className="product-editor-photo-actions">
            <p className="eyebrow">Фото товара</p>
            {productId ? (
              <>
                <label className="image-upload-label">
                  {imageBusy
                    ? "Загрузка..."
                    : form.imageUrl
                      ? "Заменить фото"
                      : "Добавить фото"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={imageBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      void uploadImage(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                {form.imageUrl ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={imageBusy}
                    onClick={() => void deleteImage()}
                  >
                    Удалить фото
                  </button>
                ) : null}
                <small className="muted">JPG, PNG или WEBP до 5 МБ. Автоматически: квадрат 800×800, белый фон, JPEG.</small>
              </>
            ) : (
              <small className="muted">
                Сначала сохраните товар — затем можно будет добавить фото.
              </small>
            )}
          </div>
        </section>

        <section className="product-editor-files">
          <p className="eyebrow" style={{ margin: 0 }}>Сертификат</p>
          {productId ? (
            <div className="product-editor-files-row">
              {form.certificateUrl ? (
                <a
                  className="product-cert-link"
                  href={form.certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {form.certificateName || "Открыть сертификат"}
                </a>
              ) : (
                <small className="muted">Файл ещё не загружен</small>
              )}
              <label className="image-upload-label">
                {certificateBusy
                  ? "Загрузка..."
                  : form.certificateUrl
                    ? "Заменить"
                    : "Загрузить сертификат"}
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,.pdf"
                  disabled={certificateBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    void uploadCertificate(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {form.certificateUrl ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={certificateBusy}
                  onClick={() => void deleteCertificate()}
                >
                  Удалить
                </button>
              ) : null}
              <small className="muted">PDF, JPG, PNG или WEBP до 10 МБ.</small>
            </div>
          ) : (
            <small className="muted">
              Сначала сохраните товар — затем можно загрузить сертификат.
            </small>
          )}
        </section>

        <section className="purchase-price-card">
          {(() => {
            const card = pickProductCardOneCCost({
              purchasePrices: form.purchasePrices,
              purchaseUpdatedAt:
                form.purchasePriceReceivedAt || form.purchasePriceUpdatedAt || "",
              salePricesByType: form.salePricesByType,
              salePriceReceivedAt: form.salePriceReceivedAt || "",
              oneCPriceTypes,
            });
            const available = hasPurchasePrice(card.cost);
            return (
              <>
                <div className="purchase-price-card-head">
                  <div>
                    <p className="eyebrow">Цена из 1С</p>
                    <h3>{card.title}</h3>
                  </div>
                  <small>
                    {card.updatedAt
                      ? `Обновлено: ${formatDateTime(card.updatedAt)}`
                      : "Цена из 1С ещё не получена"}
                  </small>
                </div>
                <div className="purchase-price-single">
                  <strong>{available ? formatMoney(card.cost) : "—"}</strong>
                  <small>
                    {available
                      ? `${card.sourceLabel} · ${UNIT_CONFIG[card.unit]?.label || "шт"}`
                      : "Нет цены из 1С"}
                  </small>
                </div>
              </>
            );
          })()}
        </section>

        <div className="form-grid">
          <label className="field">
            Название товара
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="field">
            Категория
            <select
              value={form.category || ""}
              onChange={(e) => {
                const category = e.target.value;
                const nextKey = canonicalizeProductCategory(category);
                const children = getGroupChildren(nextKey).map((item) => item.name);
                const keepSub = children.includes(String(form.subcategory || "").trim())
                  ? form.subcategory
                  : "";
                const facets = getSubgroupFacets(nextKey, keepSub).map(
                  (item) => item.name
                );
                const keepFacet = facets.includes(String(form.facet || "").trim())
                  ? form.facet
                  : "";
                setForm({
                  ...form,
                  category,
                  subcategory: keepSub,
                  facet: keepFacet,
                });
              }}
              required
            >
              {!form.category ? (
                <option value="" disabled>
                  Выберите категорию
                </option>
              ) : null}
              {categoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {subcategoryOptions.length > 0 ? (
            <label className="field">
              Подкатегория
              <select
                value={form.subcategory || ""}
                onChange={(e) => {
                  const subcategory = e.target.value;
                  const facets = getSubgroupFacets(categoryKey, subcategory).map(
                    (item) => item.name
                  );
                  const keepFacet = facets.includes(String(form.facet || "").trim())
                    ? form.facet
                    : "";
                  setForm({
                    ...form,
                    subcategory,
                    facet: keepFacet,
                  });
                }}
                required={needsSubcategory}
              >
                <option value="">
                  {needsSubcategory
                    ? "Выберите подкатегорию"
                    : "Без подкатегории"}
                </option>
                {subcategoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {facetOptions.length > 0 ? (
            <label className="field">
              Уточнение
              <select
                value={form.facet || ""}
                onChange={(e) =>
                  setForm({ ...form, facet: e.target.value })
                }
              >
                <option value="">Без уточнения</option>
                {facetOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            Внутренний код
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label className="field">
            Показывать клиентам
            <select
              value={form.active ? "yes" : "no"}
              onChange={(e) =>
                setForm({ ...form, active: e.target.value === "yes" })
              }
            >
              <option value="yes">Да</option>
              <option value="no">Нет</option>
            </select>
          </label>
          <label className="field">
            На витрине сайта
            <select
              value={form.showOnStorefront ? "yes" : "no"}
              onChange={(e) =>
                setForm({
                  ...form,
                  showOnStorefront: e.target.value === "yes",
                })
              }
            >
              <option value="no">Нет</option>
              <option value="yes">Да</option>
            </select>
          </label>
        </div>

        <section className="storefront-details-editor">
          <div className="one-c-link-editor-head">
            <div>
              <p className="eyebrow">Витрина сайта</p>
              <h3>Описание для покупателей</h3>
            </div>
            {productId ? (
              <button
                className="secondary-button"
                type="button"
                disabled={enrichBusy}
                onClick={async () => {
                  setEnrichBusy(true);
                  try {
                    const result = await api.enrichProductCard(productId, {
                      force: false,
                    });
                    if (result.product) {
                      applyLiveProduct(result.product);
                      onProductLiveUpdate?.(result.product);
                    }
                    await appAlert({
                      title: result.changed ? "Карточка дополнена" : "Без изменений",
                      message:
                        result.message ||
                        "Пустые поля заполнены из открытых источников.",
                      tone: result.changed ? "success" : "default",
                    });
                  } catch (error) {
                    await appAlert({
                      title: "Не удалось дополнить",
                      message: error.message,
                      tone: "danger",
                    });
                  } finally {
                    setEnrichBusy(false);
                  }
                }}
              >
                {enrichBusy ? "Ищем…" : "Дополнить из интернета"}
              </button>
            ) : null}
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Эти тексты видны на публичной карточке товара (/vitrina, clover-spb.ru).
            При добавлении из 1С пустые поля и фото подтягиваются автоматически.
          </p>
          <div className="form-grid">
            <label className="field field-wide">
              Описание
              <textarea
                rows={3}
                value={form.storefrontDetails?.description || ""}
                placeholder="Кратко о товаре для витрины"
                onChange={(event) =>
                  setForm({
                    ...form,
                    storefrontDetails: {
                      ...(form.storefrontDetails || {}),
                      description: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="field field-wide">
              Состав
              <textarea
                rows={2}
                value={form.storefrontDetails?.composition || ""}
                placeholder="Состав / материалы"
                onChange={(event) =>
                  setForm({
                    ...form,
                    storefrontDetails: {
                      ...(form.storefrontDetails || {}),
                      composition: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="field field-wide">
              Характеристики
              <textarea
                rows={3}
                value={form.storefrontDetails?.characteristics || ""}
                placeholder="Размеры, плотность, упаковка и т.п."
                onChange={(event) =>
                  setForm({
                    ...form,
                    storefrontDetails: {
                      ...(form.storefrontDetails || {}),
                      characteristics: event.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field field-wide">
              Цена на сайте
              <select
                value={form.storefrontPricing?.source === "manual" ? "manual" : "inherit"}
                onChange={(event) => {
                  const source = event.target.value === "manual" ? "manual" : "inherit";
                  const next = {
                    ...(form.storefrontPricing || {}),
                    source,
                  };
                  if (source === "manual") {
                    for (const unit of form.saleUnits || ["piece"]) {
                      if (next[unit] == null) {
                        const catalog = Number(form[unitPriceField(unit)]) || 0;
                        next[unit] = catalog > 0 ? catalog : null;
                      }
                    }
                  }
                  setForm({ ...form, storefrontPricing: next });
                }}
              >
                <option value="inherit">Как в настройках витрины (закупка+% или вид цен)</option>
                <option value="manual">Своя цена для этого товара</option>
              </select>
            </label>
            {form.storefrontPricing?.source === "manual"
              ? (form.saleUnits || ["piece"]).map((unit) => (
                  <label className="field" key={`sf-price-${unit}`}>
                    Цена на сайте, {UNIT_CONFIG[unit]?.label || unit}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        form.storefrontPricing?.[unit] == null
                          ? ""
                          : form.storefrontPricing[unit]
                      }
                      placeholder="0"
                      onFocus={selectDefaultNumber}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setForm({
                          ...form,
                          storefrontPricing: {
                            ...(form.storefrontPricing || {}),
                            source: "manual",
                            [unit]:
                              raw === ""
                                ? null
                                : Math.max(0, Number(String(raw).replace(",", ".")) || 0),
                          },
                        });
                      }}
                    />
                  </label>
                ))
              : null}
          </div>
          {form.storefrontPricing?.source === "manual" ? (
            <p className="muted small">
              Своя цена перекрывает расчёт «закупочная + %» (и вид цен 1С) только
              на витрине сайта. В ЛК клиентов не влияет.
            </p>
          ) : null}
        </section>

        <section className="one-c-link-editor">
          <div className="one-c-link-editor-head">
            <div>
              <p className="eyebrow">Связь с 1С</p>
              <h3>Точная номенклатура 1С</h3>
            </div>
            <button className="secondary-button" type="button" onClick={openOneCSearch}>
              {form.oneCId ? "Изменить товар 1С" : "Выбрать из загруженных 1С"}
            </button>
          </div>

          {form.oneCId ? (
            <div className="one-c-link-selected">
              <div>
                <strong>{form.oneCName || "Выбранный товар 1С"}</strong>
                <span>
                  Код: {form.oneCCode || "—"} · ID: {form.oneCId}
                </span>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={clearOneCProduct}
              >
                Убрать связь
              </button>
            </div>
          ) : (
            <div className="one-c-link-empty one-c-match-hints">
              <p>
                Название для сайта может отличаться от названия в 1С. Выберите
                позицию из полной выгрузки 1С или укажите код / точное
                название — после выгрузки Clover сможет связать автоматически.
              </p>
              <div className="form-grid one-c-match-fields">
                <label className="field">
                  Код товара в 1С
                  <input
                    value={form.oneCMatchCode || ""}
                    placeholder="Например, НФ-00000742"
                    onChange={(event) =>
                      setForm({ ...form, oneCMatchCode: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Точное название в 1С
                  <input
                    value={form.oneCMatchName || ""}
                    placeholder="Как позиция называется внутри 1С"
                    onChange={(event) =>
                      setForm({ ...form, oneCMatchName: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>
          )}

          {!oneCOpen && oneCNotice && (
            <div className="sync-success">{oneCNotice}</div>
          )}

          {oneCOpen && (
            <div className="one-c-picker">
              <div className="one-c-products-search">
                <input
                  type="search"
                  placeholder="Поиск по выгрузке 1С: название, код или ID"
                  value={oneCSearch}
                  onChange={(event) => setOneCSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchOneCProducts(oneCSearch);
                    }
                  }}
                  autoFocus
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={oneCLoading}
                  onClick={() => searchOneCProducts(oneCSearch)}
                >
                  {oneCLoading ? "Поиск..." : "Найти"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={oneCLoading}
                  onClick={() => {
                    setOneCSearch("");
                    void searchOneCProducts("");
                  }}
                >
                  Весь каталог
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setOneCOpen(false)}
                >
                  Закрыть
                </button>
              </div>

              {oneCError && <div className="sync-error">{oneCError}</div>}
              {oneCNotice && <div className="sync-success">{oneCNotice}</div>}
              <p className="muted small">
                В выгрузке 1С: {oneCTotal}. В списке сейчас: {oneCResults.length}.
                Свободные сверху; уже связанные можно перепривязать.
              </p>

              <div className="one-c-products-list one-c-picker-list">
                {oneCResults.map((item) => {
                  const linkedToCurrent =
                    item.cloverLink &&
                    String(item.cloverLink.productId) === String(productId);
                  const linkedElsewhere = item.cloverLink && !linkedToCurrent;
                  const selected = String(form.oneCId) === String(item.id);

                  return (
                    <article key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          Код: {item.code || "—"} · ID: {item.id}
                        </span>
                        {Number(item.score) > 0 && (
                          <span className="muted small">
                            Совпадение: {Math.round(Number(item.score) * 100)}%
                          </span>
                        )}
                        {linkedElsewhere && (
                          <span className="warning-text">
                            Уже связан с товаром Clover:{" "}
                            {item.cloverLink.productName}
                          </span>
                        )}
                      </div>
                      <button
                        className={
                          selected || linkedToCurrent
                            ? "secondary-button"
                            : "primary-button"
                        }
                        type="button"
                        onClick={() => void selectOneCProduct(item)}
                      >
                        {selected || linkedToCurrent
                          ? "Выбрано"
                          : linkedElsewhere
                            ? "Перепривязать"
                            : "Выбрать"}
                      </button>
                    </article>
                  );
                })}
                {!oneCLoading && !oneCResults.length && (
                  <div className="empty-box">
                    <p>В текущей выгрузке 1С подходящих позиций нет.</p>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={requestOneCSearch}
                    >
                      Сохранить запрос для следующей выгрузки из 1С
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="unit-settings">
          {UNIT_ORDER.map((unit) => {
            const sizeField = unitSizeField(unit);
            const priceField = unitPriceField(unit);
            return (
              <div className="unit-setting" key={unit}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.saleUnits.includes(unit)}
                    onChange={(e) => toggleUnit(unit, e.target.checked)}
                  />
                  {UNIT_CONFIG[unit].label}
                </label>
                {unit === "piece" ? (
                  <label className="field">
                    Кратность, шт.
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.pieceOrderMultiple ?? 1}
                      onFocus={selectDefaultNumber}
                      onMouseUp={(event) => {
                        if (
                          ["0", "1"].includes(String(event.currentTarget.value))
                        ) {
                          event.preventDefault();
                          event.currentTarget.select();
                        }
                      }}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pieceOrderMultiple: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        setForm((current) => ({
                          ...current,
                          pieceOrderMultiple: Math.max(
                            1,
                            Math.floor(Number(current.pieceOrderMultiple) || 1)
                          ),
                        }))
                      }
                    />
                  </label>
                ) : unitConvertsOneToOneToPieces(unit) ? null : (
                  <label className="field">
                    Внутри, шт.
                    <input
                      type="number"
                      min="1"
                      value={form[sizeField]}
                      onFocus={selectDefaultNumber}
                      onMouseUp={(event) => {
                        if (
                          ["0", "1"].includes(String(event.currentTarget.value))
                        ) {
                          event.preventDefault();
                          event.currentTarget.select();
                        }
                      }}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [sizeField]: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        setForm((current) => ({
                          ...current,
                          [sizeField]: Math.max(
                            1,
                            Number(current[sizeField]) || 1
                          ),
                        }))
                      }
                    />
                  </label>
                )}
                <label className="field">
                  Цена за единицу продажи
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form[priceField]}
                    onFocus={selectDefaultNumber}
                    onMouseUp={(event) => {
                      if (String(event.currentTarget.value) === "0") {
                        event.preventDefault();
                        event.currentTarget.select();
                      }
                    }}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [priceField]: event.target.value,
                      }))
                    }
                    onBlur={() =>
                      setForm((current) => ({
                        ...current,
                        [priceField]: Math.max(
                          0,
                          Number(current[priceField]) || 0
                        ),
                      }))
                    }
                  />
                </label>
              </div>
            );
          })}
        </div>
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary-button" type="submit">
            Сохранить товар
          </button>
        </div>
      </form>
    </div>
  );
}
