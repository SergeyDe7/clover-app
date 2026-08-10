import { useEffect, useRef, useState } from "react";
import { api } from "../../serverApi";
import {
  getClientMatrixMembership,
  isOneCItemInClientMatrix,
  findCloverCatalogProduct,
  mergeProductsFromCatalogResponse,
} from "./matrixMembership";
import { EMPTY_LINK } from "../../shared/appHelpers";
import { parseMatrixExcelFile } from "../../shared/matrixExcelImport";

function statusLabel(status) {
  if (status === "exact") return "Точное имя";
  if (status === "code") return "По коду";
  if (status === "fuzzy") return "Похожее";
  if (status === "empty") return "Пусто";
  return "Не найдено";
}

function buildReviewRows(matchedRows, membership, { target = "matrix", products = [] } = {}) {
  return (Array.isArray(matchedRows) ? matchedRows : []).map((row) => {
    const matchItem = {
      id: row.match?.id,
      name: row.match?.name || row.name,
      code: row.match?.code || row.code,
      cloverLink: row.match?.cloverLink || null,
    };
    const cloverProduct =
      findCloverCatalogProduct(products, {
        oneCId: matchItem.id,
        code: matchItem.code || row.code,
        name: matchItem.name,
        excelName: row.name,
      }) ||
      (row.match?.cloverLink?.productId
        ? (Array.isArray(products) ? products : []).find(
            (item) => String(item.id) === String(row.match.cloverLink.productId)
          )
        : null);
    const alreadyInClover = Boolean(cloverProduct);
    const alreadyInMatrix = isOneCItemInClientMatrix(matchItem, membership);
    const alreadyOnStorefront = Boolean(cloverProduct?.showOnStorefront);
    const autoSelect =
      (row.status === "exact" || row.status === "code") &&
      row.match?.id &&
      (target === "storefront" ? !alreadyOnStorefront : !alreadyInMatrix);
    return {
      ...row,
      alreadyInClover,
      cloverProductId: cloverProduct?.id ?? null,
      alreadyInMatrix,
      alreadyOnStorefront,
      selected: Boolean(autoSelect),
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
 * выбор файла → окно сопоставления → «Добавить товары» → «Добавлено».
 * target: "matrix" (клиент) | "storefront" (витрина сайта).
 */
export function MatrixExcelReview({
  clientId,
  link,
  products,
  setProducts,
  setClientLinks,
  onBack,
  onCancel,
  onAdded,
  onImportStateChange,
  autoOpenFile = false,
  target = "matrix",
}) {
  const isStorefront = target === "storefront";
  const fileRef = useRef(null);
  const autoOpenedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importDone, setImportDone] = useState(false);

  const setImportState = (state) => {
    onImportStateChange?.(state);
  };

  const resetFileInput = () => {
    if (fileRef.current) fileRef.current.value = "";
  };

  // Сразу системный диалог выбора файла (без лишнего клика «Выбрать файл»).
  useEffect(() => {
    if (!autoOpenFile || rows || busy || autoOpenedRef.current) return undefined;
    autoOpenedRef.current = true;
    const timer = window.setTimeout(() => {
      fileRef.current?.click();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoOpenFile, rows, busy]);

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError("");
    setSummary(null);
    setRows(null);
    setImportDone(false);
    setImportState({ status: "busy", message: "Читаем Excel…" });
    try {
      const parsed = await parseMatrixExcelFile(file);
      const matchResult = await api.matchOneCImportRows(parsed.rows || []);
      const membership = isStorefront
        ? getClientMatrixMembership({}, products)
        : getClientMatrixMembership(link, products);
      setFileName(file.name || "file.xlsx");
      setSummary(matchResult.summary || null);
      setRows(
        buildReviewRows(matchResult.rows || [], membership, {
          target,
          products,
        })
      );
      setImportState({ status: "review", message: "Сопоставление Excel" });
    } catch (pickError) {
      setError(pickError.message);
      setImportState({ status: "idle" });
      resetFileInput();
    } finally {
      setBusy(false);
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
    const membership = getClientMatrixMembership(link, products);
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
        const match = picked
          ? {
              id: picked.id,
              name: picked.name,
              code: picked.code || "",
              cloverLink: picked.cloverLink || null,
            }
          : null;
        const alreadyInMatrix = Boolean(
          match && isOneCItemInClientMatrix(match, membership)
        );
        const cloverProduct = match
          ? findCloverCatalogProduct(products, {
              oneCId: match.id,
              code: match.code,
              name: match.name,
              excelName: row.name,
            })
          : null;
        return {
          ...row,
          selectedOneCId: key,
          selected: Boolean(key) && !alreadyInMatrix,
          alreadyInMatrix,
          alreadyInClover: Boolean(cloverProduct || match?.cloverLink?.productId),
          cloverProductId: cloverProduct?.id ?? match?.cloverLink?.productId ?? null,
          match,
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
    const membership = isStorefront
      ? getClientMatrixMembership({}, products)
      : getClientMatrixMembership(link, products);
    const toAdd = (rows || []).filter((row) => {
      if (!row.selected || !row.selectedOneCId) return false;
      if (isStorefront) return !row.alreadyOnStorefront;
      return !isOneCItemInClientMatrix(
        {
          id: row.selectedOneCId,
          cloverLink: row.match?.cloverLink || null,
        },
        membership
      );
    });
    if (!toAdd.length || importDone) {
      if (!importDone) {
        setImportDone(true);
        setImportState({
          status: "done",
          message: isStorefront
            ? "Товары уже на витрине"
            : "Товары уже в матрице",
        });
        setError(
          isStorefront
            ? "Новых позиций нет — все отмеченные уже на витрине."
            : "Новых позиций нет — все отмеченные уже в матрице."
        );
        onAdded?.([]);
      }
      return;
    }

    const unique = [];
    const seenOneC = new Set();
    let skipped = 0;
    for (const row of toAdd) {
      const oneCId = String(row.selectedOneCId);
      if (seenOneC.has(oneCId)) {
        skipped += 1;
        continue;
      }
      seenOneC.add(oneCId);
      unique.push(row);
    }

    setBusy(true);
    setError("");
    setProgress({ done: 0, total: unique.length });
    setImportState({
      status: "busy",
      message: `Загружаем товары из Excel (0/${unique.length})…`,
    });
    const addedNames = [];
    let reusedCount = 0;
    let createdCount = 0;
    const liveMembership = isStorefront
      ? null
      : getClientMatrixMembership(link, products);
    const liveOnStorefront = new Set(
      (Array.isArray(products) ? products : [])
        .filter((item) => item.showOnStorefront === true)
        .map((item) => String(item.oneCId || "").trim())
        .filter(Boolean)
    );

    try {
      for (let index = 0; index < unique.length; index += 1) {
        const row = unique[index];
        const oneCId = String(row.selectedOneCId);
        if (isStorefront) {
          if (liveOnStorefront.has(oneCId)) {
            skipped += 1;
            setProgress({ done: index + 1, total: unique.length });
            continue;
          }
        } else if (
          isOneCItemInClientMatrix(
            { id: oneCId, cloverLink: row.match?.cloverLink || null },
            liveMembership
          )
        ) {
          skipped += 1;
          setProgress({ done: index + 1, total: unique.length });
          continue;
        }

        const item =
          row.match && String(row.match.id) === oneCId
            ? row.match
            : (row.candidates || []).find((entry) => String(entry.id) === oneCId) ||
              (row.searchItems || []).find((entry) => String(entry.id) === oneCId) ||
              { id: oneCId };

        const excelName = String(row.name || "").trim();
        const result = await api.createProductFromOneCCatalog({
          oneCId,
          item,
          clientId: isStorefront ? "" : clientId,
          preferredName: excelName,
          showOnStorefront: isStorefront,
        });
        if (Array.isArray(result.products)) {
          setProducts((current) =>
            mergeProductsFromCatalogResponse(current, result.products)
          );
        }
        if (!isStorefront) {
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
        }

        if (result.product?.id != null && liveMembership) {
          liveMembership.matrixIds.add(String(result.product.id));
          liveMembership.oneCIdsInMatrix.add(oneCId);
          liveMembership.productIdByOneCId.set(oneCId, String(result.product.id));
        }
        if (isStorefront) {
          liveOnStorefront.add(oneCId);
        }

        if (!isStorefront && result.alreadyInMatrix) {
          skipped += 1;
        } else {
          addedNames.push(result.product?.name || excelName || item.name || oneCId);
          if (result.created === false) reusedCount += 1;
          else createdCount += 1;
        }

        const done = index + 1;
        setProgress({ done, total: unique.length });
        setImportState({
          status: "busy",
          message: `Загружаем товары из Excel (${done}/${unique.length})…`,
        });
      }

      setImportDone(true);
      setImportState({ status: "done", message: "Товары из Excel загружены" });
      const parts = [];
      if (addedNames.length) {
        parts.push(
          isStorefront
            ? `На витрину: ${addedNames.length}`
            : `В матрицу: ${addedNames.length}`
        );
      }
      if (reusedCount) parts.push(`из каталога Clover без дублей: ${reusedCount}`);
      if (createdCount) parts.push(`новых в каталоге: ${createdCount}`);
      if (skipped) {
        parts.push(
          isStorefront
            ? `пропущено (уже на витрине/дубли): ${skipped}`
            : `пропущено (уже в матрице/дубли): ${skipped}`
        );
      }
      if (parts.length) setError(parts.join(". ") + ".");
      onAdded?.(addedNames);
    } catch (addError) {
      setError(addError.message);
      setImportState({ status: "review", message: "Ошибка загрузки Excel" });
    } finally {
      setBusy(false);
    }
  };

  // Ещё нет файла — только выбор Excel и Отмена.
  if (!rows) {
    return (
      <div className="one-c-picker matrix-excel-review" style={{ marginTop: 10 }}>
        <strong>{isStorefront ? "Загрузка на витрину из Excel" : "Загрузка из Excel"}</strong>
        <p className="muted small" style={{ marginTop: 6 }}>
          Колонки: «Название» / «Товар» (обязательно), «Код» / «Артикул» (необязательно).
          Название из Excel станет именем на витрине/в каталоге Clover (как в матрице),
          сопоставление идёт с номенклатурой 1С.
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
            onClick={() => {
              setImportState({ status: "idle" });
              (onBack || onCancel)?.();
            }}
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
        при необходимости исправьте — затем «Добавить товары».
      </p>
      {summary && (
        <div className="matrix-summary" style={{ marginTop: 8 }}>
          <span>Строк: {summary.total}</span>
          <span>Точных: {summary.exact}</span>
          <span>По коду: {summary.code}</span>
          <span>Похожих: {summary.fuzzy}</span>
          <span>Без пары: {summary.miss}</span>
          <span>
            {isStorefront ? "Уже на витрине" : "Уже в матрице"}:{" "}
            {isStorefront
              ? (rows || []).filter((row) => row.alreadyOnStorefront).length
              : summary.alreadyInMatrix || 0}
          </span>
          <span>К добавлению: {selectedCount}</span>
          {busy && progress.total > 0 ? (
            <span>
              Загрузка: {progress.done}/{progress.total}
            </span>
          ) : null}
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
                (isStorefront ? row.alreadyOnStorefront : row.alreadyInMatrix)
                  ? "bulk-photo-row matrix-excel-row muted"
                  : row.selectedOneCId
                    ? "bulk-photo-row matrix-excel-row"
                    : "bulk-photo-row matrix-excel-row miss"
              }
            >
              <label className="matrix-excel-check">
                <input
                  type="checkbox"
                  checked={Boolean(
                    row.selected &&
                      row.selectedOneCId &&
                      !(isStorefront ? row.alreadyOnStorefront : row.alreadyInMatrix)
                  )}
                  disabled={
                    !row.selectedOneCId ||
                    busy ||
                    importDone ||
                    (isStorefront ? row.alreadyOnStorefront : row.alreadyInMatrix)
                  }
                  onChange={(event) =>
                    updateRow(row.rowIndex, {
                      selected:
                        event.target.checked &&
                        !(isStorefront ? row.alreadyOnStorefront : row.alreadyInMatrix),
                    })
                  }
                />
              </label>
              <div className="matrix-excel-source">
                <strong>{row.name || "—"}</strong>
                <span className="muted small">
                  {row.code ? `Код из файла: ${row.code}` : "Без кода"} ·{" "}
                  {statusLabel(row.status)}
                  {row.score ? ` (${Math.round(row.score * 100)}%)` : ""}
                  {row.alreadyInMatrix ? (
                    <span className="badge yellow" style={{ marginLeft: 6 }}>
                      В матрице
                    </span>
                  ) : null}
                  {row.alreadyInClover && !row.alreadyInMatrix ? (
                    <span className="badge green" style={{ marginLeft: 6 }}>
                      В каталоге Clover
                    </span>
                  ) : null}
                  {row.alreadyOnStorefront ? (
                    <span className="badge green" style={{ marginLeft: 6 }}>
                      На витрине
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="matrix-excel-match">
                <select
                  value={row.selectedOneCId}
                  disabled={busy || importDone}
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
                {isStorefront && row.alreadyOnStorefront ? (
                  <span className="muted small">
                    Уже на витрине — дубликат не добавляется
                  </span>
                ) : !isStorefront && row.alreadyInMatrix ? (
                  <span className="muted small">
                    Уже в матрице клиента — дубликат не добавляется
                  </span>
                ) : row.alreadyInClover ? (
                  <span className="muted small">
                    Уже в каталоге Clover — будет использован существующий товар, без дубля
                  </span>
                ) : row.match?.cloverLink?.productId ? (
                  <span className="muted small">
                    Уже в Clover:{" "}
                    {row.match.cloverLink.productName || row.match.cloverLink.productId}
                  </span>
                ) : null}
                <div className="matrix-excel-search">
                  <input
                    type="search"
                    placeholder="Уточнить поиск в 1С"
                    value={row.search}
                    disabled={busy || importDone}
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
                    disabled={busy || importDone || row.searchLoading}
                    onClick={() => void searchOneC(row.rowIndex)}
                  >
                    {row.searchLoading ? "…" : "Найти"}
                  </button>
                </div>
                {row.searchOpen && !importDone && (
                  <div className="matrix-excel-search-results">
                    {(row.searchItems || []).map((item) => (
                      <button
                        key={`search-${row.rowIndex}-${item.id}`}
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          const membership = getClientMatrixMembership(link, products);
                          const alreadyInMatrix = isOneCItemInClientMatrix(
                            { id: item.id, cloverLink: item.cloverLink || null },
                            membership
                          );
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
                            selected: !alreadyInMatrix,
                            alreadyInMatrix,
                            alreadyInClover: Boolean(item.cloverLink?.productId),
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
          disabled={busy || importDone || selectedCount === 0}
          onClick={() => void addSelected()}
        >
          {importDone
            ? "Добавлено"
            : busy
              ? progress.total
                ? `Добавляем… ${progress.done}/${progress.total}`
                : "Добавляем…"
              : `Добавить товары (${selectedCount})`}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy || importDone}
          onClick={() => {
            setRows((current) =>
              (current || []).map((row) => ({
                ...row,
                selected: Boolean(row.selectedOneCId) && !row.alreadyInMatrix,
              }))
            );
          }}
        >
          Отметить все новые
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
            setImportDone(false);
            setProgress({ done: 0, total: 0 });
            resetFileInput();
            setImportState({ status: "idle" });
            onCancel?.();
          }}
        >
          {importDone ? "Закрыть" : "Отмена"}
        </button>
      </div>
    </div>
  );
}
