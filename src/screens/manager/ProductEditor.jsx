import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { errorDisplayMessage } from "../../shared/i18n/errorDisplay.js";
// Модалка редактирования товара каталога: поля, ед. измерения, фото, связь с 1С.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../serverApi";
import {
  UNIT_ORDER,
  UNIT_CONFIG,
  unitSizeField,
  unitPriceField,
  unitConvertsOneToOneToPieces,
  selectDefaultNumber,
  hasPurchasePrice,
  formatMoney,
  formatDateTime,
  normalizeProduct,
  inferProductCategory,
  pickProductCardOneCCost,
} from "../../shared/appHelpers";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { normalizeProductPhotoFile, productImageSrc } from "../../shared/productPhoto";
import {
  CLOVER_PRODUCT_GROUPS,
  getGroupChildren,
  getSubgroupFacets,
  groupRequiresSubgroup,
  canonicalizeProductCategory,
} from "../storefront/productGroups.js";

function sortOneCPickerResults(items, currentProductId) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const aLinkedElsewhere =
      a.cloverLink?.productId &&
      String(a.cloverLink.productId) !== String(currentProductId || "");
    const bLinkedElsewhere =
      b.cloverLink?.productId &&
      String(b.cloverLink.productId) !== String(currentProductId || "");
    if (aLinkedElsewhere !== bLinkedElsewhere) {
      return aLinkedElsewhere ? 1 : -1;
    }
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  });
}

