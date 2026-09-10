import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../serverApi";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import { PRODUCT_TRANSLATION_FIELDS } from "../../shared/i18n/productLocalization.js";
import {
  clearProductDrafts,
  clearProductFieldDraft,
  readProductFieldDraft,
  writeProductFieldDraft,
} from "../../shared/i18n/productTranslationDrafts.js";
import { shouldApplyWorkspaceResponse } from "../../shared/i18n/translationDrafts.js";

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh", "ar"];

function statusTone(cell) {
  if (cell?.stale) return "stale";
  if (cell?.state === "AUTO") return "auto";
  if (cell?.state === "MANUAL") return "manual";
  return "missing";
}

export function ProductTranslationEditor({ product }) {
  const { t } = useLocalization();
  const [expanded, setExpanded] = useState(false);
  const [expandedField, setExpandedField] = useState("");
  const [workspace, setWorkspace] = useState(null);
  const [language, setLanguage] = useState("en");
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestGenerationRef = useRef(0);

  const productId = product?.id == null ? "" : String(product.id);
  const languageLabels = {
    en: t("admin.languages.label.en"),
    uz: t("admin.languages.label.uz"),
    ky: t("admin.languages.label.ky"),
    tg: t("admin.languages.label.tg"),
    zh: t("admin.languages.label.zh"),
    ar: t("admin.languages.label.ar"),
  };

  useEffect(() => {
    requestGenerationRef.current += 1;
    setDrafts(clearProductDrafts());
    setWorkspace(null);
    setMessage("");
    setExpanded(false);
    setExpandedField("");
  }, [productId]);

  const load = useCallback(async () => {
    if (!productId) return;
    const requestGeneration = ++requestGenerationRef.current;
    const requestedProductId = productId;
    try {
      const payload = await api.getProductTranslations(requestedProductId);
      if (
        !shouldApplyWorkspaceResponse({
          requestGeneration,
          currentGeneration: requestGenerationRef.current,
          requestLanguage: requestedProductId,
          currentLanguage: productId,
          requestProductId: requestedProductId,
          currentProductId: productId,
        })
      ) {
        return;
      }
      setWorkspace(payload.workspace || null);
    } catch (error) {
      if (
        !shouldApplyWorkspaceResponse({
          requestGeneration,
          currentGeneration: requestGenerationRef.current,
          requestLanguage: requestedProductId,
          currentLanguage: productId,
          requestProductId: requestedProductId,
          currentProductId: productId,
        })
      ) {
        return;
      }
      setWorkspace(null);
      setMessage(errorDisplayMessage(error, t, "admin.languages.loadFailed"));
    }
  }, [productId, t]);

  const openSection = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!workspace) {
      await load();
    }
  };

  if (!productId) return null;

  const saveField = async (field) => {
    const sourceHash = workspace?.fields?.[field]?.sourceHash || "";
    const cell = workspace?.fields?.[field]?.languages?.[language] || {};
    const value = readProductFieldDraft(drafts, language, field, cell.value || "");
    setBusy(true);
    try {
      await api.saveProductTranslation(productId, language, field, value, sourceHash);
      setDrafts((current) => clearProductFieldDraft(current, language, field));
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

  const resetField = async (field) => {
    const confirmed = await appConfirm({
      title: t("admin.productTranslations.returnToAuto"),
      message: t("admin.languages.resetConfirm"),
    });
    if (!confirmed) return;
    const sourceHash = workspace?.fields?.[field]?.sourceHash || "";
    setBusy(true);
    try {
      await api.resetProductTranslation(productId, language, field, sourceHash);
      setDrafts((current) => clearProductFieldDraft(current, language, field));
      setMessage(t("admin.languages.resetDone"));
      await load();
    } catch (error) {
      if (error?.code === "SOURCE_STALE" || error?.status === 409) {
        setMessage(t("admin.productTranslations.sourceStale"));
        await load();
      } else {
        await appAlert({
          title: t("admin.languages.saveFailed"),
          message: errorDisplayMessage(error, t, "admin.languages.saveFailed"),
          tone: "danger",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="product-translation-editor" aria-labelledby="product-translations-title">
      <button
        type="button"
        className="product-translation-toggle"
        id="product-translations-title"
        aria-expanded={expanded}
        onClick={openSection}
      >
        {t("admin.productTranslations.title")}
      </button>
      {expanded ? (
        <div className="product-translation-panel">
          <label className="field">
            {t("admin.languages.language")}
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {TARGET_LOCALES.map((code) => (
                <option key={code} value={code}>
                  {languageLabels[code]}
                </option>
              ))}
            </select>
          </label>
          {message ? <p className="manager-languages-message">{message}</p> : null}
          {PRODUCT_TRANSLATION_FIELDS.map((field) => {
            const source = workspace?.fields?.[field]?.sourceRu || "";
            const cell = workspace?.fields?.[field]?.languages?.[language] || {};
            const emptySource = !String(source).trim();
            const tone = emptySource ? "missing" : statusTone(cell);
            const fieldOpen = expandedField === field;
            const fieldLabel =
              field === "name"
                ? t("admin.productTranslations.field.name")
                : field === "description"
                  ? t("admin.productTranslations.field.description")
                  : field === "composition"
                    ? t("admin.productTranslations.field.composition")
                    : t("admin.productTranslations.field.characteristics");
            const stateKey = emptySource
              ? "admin.productTranslations.notApplicable"
              : cell.stale
                ? "admin.languages.state.stale"
                : cell.state === "AUTO"
                  ? "admin.languages.state.auto"
                  : cell.state === "MANUAL"
                    ? "admin.languages.state.manual"
                    : "admin.languages.state.missing";
            return (
              <div className="product-translation-field" key={field}>
                <button
                  type="button"
                  className="product-translation-field-toggle"
                  aria-expanded={fieldOpen}
                  onClick={() => setExpandedField(fieldOpen ? "" : field)}
                >
                  <strong>{fieldLabel}</strong>
                  <span className={`manager-languages-status is-${tone}`}>{t(stateKey)}</span>
                </button>
                {fieldOpen ? (
                  emptySource ? (
                    <p className="muted small">{t("admin.productTranslations.notApplicable")}</p>
                  ) : (
                    <>
                      <p className="manager-languages-source">{source}</p>
                      <textarea
                        className="manager-languages-target"
                        rows={3}
                        value={readProductFieldDraft(drafts, language, field, cell.value || "")}
                        aria-label={fieldLabel}
                        onChange={(event) =>
                          setDrafts((current) =>
                            writeProductFieldDraft(current, language, field, event.target.value)
                          )
                        }
                      />
                      <div className="manager-languages-actions">
                        {cell.stale ? (
                          <span className="muted small">{t("admin.productTranslations.staleWarning")}</span>
                        ) : null}
                        <button type="button" className="primary-button" disabled={busy} onClick={() => saveField(field)}>
                          {t("admin.languages.save")}
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => resetField(field)}
                        >
                          {t("admin.productTranslations.returnToAuto")}
                        </button>
                      </div>
                    </>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
