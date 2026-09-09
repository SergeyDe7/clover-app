import { useCallback, useEffect, useState } from "react";
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

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh", "ar"];

function statusTone(cell) {
  if (cell?.stale) return "stale";
  if (cell?.state === "AUTO") return "auto";
  if (cell?.state === "MANUAL") return "manual";
  return "missing";
}

export function ProductTranslationEditor({ product }) {
  const { t } = useLocalization();
  const [workspace, setWorkspace] = useState(null);
  const [language, setLanguage] = useState("en");
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    setDrafts(clearProductDrafts());
    setWorkspace(null);
    setMessage("");
  }, [productId]);

  const load = useCallback(async () => {
    if (!productId) return;
    try {
      const payload = await api.getProductTranslations(productId);
      setWorkspace(payload.workspace || null);
    } catch (error) {
      setWorkspace(null);
      setMessage(errorDisplayMessage(error, t, "admin.languages.loadFailed"));
    }
  }, [productId, t]);

  useEffect(() => {
    load();
  }, [load]);

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
      <h3 id="product-translations-title">{t("admin.productTranslations.title")}</h3>
      <p className="muted small">{t("admin.productTranslations.lead")}</p>
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
            <strong>{fieldLabel}</strong>
            <p className="manager-languages-source">{source || "—"}</p>
            {emptySource ? (
              <p className="muted small">{t("admin.productTranslations.notApplicable")}</p>
            ) : (
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
            )}
            <div className="manager-languages-actions">
              <span className={`manager-languages-status is-${tone}`}>{t(stateKey)}</span>
              {cell.stale && !emptySource ? (
                <span className="muted small">{t("admin.productTranslations.staleWarning")}</span>
              ) : null}
              {emptySource ? null : (
                <>
                  <button type="button" className="primary-button" disabled={busy} onClick={() => saveField(field)}>
                    {t("admin.languages.save")}
                  </button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => resetField(field)}>
                    {t("admin.productTranslations.returnToAuto")}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
