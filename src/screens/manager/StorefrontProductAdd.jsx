import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../serverApi";
import { MatrixExcelReview } from "./MatrixExcelImport";
import { mergeProductsFromCatalogResponse } from "./matrixMembership";

const SHEET_TITLE_KEYS = {
  choose: "manager.storefront.add",
  manual: "manager.searchIn1c",
  excel: "manager.excelUpload",
};

function useMobileSheet() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 820px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  return isMobile;
}

/**
 * Добавление товаров на витрину из 1С (вручную или Excel),
 * даже если позиции ещё нет ни в одной клиентской матрице.
 * Имя на витрине = имя Clover/матрицы (из Excel или уже существующего товара).
 */
export function StorefrontProductAdd({ products, setProducts, onAfterAdd }) {
  const { t } = useLocalization();
  const [step, setStep] = useState("closed");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const searchInputRef = useRef(null);
  const searchRequestId = useRef(0);
  const isMobile = useMobileSheet();
  const sheetOpen = isMobile && step !== "closed";

  const productsByOneCId = new Map(
    (Array.isArray(products) ? products : [])
      .filter((item) => String(item.oneCId || "").trim())
      .map((item) => [String(item.oneCId).trim(), item])
  );

  const closeAll = () => {
    setStep("closed");
    setError("");
    setSelectedIds(new Set());
    setItems([]);
    setTotal(0);
  };

  useEffect(() => {
    if (!sheetOpen || typeof document === "undefined") return undefined;
    document.documentElement.classList.add("clover-storefront-add-open");
    return () => {
      document.documentElement.classList.remove("clover-storefront-add-open");
    };
  }, [sheetOpen]);

  const runSearch = async (query = search) => {
    const requestId = ++searchRequestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCProducts({
        search: String(query || "").trim(),
        limit: 100,
        offset: 0,
      });
      if (requestId !== searchRequestId.current) return;
      const nextItems = [...(result.items || [])].sort((a, b) => {
        const aOn = productsByOneCId.get(String(a.id))?.showOnStorefront ? 1 : 0;
        const bOn = productsByOneCId.get(String(b.id))?.showOnStorefront ? 1 : 0;
        if (aOn !== bOn) return aOn - bOn;
        return String(a.name || "").localeCompare(String(b.name || ""), "ru");
      });
      setItems(nextItems);
      setTotal(Number(result.total) || 0);
      const summaryTotal = Number(result.summary?.oneCTotal);
      if (Number.isFinite(summaryTotal) && summaryTotal >= 0) {
        setCatalogTotal(summaryTotal);
      }
    } catch (searchError) {
      if (requestId !== searchRequestId.current) return;
      setError(searchError.message);
      setItems([]);
      setTotal(0);
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== "manual") return undefined;
    const timer = window.setTimeout(() => {
      void runSearch(search);
    }, 280);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, step]);

  useEffect(() => {
    if (step !== "manual" || isMobile) return;
    searchInputRef.current?.focus();
  }, [step, isMobile]);

  const toggleSelected = (item) => {
    const clover = productsByOneCId.get(String(item.id));
    if (clover?.showOnStorefront) return;
    const key = String(item.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addItems = async (toAdd) => {
    const list = (Array.isArray(toAdd) ? toAdd : []).filter((item) => {
      const clover = productsByOneCId.get(String(item.id));
      return !clover?.showOnStorefront;
    });
    if (!list.length) {
      setError(t("manager.selectedItemsAreAlreadyOnThe"));
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    const addedNames = [];
    let skipped = 0;
    const byOneCId = new Map(productsByOneCId);

    try {
      for (const item of list) {
        const existing = byOneCId.get(String(item.id));
        if (existing?.showOnStorefront) {
          skipped += 1;
          continue;
        }
        const preferredName = existing?.name || "";
        const result = await api.createProductFromOneCCatalog({
          oneCId: item.id,
          item,
          preferredName,
          showOnStorefront: true,
        });
        if (Array.isArray(result.products)) {
          setProducts((current) =>
            mergeProductsFromCatalogResponse(current, result.products)
          );
        }
        if (result.product?.oneCId) {
          byOneCId.set(String(result.product.oneCId), result.product);
        }
        addedNames.push(result.product?.name || preferredName || item.name);
        onAfterAdd?.(result);
      }
      setSelectedIds(new Set());
      setNotice(
        addedNames.length
          ? addedNames.length === 1
            ? t("manager.storefront.addedNamed", { name: addedNames[0] })
            : t("manager.storefront.addedCountShort", { count: addedNames.length })
          : t("manager.noNewItems")
      );
      if (skipped) setError(t("manager.storefront.skippedAlready", { count: skipped }));
      await runSearch(search);
    } catch (addError) {
      setError(addError.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedItems = items.filter((item) => {
    if (!selectedIds.has(String(item.id))) return false;
    const clover = productsByOneCId.get(String(item.id));
    return !clover?.showOnStorefront;
  });

  const renderChooseStep = () => (
    <>
      <strong>{t("manager.howToAddProductsToThe")}</strong>
      <p className="muted small" style={{ marginTop: 6 }}>{
        t("manager.manuallySearchThe1cExportExcel")
      }</p>
      <div className="matrix-add-actions storefront-add-sheet-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setStep("manual");
            setSearch("");
            setSelectedIds(new Set());
          }}
        >{
          t("manager.manually")
        }</button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setStep("excel")}
        >{
          t("manager.uploadExcel")
        }</button>
        <button className="secondary-button" type="button" onClick={closeAll}>{
          t("shared.modal.cancel")
        }</button>
      </div>
    </>
  );

  const renderManualStep = () => (
    <>
      <strong>{t("manager.search1cExportStorefront")}</strong>
      <p className="muted small" style={{ marginTop: 6, marginBottom: 8 }}>
        {t("manager.storefront.ifExistsKeepMatrixName")}
        {catalogTotal ? t("manager.storefront.exportTotal", { count: catalogTotal }) : ""}
      </p>
      <div className="one-c-products-search">
        <input
          ref={searchInputRef}
          type="search"
          placeholder={t("manager.nameOr1cCode")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearch(search);
            }
          }}
        />
        <button
          className="secondary-button"
          type="button"
          disabled={loading}
          onClick={() => void runSearch(search)}
        >
          {loading ? t("manager.search.ellipsis") : t("shared.action.find")}
        </button>
        <button className="secondary-button" type="button" onClick={() => setStep("choose")}>{
          t("storefront.back")
        }</button>
        <button className="secondary-button" type="button" onClick={closeAll}>{
          t("shared.modal.cancel")
        }</button>
      </div>
      {error && <div className="sync-error">{error}</div>}
      {notice && (
        <div className="matrix-save-message saved" style={{ marginTop: 8 }}>
          {notice}
        </div>
      )}
      <div className="matrix-add-actions storefront-add-summary">
        <span className="muted small">
          {t("manager.storefront.foundToAdd", { found: total, add: selectedItems.length })}
        </span>
        <button
          className="primary-button"
          type="button"
          disabled={loading || selectedItems.length === 0}
          onClick={() => void addItems(selectedItems)}
        >
          {loading
            ? t("manager.adding")
            : t("manager.storefront.addCount", { count: selectedItems.length })}
        </button>
      </div>
      <div className="one-c-products-list one-c-picker-list storefront-add-picker-list">
        {loading && !items.length ? (
          <div className="empty-box">{t("manager.searchingThe1cExport")}</div>
        ) : null}
        {items.map((item) => {
          const clover = productsByOneCId.get(String(item.id));
          const alreadyOn = Boolean(clover?.showOnStorefront);
          const checked = selectedIds.has(String(item.id)) && !alreadyOn;
          return (
            <article
              key={item.id}
              className={
                alreadyOn
                  ? "one-c-picker-row muted"
                  : checked
                    ? "one-c-picker-row selected"
                    : "one-c-picker-row"
              }
            >
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  margin: 0,
                  cursor: alreadyOn ? "default" : "pointer",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={alreadyOn || loading}
                  onChange={() => toggleSelected(item)}
                  style={{ marginTop: 4, flex: "0 0 auto" }}
                />
                <div style={{ minWidth: 0 }}>
                  <strong>{item.name}</strong>
                  <span>{t("manager.codeValue", { code: item.code || "—" })}</span>
                  {alreadyOn ? (
                    <span className="muted small">
                      <span className="badge green" style={{ marginRight: 6 }}>{
                        t("manager.storefront.on")
                      }</span>
                      {clover?.name ? t("manager.storefront.asNamed", { name: clover.name }) : t("manager.cannotBeAddedAgain")}
                    </span>
                  ) : clover ? (
                    <span className="muted small">
                      {t("manager.storefront.inCloverMatrixName", { name: clover.name })}
                    </span>
                  ) : (
                    <span className="muted small">{
                      t("manager.newToCloverNameFrom1c")
                    }</span>
                  )}
                </div>
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={loading || alreadyOn}
                onClick={() => void addItems([item])}
              >
                {alreadyOn ? t("manager.storefront.on") : t("manager.storefront.to")}
              </button>
            </article>
          );
        })}
        {!loading && !items.length && (
          <div className="empty-box">{t("manager.nothingInThe1cExportFor")}</div>
        )}
      </div>
    </>
  );

  const renderExcelStep = () => (
    <MatrixExcelReview
      products={products}
      setProducts={setProducts}
      target="storefront"
      autoOpenFile
      onBack={() => setStep("choose")}
      onCancel={closeAll}
      onAdded={(addedNames = []) => {
        setNotice(
          addedNames.length === 1
            ? t("manager.storefront.addedNamed", { name: addedNames[0] })
            : addedNames.length
              ? t("manager.storefront.addedFromExcel", { count: addedNames.length })
              : t("manager.noNewItemsEverythingIsAlready")
        );
        onAfterAdd?.({ addedNames, source: "excel" });
        setStep("closed");
      }}
    />
  );

  const renderStepPanel = () => {
    if (step === "choose") {
      return (
        <div className="one-c-picker matrix-add-panel storefront-add-panel">
          {renderChooseStep()}
        </div>
      );
    }
    if (step === "manual") {
      return (
        <div className="one-c-picker matrix-add-panel storefront-add-panel storefront-add-panel-manual">
          {renderManualStep()}
        </div>
      );
    }
    if (step === "excel") {
      return (
        <div className="one-c-picker matrix-add-panel storefront-add-panel storefront-add-panel-excel">
          {renderExcelStep()}
        </div>
      );
    }
    return null;
  };

  const sheetPortal =
    sheetOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="cart-sheet storefront-add-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t(SHEET_TITLE_KEYS[step] || "manager.storefront.add")}
          >
            <button
              className="cart-sheet-backdrop"
              type="button"
              aria-label={t("shared.action.close")}
              onClick={closeAll}
            />
            <div className="cart-sheet-panel storefront-add-sheet-panel">
              <div className="cart-sheet-head">
                <div>
                  <strong>{t(SHEET_TITLE_KEYS[step] || "manager.storefront.add")}</strong>
                </div>
                <button className="header-button" type="button" onClick={closeAll}>{
                  t("shared.action.close")
                }</button>
              </div>
              <div className="cart-sheet-scroll storefront-add-sheet-scroll">
                {renderStepPanel()}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="matrix-onec-add storefront-onec-add">
        <button
          className="secondary-button storefront-onec-add-btn"
          type="button"
          onClick={() => {
            setNotice("");
            setError("");
            setSelectedIds(new Set());
            setStep("choose");
          }}
          disabled={loading || step !== "closed"}
        >{
          t("manager.addFrom1cExcel")
        }</button>
        {notice && step === "closed" && (
          <div className="matrix-save-message saved storefront-onec-add-notice">
            {notice}
          </div>
        )}
        {!isMobile ? renderStepPanel() : null}
      </div>
      {sheetPortal}
    </>
  );
}
