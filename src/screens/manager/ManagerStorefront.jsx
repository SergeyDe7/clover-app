import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../serverApi";
import { appAlert } from "../../shared/AppModal";
import { visibilityFilterLabel } from "../../shared/i18n/displayLabels";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
import { normalizeProduct, productArticle, UNIT_ORDER, unitPriceField, selectDefaultNumber, matchesCatalogPrefixSearch, productCatalogSearchHaystack, formatRussianPhone, getRussianPhoneLocalDigits } from "../../shared/appHelpers";
import { unitDisplayLabel } from "../../shared/i18n/unitDisplay.js";
import { StorefrontProductAdd } from "./StorefrontProductAdd";
import {
  ManagerStorefrontPromotions,
  clonePromotions,
  promotionsKey,
} from "./ManagerStorefrontPromotions";
import { ManagerStorefrontInfoPages } from "./ManagerStorefrontInfoPages";
import {
  cloneStorefrontInfoPages,
  storefrontInfoPagesKey,
} from "../../shared/storefrontInfoPages.js";
import { STOREFRONT_HERO_LEAD, STOREFRONT_HERO_TITLE, STOREFRONT_DEFAULT_HERO_SLIDES, STOREFRONT_DEFAULT_HERO_INTERVAL_SEC, STOREFRONT_MAX_HERO_SLIDES } from "../storefront/siteCopy.js";
import { normalizeYandexMapsUrl } from "../../shared/yandexMaps.js";

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

function cloneHeroSlides(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((slide) => ({
      src: String(slide?.src || ""),
      alt: String(slide?.alt || ""),
      href: String(slide?.href || ""),
      buttonLabel: String(slide?.buttonLabel || ""),
    }))
    .filter((slide) => slide.src);
}

function slidesKey(value) {
  return JSON.stringify(cloneHeroSlides(value));
}

