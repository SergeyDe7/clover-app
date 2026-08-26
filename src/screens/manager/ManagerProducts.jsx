// Раздел менеджера: каталог товаров и связь с 1С.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../serverApi";
import {
  formatMoney,
  formatDateTime,
  normalizeProduct,
  firstPositiveCatalogPrice,
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
  restoreWindowScroll,
} from "../../shared/appHelpers";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { productImageSrc } from "../../shared/productPhoto";
import { ProductEditor } from "./ProductEditor";
import { MatrixExcelReview } from "./MatrixExcelImport";
import { mergeProductsFromCatalogResponse } from "./matrixMembership";

function OneCProductsPanel({
  products,
  setProducts,
  visibility,
  onVisibilityChange,
  onCandidateIdsChange,
}) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const selectLinkFilter = (nextVisibility) => {
    if (typeof onVisibilityChange !== "function") return;
    onVisibilityChange(visibility === nextVisibility ? "Все" : nextVisibility);
    requestAnimationFrame(() => {
      document.getElementById("manager-products-toolbar")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

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
      const nextProducts = (result.products || []).map(normalizeProduct);
      if (nextProducts.length > 0) {
        setProducts(nextProducts);
      }
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
    void loadCatalog("");
  }, []);

  const summary = catalog?.summary || {};
  const candidateProductIds = useMemo(() => {
    const fromSummary = Array.isArray(summary.candidateProductIds)
      ? summary.candidateProductIds.map(String)
      : [];
    const linkedIds = new Set(
      (Array.isArray(products) ? products : [])
        .filter((item) => String(item.oneCId || "").trim())
        .map((item) => String(item.id))
    );
    return fromSummary.filter((id) => !linkedIds.has(String(id)));
  }, [summary.candidateProductIds, products]);

  useEffect(() => {
    if (typeof onCandidateIdsChange !== "function") return;
    onCandidateIdsChange(candidateProductIds);
  }, [candidateProductIds.join("|")]);

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
        <article
          className={`one-c-products-stat-clickable${visibility === "Связанные с 1С" ? " is-active" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => selectLinkFilter("Связанные с 1С")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectLinkFilter("Связанные с 1С");
            }
          }}
        >
          <span>Связано</span>
          <strong>{summary.linked || 0}</strong>
        </article>
        <article
          className={`one-c-products-stat-clickable${visibility === "Без связи с 1С" ? " is-active" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => selectLinkFilter("Без связи с 1С")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectLinkFilter("Без связи с 1С");
            }
          }}
        >
          <span>Без связи</span>
          <strong>{summary.unmatched ?? products.filter((item) => !item.oneCId).length}</strong>
        </article>
        <article
          className={`one-c-products-stat-clickable${visibility === "Есть варианты" ? " is-active" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => selectLinkFilter("Есть варианты")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectLinkFilter("Есть варианты");
            }
          }}
        >
          <span>Есть варианты</span>
          <strong>{candidateProductIds.length}</strong>
        </article>
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
              placeholder="Поиск по названию или артикулу 1С"
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
                  <span>Артикул 1С: {item.code || "—"}</span>
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

export function ManagerProducts({ products, setProducts, setClientLinks, oneCPriceTypes = [] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [visibility, setVisibility] = useState("Все");
  const [candidateProductIds, setCandidateProductIds] = useState([]);
  const [editorProduct, setEditorProduct] = useState(undefined);
  const [excelFile, setExcelFile] = useState(null);
  const excelFileRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const categories = ["Все", ...new Set(products.map((item) => item.category))];
  const visible = products.filter((product) => {
    const bySearch = matchesCatalogPrefixSearch(
      productCatalogSearchHaystack(product, { includeAdminFields: true }),
      search
    );
    const byCategory = category === "Все" || product.category === category;
    const hasOneCLink = Boolean(String(product.oneCId || "").trim());
    const hasVariants = candidateProductIds.some(
      (id) => String(id) === String(product.id)
    );
    const byVisibility =
      visibility === "Все" ||
      (visibility === "Активные" && product.active) ||
      (visibility === "Скрытые" && !product.active) ||
      (visibility === "На витрине сайта" && product.showOnStorefront === true) ||
      (visibility === "Связанные с 1С" && hasOneCLink) ||
      (visibility === "Без связи с 1С" && !hasOneCLink) ||
      (visibility === "Есть варианты" && hasVariants);
    return bySearch && byCategory && byVisibility;
  });

  const save = async (value) => {
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
      if (result.clientLinks && typeof setClientLinks === "function") {
        setClientLinks(result.clientLinks);
      }
      setSelectedIds((current) =>
        current.filter((id) => String(id) !== String(product.id))
      );
      setEditorProduct(undefined);
    } catch (error) {
      void appAlert({
        title: "Не удалось удалить",
        message: error.message || "Не удалось удалить товар.",
        tone: "danger",
      });
    }
  };

  const visibleIds = visible.map((product) => String(product.id));
  const selectedSet = new Set(selectedIds.map(String));
  const selectedCount = selectedIds.length;

  const toggleSelected = (productId, checked) => {
    const id = String(productId);
    setSelectedIds((current) => {
      const next = new Set(current.map(String));
      if (checked) next.add(id);
      else next.delete(id);
      return [...next];
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((current) => [...new Set([...current.map(String), ...visibleIds])]);
  };

  const clearSelected = () => setSelectedIds([]);

  const deleteSelectedProducts = async () => {
    const ids = selectedIds
      .map(String)
      .filter((id) => products.some((item) => String(item.id) === id));
    if (!ids.length) return;
    const wipingAll =
      products.length > 0 && ids.length >= products.length;
    const wipingMany = ids.length >= 20;
    const ok = await appConfirm({
      title: wipingAll
        ? "Удалить весь каталог Clover?"
        : wipingMany
          ? "Удалить много товаров?"
          : "Удалить выбранные товары?",
      message: wipingAll
        ? `Будет удалён весь каталог (${ids.length} поз.): с витрины сайта и из матриц клиентов. Это не отмена Excel и не загрузка файла. Заказы не меняются.`
        : `Будет удалено из каталога Clover, с витрины сайта и из матриц клиентов: ${ids.length}. Заказы с этими товарами не меняются.`,
      confirmLabel: wipingAll ? "Да, удалить весь каталог" : "Удалить выбранные",
      tone: "danger",
    });
    if (!ok) return;
    if (wipingAll || wipingMany) {
      const again = await appConfirm({
        title: "Подтвердите ещё раз",
        message: wipingAll
          ? "Каталог станет пустым. Восстановить можно только из резервной копии."
          : `Точно удалить ${ids.length} товаров из каталога Clover?`,
        confirmLabel: "Подтверждаю удаление",
        tone: "danger",
      });
      if (!again) return;
    }
    setDeleteBusy(true);
    try {
      let lastResult = null;
      for (const id of ids) {
        lastResult = await api.deleteProduct(id);
      }
      if (lastResult) {
        setProducts((lastResult.products || []).map(normalizeProduct));
        if (lastResult.clientLinks && typeof setClientLinks === "function") {
          setClientLinks(lastResult.clientLinks);
        }
      }
      setSelectedIds([]);
      if (editorProduct?.id && ids.includes(String(editorProduct.id))) {
        setEditorProduct(undefined);
      }
    } catch (error) {
      void appAlert({
        title: "Не удалось удалить",
        message: error.message || "Не удалось удалить выбранные товары.",
        tone: "danger",
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section>
      <OneCProductsPanel
        products={products}
        setProducts={setProducts}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        onCandidateIdsChange={setCandidateProductIds}
      />

      <div className="toolbar products-filter-bar" id="manager-products-toolbar">
        <input type="search" placeholder="Поиск товара или артикула 1С" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option>Все</option>
          <option>Активные</option>
          <option>Скрытые</option>
          <option>На витрине сайта</option>
          <option>Связанные с 1С</option>
          <option>Без связи с 1С</option>
          <option>Есть варианты</option>
        </select>
        <div className="inline-actions">
          <button className="primary-button" type="button" onClick={() => setEditorProduct(null)}>+ Добавить товар</button>
          <button
            className="secondary-button"
            type="button"
            disabled={Boolean(excelFile)}
            onClick={() => excelFileRef.current?.click()}
          >
            Загрузить Excel
          </button>
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) setExcelFile(file);
            }}
          />
        </div>
      </div>
      {excelFile ? null : (
      <div className="catalog-pick-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={!visibleIds.length}
          onClick={selectAllVisible}
        >
          Выбрать все
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={selectedCount === 0}
          onClick={clearSelected}
        >
          Снять все
        </button>
        <button
          className="danger-button"
          type="button"
          disabled={selectedCount === 0 || deleteBusy}
          onClick={() => void deleteSelectedProducts()}
        >
          {deleteBusy ? "Удаляем..." : "Удалить выбранные"}
        </button>
        <span>Отмечено: {selectedCount}</span>
      </div>
      )}
      {excelFile ? (
        <MatrixExcelReview
          products={products}
          setProducts={setProducts}
          setClientLinks={setClientLinks}
          target="catalog"
          initialFile={excelFile}
          onBack={() => setExcelFile(null)}
          onCancel={() => setExcelFile(null)}
          onAdded={(addedNames = []) => {
            setExcelFile(null);
            void appAlert({
              title: addedNames.length ? "Excel загружен в каталог" : "Новых товаров нет",
              message: addedNames.length === 1
                ? `В каталог: «${addedNames[0]}».`
                : addedNames.length
                  ? `В каталог из Excel: ${addedNames.length} поз.`
                  : "Все отмеченные позиции уже есть в каталоге Clover.",
              tone: addedNames.length ? "success" : "default",
            });
          }}
        />
      ) : null}
      <div className="server-safe-note">
        Фото загружается на сервер и автоматически появляется в личном кабинете клиента. JPG, PNG и WEBP до 5 МБ — при загрузке приводятся к квадрату 800×800 на белом фоне (JPEG).
      </div>

      <div className="product-manager-list" style={{ marginTop: 14 }}>
        {visible.map((product) => {
        const priceLabel = settingsPriceLabel(product, oneCPriceTypes);
        return (
        <article className={product.active ? "product-manager-row" : "product-manager-row inactive"} key={product.id}>
          {excelFile ? null : (
          <label className="product-manager-check">
            <input
              type="checkbox"
              checked={selectedSet.has(String(product.id))}
              onChange={(event) => toggleSelected(product.id, event.target.checked)}
              aria-label={`Выбрать «${product.name || "товар"}»`}
            />
          </label>
          )}
          <div className="product-manager-thumb">
            {product.imageUrl ? <img src={productImageSrc(product)} alt={product.name} loading="lazy" /> : <span>Нет фото</span>}
          </div>
          <div className="product-manager-info">
            <h3>{product.name}</h3>
            <p>{product.category}</p>
            {priceLabel ? (
              <strong className="product-manager-price">
                {priceLabel}
              </strong>
            ) : null}
            <p className="product-one-c-line">
              {String(product.oneCCode || "").trim()
                ? `Артикул 1С: ${product.oneCCode}`
                : "Артикул 1С: не связан"}
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
          <div className="product-manager-side">
            <div className="product-manager-badges">
              <span className={product.active ? "badge green" : "badge gray"}>{product.active ? "Активен" : "Скрыт"}</span>
              {product.showOnStorefront ? (
                <span className="badge green">На витрине</span>
              ) : null}
            </div>
            <div className="product-row-actions">
              <button className="secondary-button product-row-action" type="button" onClick={() => setEditorProduct(product)}>Изменить</button>
              <button className="danger-button product-row-action" type="button" onClick={() => deleteCatalogProduct(product)}>Удалить</button>
            </div>
          </div>
        </article>
        );
        })}
      </div>
      {editorProduct !== undefined && (
        <ProductEditor
          product={editorProduct}
          products={products}
          oneCPriceTypes={oneCPriceTypes}
          onClose={() => setEditorProduct(undefined)}
          onSave={save}
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
  );
}

function settingsPriceLabel(product, oneCPriceTypes = []) {
  const found = firstPositiveCatalogPrice(product, oneCPriceTypes);
  return found !== null ? formatMoney(found) : "";
}
