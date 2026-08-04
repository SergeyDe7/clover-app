import { useRef, useState } from "react";
import { api } from "../../serverApi";
import { EMPTY_LINK, normalizeProduct } from "../../shared/appHelpers";
import { parseMatrixExcelFile } from "../../shared/matrixExcelImport";

function statusLabel(status) {
  if (status === "exact") return "Точное имя";
  if (status === "code") return "По коду";
  if (status === "fuzzy") return "Похожее";
  if (status === "empty") return "Пусто";
  return "Не найдено";
}

function buildReviewRows(matchedRows) {
  return (Array.isArray(matchedRows) ? matchedRows : []).map((row) => {
    const autoSelect = row.status === "exact" || row.status === "code";
    return {
      ...row,
      selected: Boolean(autoSelect && row.match?.id),
      selectedOneCId: row.match?.id ? String(row.match.id) : "",
      search: "",
      searchItems: [],
      searchOpen: false,
      searchLoading: false,
    };
  });
}

/**
 * Шаг Excel внутри «Добавить из 1С»:
 * выбор файла → окно сопоставления/редактирования → «Добавить товары» / «Отмена».
 */
export function MatrixExcelReview({
  clientId,
  setProducts,
  setClientLinks,
  onBack,
  onCancel,
  onAdded,
}) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState(null);

  const resetFileInput = () => {
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError("");
    setSummary(null);
    setRows(null);
    setFileName(file.name);

    try {
      const parsed = await parseMatrixExcelFile(file);
      const matched = await api.matchOneCImportRows(parsed.rows);
      setSummary(matched.summary || null);
      setRows(buildReviewRows(matched.rows));
    } catch (loadError) {
      setError(loadError.message || "Не удалось прочитать файл.");
      setFileName("");
    } finally {
      setBusy(false);
      resetFileInput();
    }
  };

  const updateRow = (rowIndex, patch) => {
    setRows((current) =>
      (current || []).map((row) =>
        row.rowIndex === rowIndex ? { ...row, ...patch } : row
      )
    );
  };

  const chooseCandidate = (rowIndex, oneCId) => {
    const key = String(oneCId || "");
    setRows((current) =>
      (current || []).map((row) => {
        if (row.rowIndex !== rowIndex) return row;
        const fromCandidates = (row.candidates || []).find(
          (item) => String(item.id) === key
        );
        const fromSearch = (row.searchItems || []).find(
          (item) => String(item.id) === key
        );
        const picked = fromCandidates || fromSearch || null;
        return {
          ...row,
          selectedOneCId: key,
          selected: Boolean(key),
          match: picked
            ? {
                id: picked.id,
                name: picked.name,
                code: picked.code || "",
                cloverLink: picked.cloverLink || null,
              }
            : null,
          status: key ? (row.status === "miss" ? "fuzzy" : row.status) : "miss",
        };
      })
    );
  };

  const searchOneC = async (rowIndex) => {
    const row = (rows || []).find((item) => item.rowIndex === rowIndex);
    if (!row) return;
    const query = String(row.search || row.name || "").trim();
    updateRow(rowIndex, { searchLoading: true, searchOpen: true });
    try {
      const result = await api.getOneCProducts({
        search: query,
        limit: 30,
        offset: 0,
      });
      updateRow(rowIndex, {
        searchItems: result.items || [],
        searchLoading: false,
        searchOpen: true,
      });
    } catch (searchError) {
      updateRow(rowIndex, { searchLoading: false });
      setError(searchError.message);
    }
  };

  const selectedCount = (rows || []).filter(
    (row) => row.selected && row.selectedOneCId
  ).length;

  const addSelected = async () => {
    const toAdd = (rows || []).filter((row) => row.selected && row.selectedOneCId);
    if (!toAdd.length) return;

    setBusy(true);
    setError("");
    const addedNames = [];
    const seenOneC = new Set();

    try {
      for (const row of toAdd) {
        const oneCId = String(row.selectedOneCId);
        if (seenOneC.has(oneCId)) continue;
        seenOneC.add(oneCId);

        const item =
          row.match && String(row.match.id) === oneCId
            ? row.match
            : (row.candidates || []).find((entry) => String(entry.id) === oneCId) ||
              (row.searchItems || []).find((entry) => String(entry.id) === oneCId) ||
              { id: oneCId };

        const result = await api.createProductFromOneCCatalog({
          oneCId,
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
        addedNames.push(result.product?.name || item.name || oneCId);
      }

      onAdded?.(addedNames);
    } catch (addError) {
      setError(addError.message);
    } finally {
      setBusy(false);
    }
  };

  // Ещё нет файла — только выбор Excel и Отмена.
  if (!rows) {
    return (
      <div className="one-c-picker matrix-excel-review" style={{ marginTop: 10 }}>
        <strong>Загрузка из Excel</strong>
        <p className="muted small" style={{ marginTop: 6 }}>
          Колонки: «Название» / «Товар» (обязательно), «Код» / «Артикул» (необязательно).
          После загрузки откроется окно сопоставления с 1С.
        </p>
        {error && <div className="sync-error" style={{ marginTop: 8 }}>{error}</div>}
        <div className="bulk-photo-actions" style={{ marginTop: 12 }}>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Читаем файл…" : "Выбрать файл Excel"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={onBack || onCancel}
          >
            Отмена
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            hidden
            onChange={(event) => void onPickFile(event)}
          />
        </div>
      </div>
    );
  }

  // Окно сопоставления и редактирования.
  return (
    <div className="bulk-photo-panel matrix-excel-review" style={{ marginTop: 10 }}>
      <strong>Сопоставление с каталогом 1С</strong>
      <p className="muted small" style={{ marginTop: 6 }}>
        Файл{fileName ? ` «${fileName}»` : ""}. Проверьте пары с точными названиями 1С,
        при необходимости исправьте — затем «Добавить товары» или «Отмена».
      </p>
      {summary && (
        <div className="matrix-summary" style={{ marginTop: 8 }}>
          <span>Строк: {summary.total}</span>
          <span>Точных: {summary.exact}</span>
          <span>По коду: {summary.code}</span>
          <span>Похожих: {summary.fuzzy}</span>
          <span>Без пары: {summary.miss}</span>
          <span>К добавлению: {selectedCount}</span>
        </div>
      )}
      {error && <div className="sync-error" style={{ marginTop: 8 }}>{error}</div>}

      <div className="bulk-photo-list matrix-excel-list">
        {rows.map((row) => {
          const options = row.candidates?.length
            ? row.candidates
            : row.match
              ? [{ ...row.match, score: row.score }]
              : [];
          return (
            <div
              key={`excel-row-${row.rowIndex}`}
              className={
                row.selectedOneCId
                  ? "bulk-photo-row matrix-excel-row"
                  : "bulk-photo-row matrix-excel-row miss"
              }
            >
              <label className="matrix-excel-check">
                <input
                  type="checkbox"
                  checked={Boolean(row.selected && row.selectedOneCId)}
                  disabled={!row.selectedOneCId}
                  onChange={(event) =>
                    updateRow(row.rowIndex, { selected: event.target.checked })
                  }
                />
              </label>
              <div className="matrix-excel-source">
                <strong>{row.name || "—"}</strong>
                <span className="muted small">
                  {row.code ? `Код из файла: ${row.code}` : "Без кода"} ·{" "}
                  {statusLabel(row.status)}
                  {row.score ? ` (${Math.round(row.score * 100)}%)` : ""}
                </span>
              </div>
              <div className="matrix-excel-match">
                <select
                  value={row.selectedOneCId}
                  onChange={(event) =>
                    chooseCandidate(row.rowIndex, event.target.value)
                  }
                >
                  <option value="">— не сопоставлено —</option>
                  {options.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.name}
                      {item.code ? ` (${item.code})` : ""}
                      {item.score != null
                        ? ` · ${Math.round(Number(item.score) * 100)}%`
                        : ""}
                    </option>
                  ))}
                </select>
                {row.match?.cloverLink?.productId && (
                  <span className="muted small">
                    Уже в Clover:{" "}
                    {row.match.cloverLink.productName || row.match.cloverLink.productId}
                  </span>
                )}
                <div className="matrix-excel-search">
                  <input
                    type="search"
                    placeholder="Уточнить поиск в 1С"
                    value={row.search}
                    onChange={(event) =>
                      updateRow(row.rowIndex, { search: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchOneC(row.rowIndex);
                      }
                    }}
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy || row.searchLoading}
                    onClick={() => void searchOneC(row.rowIndex)}
                  >
                    {row.searchLoading ? "…" : "Найти"}
                  </button>
                </div>
                {row.searchOpen && (
                  <div className="matrix-excel-search-results">
                    {(row.searchItems || []).map((item) => (
                      <button
                        key={`search-${row.rowIndex}-${item.id}`}
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          updateRow(row.rowIndex, {
                            candidates: [
                              {
                                id: item.id,
                                name: item.name,
                                code: item.code || "",
                                score: 1,
                                cloverLink: item.cloverLink || null,
                              },
                              ...(row.candidates || []).filter(
                                (c) => String(c.id) !== String(item.id)
                              ),
                            ],
                            searchOpen: false,
                            selectedOneCId: String(item.id),
                            selected: true,
                            match: {
                              id: item.id,
                              name: item.name,
                              code: item.code || "",
                              cloverLink: item.cloverLink || null,
                            },
                            status: "exact",
                            score: 1,
                          });
                        }}
                      >
                        {item.name}
                        {item.code ? ` (${item.code})` : ""}
                      </button>
                    ))}
                    {!row.searchLoading && !(row.searchItems || []).length && (
                      <span className="muted small">Ничего не найдено</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bulk-photo-actions">
        <button
          className="primary-button"
          type="button"
          disabled={busy || selectedCount === 0}
          onClick={() => void addSelected()}
        >
          {busy ? "Добавляем…" : `Добавить товары (${selectedCount})`}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setRows((current) =>
              (current || []).map((row) => ({
                ...row,
                selected: Boolean(row.selectedOneCId),
              }))
            );
          }}
        >
          Отметить все сопоставленные
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setRows(null);
            setSummary(null);
            setFileName("");
            setError("");
            resetFileInput();
            onCancel?.();
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
