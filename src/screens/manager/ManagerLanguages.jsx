import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../serverApi";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import {
  TRANSLATION_WORKSPACE_VIEWS,
} from "../../shared/i18n/localizationSettings.js";
import { parseProductTranslationRowId } from "../../shared/i18n/productLocalization.js";
import {
  canSendForeignLanguageEnablePut,
  isForeignEnableToggleDisabled,
  shouldShowIncompleteEnableBlock,
} from "../../shared/i18n/languageEnableGate.js";
import {
  canSaveGenericTranslation,
  canShowGenericReset,
  nextLoadMoreOffset,
  shouldClearLoadingForRequest,
  shouldDisableTargetLanguageSelect,
  shouldReplaceOverviewOnFailure,
} from "../../shared/i18n/workspaceActionGates.js";
import { canShowReturnToAuto } from "../../shared/i18n/productTranslationUi.js";
import {
  clearDraftIfUnchanged,
  emptyWorkspacePageMeta,
  isTranslationDraftDirty,
  mergePagedWorkspaceRows,
  mergeWorkspaceDrafts,
  readDraftValue,
  setDraftValue,
  shouldApplyWorkspaceResponse,
  shouldClearWorkspaceOnLoadError,
  workspaceMutationReloadOffset,
} from "../../shared/i18n/translationDrafts.js";

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh", "ar"];
const GLOSSARY_CONTEXT_OPTIONS = [
  { id: "" },
  { id: "product.name" },
  { id: "product.description" },
  { id: "product.composition" },
  { id: "product.characteristics" },
];

function glossaryContextLabel(t, contextId) {
  if (contextId === "product.name") return t("admin.glossary.context.name");
  if (contextId === "product.description") return t("admin.glossary.context.description");
  if (contextId === "product.composition") return t("admin.glossary.context.composition");
  if (contextId === "product.characteristics") return t("admin.glossary.context.characteristics");
  return t("admin.glossary.context.generic");
}
const emptyGlossaryForm = () => ({
  id: "",
  language: "",
  sourceRu: "",
  targetValue: "",
  context: "",
  protected: false,
});

