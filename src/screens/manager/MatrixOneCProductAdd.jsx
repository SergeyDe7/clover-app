import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import { useEffect, useRef, useState } from "react";
import { api } from "../../serverApi";
import { EMPTY_LINK } from "../../shared/appHelpers";
import { MatrixExcelReview } from "./MatrixExcelImport";
import {
  getClientMatrixMembership,
  isOneCItemInClientMatrix,
  mergeProductsFromCatalogResponse,
} from "./matrixMembership";

function sortMatrixOneCResults(items, membership) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const aInMatrix = isOneCItemInClientMatrix(a, membership) ? 1 : 0;
    const bInMatrix = isOneCItemInClientMatrix(b, membership) ? 1 : 0;
    if (aInMatrix !== bInMatrix) return aInMatrix - bInMatrix;
    const aInClover = a.cloverLink?.productId ? 1 : 0;
    const bInClover = b.cloverLink?.productId ? 1 : 0;
    if (aInClover !== bInClover) return aInClover - bInClover;
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  });
}

/**
 * Добавить из 1С → выбор «Вручную» или «Excel» →
 * для Excel: файл → окно сопоставления → «Добавить товары» / «Отмена».
 */
export function MatrixOneCProductAdd({
  clientId,
  link,
  products,
  setProducts,
  setClientLinks,
  onAfterAdd,
  onExcelImportStateChange,
  onPanelChange,
}) {
  const { t } = useLocalization();
  // closed | choose | manual | excel
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

  const membership = getClientMatrixMembership(link, products);
  const panelOpen = step !== "closed";

  useEffect(() => {
    onPanelChange?.(panelOpen);
    return () => onPanelChange?.(false);
    // Только step: колбэк с родителя каждый рендер новый.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  const closeAll = () => {
    setStep("closed");
    setError("");
    setSelectedIds(new Set());
    setItems([]);
    setTotal(0);
  };

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
      const nextItems = sortMatrixOneCResults(result.items || [], membership);
      setItems(nextItems);
      setTotal(Number(result.total) || 0);
      const summaryTotal = Number(result.summary?.oneCTotal);
      if (Number.isFinite(summaryTotal) && summaryTotal >= 0) {
        setCatalogTotal(summaryTotal);
      }
    } catch (searchError) {
      if (requestId !== searchRequestId.current) return;
      setError(errorDisplayMessage(searchError, t, "shared.error.loadFailed"));
      setItems([]);
      setTotal(0);
    } finally {
      if (requestId === searchRequestId.current) {
        setLoading(false);
      }
    }
  };

  // Живой поиск по выгрузке 1С (не по каталогу Clover / матрице).
  useEffect(() => {
    if (step !== "manual") return undefined;
    const timer = window.setTimeout(() => {
      void runSearch(search);
    }, 280);
    return () => window.clearTimeout(timer);
    // membership меняется после add — пересортируем текущую выдачу отдельно.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только query/step
  }, [search, step]);

  useEffect(() => {
    if (step !== "manual") return;
    searchInputRef.current?.focus();
  }, [step]);

  const openChooser = () => {
    setNotice("");
    setError("");
    setSelectedIds(new Set());
    setStep("choose");
  };

  const openManual = () => {
    setStep("manual");
    setNotice("");
    setSelectedIds(new Set());
    setSearch("");
  };

  const toggleSelected = (item) => {
    if (isOneCItemInClientMatrix(item, membership)) return;
    const key = String(item.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addItems = async (toAdd) => {
    const list = (Array.isArray(toAdd) ? toAdd : []).filter(
      (item) => !isOneCItemInClientMatrix(item, membership)
    );
    if (!list.length) {
      setError(t("manager.selectedItemsAreAlreadyInThe"));
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    const addedNames = [];
    let skippedDuplicates = 0;
    const liveMembership = getClientMatrixMembership(link, products);

    try {
      for (const item of list) {
        if (isOneCItemInClientMatrix(item, liveMembership)) {
          skippedDuplicates += 1;
          continue;
        }

        const result = await api.createProductFromOneCCatalog({
          oneCId: item.id,
          item,
          clientId,
        });
        if (Array.isArray(result.products)) {
          setProducts((current) =>
            mergeProductsFromCatalogResponse(current, result.products)
          );
        }
        if (result.clientLinks) {
          setClientLinks(result.clientLinks);
        } else if (result.clientLink) {
          setClientLinks((current) => ({
            ...current,
            [clientId]: {
              ...EMPTY_LINK,
              ...(current[clientId] || {}),
              ...result.clientLink,
            },
          }));
        }

        if (result.product?.id != null) {
          liveMembership.matrixIds.add(String(result.product.id));
          const oneCId = String(item.id || "").trim();
          if (oneCId) {
            liveMembership.oneCIdsInMatrix.add(oneCId);
            liveMembership.productIdByOneCId.set(oneCId, String(result.product.id));
          }
        }

        if (result.alreadyInMatrix) {
          skippedDuplicates += 1;
          continue;
        }

        addedNames.push(result.product?.name || item.name);
        onAfterAdd?.(result);
      }
      setSelectedIds(new Set());
      if (addedNames.length) {
        setNotice(
          addedNames.length === 1
            ? t("manager.matrix.addedNamed", { name: addedNames[0] })
            : t("manager.matrix.addedCountPreview", {
                count: addedNames.length,
                preview: `${addedNames.slice(0, 3).join(", ")}${addedNames.length > 3 ? "…" : ""}`,
              })
        );
      } else {
        setNotice(t("manager.noNewItemsEverythingWasAlready"));
      }
      if (skippedDuplicates) {
        setError(t("manager.matrix.skippedDuplicates", { count: skippedDuplicates }));
      }
      // Обновим выдачу с учётом новой матрицы.
      await runSearch(search);
    } catch (selectError) {
      setError(errorDisplayMessage(selectError, t, "shared.error.addFailed"));
    } finally {
      setLoading(false);
    }
  };

  const selectedItems = items.filter(
    (item) =>
      selectedIds.has(String(item.id)) &&
      !isOneCItemInClientMatrix(item, membership)
  );

  return (
    <div className="matrix-onec-add">
      <button
        className="secondary-button"
        type="button"
        onClick={openChooser}
        disabled={loading || step !== "closed"}
      >{
        t("manager.addFrom1c")
      }</button>
      {notice && step === "closed" && (
        <div className="matrix-save-message saved">
          {notice}
        </div>
      )}

      {step === "choose" && (
        <div className="one-c-picker matrix-add-panel">
          <div className="matrix-add-actions">
            <button className="primary-button" type="button" onClick={openManual}>{
              t("manager.manually")
            }</button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setStep("excel")}
            >
              Excel
            </button>
            <button className="secondary-button" type="button" onClick={closeAll}>{
              t("shared.modal.cancel")
            }</button>
          </div>
        </div>
      )}

      {step === "excel" && (
        <MatrixExcelReview
          clientId={clientId}
          link={link}
          products={products}
          setProducts={setProducts}
          setClientLinks={setClientLinks}
          autoOpenFile
          onBack={() => {
            onExcelImportStateChange?.({ status: "idle" });
            setStep("choose");
          }}
          onCancel={() => {
            onExcelImportStateChange?.({ status: "idle" });
            closeAll();
          }}
          onImportStateChange={onExcelImportStateChange}
          onAdded={(addedNames = []) => {
            setNotice(
              addedNames.length === 1
                ? t("manager.matrix.addedNamedPricesLater", { name: addedNames[0] })
                : addedNames.length
                  ? t("manager.matrix.addedFromExcelPricesLater", { count: addedNames.length })
                  : t("manager.noNewItemsEverythingWasAlready")
            );
            onAfterAdd?.({ addedNames, source: "excel" });
          }}
        />
      )}

      {step === "manual" && (
        <div className="one-c-picker matrix-add-panel">
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
            <button
              className="secondary-button"
              type="button"
              disabled={loading}
              onClick={() => {
                setSearch("");
                void runSearch("");
              }}
            >{
              t("manager.entireCatalog")
            }</button>
            <button className="secondary-button" type="button" onClick={() => setStep("choose")}>{
              t("storefront.back")
            }</button>
            <button className="secondary-button" type="button" onClick={closeAll}>{
              t("shared.modal.cancel")
            }</button>
          </div>
          {error && <div className="sync-error">{error}</div>}
          {notice && (
            <div className="matrix-save-message saved">
              {notice}
            </div>
          )}
          <div className="matrix-add-actions">
            <span className="muted small">
              {t("manager.matrix.oneCFoundToAdd", {
                catalog: catalogTotal || "—",
                found: total,
                add: selectedItems.length,
              })}
            </span>
            <button
              className="primary-button"
              type="button"
              disabled={loading || selectedItems.length === 0}
              onClick={() => void addItems(selectedItems)}
            >
              {loading ? t("manager.adding") : t("manager.matrix.addCount", { count: selectedItems.length })}
            </button>
          </div>
          <div className="one-c-products-list one-c-picker-list">
            {items.map((item) => {
              const alreadyInMatrix = isOneCItemInClientMatrix(item, membership);
              const alreadyInClover = Boolean(item.cloverLink?.productId);
              const checked = selectedIds.has(String(item.id)) && !alreadyInMatrix;
              return (
                <article
                  key={item.id}
                  className={
                    alreadyInMatrix
                      ? "one-c-picker-row muted"
                      : checked
                        ? "one-c-picker-row selected"
                        : "one-c-picker-row"
                  }
                  style={{ cursor: alreadyInMatrix ? "default" : "pointer" }}
                >
                  <label
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      margin: 0,
                      cursor: alreadyInMatrix ? "default" : "pointer",
                      flex: 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={alreadyInMatrix || loading}
                      onChange={() => toggleSelected(item)}
                      style={{ marginTop: 4 }}
                    />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{t("manager.codeValue", { code: item.code || "—" })}</span>
                      {alreadyInMatrix ? (
                        <span className="muted small">{t("manager.alreadyInTheMatrixDuplicateIs")}</span>
                      ) : alreadyInClover ? (
                        <span className="muted small">
                          {t("manager.alreadyInCloverNamed", {
                            name: item.cloverLink.productName || `ID ${item.cloverLink.productId}`,
                          })}
                        </span>
                      ) : (
                        <span className="muted small">{t("manager.onlyIn1cWillBeCreated")}</span>
                      )}
                    </div>
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={loading || alreadyInMatrix}
                    onClick={() => void addItems([item])}
                  >
                    {alreadyInMatrix
                      ? t("manager.alreadyInMatrix")
                      : alreadyInClover
                        ? t("client.matrix.add")
                        : t("shared.action.add")}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">
                {catalogTotal === 0
                  ? t("manager.the1cExportIsEmptyFirst2")
                  : t("manager.nothingInThe1cExportMatches")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
