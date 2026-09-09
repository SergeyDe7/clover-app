import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { useEffect, useMemo, useState } from "react";
import { matchesCatalogPrefixSearch, productArticle, productCatalogSearchHaystack } from "../../shared/appHelpers";
import { getClientMatrixMembership } from "./matrixMembership";

const CATALOG_LIST_LIMIT = 80;

/**
 * Добавить в матрицу клиента товар, который уже есть в каталоге Clover.
 * Не создаёт SKU и не трогает 1С / каталог.
 */
export function MatrixCloverCatalogAdd({
  link,
  products,
  onAddToMatrix,
  onPanelChange,
}) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    onPanelChange?.(open);
    return () => onPanelChange?.(false);
    // Только open: колбэк с родителя каждый рендер новый.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const membership = getClientMatrixMembership(link, products);
  const matrixIdKey = (Array.isArray(link?.matrixProductIds)
    ? link.matrixProductIds
    : []
  )
    .map(String)
    .sort()
    .join(",");

  const available = useMemo(() => {
    const matrixIds = new Set(matrixIdKey ? matrixIdKey.split(",") : []);
    return (Array.isArray(products) ? products : []).filter((product) => {
      if (!product || product.active === false) return false;
      return !matrixIds.has(String(product.id));
    });
  }, [products, matrixIdKey]);

  const items = useMemo(() => {
    const filtered = available.filter((product) => {
      return matchesCatalogPrefixSearch(
        productCatalogSearchHaystack(product, { includeAdminFields: true }),
        search
      );
    });
    return filtered.slice(0, CATALOG_LIST_LIMIT);
  }, [available, search]);

  const selectedItems = items.filter((product) =>
    selectedIds.has(String(product.id))
  );

  const closePanel = () => {
    setOpen(false);
    setSearch("");
    setSelectedIds(new Set());
  };

  const toggleSelected = (product) => {
    const key = String(product.id);
    if (membership.matrixIds.has(key)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addProducts = (toAdd) => {
    const ids = (Array.isArray(toAdd) ? toAdd : [])
      .map((product) => product?.id)
      .filter((id) => id != null && !membership.matrixIds.has(String(id)));
    if (!ids.length) {
      setNotice(t("manager.selectedProductsAreAlreadyInThe"));
      return;
    }
    onAddToMatrix?.(ids);
    setSelectedIds(new Set());
    setNotice(
      ids.length === 1
        ? t("manager.theProductWasAddedToThe")
        : t("manager.matrix.addedCountSave", { count: ids.length })
    );
  };

  if (link?.matrixMode === "all") {
    return null;
  }

  return (
    <div className="matrix-clover-catalog-add">
      <button
        className="secondary-button"
        type="button"
        onClick={() => {
          setNotice("");
          setSelectedIds(new Set());
          setSearch("");
          setOpen(true);
        }}
        disabled={open}
      >{
        t("manager.addFromCatalog")
      }</button>
      {notice && !open && (
        <div className="matrix-save-message saved">
          {notice}
        </div>
      )}

      {open && (
        <div className="one-c-picker matrix-add-panel">
          <div className="one-c-products-search">
            <input
              type="search"
              placeholder={t("manager.nameSkuOrCode")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="secondary-button" type="button" onClick={closePanel}>{
              t("shared.modal.cancel")
            }</button>
          </div>
          {notice && (
            <div className="matrix-save-message saved">
              {notice}
            </div>
          )}
          <div className="matrix-add-actions">
            <span className="muted small">
              {t("manager.matrix.inListCount", { count: items.length })}
              {available.length > CATALOG_LIST_LIMIT ? t("manager.matrix.listFromTotal", { total: available.length }) : ""}
              {" · "}{t("manager.matrix.toAddCount", { count: selectedItems.length })}
            </span>
            <button
              className="primary-button"
              type="button"
              disabled={selectedItems.length === 0}
              onClick={() => addProducts(selectedItems)}
            >
              {t("manager.matrix.addCount", { count: selectedItems.length })}
            </button>
          </div>
          <div className="one-c-products-list one-c-picker-list">
            {items.map((product) => {
              const checked = selectedIds.has(String(product.id));
              return (
                <article
                  key={product.id}
                  className={checked ? "one-c-picker-row selected" : "one-c-picker-row"}
                  style={{ cursor: "pointer" }}
                >
                  <label
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      margin: 0,
                      cursor: "pointer",
                      flex: 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(product)}
                      style={{ marginTop: 4 }}
                    />
                    <div>
                      <strong>{product.name}</strong>
                      <span>
                        {productArticle(product)} · {product.category || t("manager.noCategory")}
                      </span>
                    </div>
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => addProducts([product])}
                  >{
                    t("client.matrix.add")
                  }</button>
                </article>
              );
            })}
            {!items.length && (
              <div className="empty-box">
                {available.length === 0
                  ? t("manager.everyCloverCatalogProductIsAlready")
                  : t("manager.nothingWasFoundForThisQuery")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