function formatStamp(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function statusTone(cell) {
  if (cell?.stale) return "stale";
  if (cell?.state === "AUTO") return "auto";
  if (cell?.state === "MANUAL") return "manual";
  return "missing";
}

export function ManagerLanguages() {
  const { t } = useLocalization();
  const [settings, setSettings] = useState(null);
  const [completeness, setCompleteness] = useState({});
  const [locales, setLocales] = useState([]);
  const [rows, setRows] = useState([]);
  const [view, setView] = useState("interface");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("en");
  const [untranslatedOnly, setUntranslatedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [overviewError, setOverviewError] = useState("");
  const [drafts, setDrafts] = useState({});
  const [glossary, setGlossary] = useState([]);
  const [glossaryForm, setGlossaryForm] = useState(emptyGlossaryForm);
  const [pageMeta, setPageMeta] = useState(emptyWorkspacePageMeta());
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [overviewReady, setOverviewReady] = useState(false);
  const requestGenerationRef = useRef(0);
  const overviewGenerationRef = useRef(0);
  const languageRef = useRef("en");
  const viewRef = useRef("interface");
  const queryRef = useRef("");
  const untranslatedRef = useRef(false);
  const acceptedOffsetRef = useRef(0);
  const inFlightRef = useRef(false);
  const overviewEverLoadedRef = useRef(false);
  const page0FailedRef = useRef(false);

  const safeLanguage = TARGET_LOCALES.includes(language) ? language : "en";
  languageRef.current = safeLanguage;
  viewRef.current = view;
  queryRef.current = debouncedQuery;
  untranslatedRef.current = untranslatedOnly;
  const glossaryEditing = Boolean(glossaryForm.id);
  const glossaryFormLanguage = glossaryForm.language || safeLanguage;
  const languageSelectDisabled = shouldDisableTargetLanguageSelect({
    view,
    glossaryEditing,
  });

  const languageLabels = {
    ru: t("admin.languages.label.ru"),
    en: t("admin.languages.label.en"),
    uz: t("admin.languages.label.uz"),
    ky: t("admin.languages.label.ky"),
    tg: t("admin.languages.label.tg"),
    zh: t("admin.languages.label.zh"),
    ar: t("admin.languages.label.ar"),
  };

  const viewTitles = {
    interface: t("admin.languages.view.interface"),
    products: t("admin.languages.view.products"),
    categories: t("admin.languages.view.categories"),
    seo: t("admin.languages.view.seo"),
    glossary: t("admin.languages.view.glossary"),
    untranslated: t("admin.languages.view.untranslated"),
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (view !== "glossary" && glossaryForm.id) {
      setGlossaryForm(emptyGlossaryForm());
    }
  }, [view, glossaryForm.id]);

  const loadOverview = useCallback(async () => {
    const requestGeneration = ++overviewGenerationRef.current;
    try {
      const payload = await api.getLocalizationSettings();
      if (requestGeneration !== overviewGenerationRef.current) return;
      setSettings(payload.settings || null);
      setCompleteness(payload.completeness || {});
      setLocales(Array.isArray(payload.locales) ? payload.locales : []);
      setOverviewReady(true);
      overviewEverLoadedRef.current = true;
      setOverviewError("");
    } catch (error) {
      if (requestGeneration !== overviewGenerationRef.current) return;
      if (
        shouldReplaceOverviewOnFailure({
          everLoadedSuccessfully: overviewEverLoadedRef.current,
        })
      ) {
        setSettings({ enabledLanguages: ["ru"], catalogVersion: 0 });
        setCompleteness({});
        setOverviewReady(false);
      } else {
        setOverviewReady(false);
      }
      setOverviewError(errorDisplayMessage(error, t, "admin.languages.loadFailed"));
    }
  }, [t]);

  const fetchWorkspacePage = useCallback(
    async ({
      view: requestView,
      language: requestLanguage,
      query: requestQuery,
      untranslatedOnly: requestUntranslatedOnly,
      offset: requestOffset,
      replaceIdentity = false,
    }) => {
      const requestGeneration = ++requestGenerationRef.current;
      const isPage0 = replaceIdentity || !(Number(requestOffset) > 0);
      inFlightRef.current = true;
      setWorkspaceLoading(true);
      if (isPage0) {
        setRows([]);
        setGlossary([]);
        setPageMeta(emptyWorkspacePageMeta());
        acceptedOffsetRef.current = 0;
        page0FailedRef.current = false;
      }
      try {
        const [workspace, glossaryPayload] = await Promise.all([
          requestView === "glossary"
            ? Promise.resolve({ rows: [], total: 0, hasMore: false, limit: 100, offset: 0 })
            : api.getLocalizationTranslations({
                view: requestView,
                query: requestQuery,
                language: requestLanguage,
                untranslatedOnly: requestUntranslatedOnly,
                limit: 100,
                offset: requestOffset,
              }),
          requestView === "glossary"
            ? api.getGlossaryEntries({
                query: requestQuery,
                language: requestLanguage,
                limit: 100,
                offset: requestOffset,
              })
            : Promise.resolve({ entries: [], total: 0, hasMore: false, limit: 100, offset: 0 }),
        ]);
        if (
          !shouldApplyWorkspaceResponse({
            requestGeneration,
            currentGeneration: requestGenerationRef.current,
            requestLanguage,
            currentLanguage: languageRef.current,
            requestView,
            currentView: viewRef.current,
          })
        ) {
          return;
        }
        const pageRows = Array.isArray(workspace.rows) ? workspace.rows : [];
        setRows((current) => mergePagedWorkspaceRows(current, pageRows, requestOffset));
        setDrafts((current) => mergeWorkspaceDrafts(current, pageRows, requestLanguage));
        const pageGlossary = Array.isArray(glossaryPayload.entries) ? glossaryPayload.entries : [];
        setGlossary((current) => mergePagedWorkspaceRows(current, pageGlossary, requestOffset));
        const nextMeta = {
          total: Number(requestView === "glossary" ? glossaryPayload.total : workspace.total) || 0,
          hasMore: Boolean(requestView === "glossary" ? glossaryPayload.hasMore : workspace.hasMore),
          limit: Number(requestView === "glossary" ? glossaryPayload.limit : workspace.limit) || 100,
        };
        setPageMeta(nextMeta);
        acceptedOffsetRef.current = Number(requestOffset) || 0;
        page0FailedRef.current = false;
        setWorkspaceError("");
      } catch (error) {
        if (
          !shouldApplyWorkspaceResponse({
            requestGeneration,
            currentGeneration: requestGenerationRef.current,
            requestLanguage,
            currentLanguage: languageRef.current,
            requestView,
            currentView: viewRef.current,
          })
        ) {
          return;
        }
        if (shouldClearWorkspaceOnLoadError(requestOffset)) {
          setRows([]);
          setGlossary([]);
          setPageMeta(emptyWorkspacePageMeta());
          acceptedOffsetRef.current = 0;
          page0FailedRef.current = true;
        }
        setWorkspaceError(errorDisplayMessage(error, t, "admin.languages.loadFailed"));
      } finally {
        if (
          shouldClearLoadingForRequest({
            requestGeneration,
            currentGeneration: requestGenerationRef.current,
          })
        ) {
          inFlightRef.current = false;
          setWorkspaceLoading(false);
        }
      }
    },
    [t]
  );

  const refreshWorkspaceFromStart = useCallback(async () => {
    const nextOffset = workspaceMutationReloadOffset();
    acceptedOffsetRef.current = nextOffset;
    await fetchWorkspacePage({
      view: viewRef.current,
      language: languageRef.current,
      query: queryRef.current,
      untranslatedOnly: untranslatedRef.current,
      offset: nextOffset,
      replaceIdentity: true,
    });
  }, [fetchWorkspacePage]);

  const refreshOverview = loadOverview;

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    acceptedOffsetRef.current = 0;
    fetchWorkspacePage({
      view,
      language: safeLanguage,
      query: debouncedQuery,
      untranslatedOnly,
      offset: 0,
      replaceIdentity: true,
    });
  }, [view, safeLanguage, debouncedQuery, untranslatedOnly, fetchWorkspacePage]);

  const handleLoadMore = () => {
    if (page0FailedRef.current) return;
    const next = nextLoadMoreOffset({
      acceptedOffset: acceptedOffsetRef.current,
      limit: pageMeta.limit,
      hasMore: pageMeta.hasMore,
      inFlight: inFlightRef.current || workspaceLoading,
    });
    if (next == null) return;
    fetchWorkspacePage({
      view: viewRef.current,
      language: languageRef.current,
      query: queryRef.current,
      untranslatedOnly: untranslatedRef.current,
      offset: next,
      replaceIdentity: false,
    });
  };

  const enabled = new Set(settings?.enabledLanguages || ["ru"]);

  const toggleLanguage = async (code, nextEnabled) => {
    if (code === "ru") return;
    if (
      shouldShowIncompleteEnableBlock({
        code,
        nextEnabled,
        overviewReady,
        completeness,
      })
    ) {
      await appAlert({
        title: t("admin.languages.enableBlockedTitle"),
        message: t("admin.languages.enableBlocked"),
        tone: "warn",
      });
      return;
    }
    if (
      !canSendForeignLanguageEnablePut({
        code,
        nextEnabled,
        overviewReady,
        completeness,
      })
    ) {
      return;
    }
    const next = nextEnabled
      ? [...enabled, code]
      : [...enabled].filter((item) => item !== code);
    setBusy(true);
    try {
      const result = await api.saveLocalizationSettings({
        enabledLanguages: ["ru", ...next.filter((item) => item !== "ru")],
      });
      setSettings(result.settings || result);
      setCompleteness(result.completeness || completeness);
      setOverviewReady(true);
      overviewEverLoadedRef.current = true;
      setOverviewError("");
      if (Array.isArray(result.rejected) && result.rejected.includes(code)) {
        await appAlert({
          title: t("admin.languages.enableBlockedTitle"),
          message: t("admin.languages.enableBlocked"),
          tone: "warn",
        });
      }
    } catch (error) {
      await appAlert({
        title: t("admin.languages.saveFailed"),
        message: errorDisplayMessage(error, t, "admin.languages.saveFailed"),
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async (row) => {
    const targetLanguage = languageRef.current;
    const savedValue = readDraftValue(drafts, row.id, targetLanguage, "");
    if (
      !canSaveGenericTranslation({
        dirty: isTranslationDraftDirty(drafts, row.id, targetLanguage),
        value: savedValue,
      })
    ) {
      return;
    }
    setBusy(true);
    try {
      const productRef = row.kind === "product" ? parseProductTranslationRowId(row.id) : null;
      if (productRef) {
        await api.saveProductTranslation(
          productRef.productId,
          targetLanguage,
          productRef.field,
          savedValue,
          row.sourceHash || ""
        );
      } else {
        await api.saveLocalizationTranslation(row.id, targetLanguage, savedValue);
      }
      setDrafts((current) => clearDraftIfUnchanged(current, row.id, targetLanguage, savedValue));
      setActionMessage(t("admin.languages.saved"));
      await Promise.all([refreshWorkspaceFromStart(), refreshOverview()]);
    } catch (error) {
      if (error?.code === "SOURCE_STALE" || error?.status === 409) {
        setActionMessage(t("admin.productTranslations.sourceStale"));
        await Promise.all([refreshWorkspaceFromStart(), refreshOverview()]);
      } else {
        setActionMessage(errorDisplayMessage(error, t, "admin.languages.saveFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const resetRow = async (row) => {
    const targetLanguage = languageRef.current;
    const cell = row.languages?.[targetLanguage] || {};
    const allowed =
      row.kind === "product" ? canShowReturnToAuto(cell) : canShowGenericReset(cell);
    if (!allowed) return;
    const confirmed = await appConfirm({
      title: row.kind === "product" ? t("admin.productTranslations.returnToAuto") : t("admin.languages.resetAuto"),
      message: t("admin.languages.resetConfirm"),
    });
    if (!confirmed) return;
    const priorDraft = readDraftValue(drafts, row.id, targetLanguage, cell.value || "");
    setBusy(true);
    try {
      const productRef = row.kind === "product" ? parseProductTranslationRowId(row.id) : null;
      if (productRef) {
        await api.resetProductTranslation(
          productRef.productId,
          targetLanguage,
          productRef.field,
          row.sourceHash || ""
        );
      } else {
        await api.resetLocalizationTranslation(row.id, targetLanguage);
      }
      setActionMessage(t("admin.languages.resetDone"));
      setDrafts((current) => clearDraftIfUnchanged(current, row.id, targetLanguage, priorDraft));
      await Promise.all([refreshWorkspaceFromStart(), refreshOverview()]);
    } catch (error) {
      if (error?.code === "SOURCE_STALE" || error?.status === 409) {
        setActionMessage(t("admin.productTranslations.sourceStale"));
        await Promise.all([refreshWorkspaceFromStart(), refreshOverview()]);
      } else {
        setActionMessage(errorDisplayMessage(error, t, "admin.languages.saveFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const saveGlossary = async () => {
    const submitted = { ...glossaryForm, language: glossaryFormLanguage };
    setBusy(true);
    try {
      await api.saveGlossaryEntry(submitted);
      setGlossaryForm((current) => {
        if (
          current.id === submitted.id &&
          current.sourceRu === submitted.sourceRu &&
          current.targetValue === submitted.targetValue &&
          current.context === submitted.context &&
          Boolean(current.protected) === Boolean(submitted.protected) &&
          (current.language || glossaryFormLanguage) === submitted.language
        ) {
          return emptyGlossaryForm();
        }
        return current;
      });
      setActionMessage(t("admin.glossary.saved"));
      await refreshWorkspaceFromStart();
    } catch (error) {
      setActionMessage(errorDisplayMessage(error, t, "admin.glossary.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const deleteGlossary = async (entry) => {
    const confirmed = await appConfirm({
      title: t("admin.glossary.delete"),
      message: t("admin.glossary.confirmDelete"),
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.deleteGlossaryEntry(entry.id);
      setActionMessage(t("admin.glossary.deleted"));
      await refreshWorkspaceFromStart();
    } catch (error) {
      setActionMessage(errorDisplayMessage(error, t, "admin.glossary.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const localeCards = useMemo(() => {
    const list = locales.length
      ? locales
      : ["ru", ...TARGET_LOCALES].map((publicCode) => ({
          publicCode,
          alwaysEnabled: publicCode === "ru",
        }));
    return list;
  }, [locales]);

  const loadMoreDisabled =
    busy ||
    workspaceLoading ||
    inFlightRef.current ||
    !pageMeta.hasMore ||
    page0FailedRef.current;
  const showWorkspaceRows = !workspaceLoading || rows.length > 0;
  const bannerMessage = actionMessage || workspaceError || overviewError;

  return (
    <section className="manager-languages" aria-labelledby="manager-languages-title">
      <header className="manager-languages-header">
        <h2 id="manager-languages-title">{t("manager.nav.languages")}</h2>
        <p>{t("admin.languages.lead")}</p>
      </header>

      <div className="manager-languages-locale-grid">
        {localeCards.map((locale) => {
          const code = locale.publicCode;
          const locked = code === "ru" || locale.alwaysEnabled;
          const on = locked || enabled.has(code);
          const report = completeness[code] || {};
          const toggleDisabled = isForeignEnableToggleDisabled({
            code,
            locked,
            busy,
            overviewReady,
            currentlyEnabled: on,
          });
          return (
            <article
              className={
                locked ? "manager-languages-locale-card is-locked" : "manager-languages-locale-card"
              }
              key={code}
            >
              <div className="manager-languages-locale-copy">
                <h3>{languageLabels[code] || code}</h3>
                <p>
                  {locked
                    ? t("admin.languages.sourceLocked")
                    : report.complete
                      ? t("admin.languages.ready")
                      : t("admin.languages.notReady")}
                </p>
              </div>
              <button
                className={on ? "toggle active" : "toggle"}
                type="button"
                disabled={toggleDisabled}
                aria-label={languageLabels[code] || code}
                aria-disabled={locked || toggleDisabled ? "true" : undefined}
                onClick={() => toggleLanguage(code, !on)}
              >
                <span />
              </button>
            </article>
          );
        })}
      </div>

      <div className="manager-languages-workspace" aria-busy={workspaceLoading ? "true" : undefined}>
        <nav className="manager-languages-tabs" aria-label={t("admin.languages.views")}>
          {TRANSLATION_WORKSPACE_VIEWS.map(([id]) => (
            <button
              key={id}
              className={view === id ? "manager-languages-tab is-active" : "manager-languages-tab"}
              type="button"
              onClick={() => setView(id)}
            >
              {viewTitles[id] || id}
            </button>
          ))}
        </nav>

        <div className="manager-languages-toolbar">
          <label className="manager-languages-field manager-languages-field-search">
            {t("storefront.search.placeholder")}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("admin.languages.searchPlaceholder")}
            />
          </label>
          <label className="manager-languages-field manager-languages-field-language">
            {t("admin.languages.language")}
            <select
              value={safeLanguage}
              disabled={languageSelectDisabled}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {TARGET_LOCALES.map((code) => (
                <option key={code} value={code}>
                  {languageLabels[code]}
                </option>
              ))}
            </select>
          </label>
          <label className="manager-languages-check">
            <input
              type="checkbox"
              checked={untranslatedOnly}
              onChange={(event) => setUntranslatedOnly(event.target.checked)}
            />
            <span>{t("admin.languages.untranslatedOnly")}</span>
          </label>
        </div>

        {bannerMessage ? <p className="manager-languages-message">{bannerMessage}</p> : null}

        {view === "glossary" ? (
          <div className="manager-glossary">
            <div className="manager-glossary-form">
              <label className="field">
                {t("admin.glossary.source")}
                <input
                  value={glossaryForm.sourceRu}
                  disabled={busy}
                  onChange={(event) =>
                    setGlossaryForm((current) => ({ ...current, sourceRu: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                {t("admin.glossary.target")}
                <input
                  value={glossaryForm.targetValue}
                  disabled={busy}
                  onChange={(event) =>
                    setGlossaryForm((current) => ({ ...current, targetValue: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                {t("admin.glossary.context")}
                <select
                  value={glossaryForm.context}
                  disabled={busy}
                  onChange={(event) =>
                    setGlossaryForm((current) => ({ ...current, context: event.target.value }))
                  }
                >
                  {GLOSSARY_CONTEXT_OPTIONS.map((option) => (
                    <option key={option.id || "generic"} value={option.id}>
                      {glossaryContextLabel(t, option.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="manager-languages-check">
                <input
                  type="checkbox"
                  checked={glossaryForm.protected}
                  disabled={busy}
                  onChange={(event) =>
                    setGlossaryForm((current) => ({ ...current, protected: event.target.checked }))
                  }
                />
                <span>{t("admin.glossary.protected")}</span>
              </label>
              <button type="button" className="primary-button" disabled={busy} onClick={saveGlossary}>
                {glossaryForm.id ? t("admin.languages.save") : t("admin.glossary.add")}
              </button>
              {glossaryForm.id ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setGlossaryForm(emptyGlossaryForm())}
                >
                  {t("admin.glossary.cancel")}
                </button>
              ) : null}
            </div>
            {!showWorkspaceRows ? null : glossary.length === 0 ? (
              <p className="manager-languages-empty">{t("admin.glossary.empty")}</p>
            ) : (
              <div className="manager-languages-table-wrap">
                <table className="manager-languages-table">
                  <thead>
                    <tr>
                      <th>{t("admin.glossary.source")}</th>
                      <th>{t("admin.glossary.target")}</th>
                      <th>{t("admin.glossary.context")}</th>
                      <th>{t("admin.glossary.protected")}</th>
                      <th className="manager-languages-col-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {glossary.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.sourceRu}</td>
                        <td>{entry.targetValue}</td>
                        <td>{entry.context || "—"}</td>
                        <td>{entry.protected ? "✓" : "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            onClick={() =>
                              setGlossaryForm({
                                id: entry.id,
                                language: entry.publicLanguage || safeLanguage,
                                sourceRu: entry.sourceRu || "",
                                targetValue: entry.targetValue || "",
                                context: entry.context || "",
                                protected: Boolean(entry.protected),
                              })
                            }
                          >
                            {t("admin.glossary.edit")}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => deleteGlossary(entry)}
                          >
                            {t("admin.glossary.delete")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : !showWorkspaceRows ? null : rows.length === 0 ? (
          <p className="manager-languages-empty">{t("admin.languages.empty")}</p>
        ) : (
          <div className="manager-languages-table-wrap">
            <table className="manager-languages-table">
              <thead>
                <tr>
                  <th>{t("admin.languages.label.ru")}</th>
                  <th>{languageLabels[safeLanguage]}</th>
                  <th>{t("admin.languages.status")}</th>
                  <th>{t("admin.languages.editor")}</th>
                  <th>{t("admin.languages.updatedAt")}</th>
                  <th className="manager-languages-col-actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cell = row.languages?.[safeLanguage] || {};
                  const tone = statusTone(cell);
                  const stateKey =
                    cell.stale
                      ? "admin.languages.state.stale"
                      : cell.state === "AUTO"
                        ? "admin.languages.state.auto"
                        : cell.state === "MANUAL"
                          ? "admin.languages.state.manual"
                          : "admin.languages.state.missing";
                  const dirty = isTranslationDraftDirty(drafts, row.id, safeLanguage);
                  const draftValue = readDraftValue(drafts, row.id, safeLanguage, cell.value || "");
                  const saveEnabled = canSaveGenericTranslation({ dirty, value: draftValue });
                  const resetEnabled =
                    row.kind === "product" ? canShowReturnToAuto(cell) : canShowGenericReset(cell);
                  return (
                    <tr key={`${row.id || row.fieldKey}:${safeLanguage}`}>
                      <td data-label={t("admin.languages.label.ru")}>
                        <span className="manager-languages-source">{row.sourceRu || "—"}</span>
                      </td>
                      <td data-label={languageLabels[safeLanguage]}>
                        <textarea
                          className="manager-languages-target"
                          rows={3}
                          value={draftValue}
                          aria-label={languageLabels[safeLanguage]}
                          disabled={busy}
                          onChange={(event) =>
                            setDrafts((current) =>
                              setDraftValue(current, row.id, safeLanguage, event.target.value, true)
                            )
                          }
                        />
                      </td>
                      <td data-label={t("admin.languages.status")}>
                        <span className={`manager-languages-status is-${tone}`}>{t(stateKey)}</span>
                      </td>
                      <td data-label={t("admin.languages.editor")}>
                        <span className="manager-languages-editor">{cell.updatedBy || "—"}</span>
                      </td>
                      <td data-label={t("admin.languages.updatedAt")}>
                        <span className="manager-languages-updated">{formatStamp(cell.updatedAt)}</span>
                      </td>
                      <td data-label="">
                        <div className="manager-languages-actions">
                          <button
                            type="button"
                            className="primary-button"
                            disabled={busy || !saveEnabled}
                            onClick={() => saveRow(row)}
                          >
                            {t("admin.languages.save")}
                          </button>
                          {resetEnabled ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => resetRow(row)}
                            >
                              {t("admin.languages.resetAuto")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pageMeta.hasMore ? (
          <button
            type="button"
            className="secondary-button"
            disabled={loadMoreDisabled}
            onClick={handleLoadMore}
          >
            {t("admin.languages.loadMore")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
