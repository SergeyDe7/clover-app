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
  clearTranslationDraft,
  markDraftClean,
  mergeWorkspaceDrafts,
  readDraftValue,
  setDraftValue,
  shouldApplyWorkspaceResponse,
} from "../../shared/i18n/translationDrafts.js";

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh", "ar"];

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
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});
  const [glossary, setGlossary] = useState([]);
  const [glossaryForm, setGlossaryForm] = useState({
    id: "",
    sourceRu: "",
    targetValue: "",
    context: "",
    protected: false,
  });
  const requestGenerationRef = useRef(0);
  const languageRef = useRef("en");

  const safeLanguage = TARGET_LOCALES.includes(language) ? language : "en";
  languageRef.current = safeLanguage;

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

  const load = useCallback(async () => {
    const requestGeneration = ++requestGenerationRef.current;
    const requestLanguage = safeLanguage;
    try {
      const payload = await api.getLocalizationSettings();
      const workspace = await api.getLocalizationTranslations({
        view,
        query,
        language: requestLanguage,
        untranslatedOnly,
      });
      if (
        !shouldApplyWorkspaceResponse({
          requestGeneration,
          currentGeneration: requestGenerationRef.current,
          requestLanguage,
          currentLanguage: languageRef.current,
        })
      ) {
        return;
      }
      setSettings(payload.settings || null);
      setCompleteness(payload.completeness || {});
      setLocales(Array.isArray(payload.locales) ? payload.locales : []);
      const nextRows = Array.isArray(workspace.rows) ? workspace.rows : [];
      setRows(nextRows);
      setDrafts((current) => mergeWorkspaceDrafts(current, nextRows, requestLanguage));
      if (view === "glossary") {
        const glossaryPayload = await api.getGlossaryEntries({
          query,
          language: requestLanguage,
        });
        setGlossary(Array.isArray(glossaryPayload.entries) ? glossaryPayload.entries : []);
      } else {
        setGlossary([]);
      }
      setMessage("");
    } catch (error) {
      if (
        !shouldApplyWorkspaceResponse({
          requestGeneration,
          currentGeneration: requestGenerationRef.current,
          requestLanguage,
          currentLanguage: languageRef.current,
        })
      ) {
        return;
      }
      setSettings({ enabledLanguages: ["ru"], catalogVersion: 0 });
      setCompleteness({});
      setRows([]);
      setMessage(errorDisplayMessage(error, t, "admin.languages.loadFailed"));
    }
  }, [view, query, untranslatedOnly, safeLanguage, t]);

  useEffect(() => {
    load();
  }, [load]);

  const enabled = new Set(settings?.enabledLanguages || ["ru"]);

  const toggleLanguage = async (code, nextEnabled) => {
    if (code === "ru") return;
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
      setDrafts((current) => markDraftClean(current, row.id, targetLanguage, savedValue));
      setMessage(t("admin.languages.saved"));
      await load();
    } catch (error) {
      if (error?.code === "SOURCE_STALE" || error?.status === 409) {
        setMessage(t("admin.productTranslations.sourceStale"));
        await load();
      } else {
        setMessage(errorDisplayMessage(error, t, "admin.languages.saveFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const resetRow = async (row) => {
    const targetLanguage = languageRef.current;
    const confirmed = await appConfirm({
      title: row.kind === "product" ? t("admin.productTranslations.returnToAuto") : t("admin.languages.resetAuto"),
      message: t("admin.languages.resetConfirm"),
    });
    if (!confirmed) return;
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
      setMessage(t("admin.languages.resetDone"));
      setDrafts((current) => clearTranslationDraft(current, row.id, targetLanguage));
      await load();
    } catch (error) {
      if (error?.code === "SOURCE_STALE" || error?.status === 409) {
        setMessage(t("admin.productTranslations.sourceStale"));
        await load();
      } else {
        setMessage(errorDisplayMessage(error, t, "admin.languages.saveFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const saveGlossary = async () => {
    setBusy(true);
    try {
      await api.saveGlossaryEntry({
        ...glossaryForm,
        language: safeLanguage,
      });
      setGlossaryForm({ id: "", sourceRu: "", targetValue: "", context: "", protected: false });
      setMessage(t("admin.glossary.saved"));
      await load();
    } catch (error) {
      setMessage(errorDisplayMessage(error, t, "admin.glossary.saveFailed"));
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
      setMessage(t("admin.glossary.deleted"));
      await load();
    } catch (error) {
      setMessage(errorDisplayMessage(error, t, "admin.glossary.saveFailed"));
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
                disabled={busy || locked}
                aria-label={languageLabels[code] || code}
                aria-disabled={locked ? "true" : undefined}
                onClick={() => toggleLanguage(code, !on)}
              >
                <span />
              </button>
            </article>
          );
        })}
      </div>

      <div className="manager-languages-workspace">
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
              onBlur={load}
              placeholder={t("admin.languages.searchPlaceholder")}
            />
          </label>
          <label className="manager-languages-field manager-languages-field-language">
            {t("admin.languages.language")}
            <select value={safeLanguage} onChange={(event) => setLanguage(event.target.value)}>
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

        {message ? <p className="manager-languages-message">{message}</p> : null}

        {view === "glossary" ? (
          <div className="manager-glossary">
            <div className="manager-glossary-form">
              <label className="field">
                {t("admin.glossary.source")}
                <input
                  value={glossaryForm.sourceRu}
                  onChange={(event) =>
                    setGlossaryForm((current) => ({ ...current, sourceRu: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                {t("admin.glossary.target")}
                <input
                  value={glossaryForm.targetValue}
                  onChange={(event) =>
                    setGlossaryForm((current) => ({ ...current, targetValue: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                {t("admin.glossary.context")}
                <input
                  value={glossaryForm.context}
                  onChange={(event) =>
                    setGlossaryForm((current) => ({ ...current, context: event.target.value }))
                  }
                />
              </label>
              <label className="manager-languages-check">
                <input
                  type="checkbox"
                  checked={glossaryForm.protected}
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
                  onClick={() =>
                    setGlossaryForm({ id: "", sourceRu: "", targetValue: "", context: "", protected: false })
                  }
                >
                  {t("admin.glossary.cancel")}
                </button>
              ) : null}
            </div>
            {glossary.length === 0 ? (
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
        ) : rows.length === 0 ? (
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
                  return (
                    <tr key={`${row.id || row.fieldKey}:${safeLanguage}`}>
                      <td data-label={t("admin.languages.label.ru")}>
                        <span className="manager-languages-source">{row.sourceRu || "—"}</span>
                      </td>
                      <td data-label={languageLabels[safeLanguage]}>
                        <textarea
                          className="manager-languages-target"
                          rows={3}
                          value={readDraftValue(drafts, row.id, safeLanguage, cell.value || "")}
                          aria-label={languageLabels[safeLanguage]}
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
                          <button type="button" className="primary-button" disabled={busy} onClick={() => saveRow(row)}>
                            {t("admin.languages.save")}
                          </button>
                          <button type="button" className="secondary-button" disabled={busy} onClick={() => resetRow(row)}>
                            {t("admin.languages.resetAuto")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