function heroSlidesDraft(value) {
  const list = cloneHeroSlides(value);
  return list.length
    ? list
    : STOREFRONT_DEFAULT_HERO_SLIDES.map((slide) => ({ ...slide }));
}

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
  const { t } = useLocalization();
  const [busy, setBusy] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [productNotice, setProductNotice] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [storefrontFilter, setStorefrontFilter] = useState("Все");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [editDraft, setEditDraft] = useState({
    description: "",
    composition: "",
    characteristics: "",
    pricingSource: "inherit",
    prices: {},
  });
  const [draft, setDraft] = useState({
    storefrontPricingMode:
      settings?.storefrontPricingMode === "purchase_markup"
        ? "purchase_markup"
        : "price_type",
    storefrontMarkupPercent: formatMarkupDraft(settings?.storefrontMarkupPercent),
    storefrontPriceTypeId: settings?.storefrontPriceTypeId || "",
    storefrontPriceTypeName: settings?.storefrontPriceTypeName || "",
    storefrontShowOnlyLinked: settings?.storefrontShowOnlyLinked !== false,
    storefrontHeroTitle: settings?.storefrontHeroTitle || "",
    storefrontHeroLead: settings?.storefrontHeroLead || "",
    storefrontHeroSlides: heroSlidesDraft(settings?.storefrontHeroSlides),
    storefrontHeroIntervalSec:
      settings?.storefrontHeroIntervalSec || STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
    storefrontPromotions: clonePromotions(settings?.storefrontPromotions),
    storefrontContactPhone: formatRussianPhone(settings?.storefrontContactPhone || ""),
    storefrontContactEmail: settings?.storefrontContactEmail || "",
    storefrontContactAddress: settings?.storefrontContactAddress || "",
    storefrontContactHours: settings?.storefrontContactHours || "",
    storefrontContactNote: settings?.storefrontContactNote || "",
    storefrontContactMapsUrl: settings?.storefrontContactMapsUrl || "",
    storefrontContactMapImageUrl: settings?.storefrontContactMapImageUrl || "",
    storefrontInfoPages: cloneStorefrontInfoPages(settings?.storefrontInfoPages),
    storefrontOneCClientId: settings?.storefrontOneCClientId || "",
    storefrontOneCClientName:
      settings?.storefrontOneCClientName || "Интернет магазин Clover",
  });

  useEffect(() => {
    setDraft((prev) => {
      const next = {
        storefrontPricingMode:
          settings?.storefrontPricingMode === "purchase_markup"
            ? "purchase_markup"
            : "price_type",
        storefrontMarkupPercent: formatMarkupDraft(
          settings?.storefrontMarkupPercent
        ),
        storefrontPriceTypeId: settings?.storefrontPriceTypeId || "",
        storefrontPriceTypeName: settings?.storefrontPriceTypeName || "",
        storefrontShowOnlyLinked: settings?.storefrontShowOnlyLinked !== false,
        storefrontHeroTitle: settings?.storefrontHeroTitle || "",
        storefrontHeroLead: settings?.storefrontHeroLead || "",
        storefrontHeroSlides: heroSlidesDraft(settings?.storefrontHeroSlides),
        storefrontHeroIntervalSec:
          settings?.storefrontHeroIntervalSec ||
          STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
        storefrontPromotions: clonePromotions(settings?.storefrontPromotions),
        storefrontContactPhone: formatRussianPhone(settings?.storefrontContactPhone || ""),
        storefrontContactEmail: settings?.storefrontContactEmail || "",
        storefrontContactAddress: settings?.storefrontContactAddress || "",
        storefrontContactHours: settings?.storefrontContactHours || "",
        storefrontContactNote: settings?.storefrontContactNote || "",
        storefrontContactMapsUrl: settings?.storefrontContactMapsUrl || "",
        storefrontContactMapImageUrl: settings?.storefrontContactMapImageUrl || "",
        storefrontInfoPages: cloneStorefrontInfoPages(settings?.storefrontInfoPages),
        storefrontOneCClientId: settings?.storefrontOneCClientId || "",
        storefrontOneCClientName:
          settings?.storefrontOneCClientName || "Интернет магазин Clover",
      };
      const same =
        prev.storefrontPricingMode === next.storefrontPricingMode &&
        prev.storefrontMarkupPercent === next.storefrontMarkupPercent &&
        prev.storefrontPriceTypeId === next.storefrontPriceTypeId &&
        prev.storefrontPriceTypeName === next.storefrontPriceTypeName &&
        prev.storefrontShowOnlyLinked === next.storefrontShowOnlyLinked &&
        prev.storefrontHeroTitle === next.storefrontHeroTitle &&
        prev.storefrontHeroLead === next.storefrontHeroLead &&
        slidesKey(prev.storefrontHeroSlides) === slidesKey(next.storefrontHeroSlides) &&
        Number(prev.storefrontHeroIntervalSec) === Number(next.storefrontHeroIntervalSec) &&
        promotionsKey(prev.storefrontPromotions) ===
          promotionsKey(next.storefrontPromotions) &&
        prev.storefrontContactPhone === next.storefrontContactPhone &&
        prev.storefrontContactEmail === next.storefrontContactEmail &&
        prev.storefrontContactAddress === next.storefrontContactAddress &&
        prev.storefrontContactHours === next.storefrontContactHours &&
        prev.storefrontContactNote === next.storefrontContactNote &&
        prev.storefrontContactMapsUrl === next.storefrontContactMapsUrl &&
        prev.storefrontContactMapImageUrl === next.storefrontContactMapImageUrl &&
        storefrontInfoPagesKey(prev.storefrontInfoPages) ===
          storefrontInfoPagesKey(next.storefrontInfoPages) &&
        prev.storefrontOneCClientId === next.storefrontOneCClientId &&
        prev.storefrontOneCClientName === next.storefrontOneCClientName;
      return same ? prev : next;
    });
  }, [
    settings?.storefrontPricingMode,
    settings?.storefrontMarkupPercent,
    settings?.storefrontPriceTypeId,
    settings?.storefrontPriceTypeName,
    settings?.storefrontShowOnlyLinked,
    settings?.storefrontHeroTitle,
    settings?.storefrontHeroLead,
    settings?.storefrontHeroSlides,
    settings?.storefrontHeroIntervalSec,
    settings?.storefrontPromotions,
    settings?.storefrontContactPhone,
    settings?.storefrontContactEmail,
    settings?.storefrontContactAddress,
    settings?.storefrontContactHours,
    settings?.storefrontContactNote,
    settings?.storefrontContactMapsUrl,
    settings?.storefrontContactMapImageUrl,
    settings?.storefrontInfoPages,
    settings?.storefrontOneCClientId,
    settings?.storefrontOneCClientName,
  ]);

  const types = Array.isArray(oneCPriceTypes) ? oneCPriceTypes : [];

  const activeProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : [])
        .filter((item) => item?.active !== false)
        .slice()
        .sort((a, b) => {
          const aOn = a.showOnStorefront === true ? 0 : 1;
          const bOn = b.showOnStorefront === true ? 0 : 1;
          if (aOn !== bOn) return aOn - bOn;
          return String(a.name || "").localeCompare(String(b.name || ""), "ru");
        }),
    [products]
  );

  const filteredProducts = useMemo(() => {
    return activeProducts.filter((item) => {
      const onStorefront = item.showOnStorefront === true;
      if (storefrontFilter === "На витрине" && !onStorefront) return false;
      if (storefrontFilter === "Не на витрине" && onStorefront) return false;
      return matchesCatalogPrefixSearch(
        productCatalogSearchHaystack(item, { includeAdminFields: true }),
        productQuery
      );
    });
  }, [activeProducts, productQuery, storefrontFilter]);

  const onStorefrontCount = useMemo(
    () => activeProducts.filter((item) => item.showOnStorefront === true).length,
    [activeProducts]
  );

  const selectedCount = selectedIds.size;

  const setField = (key, value) => {
    setSettingsSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateHeroSlides = (updater) => {
    setSettingsSaved(false);
    setDraft((prev) => ({
      ...prev,
      storefrontHeroSlides: updater(cloneHeroSlides(prev.storefrontHeroSlides)),
    }));
  };

  const moveHeroSlide = (index, direction) => {
    updateHeroSlides((list) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= list.length) return list;
      const next = list.slice();
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const onPriceTypeChange = (event) => {
    const id = event.target.value;
    const found = types.find((item) => String(item.id) === String(id));
    setSettingsSaved(false);
    setDraft((prev) => ({
      ...prev,
      storefrontPriceTypeId: id,
      storefrontPriceTypeName: found?.name || "",
    }));
  };

  const save = async () => {
    setBusy(true);
    setSettingsSaved(false);
    try {
      const draftPromos = clonePromotions(draft.storefrontPromotions);
      if (draftPromos.some((item) => !String(item.title || "").trim())) {
        await appAlert({
          title: t("manager.fillInThePromotions"),
          message: t("manager.everyPromotionNeedsATitleEmpty"),
          tone: "danger",
        });
        return;
      }
      const payload = {
        ...draft,
        storefrontMarkupPercent: parseMarkupPercent(draft.storefrontMarkupPercent),
        storefrontContactPhone: getRussianPhoneLocalDigits(draft.storefrontContactPhone)
          ? draft.storefrontContactPhone
          : "",
        storefrontContactEmail: String(draft.storefrontContactEmail || "").trim(),
        storefrontContactAddress: String(draft.storefrontContactAddress || "").trim(),
        storefrontContactHours: String(draft.storefrontContactHours || "").trim(),
        storefrontContactNote: String(draft.storefrontContactNote || "").trim(),
        storefrontContactMapsUrl: String(draft.storefrontContactMapsUrl || "").trim(),
        storefrontContactMapImageUrl: String(draft.storefrontContactMapImageUrl || "").trim(),
        storefrontHeroSlides: cloneHeroSlides(draft.storefrontHeroSlides),
        storefrontHeroIntervalSec: Number(draft.storefrontHeroIntervalSec) || STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
        storefrontPromotions: draftPromos,
        storefrontInfoPages: cloneStorefrontInfoPages(draft.storefrontInfoPages),
      };
      const result = await api.saveStorefrontSettings(payload);
      const next = result.settings || { ...settings, ...payload };
      setSettings(next);
      setSettingsSaved(true);
      const mapsInput = String(draft.storefrontContactMapsUrl || "").trim();
      if (mapsInput && !normalizeYandexMapsUrl(mapsInput)) {
        await appAlert({
          title: t("manager.mapLinkWasNotSaved"),
          message:
            t("manager.aYandexMapsLinkIsRequired"),
          tone: "danger",
        });
      }
    } catch (error) {
      await appAlert({
        title: t("shared.error.saveFailed"),
        message: errorDisplayMessage(error, t, "manager.saveError"),
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
      if (message) {
        setProductNotice(message);
        window.setTimeout(() => setProductNotice(""), 4500);
      }
      return saved;
    } catch (error) {
      await appAlert({
        title: t("manager.error.storefrontProductsSaveFailed"),
        message: errorDisplayMessage(error, t, "manager.saveError"),
        tone: "danger",
      });
      return null;
    } finally {
      setProductBusy(false);
    }
  };

  const toggleSelected = (productId, checked) => {
    const key = String(productId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredProducts.map((item) => String(item.id))));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const applySelectionToStorefront = async (checked) => {
    if (!selectedIds.size) return;
    const ids = selectedIds;
    let touched = 0;
    const next = (Array.isArray(products) ? products : []).map((item) => {
      if (!ids.has(String(item.id))) return item;
      const on = item.showOnStorefront === true;
      if (checked && on) return item;
      if (!checked && !on) return item;
      touched += 1;
      return { ...item, showOnStorefront: checked };
    });
    if (!touched) {
      setProductNotice(
        checked
          ? t("manager.selectedItemsAreAlreadyOnThe")
          : t("manager.noneOfTheSelectedItemsAre")
      );
      window.setTimeout(() => setProductNotice(""), 4500);
      clearSelection();
      return;
    }
    const saved = await persistProducts(
      next,
      checked
        ? t("manager.storefront.addedCount", { count: touched })
        : t("manager.storefront.removedCount", { count: touched })
    );
    if (saved) clearSelection();
  };

  const openEditor = (item) => {
    const details =
      item.storefrontDetails && typeof item.storefrontDetails === "object"
        ? item.storefrontDetails
        : {};
    const pricing =
      item.storefrontPricing && typeof item.storefrontPricing === "object"
        ? item.storefrontPricing
        : {};
    const prices = {};
    for (const unit of UNIT_ORDER) {
      prices[unit] =
        pricing[unit] == null || pricing[unit] === ""
          ? ""
          : String(pricing[unit]);
    }
    setEditingId(item.id);
    setEditDraft({
      description: String(details.description || ""),
      composition: String(details.composition || ""),
      characteristics: String(details.characteristics || ""),
      pricingSource: pricing.source === "manual" ? "manual" : "inherit",
      prices,
    });
  };

  const closeEditor = () => {
    setEditingId(null);
    setEditDraft({
      description: "",
      composition: "",
      characteristics: "",
      pricingSource: "inherit",
      prices: {},
    });
  };

  const saveProductCard = async (productId) => {
    const next = (Array.isArray(products) ? products : []).map((item) => {
      if (String(item.id) !== String(productId)) return item;
      const storefrontPricing = {
        source: editDraft.pricingSource === "manual" ? "manual" : "inherit",
      };
      for (const unit of UNIT_ORDER) {
        const raw = editDraft.prices?.[unit];
        if (raw === "" || raw == null) {
          storefrontPricing[unit] = null;
          continue;
        }
        const numeric = Number(String(raw).replace(",", "."));
        storefrontPricing[unit] =
          Number.isFinite(numeric) && numeric >= 0
            ? Math.round(numeric * 100) / 100
            : null;
      }
      return normalizeProduct({
        ...item,
        storefrontDetails: {
          description: String(editDraft.description || "").trim(),
          composition: String(editDraft.composition || "").trim(),
          characteristics: String(editDraft.characteristics || "").trim(),
        },
        storefrontPricing,
      });
    });
    const saved = await persistProducts(
      next,
      t("manager.storefrontProductCardUpdated")
    );
    if (saved) closeEditor();
  };

  const detailsPreview = (item) => {
    const details =
      item.storefrontDetails && typeof item.storefrontDetails === "object"
        ? item.storefrontDetails
        : {};
    const filled = [
      details.description,
      details.composition,
      details.characteristics,
    ].filter((value) => String(value || "").trim()).length;
    const manual = item.storefrontPricing?.source === "manual";
    const parts = [];
    if (filled) parts.push(t("manager.storefront.descriptionFilled", { filled }));
    else parts.push(t("manager.descriptionIsEmpty"));
    if (manual) parts.push(t("manager.ownPrice"));
    return parts.join(" · ");
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{t("manager.websiteStorefront")}</h2>
          <p>{
            t("manager.editingThePublicSiteCloverSpb")
          }</p>
        </div>
      </div>

      <div className="manager-contact-settings storefront-settings-card">
        <h3>{t("manager.websitePrices")}</h3>
        <p className="storefront-settings-hint">{
          t("manager.howToCalculateTheStorefrontPrice")
        }</p>

        <div className="storefront-pricing-modes" role="radiogroup" aria-label={t("manager.storefrontPriceMode")}>
          <label className="storefront-check">
            <input
              type="radio"
              name="storefront-pricing-mode"
              checked={draft.storefrontPricingMode !== "purchase_markup"}
              onChange={() => setField("storefrontPricingMode", "price_type")}
            />
            <span>{t("manager.oneC.priceType")}</span>
          </label>
          <label className="storefront-check">
            <input
              type="radio"
              name="storefront-pricing-mode"
              checked={draft.storefrontPricingMode === "purchase_markup"}
              onChange={() => setField("storefrontPricingMode", "purchase_markup")}
            />
            <span>{t("manager.purchase")}</span>
          </label>
        </div>

        {draft.storefrontPricingMode === "purchase_markup" ? (
          <>
            <label className="storefront-price-field">
              <span>{t("manager.markup2")}</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={draft.storefrontMarkupPercent}
                onChange={(event) => {
                  const raw = String(event.target.value).replace(",", ".");
                  if (raw === "") {
                    setField("storefrontMarkupPercent", "");
                    return;
                  }
                  // Разрешаем промежуточный ввод: 0, 0., 12.5
                  if (!/^\d{0,4}(\.\d{0,2})?$/.test(raw)) return;
                  setField("storefrontMarkupPercent", raw);
                }}
                onBlur={() => {
                  setField(
                    "storefrontMarkupPercent",
                    String(parseMarkupPercent(draft.storefrontMarkupPercent))
                  );
                }}
              />
            </label>
            <p className="storefront-settings-hint">{
              t("manager.baseIsThePurchasePriceFrom")
            }</p>
          </>
        ) : (
          <>
            <label className="storefront-price-field">
              <span>{t("manager.storefrontPriceType")}</span>
              <select
                value={draft.storefrontPriceTypeId || ""}
                onChange={onPriceTypeChange}
              >
                <option value="">{t("manager.notSelected")}</option>
                {types.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="storefront-price-field" style={{ marginTop: 12 }}>
              <span>{t("manager.fallbackMarkupIfThereIsNo")}</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={draft.storefrontMarkupPercent}
                onChange={(event) => {
                  const raw = String(event.target.value).replace(",", ".");
                  if (raw === "") {
                    setField("storefrontMarkupPercent", "");
                    return;
                  }
                  if (!/^\d{0,4}(\.\d{0,2})?$/.test(raw)) return;
                  setField("storefrontMarkupPercent", raw);
                }}
                onBlur={() => {
                  setField(
                    "storefrontMarkupPercent",
                    String(parseMarkupPercent(draft.storefrontMarkupPercent))
                  );
                }}
              />
            </label>
            <p className="storefront-settings-hint">{
              t("manager.firstTheSelected1cPriceType")
            }</p>
          </>
        )}

        <label className="storefront-check">
          <input
            type="checkbox"
            checked={Boolean(draft.storefrontShowOnlyLinked)}
            onChange={(event) =>
              setField("storefrontShowOnlyLinked", event.target.checked)
            }
          />
          <span>{t("manager.onlyProductsLinkedTo1c")}</span>
        </label>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 20 }}>
        <h3>{t("manager.storefront.oneC.counterparty.title")}</h3>
        <p className="storefront-settings-hint">{
          t("manager.guestOrdersWithoutRegistrationGoTo")
        }</p>
        <div className="form-grid">
          <label className="field field-wide">{
            t("manager.nameIn1c2")
            }<input
              value={draft.storefrontOneCClientName || ""}
              placeholder={t("manager.cloverOnlineStore")}
              onChange={(event) =>
                setField("storefrontOneCClientName", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">{
            t("manager.storefront.oneC.counterparty.id")
            }<input
              value={draft.storefrontOneCClientId || ""}
              placeholder={t("manager.ifTheGuidFromTheExport")}
              onChange={(event) =>
                setField("storefrontOneCClientId", event.target.value)
              }
            />
          </label>
        </div>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 20 }}>
        <h3>{t("manager.homeTextAndSlides")}</h3>
        <div className="form-grid">
          <label className="field field-wide">{
            t("shared.field.title")
            }<input
              value={draft.storefrontHeroTitle || ""}
              placeholder={STOREFRONT_HERO_TITLE}
              onChange={(event) =>
                setField("storefrontHeroTitle", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">{
            t("manager.subtitle")
            }<textarea
              rows={3}
              value={draft.storefrontHeroLead || ""}
              placeholder={STOREFRONT_HERO_LEAD}
              onChange={(event) =>
                setField("storefrontHeroLead", event.target.value)
              }
            />
          </label>
          <label className="field">{
            t("manager.slideChangeSeconds")
            }<input
              type="number"
              min={2}
              max={60}
              step={1}
              value={draft.storefrontHeroIntervalSec || STOREFRONT_DEFAULT_HERO_INTERVAL_SEC}
              onChange={(event) =>
                setField(
                  "storefrontHeroIntervalSec",
                  event.target.value === ""
                    ? STOREFRONT_DEFAULT_HERO_INTERVAL_SEC
                    : Number(event.target.value)
                )
              }
            />
          </label>
        </div>
        <p className="storefront-settings-hint">{
          t("manager.imagesInTheRightPaneOn")
        }</p>
        <div className="storefront-hero-slide-list">
          {cloneHeroSlides(draft.storefrontHeroSlides).map((slide, index) => (
            <div key={`${slide.src}-${index}`} className="storefront-hero-slide-row">
              <img src={slide.src} alt="" loading="lazy" />
              <div className="storefront-hero-slide-fields">
                <input
                  value={slide.alt || ""}
                  placeholder={t("manager.captionOptional")}
                  onChange={(event) =>
                    updateHeroSlides((list) =>
                      list.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, alt: event.target.value }
                          : item
                      )
                    )
                  }
                />
                <input
                  value={slide.href || ""}
                  placeholder={t("manager.skuOrProduct")}
                  onChange={(event) =>
                    updateHeroSlides((list) =>
                      list.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, href: event.target.value }
                          : item
                      )
                    )
                  }
                />
                <input
                  value={slide.buttonLabel || ""}
                  placeholder={t("manager.buttonTextForExampleViewProduct")}
                  onChange={(event) =>
                    updateHeroSlides((list) =>
                      list.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, buttonLabel: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </div>
              <div className="storefront-hero-slide-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={index === 0}
                  onClick={() => moveHeroSlide(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    index === cloneHeroSlides(draft.storefrontHeroSlides).length - 1
                  }
                  onClick={() => moveHeroSlide(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    updateHeroSlides((list) =>
                      list.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >{
                  t("shared.action.delete")
                }</button>
              </div>
            </div>
          ))}
        </div>
        <div className="form-actions" style={{ marginTop: 0 }}>
          <label className="secondary-button">
            {heroBusy ? t("shared.status.loadingEllipsis") : t("manager.addAnImage")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={
                heroBusy ||
                cloneHeroSlides(draft.storefrontHeroSlides).length >=
                  STOREFRONT_MAX_HERO_SLIDES
              }
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setHeroBusy(true);
                void api
                  .uploadStorefrontHeroImage(file)
                  .then((result) => {
                    const imageUrl = result.imageUrl || "";
                    if (!imageUrl) return;
                    updateHeroSlides((list) => {
                      if (list.length >= STOREFRONT_MAX_HERO_SLIDES) return list;
                      if (list.some((item) => item.src === imageUrl)) return list;
                      return [...list, { src: imageUrl, alt: "", href: "", buttonLabel: "" }];
                    });
                  })
                  .catch((error) =>
                    appAlert({
                      title: t("manager.error.slideLoadFailed"),
                      message: errorDisplayMessage(error, t, "manager.loadError"),
                      tone: "danger",
                    })
                  )
                  .finally(() => setHeroBusy(false));
              }}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setField(
                "storefrontHeroSlides",
                STOREFRONT_DEFAULT_HERO_SLIDES.map((slide) => ({ ...slide }))
              )
            }
          >{
            t("manager.restoreExamples")
          }</button>
        </div>
      </div>

      <ManagerStorefrontPromotions
        promotions={draft.storefrontPromotions}
        onChange={(next) => setField("storefrontPromotions", next)}
      />

      <div className="manager-contact-settings" style={{ marginTop: 20 }}>
        <h3>{t("manager.storefrontContacts")}</h3>
        <p className="storefront-settings-hint">{
          t("manager.theContactsButtonOpensAPage")
        }</p>
        <div className="form-grid">
          <label className="field">{
            t("auth.register.phone")
            }<input
              inputMode="tel"
              autoComplete="tel"
              value={draft.storefrontContactPhone || ""}
              placeholder="+7 (___) ___-__-__"
              onFocus={(event) => {
                if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                  requestAnimationFrame(() => {
                    const end = event.currentTarget.value.length;
                    event.currentTarget.setSelectionRange(end, end);
                  });
                }
              }}
              onChange={(event) =>
                setField(
                  "storefrontContactPhone",
                  formatRussianPhone(event.target.value)
                )
              }
            />
          </label>
          <label className="field">{
            t("shared.field.emailShort")
            }<input
              type="email"
              autoComplete="email"
              value={draft.storefrontContactEmail || ""}
              placeholder="hello@clover-spb.ru"
              onChange={(event) =>
                setField("storefrontContactEmail", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">{
            t("shared.field.address")
            }<input
              value={draft.storefrontContactAddress || ""}
              placeholder={t("manager.saintPetersburg")}
              onChange={(event) =>
                setField("storefrontContactAddress", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">{
            t("storefront.workingHours")
            }<textarea
              rows={3}
              value={draft.storefrontContactHours || ""}
              placeholder={"Пн–Пт 9:00–18:00\nСб 10:00–16:00\nВс выходной"}
              onChange={(event) =>
                setField("storefrontContactHours", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">{
            t("manager.howToGetThereOptional")
            }<textarea
              rows={2}
              value={draft.storefrontContactNote || ""}
              placeholder={t("manager.landmarkEntranceIntercom")}
              onChange={(event) =>
                setField("storefrontContactNote", event.target.value)
              }
            />
          </label>
          <label className="field field-wide">{
            t("manager.yandexMapsLink")
            }<input
              value={draft.storefrontContactMapsUrl || ""}
              placeholder={t("manager.httpsYandexRuMapsOrN")}
              onChange={(event) =>
                setField("storefrontContactMapsUrl", event.target.value)
              }
            />
            {String(draft.storefrontContactMapsUrl || "").trim() &&
            !normalizeYandexMapsUrl(draft.storefrontContactMapsUrl) ? (
              <p className="storefront-settings-hint" style={{ color: "#a14a32" }}>{
                t("manager.thisDoesNotLookLikeA")
              }</p>
            ) : null}
          </label>
          <div className="field field-wide">{
            t("manager.mapImageWithAPin")
            }<p className="storefront-settings-hint" style={{ margin: "6px 0 10px" }}>{
              t("manager.youCanUploadYourOwnSnapshot")
            }</p>
            {draft.storefrontContactMapImageUrl ? (
              <p style={{ margin: "0 0 10px" }}>
                <img
                  src={draft.storefrontContactMapImageUrl}
                  alt={t("manager.map")}
                  loading="lazy"
                  style={{ maxWidth: 320, borderRadius: 12 }}
                />
              </p>
            ) : null}
            <div className="form-actions" style={{ marginTop: 0 }}>
              <label className="secondary-button">
                {mapBusy ? t("shared.status.loadingEllipsis") : t("manager.uploadAnImage")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={mapBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setMapBusy(true);
                    void api
                      .uploadStorefrontMapImage(file)
                      .then((result) => {
                        setField(
                          "storefrontContactMapImageUrl",
                          result.imageUrl || ""
                        );
                      })
                      .catch((error) =>
                        appAlert({
                          title: t("manager.error.mapLoadFailed"),
                          message: errorDisplayMessage(error, t, "manager.loadError"),
                          tone: "danger",
                        })
                      )
                      .finally(() => setMapBusy(false));
                  }}
                />
              </label>
              {draft.storefrontContactMapImageUrl ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setField("storefrontContactMapImageUrl", "")}
                >{
                  t("manager.removeImage")
                }</button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <ManagerStorefrontInfoPages
        pages={draft.storefrontInfoPages}
        onChange={(next) => setField("storefrontInfoPages", next)}
      />

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button
          className={`primary-button${settingsSaved && !busy ? " is-saved" : ""}`}
          type="button"
          disabled={busy || settingsSaved}
          onClick={() => void save()}
        >
          {busy ? t("shared.status.savingProgress") : settingsSaved ? t("shared.status.saved") : t("manager.saveStorefront")}
        </button>
        <a
          className="secondary-button"
          href="/"
          target="_blank"
          rel="noreferrer"
        >{
          t("manager.openPreview")
        }</a>
      </div>

      <div className="manager-contact-settings" style={{ marginTop: 28 }}>
        <h3>{t("manager.productsOnTheStorefront")}</h3>
        <p className="storefront-settings-hint">
          {t("manager.storefront.nameEqualsMatrixHint")}{" "}
          {t("manager.storefront.nowOnStorefrontSelected", {
            onStorefront: onStorefrontCount,
            total: activeProducts.length,
            selected: selectedCount,
          })}
        </p>
        <StorefrontProductAdd
          products={products}
          setProducts={setProducts}
          onAfterAdd={() => {
            setSelectedIds(new Set());
          }}
        />
        <div className="storefront-pick-shell">
        {productNotice ? (
          <div className="matrix-save-message saved storefront-pick-notice">{productNotice}</div>
        ) : null}
        <div className="form-grid storefront-catalog-filters" style={{ marginBottom: 12 }}>
          <label className="field">{
            t("manager.searchCloverCatalog")
            }<input
              value={productQuery}
              placeholder={t("manager.nameSkuCategory")}
              onChange={(event) => setProductQuery(event.target.value)}
            />
          </label>
          <label className="field">{
            t("manager.storefront.on")
            }<select
              value={storefrontFilter}
              onChange={(event) => setStorefrontFilter(event.target.value)}
            >
              <option value="Все">{visibilityFilterLabel("Все", t)}</option>
              <option value="На витрине">{visibilityFilterLabel("На витрине", t)}</option>
              <option value="Не на витрине">{visibilityFilterLabel("Не на витрине", t)}</option>
            </select>
          </label>
        </div>
        <div className="storefront-pick-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || filteredProducts.length === 0}
            onClick={selectAllFiltered}
          >{
            t("shared.action.selectAll")
          }</button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || selectedCount === 0}
            onClick={clearSelection}
          >{
            t("shared.action.clearSelection")
          }</button>
          <button
            className="primary-button"
            type="button"
            disabled={productBusy || selectedCount === 0}
            onClick={() => void applySelectionToStorefront(true)}
          >{
            t("manager.storefront.add")
          }</button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || selectedCount === 0}
            onClick={() => void applySelectionToStorefront(false)}
          >{
            t("manager.removeFromStorefront")
          }</button>
          <button
            className="secondary-button"
            type="button"
            disabled={productBusy || onStorefrontCount === 0}
            onClick={() => {
              void (async () => {
                setProductBusy(true);
                try {
                  const result = await api.enrichStorefrontAll({
                    forceCopy: true,
                  });
                  await appAlert({
                    title: t("manager.queueStarted"),
                    message: t("manager.storefront.enrichQueued", { count: result.queued || 0 }),
                    tone: "success",
                  });
                } catch (error) {
                  await appAlert({
                    title: t("manager.error.descriptionsUpdateFailed"),
                    message: errorDisplayMessage(error, t, "manager.enrichmentQueueError"),
                    tone: "danger",
                  });
                } finally {
                  setProductBusy(false);
                }
              })();
            }}
          >{
            t("manager.refreshDescriptions")
          }</button>
        </div>
        <div className="storefront-product-pick-list">
          {filteredProducts.length === 0 ? (
            <p className="storefront-settings-hint">{t("manager.noProductsMatchTheFilter")}</p>
          ) : (
            filteredProducts.map((item) => {
              const open = String(editingId) === String(item.id);
              const selected = selectedIds.has(String(item.id));
              const onStorefront = item.showOnStorefront === true;
              return (
                <div
                  className={`storefront-product-card${open ? " is-open" : ""}${
                    onStorefront ? " is-on" : ""
                  }${selected ? " is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="storefront-product-card-head">
                    <label className="storefront-check storefront-product-row">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={productBusy}
                        onChange={(event) =>
                          toggleSelected(item.id, event.target.checked)
                        }
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <span className="storefront-product-meta">
                          {onStorefront ? (
                            <span className="badge green" style={{ marginRight: 6 }}>{
                              t("manager.storefront.on")
                            }</span>
                          ) : (
                            <span className="badge yellow" style={{ marginRight: 6 }}>{
                              t("manager.storefront.off")
                            }</span>
                          )}
                          {[productArticle(item), item.category].filter(Boolean).join(" · ") ||
                            "—"}
                          {" · "}
                          {detailsPreview(item)}
                          {item.imageUrl ? t("manager.hasPhoto") : t("manager.noPhoto")}
                        </span>
                      </span>
                    </label>
                    <button
                      className="secondary-button storefront-product-edit-btn"
                      type="button"
                      disabled={productBusy}
                      onClick={() => (open ? closeEditor() : openEditor(item))}
                    >
                      {open ? t("shared.action.collapse") : t("manager.card")}
                    </button>
                  </div>
                  {open ? (
                    <div className="storefront-product-card-editor">
                      <div className="form-grid">
                        <label className="field field-wide">{
                          t("shared.field.description")
                          }<textarea
                            rows={3}
                            value={editDraft.description}
                            placeholder={t("manager.shortStorefrontProductBlurb")}
                            disabled={productBusy}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field field-wide">{
                          t("manager.contents")
                          }<textarea
                            rows={2}
                            value={editDraft.composition}
                            placeholder={t("manager.compositionMaterials")}
                            disabled={productBusy}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                composition: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field field-wide">{
                          t("manager.specifications")
                          }<textarea
                            rows={3}
                            value={editDraft.characteristics}
                            placeholder={t("manager.sizesDensityPackagingEtc")}
                            disabled={productBusy}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                characteristics: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field field-wide">{
                          t("manager.websitePrice")
                          }<select
                            value={editDraft.pricingSource}
                            disabled={productBusy}
                            onChange={(event) => {
                              const pricingSource =
                                event.target.value === "manual"
                                  ? "manual"
                                  : "inherit";
                              setEditDraft((prev) => {
                                const prices = { ...(prev.prices || {}) };
                                if (pricingSource === "manual") {
                                  const units =
                                    Array.isArray(item.saleUnits) &&
                                    item.saleUnits.length
                                      ? item.saleUnits
                                      : ["piece"];
                                  for (const unit of units) {
                                    if (prices[unit] === "" || prices[unit] == null) {
                                      const catalog =
                                        Number(item[unitPriceField(unit)]) || 0;
                                      prices[unit] =
                                        catalog > 0 ? String(catalog) : "";
                                    }
                                  }
                                }
                                return { ...prev, pricingSource, prices };
                              });
                            }}
                          >
                            <option value="inherit">{
                              t("manager.asInStorefrontSettings")
                            }</option>
                            <option value="manual">{
                              t("manager.customPriceForThisProduct")
                            }</option>
                          </select>
                        </label>
                        {editDraft.pricingSource === "manual"
                          ? (Array.isArray(item.saleUnits) && item.saleUnits.length
                              ? item.saleUnits
                              : ["piece"]
                            ).map((unit) => (
                              <label className="field" key={`sf-m-${item.id}-${unit}`}>
                                {unitDisplayLabel(unit, t) || unit}, ₽
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  disabled={productBusy}
                                  value={editDraft.prices?.[unit] ?? ""}
                                  placeholder="0"
                                  onFocus={selectDefaultNumber}
                                  onChange={(event) =>
                                    setEditDraft((prev) => ({
                                      ...prev,
                                      prices: {
                                        ...(prev.prices || {}),
                                        [unit]: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            ))
                          : null}
                      </div>
                      {editDraft.pricingSource === "manual" &&
                      draft.storefrontPricingMode === "purchase_markup" ? (
                        <p className="storefront-settings-hint" style={{ marginTop: 8 }}>{
                          t("manager.overridesThePurchaseCalculationOnThe")
                        }</p>
                      ) : null}
                      <div className="form-actions" style={{ marginTop: 10 }}>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={productBusy}
                          onClick={() => void saveProductCard(item.id)}
                        >
                          {productBusy ? t("shared.status.savingProgress") : t("manager.saveCard")}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={productBusy}
                          onClick={closeEditor}
                        >{
                          t("shared.modal.cancel")
                        }</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        </div>
      </div>
    </section>
  );
}
