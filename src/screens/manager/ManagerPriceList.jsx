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
        title: "Не удалось выгрузить прайс",
        message: error.message || "Ошибка формирования PDF.",
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
        <p className="manager-price-list-kicker">Витрина clover-spb.ru</p>
        <h2 id="manager-price-list-title">Прайс-лист</h2>
        <p className="manager-price-list-lead">
          PDF со всеми товарами витрины и фото. Накрутка применяется только в
          файле — настройки сайта не меняются.
        </p>
      </header>

      <div className="manager-price-list-body">
        <div className="manager-price-list-export">
          <label className="field manager-price-list-markup">
            Накрутка, %
            <input
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
            Цена в файле = закупка × (1 + {markupNumber} / 100)
          </p>
          <button
            className="primary-button manager-price-list-download"
            type="button"
            disabled={busy}
            onClick={() => void downloadPdf()}
          >
            {busy ? "Формируем PDF…" : "Скачать PDF"}
          </button>
        </div>

        <ul className="manager-price-list-notes">
          <li>Берутся товары, которые сейчас на витрине</li>
          <li>В файле — название, фото и цена с вашей накруткой</li>
          <li>Удобно отправить клиенту или распечатать</li>
        </ul>
      </div>
    </section>
  );
}
