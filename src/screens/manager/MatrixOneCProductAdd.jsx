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
      setError(searchError.message);
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
      setError("Выбранные позиции уже есть в матрице — дубликаты не добавляются.");
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
            ? `Добавлено в матрицу: «${addedNames[0]}».`
            : `Добавлено в матрицу: ${addedNames.length} поз. (${addedNames.slice(0, 3).join(", ")}${addedNames.length > 3 ? "…" : ""}).`
        );
      } else {
        setNotice("Новых позиций нет — всё уже было в матрице.");
      }
      if (skippedDuplicates) {
        setError(`Пропущено дубликатов (уже в матрице): ${skippedDuplicates}.`);
      }
      // Обновим выдачу с учётом новой матрицы.
      await runSearch(search);
    } catch (selectError) {
      setError(selectError.message);
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
    <div className="matrix-onec-add" style={{ marginTop: 12 }}>
      <div className="toolbar two">
        <p className="muted small" style={{ margin: 0 }}>
          Добавление из каталога 1С: вручную или списком из Excel. Товары появятся в разделе «Товары» и в матрице клиента.
          {link.matrixMode === "all"
            ? " В режиме «все товары» позиция сразу доступна клиенту."
            : ""}
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={openChooser}
          disabled={loading || step !== "closed"}
        >
          Добавить из 1С
        </button>
      </div>
      {notice && step === "closed" && (
        <div className="matrix-save-message saved" style={{ marginTop: 8 }}>
          {notice}
        </div>
      )}

      {step === "choose" && (
        <div className="one-c-picker" style={{ marginTop: 10 }}>
          <strong>Как добавить товары из 1С?</strong>
          <p className="muted small" style={{ marginTop: 6 }}>
            Вручную — поиск по полной выгрузке номенклатуры 1С (не по каталогу Clover).
            Excel — загрузка файла, сопоставление названий с 1С, затем добавление.
          </p>
          <div className="bulk-photo-actions" style={{ marginTop: 12 }}>
            <button className="primary-button" type="button" onClick={openManual}>
              Вручную
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setStep("excel")}
            >
              Загрузить Excel
            </button>
            <button className="secondary-button" type="button" onClick={closeAll}>
              Отмена
            </button>
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
                ? `Добавлено в матрицу: «${addedNames[0]}». Цены подтянутся после обмена с 1С.`
                : addedNames.length
                  ? `Добавлено в матрицу из Excel: ${addedNames.length} поз. Цены подтянутся после обмена с 1С («Обновить цены»).`
                  : "Новых позиций нет — всё уже было в матрице."
            );
            onAfterAdd?.({ addedNames, source: "excel" });
          }}
        />
      )}

      {step === "manual" && (
        <div className="one-c-picker" style={{ marginTop: 10 }}>
          <strong>Поиск по выгрузке 1С</strong>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 8 }}>
            Это номенклатура из 1С
            {catalogTotal ? ` (${catalogTotal} поз.)` : ""}
            , а не каталог товаров Clover и не список матрицы ниже.
            Введите название или код 1С — поиск идёт сам при вводе.
          </p>
          <div className="one-c-products-search">
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Название или код из 1С"
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
              {loading ? "Поиск..." : "Найти"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={loading}
              onClick={() => {
                setSearch("");
                void runSearch("");
              }}
            >
              Весь каталог
            </button>
            <button className="secondary-button" type="button" onClick={() => setStep("choose")}>
              Назад
            </button>
            <button className="secondary-button" type="button" onClick={closeAll}>
              Отмена
            </button>
          </div>
          {error && <div className="sync-error">{error}</div>}
          {notice && (
            <div className="matrix-save-message saved" style={{ marginTop: 8 }}>
              {notice}
            </div>
          )}
          <div className="toolbar two" style={{ marginTop: 8, marginBottom: 8 }}>
            <p className="muted small" style={{ margin: 0 }}>
              В выгрузке 1С: {catalogTotal || "—"}. По запросу: {total}. В списке:{" "}
              {items.length || 0}. К добавлению: {selectedItems.length}.
              Сверху — позиции, которых ещё нет в Clover/матрице.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={loading || selectedItems.length === 0}
              onClick={() => void addItems(selectedItems)}
            >
              {loading ? "Добавляем..." : `Добавить товары (${selectedItems.length})`}
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
                      <span>Код: {item.code || "—"}</span>
                      {alreadyInMatrix ? (
                        <span className="muted small">Уже в матрице — дубликат не добавляется</span>
                      ) : alreadyInClover ? (
                        <span className="muted small">
                          Уже в Clover:{" "}
                          {item.cloverLink.productName || `ID ${item.cloverLink.productId}`}
                        </span>
                      ) : (
                        <span className="muted small">Только в 1С — будет создан в Clover</span>
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
                      ? "Уже в матрице"
                      : alreadyInClover
                        ? "В матрицу"
                        : "Добавить"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">
                {catalogTotal === 0
                  ? "Выгрузка 1С пуста. Сначала «Отправить товары» из VLAVKA."
                  : "В выгрузке 1С по этому запросу ничего нет. Уточните название/код или нажмите «Весь каталог»."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
