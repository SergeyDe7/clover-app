import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import { useEffect, useState } from "react";
import { api } from "../../serverApi";
import { appAlert } from "../../shared/AppModal";

function formatMarkupDraft(value) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function parseMarkupPercent(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.min(1000, Math.max(0, n));
}

/**
 * Выгрузка прайса витрины — отдельный спокойный экран без сводки заказов.
 */
export function ManagerPriceList({ settings }) {
  const { t } = useLocalization();
  const [busy, setBusy] = useState(false);
  const [markup, setMarkup] = useState(() =>
    formatMarkupDraft(settings?.storefrontMarkupPercent ?? 30)
  );

  useEffect(() => {
    setMarkup(formatMarkupDraft(settings?.storefrontMarkupPercent ?? 30));
  }, [settings?.storefrontMarkupPercent]);

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const { blob, fileName } = await api.downloadStorefrontPriceListPdf(
        parseMarkupPercent(markup)
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      appAlert({
        title: t("manager.error.priceExportFailed"),
        message: errorDisplayMessage(error, t, "manager.pdfGenerationError"),
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const markupNumber = parseMarkupPercent(markup);

  return (
    <section className="manager-price-list" aria-labelledby="manager-price-list-title">
      <header className="manager-price-list-hero">
        <p className="manager-price-list-kicker">{t("manager.storefrontCloverSpbRu")}</p>
        <h2 id="manager-price-list-title">{t("manager.priceList")}</h2>
        <p className="manager-price-list-lead">{
          t("manager.pdfWithAllStorefrontProductsAnd")
        }</p>
      </header>

      <div className="manager-price-list-body">
        <div className="manager-price-list-export">
          <label className="field manager-price-list-markup">{
            t("manager.markup")
            }<input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="30"
              value={markup}
              disabled={busy}
              onChange={(event) => {
                const raw = String(event.target.value).replace(",", ".");
                if (raw === "") {
                  setMarkup("");
                  return;
                }
                if (!/^\d{0,4}(\.\d{0,2})?$/.test(raw)) return;
                setMarkup(raw);
              }}
              onBlur={() => setMarkup(String(parseMarkupPercent(markup)))}
            />
          </label>
          <p className="manager-price-list-formula muted">
            {t("manager.priceList.filePriceFormula", { markup: markupNumber })}
          </p>
          <button
            className="primary-button manager-price-list-download"
            type="button"
            disabled={busy}
            onClick={() => void downloadPdf()}
          >
            {busy ? t("manager.generatingPdf") : t("manager.downloadPdf")}
          </button>
        </div>

        <ul className="manager-price-list-notes">
          <li>{t("manager.usesProductsCurrentlyOnTheStorefront")}</li>
          <li>{t("manager.theFileHasTheNamePhoto")}</li>
          <li>{t("manager.convenientToSendToAClient")}</li>
        </ul>
      </div>
    </section>
  );
}
