// Модалка редактирования товара каталога: поля, ед. измерения, фото, связь с 1С.
import { useState } from "react";
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
import { appAlert, appConfirm } from "../../shared/AppModal";

export function ProductEditor({
  product,
  products = [],
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
      pieceSize: 1,
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

  const productId = form.id || product?.id;

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
    const query =
      form.oneCSearchQuery ||
      form.oneCCode ||
      form.oneCMatchCode ||
      form.oneCName ||
      form.oneCMatchName ||
      form.name ||
      "";
    setOneCSearch(query);
    setOneCOpen(true);
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      if (productId) {
        const candidateResult = await api.getOneCProductCandidates(productId);
        if ((candidateResult.items || []).length) {
          setOneCResults(candidateResult.items || []);
          setOneCTotal(Number(candidateResult.total) || 0);
          setOneCNotice(
            "Показаны наиболее подходящие варианты, найденные при последней выгрузке из 1С."
          );
          return;
        }
      }
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
    if (!file.type.startsWith("image/")) {
      await appAlert({
        title: "Неверный файл",
        message: "Выберите фотографию товара (JPG, PNG или WEBP).",
        tone: "warn",
      });
      return;
    }

    setImageBusy(true);
    try {
      const result = await api.uploadProductImage(productId, file);
      applyLiveProduct({ ...form, ...result.product });
      await appAlert({
        title: "Фото сохранено",
        message: "Фотография товара сохранена на сервере.",
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

    onSave(
      normalizeProduct({
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
              <img src={form.imageUrl} alt={form.name || "Фото товара"} />
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
                <small className="muted">JPG, PNG или WEBP до 5 МБ.</small>
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
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              required
            />
          </label>
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
                позицию из полной выгрузки 1С TEST или укажите код / точное
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
                  onClick={() => setOneCOpen(false)}
                >
                  Закрыть
                </button>
              </div>

              {oneCError && <div className="sync-error">{oneCError}</div>}
              {oneCNotice && <div className="sync-success">{oneCNotice}</div>}
              <p className="muted small">
                Найдено: {oneCTotal}. Показаны первые {oneCResults.length}{" "}
                позиций.
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
                        disabled={Boolean(linkedElsewhere)}
                        onClick={() => selectOneCProduct(item)}
                      >
                        {selected || linkedToCurrent
                          ? "Выбрано"
                          : linkedElsewhere
                            ? "Уже связан"
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
                {unitConvertsOneToOneToPieces(unit) ? null : (
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
                  {Number(form[priceField]) <= 0 ? (
                    <small className="hint">
                      Пусто — для клиента с категорией цен 1С возьмётся цена за
                      шт из вида цен
                      {unit === "piece" || unit === "pair" || unit === "roll"
                        ? ""
                        : " × кол-во внутри"}
                      .
                    </small>
                  ) : null}
                </label>
              </div>
            );
          })}
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
