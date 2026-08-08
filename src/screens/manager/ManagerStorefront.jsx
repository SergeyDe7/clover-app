import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert } from "../../shared/AppModal";

/**
 * Редактирование витрины clover-spb.ru — только admin.
 */
export function ManagerStorefront({
  settings,
  setSettings,
  oneCPriceTypes = [],
  products = [],
  setProducts,
}) {
  const [busy, setBusy] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [draft, setDraft] = useState({
    storefrontPriceTypeId: settings?.storefrontPriceTypeId || "",
    storefrontPriceTypeName: settings?.storefrontPriceTypeName || "",
    storefrontShowOnlyLinked: settings?.storefrontShowOnlyLinked !== false,
    storefrontHeroTitle: settings?.storefrontHeroTitle || "",
    storefrontHeroLead: settings?.storefrontHeroLead || "",
  });

  useEffect(() => {
    setDraft({
      storefrontPriceTypeId: settings?.storefrontPriceTypeId || "",
      storefrontPriceTypeName: settings?.storefrontPriceTypeName || "",
      storefrontShowOnlyLinked: settings?.storefrontShowOnlyLinked !== false,
      storefrontHeroTitle: settings?.storefrontHeroTitle || "",
      storefrontHeroLead: settings?.storefrontHeroLead || "",
    });
  }, [settings]);

  const types = Array.isArray(oneCPriceTypes) ? oneCPriceTypes : [];

  const activeProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : [])
        .filter((item) => item?.active !== false)
        .slice()
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "ru")
        ),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLocaleLowerCase("ru-RU");
    if (!q) return activeProducts;
    return activeProducts.filter((item) => {
      const hay = `${item.name || ""} ${item.code || ""} ${item.category || ""}`
        .toLocaleLowerCase("ru-RU")
        .replaceAll("ё", "е");
      return hay.includes(q.replaceAll("ё", "е"));
    });
  }, [activeProducts, productQuery]);

  const onStorefrontCount = useMemo(
    () => activeProducts.filter((item) => item.showOnStorefront === true).length,
    [activeProducts]
  );

  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const onPriceTypeChange = (event) => {
    const id = event.target.value;
    const found = types.find((item) => String(item.id) === String(id));
    setDraft((prev) => ({
      ...prev,
      storefrontPriceTypeId: id,
      storefrontPriceTypeName: found?.name || "",
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const result = await api.saveStorefrontSettings(draft);
      const next = result.settings || { ...settings, ...draft };
      setSettings(next);
      await appAlert({
        title: "Сохранено",
        message: "Настройки витрины обновлены.",
        tone: "success",
      });
    } catch (error) {
      await appAlert({
        title: "Не удалось сохранить",
        message: error.message || "Ошибка сохранения.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const persistProducts = async (nextProducts, message) => {
    setProductBusy(true);
    try {
      const result = await api.saveProducts(nextProducts);
      const saved = result.products || nextProducts;
      setProducts?.(saved);
      await appAlert({
        title: "Сохранено",
        message,
        tone: "success",
      });
    } catch (error) {
      await appAlert({
        title: "Не удалось сохранить товары",
        message: error.message || "Ошибка сохранения.",
        tone: "danger",
      });
    } finally {
      setProductBusy(false);
    }
  };

  const toggleProduct = (productId, checked) => {
    const next = (Array.isArray(products) ? products : []).map((item) =>
      String(item.id) === String(productId)
        ? { ...item, showOnStorefront: checked }
        : item
    );
    void persistProducts(
      next,
      checked
        ? "Товар добавлен на витрину сайта."
        : "Товар скрыт с витрины сайта."
    );
  };

  const setAllFiltered = (checked) => {
    const ids = new Set(filteredProducts.map((item) => String(item.id)));
    const next = (Array.isArray(products) ? products : []).map((item) =>
      ids.has(String(item.id)) ? { ...item, showOnStorefront: checked } : item
    );
    void persistProducts(
      next,
      checked
        ? `На витрину добавлено: ${ids.size}.`
        : `С витрины снято: ${ids.size}.`
    );
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Витрина сайта</h2>
          <p>
            Редактирование публичного сайта (clover-spb.ru / превью /vitrina).
            Доступно только администратору.
          </p>
        </div>
      </div>

      <div className="manager-contact-settings storefront-settings-card">
        <h3>Цены на сайте</h3>
        <p className="storefront-settings-hint">
          Один вид цен из 1С для витрины. В ЛК у клиентов — персональные цены.
        </p>
        <label className="storefront-price-field">
          <span>Вид цен витрины</span>
          <select
            value={draft.storefrontPriceTypeId || ""}
            onChange={onPriceTypeChange}
          >
            <option value="">Не выбран</option>
            {types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.code ? ` · ${item.code}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="storefront-check">
          <input
            type="checkbox"
            checked={Boolean(draft.storefrontShowOnlyLinked)}
            onChange={(event) =>
              setField("storefrontShowOnlyLinked", event.target.checked)
            }
          />
          <span>Только товары, связанные с 1С</span>
        </label>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 20 }}>
        <h3>Текст на главной</h3>
        <div className="form-grid">
          <label className="field field-wide">
            Заголовок
            <input
              value={draft.storefrontHeroTitle || ""}
              placeholder="Оптовые поставки для HoReCa и бизнеса"
              onChange={(event) =>
                setField("storefrontHeroTitle", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">
            Подзаголовок
            <textarea
              rows={3}
              value={draft.storefrontHeroLead || ""}
              placeholder="Каталог с артикулами из 1С…"
              onChange={(event) =>
                setField("storefrontHeroLead", event.target.value)
              }
            />
          </label>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Сохранение…" : "Сохранить витрину"}
        </button>
        <a
          className="secondary-button"
          href="/vitrina"
          target="_blank"
          rel="noreferrer"
        >
          Открыть превью
        </a>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 28 }}>
        <h3>Товары на витрине</h3>
        <p className="storefront-settings-hint">
          На сайте показываются только отмеченные активные товары. Сейчас на
          витрине: <strong>{onStorefrontCount}</strong> из {activeProducts.length}.
        </p>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label className="field field-wide">
            Поиск
            <input
              value={productQuery}
              placeholder="Название, код, категория"
              onChange={(event) => setProductQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="form-actions" style={{ marginBottom: 12 }}>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || filteredProducts.length === 0}
            onClick={() => setAllFiltered(true)}
          >
            Отметить найденные
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || filteredProducts.length === 0}
            onClick={() => setAllFiltered(false)}
          >
            Снять найденные
          </button>
        </div>
        <div className="storefront-product-pick-list">
          {filteredProducts.length === 0 ? (
            <p className="storefront-settings-hint">Нет товаров по фильтру.</p>
          ) : (
            filteredProducts.map((item) => (
              <label className="storefront-check storefront-product-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={item.showOnStorefront === true}
                  disabled={productBusy}
                  onChange={(event) =>
                    toggleProduct(item.id, event.target.checked)
                  }
                />
                <span>
                  <strong>{item.name}</strong>
                  <span className="storefront-product-meta">
                    {[item.code, item.category].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
