// Раздел менеджера: каталог товаров и связь с 1С.
import { useEffect, useRef, useState } from "react";
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
} from "../../shared/appHelpers";
import { SoftBanner } from "../../shared/uxFeedback";
import { appAlert, appConfirm } from "../../shared/AppModal";

function normalizeMatchKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function fileBaseName(fileName) {
  return String(fileName || "").replace(/\.[^.]+$/, "");
}

function matchProductForPhoto(products, fileName) {
  const key = normalizeMatchKey(fileBaseName(fileName));
  if (!key) return null;
  return products.find((product) => {
    const candidates = [product.code, product.oneCCode, product.name]
      .map(normalizeMatchKey)
      .filter(Boolean);
    return candidates.includes(key);
  }) || null;
}

function ProductEditor({ product, products = [], onClose, onSave }) {
  const isNew = !product;
  const [form, setForm] = useState(product || {
    name: "", category: "Новые товары", code: "", oneCId: "",
    oneCCode: "", oneCName: "", oneCMatchCode: "", oneCMatchName: "", oneCSearchQuery: "", oneCSearchRequestedAt: "", oneCLinkMode: "", oneCLinkedAt: "", active: true,
    pieceSize: 1, packSize: 1, bundleSize: 1, boxSize: 1, pairSize: 1, rollSize: 1,
    pricePiece: 0, pricePack: 0, priceBundle: 0, priceBox: 0, pricePair: 0, priceRoll: 0,
    saleUnits: ["piece"],
  });
  const [oneCOpen, setOneCOpen] = useState(false);
  const [oneCSearch, setOneCSearch] = useState(product?.oneCName || product?.name || "");
  const [oneCResults, setOneCResults] = useState([]);
  const [oneCTotal, setOneCTotal] = useState(0);
  const [oneCLoading, setOneCLoading] = useState(false);
  const [oneCError, setOneCError] = useState("");
  const [oneCNotice, setOneCNotice] = useState("");

  const toggleUnit = (unit, checked) => {
    const next = checked ? [...new Set([...form.saleUnits, unit])] : form.saleUnits.filter((item) => item !== unit);
    setForm({ ...form, saleUnits: next.length ? next : ["piece"] });
  };

  const searchOneCProducts = async (query = oneCSearch) => {
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.getOneCProducts({
        search: String(query || "").trim(),
        limit: 50,
        offset: 0,
      });
      setOneCResults(result.items || []);
      setOneCTotal(Number(result.total) || 0);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const openOneCSearch = async () => {
    const query = form.oneCSearchQuery || form.oneCCode || form.oneCMatchCode || form.oneCName || form.oneCMatchName || form.name || "";
    setOneCSearch(query);
    setOneCOpen(true);
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      if (product?.id) {
        const candidateResult = await api.getOneCProductCandidates(product.id);
        if ((candidateResult.items || []).length) {
          setOneCResults(candidateResult.items || []);
          setOneCTotal(Number(candidateResult.total) || 0);
          setOneCNotice("Показаны наиболее подходящие варианты, найденные при последней выгрузке из 1С.");
          return;
        }
      }
      const result = await api.getOneCProducts({ search: String(query || "").trim(), limit: 50, offset: 0 });
      setOneCResults(result.items || []);
      setOneCTotal(Number(result.total) || 0);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const selectOneCProduct = (item) => {
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

  const requestOneCSearch = async () => {
    if (!product?.id) {
      setForm((current) => ({ ...current, oneCSearchQuery: oneCSearch || current.name }));
      setOneCNotice("Запрос будет сохранён вместе с новым товаром.");
      return;
    }
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.requestOneCProduct(product.id, {
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

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim()) return;

    onSave(normalizeProduct({
      ...form,
      name: form.name.trim(),
      category: form.category.trim(),
      oneCId: String(form.oneCId || "").trim(),
      oneCCode: String(form.oneCCode || "").trim(),
      oneCName: String(form.oneCName || "").trim(),
      oneCMatchCode: String(form.oneCMatchCode || "").trim(),
      oneCMatchName: String(form.oneCMatchName || "").trim(),
      oneCSearchQuery: String(form.oneCSearchQuery || "").trim(),
      oneCSearchRequestedAt: String(form.oneCSearchRequestedAt || "").trim(),
    }));
  };

  return (
    <div className="product-editor" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="product-editor-card" onSubmit={submit}>
        <div className="panel-heading"><div><p className="eyebrow">Каталог</p><h2>{isNew ? "Новый товар" : "Редактирование товара"}</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
        <div className="form-grid">
          <label className="field">Название товара<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field">Категория<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label>
          <label className="field">Внутренний код<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label className="field">Показывать клиентам<select value={form.active ? "yes" : "no"} onChange={(e) => setForm({ ...form, active: e.target.value === "yes" })}><option value="yes">Да</option><option value="no">Нет</option></select></label>
        </div>

        <section className="one-c-link-editor">
          <div className="one-c-link-editor-head">
            <div>
              <p className="eyebrow">Связь с 1С</p>
              <h3>Точная номенклатура 1С TEST</h3>
            </div>
            <button className="secondary-button" type="button" onClick={openOneCSearch}>
              {form.oneCId ? "Изменить товар 1С" : "Выбрать из загруженных 1С"}
            </button>
          </div>

          {form.oneCId ? (
            <div className="one-c-link-selected">
              <div>
                <strong>{form.oneCName || "Выбранный товар 1С"}</strong>
                <span>Код: {form.oneCCode || "—"} · ID: {form.oneCId}</span>
              </div>
              <button className="secondary-button" type="button" onClick={clearOneCProduct}>Убрать связь</button>
            </div>
          ) : (
            <div className="one-c-link-empty one-c-match-hints">
                  <p>
                Название для сайта может отличаться от названия в 1С. Выберите
                позицию из полной выгрузки 1С TEST или укажите код / точное
                название — после выгрузки Clover сможет связать автоматически.
              </p>
              <div className="form-grid one-c-match-fields">
                <label className="field">Код товара в 1С
                  <input
                    value={form.oneCMatchCode || ""}
                    placeholder="Например, НФ-00000742"
                    onChange={(event) => setForm({ ...form, oneCMatchCode: event.target.value })}
                  />
                </label>
                <label className="field">Точное название в 1С
                  <input
                    value={form.oneCMatchName || ""}
                    placeholder="Как позиция называется внутри 1С"
                    onChange={(event) => setForm({ ...form, oneCMatchName: event.target.value })}
                  />
                </label>
              </div>
            </div>
          )}

          {!oneCOpen && oneCNotice && <div className="sync-success">{oneCNotice}</div>}

          {oneCOpen && (
            <div className="one-c-picker">
              <div className="one-c-products-search">
                <input
                  type="search"
                  placeholder="Поиск по выгрузке 1С TEST: название, код или ID"
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
                <button className="secondary-button" type="button" disabled={oneCLoading} onClick={() => searchOneCProducts(oneCSearch)}>
                  {oneCLoading ? "Поиск..." : "Найти"}
                </button>
                <button className="secondary-button" type="button" onClick={() => setOneCOpen(false)}>Закрыть</button>
              </div>

              {oneCError && <div className="sync-error">{oneCError}</div>}
              {oneCNotice && <div className="sync-success">{oneCNotice}</div>}
              <p className="muted small">Найдено: {oneCTotal}. Показаны первые {oneCResults.length} позиций.</p>

              <div className="one-c-products-list one-c-picker-list">
                {oneCResults.map((item) => {
                  const linkedToCurrent = item.cloverLink && String(item.cloverLink.productId) === String(product?.id);
                  const linkedElsewhere = item.cloverLink && !linkedToCurrent;
                  const selected = String(form.oneCId) === String(item.id);

                  return (
                    <article key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>Код: {item.code || "—"} · ID: {item.id}</span>
                        {Number(item.score) > 0 && <span className="muted small">Совпадение: {Math.round(Number(item.score) * 100)}%</span>}
                        {linkedElsewhere && <span className="warning-text">Уже связан с товаром Clover: {item.cloverLink.productName}</span>}
                      </div>
                      <button
                        className={selected || linkedToCurrent ? "secondary-button" : "primary-button"}
                        type="button"
                        disabled={Boolean(linkedElsewhere)}
                        onClick={() => selectOneCProduct(item)}
                      >
                        {selected || linkedToCurrent ? "Выбрано" : linkedElsewhere ? "Уже связан" : "Выбрать"}
                      </button>
                    </article>
                  );
                })}
                {!oneCLoading && !oneCResults.length && (
                  <div className="empty-box">
                    <p>В текущей выгрузке 1С подходящих позиций нет.</p>
                    <button className="primary-button" type="button" onClick={requestOneCSearch}>
                      Сохранить запрос для следующей выгрузки из 1С
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="purchase-price-card">
          <div className="purchase-price-card-head">
            <div>
              <p className="eyebrow">Цена из 1С TEST</p>
              <h3>Закупочная цена товара</h3>
            </div>
            <small>
              {form.purchasePriceUpdatedAt
                ? `Обновлено: ${formatDateTime(form.purchasePriceUpdatedAt)}`
                : "Закупочная цена ещё не получена"}
            </small>
          </div>
          <div className="purchase-price-grid">
            {UNIT_ORDER.map((unit) => {
              const value = form.purchasePrices?.[unit];
              const available = hasPurchasePrice(value);
              return (
                <article key={unit}>
                  <span>{UNIT_CONFIG[unit].label}</span>
                  <strong>{available ? formatMoney(value) : "—"}</strong>
                  <small>
                    {form.saleUnits.includes(unit)
                      ? available
                        ? "Получено из 1С"
                        : "Нет цены из 1С"
                      : "Единица не продаётся"}
                  </small>
                </article>
              );
            })}
          </div>
        </section>

        <div className="unit-settings">
          {UNIT_ORDER.map((unit) => {
            const sizeField = unitSizeField(unit);
            const priceField = unitPriceField(unit);
            return <div className="unit-setting" key={unit}>
              <label><input type="checkbox" checked={form.saleUnits.includes(unit)} onChange={(e) => toggleUnit(unit, e.target.checked)} />{UNIT_CONFIG[unit].label}</label>
              {unitConvertsOneToOneToPieces(unit) ? null : (
              <label className="field">Внутри, шт.
                <input
                  type="number"
                  min="1"
                  value={form[sizeField]}
                  onFocus={selectDefaultNumber}
                  onMouseUp={(event) => {
                    if (["0", "1"].includes(String(event.currentTarget.value))) {
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
                      [sizeField]: Math.max(1, Number(current[sizeField]) || 1),
                    }))
                  }
                />
              </label>
              )}
              <label className="field">Цена за единицу продажи
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
                      [priceField]: Math.max(0, Number(current[priceField]) || 0),
                    }))
                  }
                />
              </label>
            </div>;
          })}
        </div>
        <div className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit">Сохранить товар</button></div>
      </form>
    </div>
  );
}

function OneCProductsPanel({ products, setProducts }) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const initialLinkDone = useRef(false);

  const loadCatalog = async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCProducts({
        search: query,
        limit: 50,
        offset: 0,
      });
      setCatalog(result);
      return result;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runAutoLink = async ({ silent = false } = {}) => {
    setLinking(true);
    if (!silent) setError("");
    try {
      const result = await api.autoLinkOneCProducts();
      setProducts((result.products || []).map(normalizeProduct));
      const refreshed = await api.getOneCProducts({
        search,
        limit: 50,
        offset: 0,
      });
      setCatalog(refreshed);
      if (!silent) {
        const linked = result.report?.newlyLinked || 0;
        void appAlert({
          title: linked ? "Связи обновлены" : "Совпадений нет",
          message: linked
            ? `Автоматически связаны товары: ${linked}.`
            : "Новых точных совпадений не найдено. Уже созданные связи сохранены.",
          tone: linked ? "success" : "default",
        });
      }
    } catch (linkError) {
      setError(linkError.message);
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const result = await loadCatalog("");
      if (cancelled || initialLinkDone.current) return;
      initialLinkDone.current = true;

      if (result?.summary?.oneCTotal > 0) {
        await runAutoLink({ silent: true });
      }
    };

    initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = catalog?.summary || {};

  return (
    <section className="one-c-products-panel one-c-products-panel-compact">
      <div className="one-c-products-head">
        <strong className="one-c-products-title">Каталог 1С</strong>
        <div className="one-c-products-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => loadCatalog()}
            disabled={loading || linking}
          >
            {loading ? "Обновление..." : "Обновить"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => runAutoLink()}
            disabled={linking || !summary.oneCTotal}
          >
            {linking ? "Сопоставление..." : "Сопоставить"}
          </button>
        </div>
      </div>

      {error && <div className="sync-error">{error}</div>}

      <div className="one-c-products-stats">
        <article><span>Из 1С</span><strong>{summary.oneCTotal || 0}</strong></article>
        <article><span>Связано</span><strong>{summary.linked || 0}</strong></article>
        <article><span>Без связи</span><strong>{summary.unmatched ?? products.filter((item) => !item.oneCId).length}</strong></article>
        {Number(summary.candidateProducts) > 0 && (
          <article><span>Есть варианты</span><strong>{summary.candidateProducts}</strong></article>
        )}
      </div>

      <div className="one-c-products-meta">
        <span>
          Выгрузка: {summary.receivedAt ? formatDateTime(summary.receivedAt) : "ещё не было"}
        </span>
        {summary.stale > 0 && <span className="warning-text">Не в свежем каталоге: {summary.stale}</span>}
      </div>

      <button
        className="one-c-products-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Скрыть позиции 1С" : "Показать позиции 1С"}
      </button>

      {open && (
        <div className="one-c-products-browser">
          <form
            className="one-c-products-search"
            onSubmit={(event) => {
              event.preventDefault();
              loadCatalog(search);
            }}
          >
            <input
              type="search"
              placeholder="Поиск: название, код или ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="secondary-button" type="submit" disabled={loading}>
              Найти
            </button>
            {search && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  loadCatalog("");
                }}
              >
                Сбросить
              </button>
            )}
          </form>

          <p className="muted small">
            Найдено: {catalog?.total || 0}. Показаны первые {catalog?.items?.length || 0}.
          </p>

          <div className="one-c-products-list">
            {(catalog?.items || []).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>Код: {item.code || "—"} · ID: {item.id}</span>
                </div>
                {item.cloverLink ? (
                  <span className="badge green">
                    Связан: {item.cloverLink.productName}
                  </span>
                ) : (
                  <span className="badge gray">Не в Clover</span>
                )}
              </article>
            ))}
            {!loading && !(catalog?.items || []).length && (
              <div className="empty-box">Позиции не найдены.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function ManagerProducts({ products, setProducts }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [visibility, setVisibility] = useState("Все");
  const [editorProduct, setEditorProduct] = useState(undefined);
  const [imageBusyId, setImageBusyId] = useState(null);
  const [bulkMatches, setBulkMatches] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [bulkBanner, setBulkBanner] = useState(null);
  const bulkInputRef = useRef(null);
  const categories = ["Все", ...new Set(products.map((item) => item.category))];
  const visible = products.filter((product) => {
    const bySearch = !search || `${product.name} ${product.code} ${product.oneCId} ${product.oneCCode} ${product.oneCName} ${product.oneCMatchCode} ${product.oneCMatchName} ${product.oneCSearchQuery}`.toLowerCase().includes(search.toLowerCase());
    const byCategory = category === "Все" || product.category === category;
    const hasOneCLink = Boolean(String(product.oneCId || "").trim());
    const byVisibility =
      visibility === "Все" ||
      (visibility === "Активные" && product.active) ||
      (visibility === "Скрытые" && !product.active) ||
      (visibility === "Связанные с 1С" && hasOneCLink) ||
      (visibility === "Без связи с 1С" && !hasOneCLink);
    return bySearch && byCategory && byVisibility;
  });

  const save = async (value) => {
    let nextProducts;

    if (value.id) {
      nextProducts = products.map((item) => item.id === value.id ? normalizeProduct(value) : item);
    } else {
      const id = Math.max(0, ...products.map((item) => Number(item.id) || 0)) + 1;
      nextProducts = [
        normalizeProduct({
          ...value,
          id,
          code: value.code || `CL-${String(id).padStart(4, "0")}`,
        }),
        ...products,
      ];
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

  const uploadImage = async (product, file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      await appAlert({ title: "Неверный файл", message: "Выберите фотографию товара.", tone: "warn" });
      return;
    }

    setImageBusyId(product.id);
    try {
      const result = await api.uploadProductImage(product.id, file);
      setProducts((current) => current.map((item) =>
        item.id === product.id
          ? normalizeProduct({ ...item, ...result.product })
          : item
      ));
      await appAlert({
        title: "Фото сохранено",
        message: "Фотография товара сохранена на сервере.",
        tone: "success",
      });
    } catch (error) {
      await appAlert({ title: "Ошибка загрузки", message: error.message, tone: "danger" });
    } finally {
      setImageBusyId(null);
    }
  };

  const prepareBulkPhotos = (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      void appAlert({ title: "Нет фото", message: "Выберите файлы JPG, PNG или WEBP." });
      return;
    }
    const usedProductIds = new Set();
    const rows = files.map((file) => {
      let product = matchProductForPhoto(products, file.name);
      if (product && usedProductIds.has(product.id)) {
        product = null;
      }
      if (product) usedProductIds.add(product.id);
      return {
        file,
        fileName: file.name,
        product,
      };
    });
    setBulkMatches(rows);
    setBulkBanner(null);
    setBulkProgress("");
  };

  const cancelBulkPhotos = () => {
    setBulkMatches(null);
    setBulkProgress("");
    if (bulkInputRef.current) bulkInputRef.current.value = "";
  };

  const uploadBulkMatches = async () => {
    const matched = (bulkMatches || []).filter((row) => row.product);
    if (!matched.length) {
      void appAlert({ title: "Нет совпадений", message: "Не удалось сопоставить файлы с товарами по имени." });
      return;
    }

    setBulkBusy(true);
    let done = 0;
    let failed = 0;
    const total = matched.length;
    try {
      for (const row of matched) {
        setBulkProgress(`${done + 1} из ${total}`);
        try {
          const result = await api.uploadProductImage(row.product.id, row.file);
          setProducts((current) => current.map((item) =>
            item.id === row.product.id
              ? normalizeProduct({ ...item, ...result.product })
              : item
          ));
          done += 1;
        } catch {
          failed += 1;
        }
      }
      setBulkMatches(null);
      setBulkBanner({
        tone: failed ? "warn" : "success",
        title: failed ? "Загрузка завершена с ошибками" : "Фото загружены",
        message: failed
          ? `Успешно: ${done} из ${total}. Не удалось: ${failed}.`
          : `Загружено фото: ${done} из ${total}.`,
      });
    } finally {
      setBulkBusy(false);
      setBulkProgress("");
      if (bulkInputRef.current) bulkInputRef.current.value = "";
    }
  };

  const deleteImage = async (product) => {
    const ok = await appConfirm({
      title: "Удалить фото?",
      message: `Удалить фотографию товара «${product.name}»?`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) {
      return;
    }

    setImageBusyId(product.id);
    try {
      const result = await api.deleteProductImage(product.id);
      setProducts((current) => current.map((item) =>
        item.id === product.id
          ? normalizeProduct({ ...item, ...result.product })
          : item
      ));
    } catch (error) {
      await appAlert({ title: "Ошибка удаления", message: error.message, tone: "danger" });
    } finally {
      setImageBusyId(null);
    }
  };

  return (
    <section>
      <OneCProductsPanel products={products} setProducts={setProducts} />

      <div className="toolbar four">
        <input type="search" placeholder="Поиск товара, кода или ID 1С" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option>Все</option>
          <option>Активные</option>
          <option>Скрытые</option>
          <option>Связанные с 1С</option>
          <option>Без связи с 1С</option>
        </select>
        <button className="primary-button" type="button" onClick={() => setEditorProduct(null)}>+ Добавить товар</button>
      </div>
      <div className="server-safe-note">
        Фото загружается на сервер и автоматически появляется в личном кабинете клиента. Поддерживаются JPG, PNG и WEBP до 5 МБ.
      </div>
      <div className="bulk-photo-actions" style={{ marginTop: 12 }}>
        <button
          className="secondary-button"
          type="button"
          disabled={bulkBusy}
          onClick={() => bulkInputRef.current?.click()}
        >
          Загрузить фото пакетом
        </button>
        <input
          ref={bulkInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            prepareBulkPhotos(event.target.files);
          }}
        />
        {bulkProgress ? <span className="bulk-photo-progress">{bulkProgress}</span> : null}
      </div>

      {bulkMatches && (
        <div className="bulk-photo-panel">
          <strong>Сопоставление файлов с товарами</strong>
          <p className="muted small" style={{ marginTop: 6 }}>
            Имя файла (без расширения) сравнивается с кодом, кодом 1С и названием товара.
          </p>
          <div className="bulk-photo-list">
            {bulkMatches.map((row) => (
              <div
                className={row.product ? "bulk-photo-row" : "bulk-photo-row miss"}
                key={`${row.fileName}-${row.product?.id || "miss"}`}
              >
                <strong>{row.fileName}</strong>
                <span>
                  {row.product
                    ? `→ ${row.product.name}${row.product.code ? ` (${row.product.code})` : ""}`
                    : "→ не найден"}
                </span>
              </div>
            ))}
          </div>
          <div className="bulk-photo-actions">
            <button
              className="primary-button"
              type="button"
              disabled={bulkBusy || !bulkMatches.some((row) => row.product)}
              onClick={() => void uploadBulkMatches()}
            >
              {bulkBusy ? (bulkProgress || "Загрузка…") : "Загрузить совпадения"}
            </button>
            <button className="secondary-button" type="button" disabled={bulkBusy} onClick={cancelBulkPhotos}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {bulkBanner && (
        <SoftBanner
          tone={bulkBanner.tone}
          title={bulkBanner.title}
          message={bulkBanner.message}
          onDismiss={() => setBulkBanner(null)}
        />
      )}

      <div className="product-manager-list" style={{ marginTop: 14 }}>
        {visible.map((product) => (
        <article className={product.active ? "product-manager-row" : "product-manager-row inactive"} key={product.id}>
          <div className="product-manager-thumb">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span>Нет фото</span>}
          </div>
          <div>
            <h3>{product.name}</h3>
            <p>{product.category} · {product.code}</p>
            <p className="product-one-c-line">
              {product.oneCId
                ? `1С: ${product.oneCCode || "без кода"} · ${product.oneCId}`
                : "1С: не связан"}
              {product.oneCLinkMode === "auto" ? " · автоматически" : product.oneCId ? " · вручную" : ""}
            </p>
          </div>
          <span className={product.active ? "badge green" : "badge gray"}>{product.active ? "Активен" : "Скрыт"}</span>
          <strong>{settingsPriceLabel(product)}</strong>
          <div className="image-actions">
            <label className="image-upload-label">
              {imageBusyId === product.id ? "Загрузка..." : product.imageUrl ? "Заменить фото" : "Добавить фото"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageBusyId === product.id || bulkBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  uploadImage(product, file);
                  event.target.value = "";
                }}
              />
            </label>
            {product.imageUrl && <button className="secondary-button" type="button" disabled={imageBusyId === product.id} onClick={() => deleteImage(product)}>Удалить фото</button>}
            <button className="secondary-button" type="button" onClick={() => setEditorProduct(product)}>Изменить</button>
            <button className="secondary-button" type="button" onClick={() => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: !item.active } : item))}>{product.active ? "Скрыть" : "Показать"}</button>
          </div>
        </article>
        ))}
      </div>
      {editorProduct !== undefined && (
        <ProductEditor
          product={editorProduct}
          products={products}
          onClose={() => setEditorProduct(undefined)}
          onSave={save}
        />
      )}
    </section>
  );
}

function settingsPriceLabel(product) {
  const prices = UNIT_ORDER.map((unit) => product[unitPriceField(unit)]).filter((value) => Number(value) > 0);
  return prices.length ? `от ${formatMoney(Math.min(...prices))}` : "Без цены";
}
