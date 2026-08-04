import { useState } from "react";
import { api } from "../../serverApi";
import { EMPTY_LINK, normalizeProduct } from "../../shared/appHelpers";
import { MatrixExcelReview } from "./MatrixExcelImport";

/**
 * Добавить из 1С → выбор «Вручную» или «Excel» →
 * для Excel: файл → окно сопоставления → «Добавить товары» / «Отмена».
 */
export function MatrixOneCProductAdd({
  clientId,
  link,
  setProducts,
  setClientLinks,
  onAfterAdd,
}) {
  // closed | choose | manual | excel
  const [step, setStep] = useState("closed");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const closeAll = () => {
    setStep("closed");
    setError("");
    setSelectedIds(new Set());
  };

  const runSearch = async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCProducts({
        search: String(query || "").trim(),
        limit: 50,
        offset: 0,
      });
      setItems(result.items || []);
      setTotal(Number(result.total) || 0);
    } catch (searchError) {
      setError(searchError.message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const openChooser = () => {
    setNotice("");
    setError("");
    setSelectedIds(new Set());
    setStep("choose");
  };

  const openManual = async () => {
    setStep("manual");
    setNotice("");
    setSelectedIds(new Set());
    await runSearch(search);
  };

  const toggleSelected = (itemId) => {
    const key = String(itemId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addItems = async (toAdd) => {
    const list = Array.isArray(toAdd) ? toAdd : [];
    if (!list.length) return;

    setLoading(true);
    setError("");
    setNotice("");
    const addedNames = [];
    try {
      for (const item of list) {
        const result = await api.createProductFromOneCCatalog({
          oneCId: item.id,
          item,
          clientId,
        });
        if (Array.isArray(result.products)) {
          setProducts(result.products.map(normalizeProduct));
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
        addedNames.push(result.product?.name || item.name);
        onAfterAdd?.(result);
      }
      setSelectedIds(new Set());
      setNotice(
        addedNames.length === 1
          ? `Добавлено в матрицу: «${addedNames[0]}».`
          : `Добавлено в матрицу: ${addedNames.length} поз. (${addedNames.slice(0, 3).join(", ")}${addedNames.length > 3 ? "…" : ""}).`
      );
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedItems = items.filter((item) => selectedIds.has(String(item.id)));

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
            Вручную — поиск в каталоге. Excel — загрузка файла, сопоставление названий с 1С, затем добавление.
          </p>
          <div className="bulk-photo-actions" style={{ marginTop: 12 }}>
            <button className="primary-button" type="button" onClick={() => void openManual()}>
              Вручную
            </button>
            <button className="secondary-button" type="button" onClick={() => setStep("excel")}>
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
          setProducts={setProducts}
          setClientLinks={setClientLinks}
          onBack={() => setStep("choose")}
          onCancel={closeAll}
          onAdded={(addedNames = []) => {
            setNotice(
              addedNames.length === 1
                ? `Добавлено в матрицу: «${addedNames[0]}».`
                : `Добавлено в матрицу из Excel: ${addedNames.length} поз.`
            );
            closeAll();
          }}
        />
      )}

      {step === "manual" && (
        <div className="one-c-picker" style={{ marginTop: 10 }}>
          <div className="one-c-products-search">
            <input
              type="search"
              value={search}
              placeholder="Название или код номенклатуры 1С"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
            <button
              className="secondary-button"
              type="button"
              disabled={loading}
              onClick={() => runSearch()}
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
          <div className="toolbar two" style={{ marginTop: 8, marginBottom: 8 }}>
            <p className="muted small" style={{ margin: 0 }}>
              Найдено: {total}. Показаны первые {items.length || 0}. Выбрано: {selectedIds.size}.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={loading || selectedIds.size === 0}
              onClick={() => addItems(selectedItems)}
            >
              {loading ? "Добавляем..." : `Добавить товары (${selectedIds.size})`}
            </button>
          </div>
          <div className="one-c-products-list one-c-picker-list">
            {items.map((item) => {
              const alreadyInClover = Boolean(item.cloverLink?.productId);
              const checked = selectedIds.has(String(item.id));
              return (
                <article
                  key={item.id}
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
                      onChange={() => toggleSelected(item.id)}
                      style={{ marginTop: 4 }}
                    />
                    <div>
                      <strong>{item.name}</strong>
                      <span>Код: {item.code || "—"}</span>
                      {alreadyInClover && (
                        <span className="muted small">
                          Уже в Clover:{" "}
                          {item.cloverLink.productName || `ID ${item.cloverLink.productId}`}
                        </span>
                      )}
                    </div>
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={loading}
                    onClick={() => addItems([item])}
                  >
                    {alreadyInClover ? "В матрицу" : "Добавить"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">
                Номенклатура не найдена. Уточните запрос или обновите выгрузку из 1С.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
