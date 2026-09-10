import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../serverApi";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import { PRODUCT_TRANSLATION_FIELDS } from "../../shared/i18n/productLocalization.js";
import {
  canShowReturnToAuto,
  productTranslationFieldPresentation,
  shouldStartProductTranslationFetch,
} from "../../shared/i18n/productTranslationUi.js";
import { canSaveProductTranslationField } from "../../shared/i18n/workspaceActionGates.js";
import {
  clearProductDrafts,
  clearProductFieldDraft,
  isProductFieldDraftDirty,
  readProductFieldDraft,
  writeProductFieldDraft,
} from "../../shared/i18n/productTranslationDrafts.js";
import { shouldApplyWorkspaceResponse } from "../../shared/i18n/translationDrafts.js";
import { shouldClearLoadingForRequest } from "../../shared/i18n/workspaceActionGates.js";

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
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("en");
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestGenerationRef = useRef(0);
  const inFlightRef = useRef(false);
  const productIdRef = useRef("");

  const productId = product?.id == null ? "" : String(product.id);
  productIdRef.current = productId;
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
    inFlightRef.current = false;
    setDrafts(clearProductDrafts());
    setWorkspace(null);
    setLoading(false);
    setMessage("");
    setExpanded(false);
    setExpandedField("");
  }, [productId]);

  const load = useCallback(async ({ force = false } = {}) => {
    if (!productId) return;
    if (
      !shouldStartProductTranslationFetch({
        hasWorkspace: Boolean(workspace),
        inFlight: inFlightRef.current,
        force,
      })
    ) {
      return;
    }
    const requestGeneration = ++requestGenerationRef.current;
    const requestedProductId = productId;
    inFlightRef.current = true;
    setLoading(true);
    setMessage("");
    try {
      const payload = await api.getProductTranslations(requestedProductId);
      if (
        !shouldApplyWorkspaceResponse({
          requestGeneration,
          currentGeneration: requestGenerationRef.current,
          requestLanguage: requestedProductId,
          currentLanguage: productIdRef.current,
          requestProductId: requestedProductId,
          currentProductId: productIdRef.current,
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
          currentLanguage: productIdRef.current,
          requestProductId: requestedProductId,
          currentProductId: productIdRef.current,
        })
      ) {
        return;
      }
      setWorkspace(null);
      setMessage(errorDisplayMessage(error, t, "admin.languages.loadFailed"));
    } finally {
      if (
        shouldClearLoadingForRequest({
          requestGeneration,
          currentGeneration: requestGenerationRef.current,
        }) &&
        requestedProductId === productIdRef.current
      ) {
        setLoading(false);
        inFlightRef.current = false;
      }
    }
  }, [productId, t, workspace]);

  const openSection = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    await load({ force: false });
  };

  if (!productId) return null;

  const saveField = async (field) => {
    const sourceHash = workspace?.fields?.[field]?.sourceHash || "";
    const cell = workspace?.fields?.[field]?.languages?.[language] || {};
    const value = readProductFieldDraft(drafts, language, field, cell.value || "");
    if (
      !canSaveProductTranslationField({
        dirty: isProductFieldDraftDirty(drafts, language, field),
        value,
      })
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.saveProductTranslation(productId, language, field, value, sourceHash);
      setDrafts((current) => clearProductFieldDraft(current, language, field));
      setMessage(t("admin.languages.saved"));
      inFlightRef.current = false;
      setWorkspace(null);
      await load({ force: true });
    } catch (error) {
      if (error?.code === "SOURCE_STALE" || error?.status === 409) {
        setMessage(t("admin.productTranslations.sourceStale"));
        inFlightRef.current = false;
        setWorkspace(null);
        await load({ force: true });
      } else {
        setMessage(errorDisplayMessage(error, t, "admin.languages.saveFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const resetField = async (field) => {
    const cell = workspace?.fields?.[field]?.languages?.[language] || {};
    if (!canShowReturnToAuto(cell)) return;
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
      inFlightRef.current = false;
      setWorkspace(null);
      await load({ force: true });
    } catch (error) {
      if (error?.code === "SOURCE_STALE" || error?.status === 409) {
        setMessage(t("admin.productTranslations.sourceStale"));
        inFlightRef.current = false;
        setWorkspace(null);
        await load({ force: true });
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
        <div className="product-translation-panel" aria-busy={loading ? "true" : undefined}>
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
          {loading ? (
            <div className="product-translation-loading" aria-hidden="true">
              <span className="product-translation-skeleton" />
              <span className="product-translation-skeleton" />
              <span className="product-translation-skeleton" />
              <span className="product-translation-skeleton" />
            </div>
          ) : !workspace ? null : (
            PRODUCT_TRANSLATION_FIELDS.map((field) => {
              const source = workspace?.fields?.[field]?.sourceRu || "";
              const presentation = productTranslationFieldPresentation({
                loading: false,
                workspaceLoaded: Boolean(workspace),
                sourceRu: source,
              });
              const cell = workspace?.fields?.[field]?.languages?.[language] || {};
              const emptySource = presentation.kind === "notApplicable";
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
              const showReturnToAuto = canShowReturnToAuto(cell);
              const draftValue = readProductFieldDraft(drafts, language, field, cell.value || "");
              const saveEnabled = canSaveProductTranslationField({
                dirty: isProductFieldDraftDirty(drafts, language, field),
                value: draftValue,
              });
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
                          value={draftValue}
                          aria-label={fieldLabel}
                          onChange={(event) =>
                            setDrafts((current) =>
                              writeProductFieldDraft(current, language, field, event.target.value, true)
                            )
                          }
                        />
                        <div className="manager-languages-actions">
                          {cell.stale ? (
                            <span className="muted small">{t("admin.productTranslations.staleWarning")}</span>
                          ) : null}
                          <button
                            type="button"
                            className="primary-button"
                            disabled={busy || !saveEnabled}
                            onClick={() => saveField(field)}
                          >
                            {t("admin.languages.save")}
                          </button>
                          {showReturnToAuto ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busy}
                              onClick={() => resetField(field)}
                            >
                              {t("admin.productTranslations.returnToAuto")}
                            </button>
                          ) : null}
                        </div>
                      </>
                    )
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}
