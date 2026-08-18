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

function excelTargetAlreadyPresent(row, target) {
  if (target === "storefront") return Boolean(row.alreadyOnStorefront);
  if (target === "catalog") return Boolean(row.alreadyInClover);
  return Boolean(row.alreadyInMatrix);
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
      (target === "storefront"
        ? !alreadyOnStorefront
        : target === "catalog"
          ? !alreadyInClover
          : !alreadyInMatrix);
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
 * target: "matrix" (клиент) | "storefront" (витрина сайта) | "catalog" (каталог Clover).
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
  initialFile = null,
  target = "matrix",
}) {
  const isStorefront = target === "storefront";
  const isCatalog = target === "catalog";
  const skipClient = isStorefront || isCatalog;
  const fileRef = useRef(null);
  const autoOpenedRef = useRef(false);
  const [busy, setBusy] = useState(() => Boolean(initialFile));
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
    if (initialFile || !autoOpenFile || rows || busy || autoOpenedRef.current) return undefined;
    autoOpenedRef.current = true;
    const timer = window.setTimeout(() => {
      fileRef.current?.click();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoOpenFile, initialFile, rows, busy]);

  const parsePickedFile = async (file) => {
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
      const membership = skipClient
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

  useEffect(() => {
    if (!initialFile || autoOpenedRef.current) return undefined;
    autoOpenedRef.current = true;
    void parsePickedFile(initialFile);
    return undefined;
  }, [initialFile]);

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      if (autoOpenFile && !initialFile && !rows) {
        setImportState({ status: "idle" });
        (onBack || onCancel)?.();
      }
      return;
    }
    await parsePickedFile(file);
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
        const alreadyInClover = Boolean(cloverProduct || match?.cloverLink?.productId);
        const alreadyOnStorefront = Boolean(cloverProduct?.showOnStorefront);
        const alreadyHere = excelTargetAlreadyPresent(
          { alreadyInMatrix, alreadyInClover, alreadyOnStorefront },
          target
        );
        return {
          ...row,
          selectedOneCId: key,
          selected: Boolean(key) && !alreadyHere,
          alreadyInMatrix,
          alreadyInClover,
          alreadyOnStorefront,
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
    const toAdd = (rows || []).filter((row) => {
      if (!row.selected || !row.selectedOneCId) return false;
      return !excelTargetAlreadyPresent(row, target);
    });
    if (!toAdd.length || importDone) {
      if (!importDone) {
        setImportDone(true);
        setImportState({
          status: "done",
          message: isStorefront
            ? "Товары уже на витрине"
            : isCatalog
              ? "Товары уже в каталоге"
              : "Товары уже в матрице",
        });
        setError(
          isStorefront
            ? "Новых позиций нет — все отмеченные уже на витрине."
            : isCatalog
              ? "Новых позиций нет — все отмеченные уже в каталоге Clover."
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
    const liveMembership = skipClient
      ? null
      : getClientMatrixMembership(link, products);
    const liveOnStorefront = new Set(
      (Array.isArray(products) ? products : [])
        .filter((item) => item.showOnStorefront === true)
        .map((item) => String(item.oneCId || "").trim())
        .filter(Boolean)
    );
    const liveInClover = new Set(
      (Array.isArray(products) ? products : [])
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
        } else if (isCatalog) {
          if (liveInClover.has(oneCId) || row.alreadyInClover) {
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
          clientId: skipClient ? "" : clientId,
          preferredName: excelName,
          showOnStorefront: isStorefront,
          skipEnrichment: isCatalog || unique.length > 20,
        });
        if (Array.isArray(result.products)) {
          setProducts((current) =>
            mergeProductsFromCatalogResponse(current, result.products)
          );
        }
        if (!skipClient) {
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
        if (isCatalog) {
          liveInClover.add(oneCId);
        }

        if (!skipClient && result.alreadyInMatrix) {
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
            : isCatalog
              ? `В каталог: ${addedNames.length}`
              : `В матрицу: ${addedNames.length}`
        );
      }
      if (reusedCount) parts.push(`из каталога Clover без дублей: ${reusedCount}`);
      if (createdCount) parts.push(`новых в каталоге: ${createdCount}`);
      if (skipped) {
        parts.push(
          isStorefront
            ? `пропущено (уже на витрине/дубли): ${skipped}`
            : isCatalog
              ? `пропущено (уже в каталоге/дубли): ${skipped}`
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

  // Ещё нет файла: системный диалог уже открыт, либо читаем выбранный файл.
  if (!rows) {
    const skipChooser = Boolean(autoOpenFile || initialFile);
    return (
      <div className="one-c-picker matrix-excel-review" style={{ marginTop: 10 }}>
        {!skipChooser || error || busy ? (
          <strong>
            {isStorefront
              ? "Excel на витрину"
              : isCatalog
                ? "Excel в каталог Clover"
                : "Excel"}
          </strong>
        ) : null}
        {error && <div className="sync-error" style={{ marginTop: 8 }}>{error}</div>}
        {busy ? (
          <p className="muted small" style={{ marginTop: 8 }}>Читаем файл…</p>
        ) : null}
        {skipChooser && !error ? (
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            hidden
            onChange={(event) => void onPickFile(event)}
          />
        ) : (
        <div className="matrix-add-actions" style={{ marginTop: 8 }}>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Читаем файл…" : skipChooser ? "Выбрать другой файл" : "Выбрать файл Excel"}
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
        )}
      </div>
    );
  }

  // Окно сопоставления и редактирования.
  return (
    <div className="bulk-photo-panel matrix-excel-review" style={{ marginTop: 10 }}>
      <strong>{fileName ? `Excel: ${fileName}` : "Сопоставление с 1С"}</strong>
      {summary && (
        <div className="matrix-summary" style={{ marginTop: 8 }}>
          <span>Строк: {summary.total}</span>
          <span>Точных: {summary.exact}</span>
          <span>По коду: {summary.code}</span>
          <span>Похожих: {summary.fuzzy}</span>
          <span>Без пары: {summary.miss}</span>
          <span>
            {isStorefront
              ? "Уже на витрине"
              : isCatalog
                ? "Уже в каталоге"
                : "Уже в матрице"}
            :{" "}
            {isStorefront
              ? (rows || []).filter((row) => row.alreadyOnStorefront).length
              : isCatalog
                ? (rows || []).filter((row) => row.alreadyInClover).length
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
          const present = excelTargetAlreadyPresent(row, target);
          return (
            <div
              key={`excel-row-${row.rowIndex}`}
              className={
                present
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
                      !present
                  )}
                  disabled={
                    !row.selectedOneCId ||
                    busy ||
                    importDone ||
                    present
                  }
                  onChange={(event) =>
                    updateRow(row.rowIndex, {
                      selected:
                        event.target.checked &&
                        !present,
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
                ) : isCatalog && row.alreadyInClover ? (
                  <span className="muted small">
                    Уже в каталоге Clover — дубликат не добавляется
                  </span>
                ) : !skipClient && row.alreadyInMatrix ? (
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
                          const membership = getClientMatrixMembership(
                            skipClient ? {} : link,
                            products
                          );
                          const alreadyInMatrix = isOneCItemInClientMatrix(
                            { id: item.id, cloverLink: item.cloverLink || null },
                            membership
                          );
                          const cloverProduct = findCloverCatalogProduct(products, {
                            oneCId: item.id,
                            code: item.code,
                            name: item.name,
                            excelName: row.name,
                          });
                          const alreadyInClover = Boolean(
                            cloverProduct || item.cloverLink?.productId
                          );
                          const alreadyOnStorefront = Boolean(
                            cloverProduct?.showOnStorefront
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
                            selected: !excelTargetAlreadyPresent(
                              { alreadyInMatrix, alreadyInClover, alreadyOnStorefront },
                              target
                            ),
                            alreadyInMatrix,
                            alreadyInClover,
                            alreadyOnStorefront,
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
              : isCatalog
                ? `Добавить в каталог (${selectedCount})`
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
                selected:
                  Boolean(row.selectedOneCId) &&
                  !excelTargetAlreadyPresent(row, target),
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
