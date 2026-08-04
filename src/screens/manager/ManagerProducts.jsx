// Раздел менеджера: каталог товаров и связь с 1С.
import { useEffect, useRef, useState } from "react";
import { api } from "../../serverApi";
import {
  UNIT_ORDER,
  unitPriceField,
  formatMoney,
  formatDateTime,
  normalizeProduct,
} from "../../shared/appHelpers";
import { SoftBanner } from "../../shared/uxFeedback";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { ProductEditor } from "./ProductEditor";

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
          <div className="product-manager-info">
            <h3>{product.name}</h3>
            <p>{product.category} · {product.code}</p>
            <p className="product-one-c-line">
              {product.oneCId
                ? `1С: ${product.oneCCode || "без кода"} · ${product.oneCId}`
                : "1С: не связан"}
              {product.oneCLinkMode === "auto" ? " · автоматически" : product.oneCId ? " · вручную" : ""}
            </p>
            {product.certificateUrl ? (
              <p>
                <a
                  className="product-cert-link product-cert-link-top"
                  href={product.certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Сертификат
                </a>
              </p>
            ) : null}
          </div>
          <div className="product-manager-meta">
            <span className={product.active ? "badge green" : "badge gray"}>{product.active ? "Активен" : "Скрыт"}</span>
            <strong>{settingsPriceLabel(product)}</strong>
            <button className="secondary-button" type="button" onClick={() => setEditorProduct(product)}>Изменить</button>
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
  );
}

function settingsPriceLabel(product) {
  const prices = UNIT_ORDER.map((unit) => product[unitPriceField(unit)]).filter((value) => Number(value) > 0);
  return prices.length ? `от ${formatMoney(Math.min(...prices))}` : "";
}
