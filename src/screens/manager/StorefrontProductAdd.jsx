import { useEffect, useRef, useState } from "react";
import { api } from "../../serverApi";
import { MatrixExcelReview } from "./MatrixExcelImport";
import { mergeProductsFromCatalogResponse } from "./matrixMembership";

/**
 * Добавление товаров на витрину из 1С (вручную или Excel),
 * даже если позиции ещё нет ни в одной клиентской матрице.
 * Имя на витрине = имя Clover/матрицы (из Excel или уже существующего товара).
 */
export function StorefrontProductAdd({ products, setProducts, onAfterAdd }) {
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
    if (step !== "manual") return;
    searchInputRef.current?.focus();
  }, [step]);

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
      setError("Выбранные позиции уже на витрине.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    const addedNames = [];
    let skipped = 0;

    try {
      for (const item of list) {
        const existing = productsByOneCId.get(String(item.id));
        if (existing?.showOnStorefront) {
          skipped += 1;
          continue;
        }
        // Уже есть в Clover — берём имя матрицы/каталога; новое — имя 1С.
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
          productsByOneCId.set(String(result.product.oneCId), result.product);
        }
        addedNames.push(result.product?.name || preferredName || item.name);
        onAfterAdd?.(result);
      }
      setSelectedIds(new Set());
      setNotice(
        addedNames.length
          ? addedNames.length === 1
            ? `На витрину: «${addedNames[0]}».`
            : `На витрину: ${addedNames.length} поз.`
          : "Новых позиций нет."
      );
      if (skipped) setError(`Уже на витрине, пропущено: ${skipped}.`);
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

  return (
    <div className="matrix-onec-add" style={{ marginBottom: 16 }}>
      <div className="toolbar two">
        <p className="muted small" style={{ margin: 0 }}>
          Добавить на витрину из 1С вручную или Excel — даже если товара ещё нет
          ни у одного клиента в матрице. На сайте показывается имя Clover/матрицы,
          не сырое название 1С.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setNotice("");
            setError("");
            setSelectedIds(new Set());
            setStep("choose");
          }}
          disabled={loading || step !== "closed"}
        >
          Добавить из 1С / Excel
        </button>
      </div>
      {notice && step === "closed" && (
        <div className="matrix-save-message saved" style={{ marginTop: 8 }}>
          {notice}
        </div>
      )}

      {step === "choose" && (
        <div className="one-c-picker" style={{ marginTop: 10 }}>
          <strong>Как добавить товары на витрину?</strong>
          <p className="muted small" style={{ marginTop: 6 }}>
            Вручную — поиск в выгрузке 1С. Excel — названия как в матрице, пары с 1С.
          </p>
          <div className="bulk-photo-actions" style={{ marginTop: 12 }}>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setStep("manual");
                setSearch("");
                setSelectedIds(new Set());
              }}
            >
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
          products={products}
          setProducts={setProducts}
          target="storefront"
          autoOpenFile
          onBack={() => setStep("choose")}
          onCancel={closeAll}
          onAdded={(addedNames = []) => {
            setNotice(
              addedNames.length === 1
                ? `На витрину: «${addedNames[0]}».`
                : addedNames.length
                  ? `На витрину из Excel: ${addedNames.length} поз.`
                  : "Новых позиций нет — всё уже на витрине."
            );
            onAfterAdd?.({ addedNames, source: "excel" });
            setStep("closed");
          }}
        />
      )}

      {step === "manual" && (
        <div className="one-c-picker" style={{ marginTop: 10 }}>
          <strong>Поиск по выгрузке 1С → витрина</strong>
          <p className="muted small" style={{ marginTop: 6, marginBottom: 8 }}>
            Если товар уже есть в Clover, на витрине останется его имя из матрицы.
            Новый товар получит имя из 1С (его можно потом поменять в карточке).
            {catalogTotal ? ` В выгрузке: ${catalogTotal}.` : ""}
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
              Найдено: {total}. К добавлению: {selectedItems.length}.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={loading || selectedItems.length === 0}
              onClick={() => void addItems(selectedItems)}
            >
              {loading
                ? "Добавляем..."
                : `Добавить на витрину (${selectedItems.length})`}
            </button>
          </div>
          <div className="one-c-products-list one-c-picker-list">
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
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={alreadyOn || loading}
                      onChange={() => toggleSelected(item)}
                      style={{ marginTop: 4 }}
                    />
                    <div>
                      <strong>{item.name}</strong>
                      <span>Код: {item.code || "—"}</span>
                      {alreadyOn ? (
                        <span className="muted small">
                          <span className="badge green" style={{ marginRight: 6 }}>
                            На витрине
                          </span>
                          {clover?.name ? `как «${clover.name}»` : "повторно добавить нельзя"}
                        </span>
                      ) : clover ? (
                        <span className="muted small">
                          В Clover/матрице: «{clover.name}» — это имя пойдёт на витрину
                        </span>
                      ) : (
                        <span className="muted small">
                          Новый для Clover — имя с 1С, можно изменить позже
                        </span>
                      )}
                    </div>
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={loading || alreadyOn}
                    onClick={() => void addItems([item])}
                  >
                    {alreadyOn ? "На витрине" : "На витрину"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">
                В выгрузке 1С по запросу ничего нет.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
