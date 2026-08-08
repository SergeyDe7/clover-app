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
import { appAlert } from "../../shared/AppModal";
import { productImageSrc } from "../../shared/productPhoto";
import { ProductEditor } from "./ProductEditor";

function clearConflictingOneCLink(product) {
  return normalizeProduct({
    ...product,
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
}

function OneCProductsPanel({ products, setProducts, visibility, onVisibilityChange }) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const initialLinkDone = useRef(false);

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

export function ManagerProducts({ products, setProducts, oneCPriceTypes = [] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [visibility, setVisibility] = useState("Все");
  const [editorProduct, setEditorProduct] = useState(undefined);
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
    const normalized = normalizeProduct(value);
    let nextProducts;
    let targetId;

    if (normalized.id) {
      targetId = String(normalized.id);
      nextProducts = products.map((item) =>
        String(item.id) === targetId ? normalized : item
      );
    } else {
      const id = Math.max(0, ...products.map((item) => Number(item.id) || 0)) + 1;
      targetId = String(id);
      nextProducts = [
        normalizeProduct({
          ...normalized,
          id,
          code: normalized.code || `CL-${String(id).padStart(4, "0")}`,
        }),
        ...products,
      ];
    }

    const oneCId = String(normalized.oneCId || "").trim();
    if (oneCId) {
      nextProducts = nextProducts.map((item) => {
        if (String(item.id) === targetId) return item;
        if (String(item.oneCId || "").trim() !== oneCId) return item;
        return clearConflictingOneCLink(item);
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

  return (
    <section>
      <OneCProductsPanel
        products={products}
        setProducts={setProducts}
        visibility={visibility}
        onVisibilityChange={setVisibility}
      />

      <div className="toolbar four" id="manager-products-toolbar">
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
        Фото загружается на сервер и автоматически появляется в личном кабинете клиента. JPG, PNG и WEBP до 5 МБ — при загрузке приводятся к квадрату 800×800 на белом фоне (JPEG).
      </div>

      <div className="product-manager-list" style={{ marginTop: 14 }}>
        {visible.map((product) => (
        <article className={product.active ? "product-manager-row" : "product-manager-row inactive"} key={product.id}>
          <div className="product-manager-thumb">
            {product.imageUrl ? <img src={productImageSrc(product)} alt={product.name} /> : <span>Нет фото</span>}
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
          oneCPriceTypes={oneCPriceTypes}
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