/** Кандидаты сверху, затем полный каталог; без дублей по id. */
function mergeOneCPickerResults(candidates, catalogItems, currentProductId) {
  const seen = new Set();
  const merged = [];
  for (const item of [...(candidates || []), ...(catalogItems || [])]) {
    const id = String(item?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return sortOneCPickerResults(merged, currentProductId);
}

/** Категории: канон витрины + уже используемые в каталоге + текущее значение. */
function buildCategoryOptions(products, currentCategory) {
  const fromCatalog = new Set();
  for (const item of Array.isArray(products) ? products : []) {
    const name = String(item?.category || "").trim();
    if (name) fromCatalog.add(name);
  }
  const current = String(currentCategory || "").trim();
  if (current) fromCatalog.add(current);

  const options = [...CLOVER_PRODUCT_GROUPS];
  const extras = [...fromCatalog]
    .filter((name) => !options.includes(name))
    .sort((a, b) => a.localeCompare(b, "ru"));
  options.push(...extras);
  return options;
}

export function ProductEditor({
  product,
  products = [],
  oneCPriceTypes = [],
  onClose,
  onSave,
  onDelete,
  onProductLiveUpdate,
}) {
  const { t } = useLocalization();
  const isNew = !product;
  const [form, setForm] = useState(
    product || {
      name: "",
      category: "Прочее",
      code: "",
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCMatchCode: "",
      oneCMatchName: "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "",
      oneCLinkedAt: "",
      active: true,
      showOnStorefront: false,
      subcategory: "",
      facet: "",
      storefrontDetails: {
        description: "",
        composition: "",
        characteristics: "",
      },
      storefrontPricing: {
        source: "inherit",
      },
      pieceSize: 1,
      pieceOrderMultiple: 1,
      packSize: 1,
      bundleSize: 1,
      boxSize: 1,
      pairSize: 1,
      meterSize: 1,
      rollSize: 1,
      pricePiece: 0,
      pricePack: 0,
      priceBundle: 0,
      priceBox: 0,
      pricePair: 0,
      priceMeter: 0,
      priceRoll: 0,
      saleUnits: ["piece"],
    }
  );
  const [oneCOpen, setOneCOpen] = useState(false);
  const [oneCSearch, setOneCSearch] = useState(product?.oneCName || product?.name || "");
  const [oneCResults, setOneCResults] = useState([]);
  const [oneCTotal, setOneCTotal] = useState(0);
  const [oneCLoading, setOneCLoading] = useState(false);
  const [oneCError, setOneCError] = useState("");
  const [oneCNotice, setOneCNotice] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [certificateBusy, setCertificateBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);

  const productId = form.id || product?.id;
  const categoryOptions = useMemo(
    () => buildCategoryOptions(products, form.category),
    [products, form.category]
  );
  const categoryKey = canonicalizeProductCategory(form.category || "");
  const subcategoryOptions = useMemo(
    () => getGroupChildren(categoryKey).map((item) => item.name),
    [categoryKey]
  );
  const facetOptions = useMemo(
    () =>
      getSubgroupFacets(categoryKey, form.subcategory || "").map(
        (item) => item.name
      ),
    [categoryKey, form.subcategory]
  );
  const needsSubcategory = groupRequiresSubgroup(categoryKey);

  const applyLiveProduct = (nextProduct) => {
    const normalized = normalizeProduct(nextProduct);
    setForm(normalized);
    onProductLiveUpdate?.(normalized);
  };

  const toggleUnit = (unit, checked) => {
    const next = checked
      ? [...new Set([...form.saleUnits, unit])]
      : form.saleUnits.filter((item) => item !== unit);
    setForm({ ...form, saleUnits: next.length ? next : ["piece"] });
  };

  const searchOneCProducts = async (query = oneCSearch) => {
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      const needle = String(query || "").trim();
      const result = await api.getOneCProducts({
        search: needle,
        limit: 100,
        offset: 0,
      });
      setOneCResults(sortOneCPickerResults(result.items || [], productId));
      setOneCTotal(Number(result.total) || 0);
      if (!needle) {
        setOneCNotice(
          t("manager.full1cExportFreeItemsAre")
        );
      }
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const openOneCSearch = async () => {
    const hintQuery =
      form.oneCSearchQuery ||
      form.oneCCode ||
      form.oneCMatchCode ||
      form.oneCName ||
      form.oneCMatchName ||
      form.name ||
      "";
    setOneCSearch(hintQuery);
    setOneCOpen(true);
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      let candidates = [];
      if (productId) {
        try {
          const candidateResult = await api.getOneCProductCandidates(productId);
          candidates = candidateResult.items || [];
        } catch {
          candidates = [];
        }
      }

      // Ищем по названию товара Clover (токены на сервере: ×≈х и т.п.),
      // а не по «первым 100 алфавитом» — иначе кажется, что каталога нет.
      const result = await api.getOneCProducts({
        search: String(hintQuery || "").trim(),
        limit: 100,
        offset: 0,
      });
      let catalogItems = result.items || [];
      let total = Number(result.total) || catalogItems.length;

      // Если по полному названию пусто — всё равно показать срез каталога.
      if (!catalogItems.length && hintQuery) {
        const fallback = await api.getOneCProducts({
          search: "",
          limit: 100,
          offset: 0,
        });
        catalogItems = fallback.items || [];
        total = Number(fallback.total) || catalogItems.length;
        setOneCNotice(
          t("manager.products.oneC.noExactShownCatalog", { query: hintQuery, total })
        );
      } else {
        setOneCNotice(
          total
            ? t("manager.products.oneC.foundInExport", { total })
            : t("manager.the1cExportIsEmptyFirst")
        );
      }

      setOneCResults(mergeOneCPickerResults(candidates, catalogItems, productId));
      setOneCTotal(total);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const applyOneCProduct = (item) => {
    const nextName = item.name || form.name || "";
    const keepCategory =
      form.category &&
      form.category !== "Прочее" &&
      form.category !== "Новые товары" &&
      form.category !== "Из 1С";
    const nextProduct = normalizeProduct({
      ...form,
      name: nextName || form.name,
      category: keepCategory
        ? form.category
        : inferProductCategory(nextName, products),
      oneCId: item.id,
      oneCCode: item.code || "",
      oneCName: item.name || "",
      oneCMatchCode: item.code || "",
      oneCMatchName: item.name || "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual",
      oneCLinkedAt: new Date().toISOString(),
    });

    setForm(nextProduct);
    setOneCOpen(false);
    setOneCError("");
    setOneCNotice(
      t("manager.products.oneC.selectedCategory", { category: nextProduct.category })
    );
  };

  const selectOneCProduct = async (item) => {
    const linkedToCurrent =
      item.cloverLink &&
      String(item.cloverLink.productId) === String(productId);
    if (linkedToCurrent) {
      setOneCOpen(false);
      return;
    }

    const linkedElsewhere = Boolean(item.cloverLink?.productId);
    if (linkedElsewhere) {
      const ok = await appConfirm({
        title: t("manager.itemAlreadyLinked"),
        message: t("manager.products.oneC.relinkConfirm", {
          name: item.name,
          linkedName: item.cloverLink.productName || item.cloverLink.productId,
        }),
        confirmLabel: t("manager.relink"),
        cancelLabel: t("shared.modal.cancel"),
        tone: "warn",
      });
      if (!ok) return;
    }

    applyOneCProduct(item);
  };

  const requestOneCSearch = async () => {
    if (!productId) {
      setForm((current) => ({
        ...current,
        oneCSearchQuery: oneCSearch || current.name,
      }));
      setOneCNotice(t("manager.theRequestWillBeSavedTogether"));
      return;
    }
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.requestOneCProduct(productId, {
        query: oneCSearch || form.name,
        code: form.oneCMatchCode || "",
        name: form.oneCMatchName || "",
      });
      const updatedProduct = normalizeProduct({
        ...form,
        ...(result.product || {}),
        oneCSearchQuery: oneCSearch || form.name,
      });
      setForm(updatedProduct);
      setOneCNotice(result.message || t("manager.requestSaved"));
      await onSave(updatedProduct);
    } catch (error) {
      setOneCError(error.message);
    } finally {
      setOneCLoading(false);
    }
  };

  const clearOneCProduct = () => {
    setForm((current) => ({
      ...current,
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCMatchCode: "",
      oneCMatchName: "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual-cleared",
      oneCLinkedAt: "",
    }));
  };

  const uploadImage = async (file) => {
    if (!file || !productId) return;

    setImageBusy(true);
    try {
      const normalized = await normalizeProductPhotoFile(file);
      const result = await api.uploadProductImage(productId, normalized);
      const editorScroll = document.querySelector(".product-editor-scroll");
      const editorTop = editorScroll?.scrollTop ?? 0;
      const pageY = window.scrollY;
      applyLiveProduct({ ...form, ...result.product });
      requestAnimationFrame(() => {
        if (editorScroll) editorScroll.scrollTop = editorTop;
        window.scrollTo(0, pageY);
      });
    } catch (error) {
      await appAlert({
        title: t("manager.loadError2"),
        message: errorDisplayMessage(error, t, "manager.loadError2"),
        tone: "danger",
      });
    } finally {
      setImageBusy(false);
    }
  };

  const deleteImage = async () => {
    if (!productId || !form.imageUrl) return;
    const ok = await appConfirm({
      title: t("manager.deleteThePhoto"),
      message: t("manager.products.deletePhotoNamed", {
        name: form.name || t("storefront.product"),
      }),
      confirmLabel: t("shared.action.delete"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) return;

    setImageBusy(true);
    try {
      const result = await api.deleteProductImage(productId);
      applyLiveProduct({ ...form, ...result.product });
    } catch (error) {
      await appAlert({
        title: t("manager.deleteError"),
        message: error.message,
        tone: "danger",
      });
    } finally {
      setImageBusy(false);
    }
  };

  const uploadCertificate = async (file) => {
    if (!file || !productId) return;
    setCertificateBusy(true);
    try {
      const result = await api.uploadProductCertificate(productId, file);
      applyLiveProduct({ ...form, ...result.product });
      await appAlert({
        title: t("manager.certificateSaved"),
        message: t("manager.certificateFileUploadedToTheServer"),
        tone: "success",
      });
    } catch (error) {
      await appAlert({
        title: t("manager.loadError2"),
        message: error.message,
        tone: "danger",
      });
    } finally {
      setCertificateBusy(false);
    }
  };

  const deleteCertificate = async () => {
    if (!productId || !form.certificateUrl) return;
    const ok = await appConfirm({
      title: t("manager.deleteTheCertificate"),
      message: t("manager.products.deleteCertificateNamed", {
        name: form.name || t("storefront.product"),
      }),
      confirmLabel: t("shared.action.delete"),
      cancelLabel: t("shared.modal.cancel"),
      tone: "danger",
    });
    if (!ok) return;

    setCertificateBusy(true);
    try {
      const result = await api.deleteProductCertificate(productId);
      applyLiveProduct({ ...form, ...result.product });
    } catch (error) {
      await appAlert({
        title: t("manager.deleteError"),
        message: error.message,
        tone: "danger",
      });
    } finally {
      setCertificateBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim()) return;
    if (needsSubcategory && !String(form.subcategory || "").trim()) {
      void appAlert({
        title: t("manager.chooseASubcategory"),
        message: t("manager.products.subcategoryRequired", { category: categoryKey }),
      });
      return;
    }

    onSave(
      normalizeProduct({
        ...form,
        name: form.name.trim(),
        category: form.category.trim(),
        subcategory: String(form.subcategory || "").trim(),
        facet: String(form.facet || "").trim(),
        oneCId: String(form.oneCId || "").trim(),
        oneCCode: String(form.oneCCode || "").trim(),
        oneCName: String(form.oneCName || "").trim(),
        oneCMatchCode: String(form.oneCMatchCode || "").trim(),
        oneCMatchName: String(form.oneCMatchName || "").trim(),
        oneCSearchQuery: String(form.oneCSearchQuery || "").trim(),
        oneCSearchRequestedAt: String(form.oneCSearchRequestedAt || "").trim(),
      })
    );
  };

  const editor = (
    <div
      className="product-editor"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="product-editor-card" onSubmit={submit}>
        <div className="product-editor-scroll">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("storefront.nav.catalog")}</p>
            <h2>{isNew ? t("manager.newProduct") : t("manager.editingTheProduct")}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="product-editor-photo">
          <div className="product-editor-photo-preview">
            {form.imageUrl ? (
              <img src={productImageSrc(form)} alt={form.name || t("shared.productPhoto")} loading="lazy" />
            ) : (
              <span>{t("shared.media.noPhoto")}</span>
            )}
          </div>
          <div className="product-editor-photo-actions">
            <p className="eyebrow">{t("shared.productPhoto")}</p>
            {productId ? (
              <>
                <label className="image-upload-label">
                  {imageBusy
                    ? t("shared.status.loadingDots")
                    : form.imageUrl
                      ? t("manager.replacePhoto")
                      : t("manager.addPhoto")}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={imageBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      void uploadImage(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                {form.imageUrl ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={imageBusy}
                    onClick={() => void deleteImage()}
                  >{
                    t("shared.deletePhoto")
                  }</button>
                ) : null}
                <small className="muted">{t("manager.jpgPngOrWebpUpTo")}</small>
              </>
            ) : (
              <small className="muted">{
                t("manager.saveTheProductFirstThenYou")
              }</small>
            )}
          </div>
        </section>

        <section className="product-editor-files">
          <p className="eyebrow" style={{ margin: 0 }}>{t("shared.media.certificate")}</p>
          {productId ? (
            <div className="product-editor-files-row">
              {form.certificateUrl ? (
                <a
                  className="product-cert-link"
                  href={form.certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {form.certificateName || t("manager.openCertificate")}
                </a>
              ) : (
                <small className="muted">{t("manager.fileIsNotUploadedYet")}</small>
              )}
              <label className="image-upload-label">
                {certificateBusy
                  ? t("shared.status.loadingDots")
                  : form.certificateUrl
                    ? t("shared.action.replace")
                    : t("manager.uploadACertificate")}
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,.pdf"
                  disabled={certificateBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    void uploadCertificate(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {form.certificateUrl ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={certificateBusy}
                  onClick={() => void deleteCertificate()}
                >{
                  t("shared.action.delete")
                }</button>
              ) : null}
              <small className="muted">{t("manager.pdfJpgPngOrWebpUp")}</small>
            </div>
          ) : (
            <small className="muted">{
              t("manager.saveTheProductFirstThenYou2")
            }</small>
          )}
        </section>

        <section className="purchase-price-card">
          {(() => {
            const card = pickProductCardOneCCost({
              purchasePrices: form.purchasePrices,
              purchaseUpdatedAt:
                form.purchasePriceReceivedAt || form.purchasePriceUpdatedAt || "",
              salePricesByType: form.salePricesByType,
              salePriceReceivedAt: form.salePriceReceivedAt || "",
              oneCPriceTypes,
              t,
            });
            const available = hasPurchasePrice(card.cost);
            return (
              <>
                <div className="purchase-price-card-head">
                  <div>
                    <p className="eyebrow">{t("manager.priceFrom1c")}</p>
                    <h3>{card.title}</h3>
                  </div>
                  <small>
                    {card.updatedAt
                      ? t("manager.products.updatedAt", { datetime: formatDateTime(card.updatedAt) })
                      : t("manager.products.oneC.pricePending")}
                  </small>
                </div>
                <div className="purchase-price-single">
                  <strong>{available ? formatMoney(card.cost) : "—"}</strong>
                  <small>
                    {available
                      ? `${card.sourceLabel} · ${UNIT_CONFIG[card.unit]?.label || "шт"}`
                      : t("manager.no1cPrice")}
                  </small>
                </div>
              </>
            );
          })()}
        </section>

        <div className="form-grid">
          <label className="field">{
            t("shared.productName")
            }<input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="field">{
            t("manager.category")
            }<select
              value={form.category || ""}
              onChange={(e) => {
                const category = e.target.value;
                const nextKey = canonicalizeProductCategory(category);
                const children = getGroupChildren(nextKey).map((item) => item.name);
                const keepSub = children.includes(String(form.subcategory || "").trim())
                  ? form.subcategory
                  : "";
                const facets = getSubgroupFacets(nextKey, keepSub).map(
                  (item) => item.name
                );
                const keepFacet = facets.includes(String(form.facet || "").trim())
                  ? form.facet
                  : "";
                setForm({
                  ...form,
                  category,
                  subcategory: keepSub,
                  facet: keepFacet,
                });
              }}
              required
            >
              {!form.category ? (
                <option value="" disabled>{
                  t("manager.chooseACategory")
                }</option>
              ) : null}
              {categoryOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {subcategoryOptions.length > 0 ? (
            <label className="field">{
              t("manager.subcategory")
              }<select
                value={form.subcategory || ""}
                onChange={(e) => {
                  const subcategory = e.target.value;
                  const facets = getSubgroupFacets(categoryKey, subcategory).map(
                    (item) => item.name
                  );
                  const keepFacet = facets.includes(String(form.facet || "").trim())
                    ? form.facet
                    : "";
                  setForm({
                    ...form,
                    subcategory,
                    facet: keepFacet,
                  });
                }}
                required={needsSubcategory}
              >
                <option value="">
                  {needsSubcategory
                    ? t("manager.chooseASubcategory")
                    : t("manager.noSubcategory")}
                </option>
                {subcategoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {facetOptions.length > 0 ? (
            <label className="field">{
              t("storefront.clarification")
              }<select
                value={form.facet || ""}
                onChange={(e) =>
                  setForm({ ...form, facet: e.target.value })
                }
              >
                <option value="">{t("manager.noSpecification")}</option>
                {facetOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">{
            t("manager.products.oneC.article")
            }<input
              value={form.oneCCode || ""}
              readOnly
              placeholder={t("manager.willAppearAfterLinkingTo1c")}
            />
          </label>
          <label className="field">{
            t("manager.showToClients")
            }<select
              value={form.active ? "yes" : "no"}
              onChange={(e) =>
                setForm({ ...form, active: e.target.value === "yes" })
              }
            >
              <option value="yes">{t("shared.action.yes")}</option>
              <option value="no">{t("shared.action.no")}</option>
            </select>
          </label>
          <label className="field">{
            t("manager.onTheWebsiteStorefront")
            }<select
              value={form.showOnStorefront ? "yes" : "no"}
              onChange={(e) =>
                setForm({
                  ...form,
                  showOnStorefront: e.target.value === "yes",
                })
              }
            >
              <option value="no">{t("shared.action.no")}</option>
              <option value="yes">{t("shared.action.yes")}</option>
            </select>
          </label>
        </div>

        <section className="storefront-details-editor">
          <div className="one-c-link-editor-head">
            <div>
              <p className="eyebrow">{t("manager.websiteStorefront")}</p>
              <h3>{t("manager.descriptionForBuyers")}</h3>
            </div>
            {productId ? (
              <button
                className="secondary-button"
                type="button"
                disabled={enrichBusy}
                onClick={async () => {
                  setEnrichBusy(true);
                  try {
                    const result = await api.enrichProductCard(productId, {
                      force: false,
                    });
                    if (result.product) {
                      applyLiveProduct(result.product);
                      onProductLiveUpdate?.(result.product);
                    }
                    await appAlert({
                      title: result.changed ? t("manager.cardEnriched") : t("manager.noChanges"),
                      message:
                        result.message ||
                        t("manager.emptyFieldsWereFilledFromPublic"),
                      tone: result.changed ? "success" : "default",
                    });
                  } catch (error) {
                    await appAlert({
                      title: t("manager.error.enrichFailed"),
                      message: errorDisplayMessage(error, t, "manager.error.enrichFailed"),
                      tone: "danger",
                    });
                  } finally {
                    setEnrichBusy(false);
                  }
                }}
              >
                {enrichBusy ? t("manager.searching") : t("manager.enrichFromTheInternet")}
              </button>
            ) : null}
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>{
            t("manager.theseTextsAppearOnThePublic")
          }</p>
          <div className="form-grid">
            <label className="field field-wide">{
              t("shared.field.description")
              }<textarea
                rows={3}
                value={form.storefrontDetails?.description || ""}
                placeholder={t("manager.shortStorefrontProductBlurb")}
                onChange={(event) =>
                  setForm({
                    ...form,
                    storefrontDetails: {
                      ...(form.storefrontDetails || {}),
                      description: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="field field-wide">{
              t("manager.contents")
              }<textarea
                rows={2}
                value={form.storefrontDetails?.composition || ""}
                placeholder={t("manager.compositionMaterials")}
                onChange={(event) =>
                  setForm({
                    ...form,
                    storefrontDetails: {
                      ...(form.storefrontDetails || {}),
                      composition: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="field field-wide">{
              t("manager.specifications")
              }<textarea
                rows={3}
                value={form.storefrontDetails?.characteristics || ""}
                placeholder={t("manager.sizesDensityPackagingEtc")}
                onChange={(event) =>
                  setForm({
                    ...form,
                    storefrontDetails: {
                      ...(form.storefrontDetails || {}),
                      characteristics: event.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field field-wide">{
              t("manager.websitePrice")
              }<select
                value={form.storefrontPricing?.source === "manual" ? "manual" : "inherit"}
                onChange={(event) => {
                  const source = event.target.value === "manual" ? "manual" : "inherit";
                  const next = {
                    ...(form.storefrontPricing || {}),
                    source,
                  };
                  if (source === "manual") {
                    for (const unit of form.saleUnits || ["piece"]) {
                      if (next[unit] == null) {
                        const catalog = Number(form[unitPriceField(unit)]) || 0;
                        next[unit] = catalog > 0 ? catalog : null;
                      }
                    }
                  }
                  setForm({ ...form, storefrontPricing: next });
                }}
              >
                <option value="inherit">{t("manager.asInStorefrontSettingsPurchaseOr")}</option>
                <option value="manual">{t("manager.customPriceForThisProduct")}</option>
              </select>
            </label>
            {form.storefrontPricing?.source === "manual"
              ? (form.saleUnits || ["piece"]).map((unit) => (
                  <label className="field" key={`sf-price-${unit}`}>
                    {t("manager.products.websitePriceUnit", {
                      unit: UNIT_CONFIG[unit]?.label || unit,
                    })}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        form.storefrontPricing?.[unit] == null
                          ? ""
                          : form.storefrontPricing[unit]
                      }
                      placeholder="0"
                      onFocus={selectDefaultNumber}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setForm({
                          ...form,
                          storefrontPricing: {
                            ...(form.storefrontPricing || {}),
                            source: "manual",
                            [unit]:
                              raw === ""
                                ? null
                                : Math.max(0, Number(String(raw).replace(",", ".")) || 0),
                          },
                        });
                      }}
                    />
                  </label>
                ))
              : null}
          </div>
          {form.storefrontPricing?.source === "manual" ? (
            <p className="muted small">{
              t("manager.aCustomPriceOverridesPurchaseAnd")
            }</p>
          ) : null}
        </section>

        <section className="one-c-link-editor">
          <div className="one-c-link-editor-head">
            <div>
              <p className="eyebrow">{t("manager.products.oneC.link")}</p>
              <h3>{t("manager.exact1cNomenclature")}</h3>
            </div>
            <button className="secondary-button" type="button" onClick={openOneCSearch}>
              {form.oneCId ? t("manager.change1cProduct") : t("manager.chooseFromLoaded1cItems")}
            </button>
          </div>

          {form.oneCId ? (
            <div className="one-c-link-selected">
              <div>
                <strong>{form.oneCName || t("manager.selected1cProduct")}</strong>
                <span>
                  {t("manager.products.oneCArticleCode", { code: form.oneCCode || "—" })}
                </span>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={clearOneCProduct}
              >{
                t("manager.unlink")
              }</button>
            </div>
          ) : (
            <div className="one-c-link-empty one-c-match-hints">
              <p>{
                t("manager.theSiteNameMayDifferFrom")
              }</p>
              <div className="form-grid one-c-match-fields">
                <label className="field">{
                  t("manager.productCodeIn1c")
                  }<input
                    value={form.oneCMatchCode || ""}
                    placeholder={t("manager.forExampleNf00000742")}
                    onChange={(event) =>
                      setForm({ ...form, oneCMatchCode: event.target.value })
                    }
                  />
                </label>
                <label className="field">{
                  t("manager.exactNameIn1c")
                  }<input
                    value={form.oneCMatchName || ""}
                    placeholder={t("manager.howTheItemIsNamedIn")}
                    onChange={(event) =>
                      setForm({ ...form, oneCMatchName: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>
          )}

          {!oneCOpen && oneCNotice && (
            <div className="sync-success">{oneCNotice}</div>
          )}

          {oneCOpen && (
            <div className="one-c-picker">
              <div className="one-c-products-search">
                <input
                  type="search"
                  placeholder={t("manager.searchThe1cExportNameCode")}
                  value={oneCSearch}
                  onChange={(event) => setOneCSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchOneCProducts(oneCSearch);
                    }
                  }}
                  autoFocus
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={oneCLoading}
                  onClick={() => searchOneCProducts(oneCSearch)}
                >
                  {oneCLoading ? t("manager.search.ellipsis") : t("shared.action.find")}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={oneCLoading}
                  onClick={() => {
                    setOneCSearch("");
                    void searchOneCProducts("");
                  }}
                >{
                  t("manager.entireCatalog")
                }</button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setOneCOpen(false)}
                >{
                  t("shared.action.close")
                }</button>
              </div>

              {oneCError && <div className="sync-error">{oneCError}</div>}
              {oneCNotice && <div className="sync-success">{oneCNotice}</div>}
              <p className="muted small">
                {t("manager.products.oneCExportListHint", {
                  total: oneCTotal,
                  shown: oneCResults.length,
                })}
              </p>

              <div className="one-c-products-list one-c-picker-list">
                {oneCResults.map((item) => {
                  const linkedToCurrent =
                    item.cloverLink &&
                    String(item.cloverLink.productId) === String(productId);
                  const linkedElsewhere = item.cloverLink && !linkedToCurrent;
                  const selected = String(form.oneCId) === String(item.id);

                  return (
                    <article key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>
                          {t("manager.products.oneCArticleCode", { code: item.code || "—" })}
                        </span>
                        {Number(item.score) > 0 && (
                          <span className="muted small">
                            {t("manager.matchPercent", { percent: Math.round(Number(item.score) * 100) })}
                          </span>
                        )}
                        {linkedElsewhere && (
                          <span className="warning-text">
                            {t("manager.products.alreadyLinkedToProduct", {
                              name: item.cloverLink.productName,
                            })}
                          </span>
                        )}
                      </div>
                      <button
                        className={
                          selected || linkedToCurrent
                            ? "secondary-button"
                            : "primary-button"
                        }
                        type="button"
                        onClick={() => void selectOneCProduct(item)}
                      >
                        {selected || linkedToCurrent
                          ? t("manager.selected")
                          : linkedElsewhere
                            ? t("manager.relink")
                            : t("shared.action.choose")}
                      </button>
                    </article>
                  );
                })}
                {!oneCLoading && !oneCResults.length && (
                  <div className="empty-box">
                    <p>{t("manager.noMatchingItemsInTheCurrent")}</p>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={requestOneCSearch}
                    >{
                      t("manager.saveTheRequestForTheNext")
                    }</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="unit-settings">
          {UNIT_ORDER.map((unit) => {
            const sizeField = unitSizeField(unit);
            const priceField = unitPriceField(unit);
            return (
              <div className="unit-setting" key={unit}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.saleUnits.includes(unit)}
                    onChange={(e) => toggleUnit(unit, e.target.checked)}
                  />
                  {UNIT_CONFIG[unit].label}
                </label>
                {unit === "piece" ? (
                  <label className="field">{
                    t("manager.multiplePcs")
                    }<input
                      type="number"
                      min="1"
                      step="1"
                      value={form.pieceOrderMultiple ?? 1}
                      onFocus={selectDefaultNumber}
                      onMouseUp={(event) => {
                        if (
                          ["0", "1"].includes(String(event.currentTarget.value))
                        ) {
                          event.preventDefault();
                          event.currentTarget.select();
                        }
                      }}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pieceOrderMultiple: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        setForm((current) => ({
                          ...current,
                          pieceOrderMultiple: Math.max(
                            1,
                            Math.floor(Number(current.pieceOrderMultiple) || 1)
                          ),
                        }))
                      }
                    />
                  </label>
                ) : unitConvertsOneToOneToPieces(unit) ? null : (
                  <label className="field">{
                    t("manager.insidePcs")
                    }<input
                      type="number"
                      min="1"
                      value={form[sizeField]}
                      onFocus={selectDefaultNumber}
                      onMouseUp={(event) => {
                        if (
                          ["0", "1"].includes(String(event.currentTarget.value))
                        ) {
                          event.preventDefault();
                          event.currentTarget.select();
                        }
                      }}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [sizeField]: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        setForm((current) => ({
                          ...current,
                          [sizeField]: Math.max(
                            1,
                            Number(current[sizeField]) || 1
                          ),
                        }))
                      }
                    />
                  </label>
                )}
                <label className="field">{
                  t("manager.pricePerSaleUnit")
                  }<input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form[priceField]}
                    onFocus={selectDefaultNumber}
                    onMouseUp={(event) => {
                      if (String(event.currentTarget.value) === "0") {
                        event.preventDefault();
                        event.currentTarget.select();
                      }
                    }}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [priceField]: event.target.value,
                      }))
                    }
                    onBlur={() =>
                      setForm((current) => ({
                        ...current,
                        [priceField]: Math.max(
                          0,
                          Number(current[priceField]) || 0
                        ),
                      }))
                    }
                  />
                </label>
              </div>
            );
          })}
        </div>
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>{
            t("shared.modal.cancel")
          }</button>
          {!isNew && typeof onDelete === "function" ? (
            <button
              className="danger-button"
              type="button"
              onClick={() => onDelete(product)}
            >{
              t("manager.deleteFromCatalog")
            }</button>
          ) : null}
          <button className="primary-button" type="submit">{
            t("manager.saveProduct")
          }</button>
        </div>
      </form>
    </div>
  );

  if (typeof document === "undefined") return editor;
  return createPortal(editor, document.documentElement);
}
