// Редактор заказа клиента: каталог, корзина и оформление.
import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../../shared/SharedPanels";
import {
  UNIT_CONFIG,
  STORAGE,
  safeRead,
  safeWrite,
  makeId,
  formatMoney,
  roundPriceUp,
  getUnitMultiplier,
  getUnitPrice,
  toQuantityInputValue,
  fromQuantityInputValue,
  quantityInputStep,
  quantityInputUnitLabel,
  orderedSaleUnits,
} from "../../shared/appHelpers";
import {
  getEarliestDeliveryDateIso,
  validateDeliveryDate,
} from "../../shared/deliveryDateRules";
import { productImageSrc } from "../../shared/productPhoto";
import { ManagerContact } from "./ManagerContact";
import { DeliveryDateCalendar } from "./DeliveryDateCalendar";
import { CatalogSearchInput } from "./CatalogSearchInput";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { EmptyState } from "../../shared/uxFeedback";

function capitalizeRu(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getDeliveryDateParts(value) {
  if (!value) return null;
  try {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return {
      day: String(date.getDate()),
      weekday: capitalizeRu(new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(date)),
      monthYear: capitalizeRu(
        new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date)
      ),
    };
  } catch {
    return null;
  }
}

/** Один адрес — берём его; несколько — только явный выбор (заказ/черновик) или пусто. */
function resolveCheckoutAddressId(addresses, preferredId) {
  const list = Array.isArray(addresses) ? addresses : [];
  if (preferredId && list.some((item) => item.id === preferredId)) {
    return preferredId;
  }
  if (list.length === 1) {
    return list[0].id;
  }
  return "";
}

export function OrderEditor({
  session,
  products,
  addresses,
  favorites,
  setFavorites,
  settings,
  profile,
  orders,
  catalogPolicy,
  showFullCatalog,
  setShowFullCatalog,
  onClose,
  onSave,
  embedded = false,
}) {
  const initialOrder = session.order || null;
  const savedDraft = session.mode === "new" && settings.enableDrafts ? safeRead(STORAGE.draft, null) : null;
  const initialSource = initialOrder || savedDraft || {};

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [catalogView, setCatalogView] = useState(() => {
    const saved = safeRead(STORAGE.catalogView, "cards");
    return saved === "list" ? "list" : "cards";
  });
  const [cart, setCart] = useState(() => {
    const result = {};
    (initialSource.items || []).forEach((item) => { result[item.productId ?? item.id] = item.quantity; });
    return result;
  });
  /** Черновик ввода в поле шт (чтобы «100» не сбрасывалось на «1» при наборе). */
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [units, setUnits] = useState(() => {
    const result = {};
    (initialSource.items || []).forEach((item) => { result[item.productId ?? item.id] = item.unit; });
    return result;
  });
  const [customItems, setCustomItems] = useState(() =>
    session.mode === "repeat"
      ? (initialSource.customItems || []).map((item) => ({
          ...item,
          id: makeId("custom"),
          requestStatus: "Новый запрос",
          unitPrice: 0,
          managerComment: "",
          matchedProductId: null,
        }))
      : initialSource.customItems || []
  );
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const initial = initialSource.firstDeliveryDate || "";
    if (!initial) return "";
    return validateDeliveryDate(initial).ok ? initial : "";
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [addressId, setAddressId] = useState(() =>
    resolveCheckoutAddressId(addresses, initialSource.addressId || "")
  );
  const [clientComment, setClientComment] = useState(initialSource.clientComment || "");
  const [missingFields, setMissingFields] = useState({ date: false, address: false });
  const cartDateFieldRef = useRef(null);
  const cartAddressFieldRef = useRef(null);
  const earliestDeliveryDate = getEarliestDeliveryDateIso();

  // Один адрес в списке — всегда подставляем автоматически.
  useEffect(() => {
    if (addresses.length !== 1) return;
    const soleId = addresses[0].id;
    if (addressId !== soleId) {
      setAddressId(soleId);
      setMissingFields((current) => ({ ...current, address: false }));
    }
  }, [addresses, addressId]);

  const updateDeliveryDate = async (value) => {
    if (!value) {
      setDeliveryDate("");
      return;
    }
    const check = validateDeliveryDate(value);
    if (!check.ok) {
      await appAlert({
        title: "Дата недоступна",
        message: check.message,
        tone: "warn",
      });
      return;
    }
    setDeliveryDate(value);
    setMissingFields((current) => ({ ...current, date: false }));
  };

  const handleCalendarPick = async (result) => {
    if (!result.ok) {
      await appAlert({
        title: "Дата недоступна",
        message: result.message,
        tone: "warn",
      });
      return;
    }
    await updateDeliveryDate(result.value);
    setDatePickerOpen(false);
    setCartSheetOpen(true);
  };

  const closeDatePickerToCart = () => {
    setDatePickerOpen(false);
    setCartSheetOpen(true);
  };

  const updateAddressId = (value) => {
    setAddressId(value);
    if (value) setMissingFields((current) => ({ ...current, address: false }));
  };

  const focusMissingFields = (dateMissing, addressMissing) => {
    setMissingFields({ date: dateMissing, address: addressMissing });
    setCartSheetOpen(true);

    window.setTimeout(() => {
      const target = dateMissing
        ? cartDateFieldRef.current
        : cartAddressFieldRef.current;
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
  };

  const categories = useMemo(() => ["Все", ...new Set(products.map((item) => item.category))], [products]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((item) => {
      const byCategory = category === "Все" || item.category === category;
      const bySearch = !needle || item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle);
      const byFavorite = !favoritesOnly || favorites.includes(item.id);
      return byCategory && bySearch && byFavorite;
    });
  }, [products, search, category, favoritesOnly, favorites]);

  const selectedItems = useMemo(() => products
    .filter((product) => Number(cart[product.id]) > 0)
    .map((product) => {
      const unit = units[product.id] || orderedSaleUnits(product)[0];
      const quantity = Number(cart[product.id]) || 0;
      const unitPrice = getUnitPrice(product, unit);
      return {
        id: product.id,
        productId: product.id,
        code: product.code,
        oneCId: product.oneCId || "",
        name: product.name,
        category: product.category,
        quantity,
        unit,
        multiplier: getUnitMultiplier(product, unit),
        unitPrice,
        lineTotal: quantity * unitPrice,
        pieceSize: product.pieceSize,
        packSize: product.packSize,
        bundleSize: product.bundleSize,
      };
    }), [products, cart, units]);

  const total = roundPriceUp(
    selectedItems.reduce((sum, item) => sum + item.lineTotal, 0) +
      customItems.reduce(
        (sum, item) =>
          sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
        0
      )
  );
  const cartCount = selectedItems.length + customItems.length;
  const selectedAddress = addresses.find((item) => item.id === addressId);
  const deliveryDateParts = getDeliveryDateParts(deliveryDate);

  const draftSaveLockedRef = useRef(false);

  useEffect(() => {
    if (draftSaveLockedRef.current) return;
    if (session.mode !== "new" || !settings.enableDrafts) return;
    safeWrite(STORAGE.draft, {
      items: selectedItems,
      customItems,
      firstDeliveryDate: deliveryDate,
      addressId,
      address: selectedAddress?.address || "",
      clientComment,
    });
  }, [session.mode, settings.enableDrafts, selectedItems, customItems, deliveryDate, addressId, selectedAddress, clientComment]);

  const clearQtyDraft = (id) => {
    setQtyDrafts((current) => {
      if (current[id] === undefined) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const changeQuantity = (id, delta) => {
    clearQtyDraft(id);
    setCart((current) => {
      const nextValue = Math.max(0, (Number(current[id]) || 0) + delta);
      const next = { ...current };
      if (nextValue) next[id] = nextValue; else delete next[id];
      return next;
    });
  };

  const setItemQuantity = (id, value, multiplier = 1) => {
    const nextValue = fromQuantityInputValue(value, multiplier);
    setCart((current) => {
      const next = { ...current };
      if (nextValue) next[id] = nextValue; else delete next[id];
      return next;
    });
  };

  const commitQtyDraft = (id, multiplier = 1) => {
    if (qtyDrafts[id] === undefined) return;
    setItemQuantity(id, qtyDrafts[id], multiplier);
    clearQtyDraft(id);
  };

  const quantityFieldValue = (id, quantity, multiplier) => {
    if (qtyDrafts[id] !== undefined) return qtyDrafts[id];
    return quantity ? String(toQuantityInputValue(quantity, multiplier)) : "";
  };

  const setProductUnit = (productId, nextUnit) => {
    clearQtyDraft(productId);
    setUnits((current) => ({ ...current, [productId]: nextUnit }));
  };

  const changeCustomQuantity = (id, delta) => {
    setCustomItems((current) =>
      current
        .map((item) => {
          if (item.id !== id) return item;
          const quantity = Math.max(0, (Number(item.quantity) || 0) + delta);
          return { ...item, quantity };
        })
        .filter((item) => Number(item.quantity) > 0)
    );
  };

  const clearCart = async () => {
    if (!selectedItems.length && !customItems.length) return;
    const ok = await appConfirm({
      title: "Очистить корзину?",
      message: "Все выбранные позиции будут удалены.",
      confirmLabel: "Очистить",
      cancelLabel: "Отмена",
      tone: "danger",
    });
    if (!ok) return;
    setCart({});
    setCustomItems([]);
    setQtyDrafts({});
  };

  const openCartForCheckout = () => {
    if (!selectedItems.length && !customItems.length) {
      void appAlert({
        title: "Корзина пуста",
        message: "Добавьте хотя бы один товар из каталога.",
        tone: "warn",
      });
      return;
    }
    setCartSheetOpen(true);
  };

  const submitOrder = async () => {
    if (!selectedItems.length && !customItems.length) {
      await appAlert({
        title: "Корзина пуста",
        message: "Добавьте хотя бы один товар.",
        tone: "warn",
      });
      return;
    }

    // 1) Сначала дата.
    const dateMissing = !deliveryDate;
    if (dateMissing) {
      focusMissingFields(true, false);
      setDatePickerOpen(true);
      return;
    }
    const dateCheck = validateDeliveryDate(deliveryDate);
    if (!dateCheck.ok) {
      focusMissingFields(true, false);
      setDeliveryDate("");
      setDatePickerOpen(true);
      return;
    }

    // 2) Адрес: один — автоматически; несколько — явным выбором.
    let checkoutAddressId = addressId;
    let checkoutAddress = addresses.find((item) => item.id === checkoutAddressId) || null;
    if (!checkoutAddress && addresses.length === 1) {
      checkoutAddressId = addresses[0].id;
      checkoutAddress = addresses[0];
      setAddressId(checkoutAddressId);
    }
    if (!checkoutAddress) {
      focusMissingFields(false, true);
      await appAlert({
        title: "Укажите адрес доставки",
        message: addresses.length > 1
          ? "У вас несколько адресов. Выберите, куда доставить заказ."
          : "Выберите адрес из списка или добавьте новый.",
        tone: "warn",
      });
      return;
    }

    setMissingFields({ date: false, address: false });
    draftSaveLockedRef.current = true;
    try {
      localStorage.removeItem(STORAGE.draft);
    } catch {
      // ignore
    }
    Promise.resolve(
      onSave({
        items: selectedItems,
        customItems,
        firstDeliveryDate: deliveryDate,
        addressId: checkoutAddressId,
        address: checkoutAddress.address,
        addressLabel: checkoutAddress.label,
        clientComment: clientComment.trim(),
      })
    )
      .then(() => {
        setCartSheetOpen(false);
      })
      .catch(() => {
        // Заказ не создан — снова разрешаем черновик и оставляем корзину.
        draftSaveLockedRef.current = false;
      });
  };

  const submit = (event) => {
    event.preventDefault();
    submitOrder();
  };

  const catalogBody = (
      <section className={embedded ? "catalog-content embedded-catalog" : "catalog-content"}>
        <div className="catalog-layout">
          <aside className="order-summary" id="order-summary">
            <h2>Корзина</h2>
            {!selectedItems.length && !customItems.length ? (
              <EmptyState
                title="Пока пусто"
                message="Выберите товары в каталоге, затем откройте корзину для оформления."
              />
            ) : (
              <>
                <div className="summary-total" style={{ marginTop: 0 }}>
                  <span>Позиций</span>
                  <strong>{cartCount}</strong>
                </div>
                <div className="summary-total">
                  <span>Итого</span>
                  <strong>
                    {settings.showPrices && total > 0
                      ? formatMoney(total)
                      : "уточняется"}
                  </strong>
                </div>
                <p className="summary-note">
                  Дата, адрес и комментарий — в корзине перед оформлением.
                </p>
                <div className="order-summary-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void clearCart()}
                  >
                    Очистить корзину
                  </button>
                  <button
                    className="primary-button open-cart-button"
                    type="button"
                    onClick={openCartForCheckout}
                  >
                    Перейти в корзину
                  </button>
                </div>
              </>
            )}
            {settings.enableDrafts && session.mode === "new" && (
              <p className="summary-note">Черновик автоматически сохраняется в этом браузере.</p>
            )}
          </aside>

          <div className="catalog-main">
            <div className="page-title-row">
              <div>
                <h1>
                  {session.mode === "edit"
                    ? "Редактирование заказа"
                    : session.mode === "repeat"
                      ? "Повтор заказа"
                      : "Новый заказ"}
                </h1>
              </div>
              <div className="mini-card"><span className="mini-label">Позиций</span><strong>{cartCount}</strong></div>
            </div>

            {catalogPolicy.matrixMode === "pending" && (
              <div className="matrix-catalog-note pending">
                Менеджер ещё подготавливает ваш постоянный список
                товаров и персональные цены. Пока можно добавить товар
                через форму «Не нашли нужный товар?».
              </div>
            )}

            {catalogPolicy.allowFullCatalog && (
              <div className="catalog-scope-switch">
                <button
                  className={!showFullCatalog ? "active" : ""}
                  type="button"
                  onClick={() => setShowFullCatalog(false)}
                >
                  Мои постоянные позиции
                </button>
                <button
                  className={showFullCatalog ? "active" : ""}
                  type="button"
                  onClick={() => setShowFullCatalog(true)}
                >
                  Весь каталог
                </button>
              </div>
            )}

            <div className="catalog-toolbar">
              <div className="catalog-filter-row">
                <CatalogSearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="catalog-filter-actions">
                  {settings.showFavorites && (
                    <button
                      className={favoritesOnly ? "category-button active" : "category-button"}
                      type="button"
                      onClick={() => setFavoritesOnly((value) => !value)}
                      aria-label="Избранное"
                      title="Избранное"
                    >
                      <span className="fav-label-full">★ Избранное</span>
                      <span className="fav-label-short">★</span>
                    </button>
                  )}
                  <div className="catalog-view-toggle" role="group" aria-label="Вид каталога">
                    <button
                      type="button"
                      className={catalogView === "cards" ? "active" : ""}
                      aria-pressed={catalogView === "cards"}
                      title="С фото"
                      aria-label="С фото"
                      onClick={() => {
                        setCatalogView("cards");
                        safeWrite(STORAGE.catalogView, "cards");
                      }}
                    >
                      <span className="view-toggle-icon" aria-hidden="true">▦</span>
                      <span className="view-toggle-label">Фото</span>
                    </button>
                    <button
                      type="button"
                      className={catalogView === "list" ? "active" : ""}
                      aria-pressed={catalogView === "list"}
                      title="Список"
                      aria-label="Список"
                      onClick={() => {
                        setCatalogView("list");
                        safeWrite(STORAGE.catalogView, "list");
                      }}
                    >
                      <span className="view-toggle-icon" aria-hidden="true">☰</span>
                      <span className="view-toggle-label">Список</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="category-list">
                {categories.map((item) => <button className={category === item ? "category-button active" : "category-button"} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}
              </div>
            </div>

            <section className={catalogView === "list" ? "product-grid product-grid-list" : "product-grid"}>
              {filtered.map((product) => {
                const unit = units[product.id] || orderedSaleUnits(product)[0];
                const quantity = Number(cart[product.id]) || 0;
                const multiplier = getUnitMultiplier(product, unit);
                const price = getUnitPrice(product, unit);
                const isList = catalogView === "list";
                const selected = quantity > 0;
                return (
                  <article
                    className={[
                      "product-card",
                      isList ? "product-card-list" : "",
                      selected ? "product-card-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={product.id}
                  >
                    <div className="product-card-top">
                      {product.certificateUrl ? (
                        <a
                          className="product-cert-link product-cert-link-top"
                          href={product.certificateUrl}
                          target="_blank"
                          rel="noreferrer"
                          download={product.certificateName || undefined}
                        >
                          Сертификат
                        </a>
                      ) : (
                        <span className="product-card-top-spacer" aria-hidden="true" />
                      )}
                      {settings.showFavorites && <button className={favorites.includes(product.id) ? "favorite-button active" : "favorite-button"} type="button" onClick={() => setFavorites((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])}>★</button>}
                    </div>
                    {!isList && (
                      <div className="product-image-wrap">
                        {product.imageUrl ? (
                          <img className="product-image" src={productImageSrc(product)} alt={product.name} />
                        ) : (
                          <span className="product-image-placeholder">Фото товара пока не загружено</span>
                        )}
                      </div>
                    )}
                    <h2>{product.name}</h2>
                    <p className="product-code">Код: {product.code}</p>
                    <p className="product-price">
                      {settings.showPrices && price > 0
                        ? <>{formatMoney(price)} <small>/ {UNIT_CONFIG[unit].shortLabel}</small></>
                        : "Цена уточняется"}
                    </p>
                    <div className="product-card-controls">
                      <div className={`unit-choice${orderedSaleUnits(product).length === 1 ? " unit-choice-single" : ""}`}>
                        {orderedSaleUnits(product).map((item) => {
                          const sole = orderedSaleUnits(product).length === 1;
                          return (
                            <button
                              className={sole || unit === item ? "active" : ""}
                              type="button"
                              key={item}
                              onClick={() => setProductUnit(product.id, item)}
                            >
                              {UNIT_CONFIG[item].shortLabel || UNIT_CONFIG[item].label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="quantity-control">
                        <button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label="Уменьшить">−</button>
                        <div className="quantity-input-wrap">
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            step={quantityInputStep(multiplier)}
                            inputMode="numeric"
                            value={quantityFieldValue(product.id, quantity, multiplier)}
                            placeholder="0"
                            onChange={(e) => setQtyDrafts((current) => ({ ...current, [product.id]: e.target.value }))}
                            onBlur={() => commitQtyDraft(product.id, multiplier)}
                          />
                          <small>{quantityInputUnitLabel(unit, multiplier)}</small>
                        </div>
                        <button type="button" onClick={() => changeQuantity(product.id, 1)} aria-label="Увеличить">+</button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!filtered.length && <div className="empty-box">Товары не найдены.</div>}
            </section>
          </div>
        </div>

        <div className="mobile-checkout-bar" aria-label="Корзина">
          <div className="mobile-checkout-bar-info">
            <strong>{cartCount} поз.</strong>
            <span>{settings.showPrices && total > 0 ? formatMoney(total) : "Сумма уточняется"}</span>
          </div>
          <button
            className="mobile-checkout-bar-button"
            type="button"
            onClick={openCartForCheckout}
          >
            Корзина
          </button>
        </div>

        {cartSheetOpen && (
          <div className="cart-sheet" role="dialog" aria-modal="true" aria-label="Корзина заказа">
            <button
              className="cart-sheet-backdrop"
              type="button"
              aria-label="Закрыть корзину"
              onClick={() => setCartSheetOpen(false)}
            />
            <div className="cart-sheet-panel">
              <div className="cart-sheet-head">
                <div>
                  <strong>Корзина</strong>
                  <p className="muted small">{cartCount ? `${cartCount} поз.` : "Пока пусто"}</p>
                </div>
                <button className="header-button" type="button" onClick={() => setCartSheetOpen(false)}>
                  Закрыть
                </button>
              </div>

              <div className="cart-sheet-scroll">
              {!cartCount ? (
                <EmptyState
                  title="Корзина пуста"
                  message="Добавьте товары из каталога — они появятся здесь для быстрой правки."
                  actionLabel="К каталогу"
                  onAction={() => {
                    setCartSheetOpen(false);
                    window.setTimeout(() => {
                      document.querySelector(".product-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                />
              ) : (
                <div className="cart-sheet-list">
                  {selectedItems.map((item) => (
                    <div className="cart-sheet-item" key={item.productId}>
                      <div className="cart-sheet-item-main">
                        <strong>{item.name}</strong>
                        <small>
                          {UNIT_CONFIG[item.unit].label}
                          {item.multiplier > 1 ? ` · ${item.quantity * item.multiplier} шт. всего` : ""}
                          {settings.showPrices && item.lineTotal > 0 ? ` · ${formatMoney(item.lineTotal)}` : ""}
                        </small>
                        <div className={`unit-choice cart-sheet-units${(() => {
                          const product = products.find((row) => String(row.id) === String(item.productId));
                          return orderedSaleUnits(product).length === 1 ? " unit-choice-single" : "";
                        })()}`}>
                          {(() => {
                            const product = products.find((row) => String(row.id) === String(item.productId));
                            const unitsList = orderedSaleUnits(product);
                            const sole = unitsList.length === 1;
                            return unitsList.map((unitId) => (
                              <button
                                className={sole || item.unit === unitId ? "active" : ""}
                                type="button"
                                key={unitId}
                                onClick={() => setProductUnit(item.productId, unitId)}
                              >
                                {UNIT_CONFIG[unitId].shortLabel || UNIT_CONFIG[unitId].label}
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                      <div className="quantity-control cart-sheet-qty">
                        <button type="button" onClick={() => changeQuantity(item.productId, -1)} aria-label="Уменьшить">−</button>
                        <div className="quantity-input-wrap">
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            step={quantityInputStep(item.multiplier)}
                            inputMode="numeric"
                            value={quantityFieldValue(item.productId, item.quantity, item.multiplier)}
                            onChange={(e) => setQtyDrafts((current) => ({ ...current, [item.productId]: e.target.value }))}
                            onBlur={() => commitQtyDraft(item.productId, item.multiplier)}
                          />
                          <small>{quantityInputUnitLabel(item.unit, item.multiplier)}</small>
                        </div>
                        <button type="button" onClick={() => changeQuantity(item.productId, 1)} aria-label="Увеличить">+</button>
                      </div>
                    </div>
                  ))}
                  {customItems.map((item) => (
                    <div className="cart-sheet-item" key={item.id}>
                      <div className="cart-sheet-item-main">
                        <strong>{item.name}</strong>
                        <small>Товар вне матрицы · {item.unit || "шт."}</small>
                      </div>
                      <div className="quantity-control cart-sheet-qty">
                        <button type="button" onClick={() => changeCustomQuantity(item.id, -1)} aria-label="Уменьшить">−</button>
                        <div className="quantity-input-wrap">
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={item.quantity || ""}
                            onChange={(e) => {
                              const quantity = Math.max(0, Number.parseInt(e.target.value, 10) || 0);
                              setCustomItems((current) =>
                                current
                                  .map((row) => (row.id === item.id ? { ...row, quantity } : row))
                                  .filter((row) => Number(row.quantity) > 0)
                              );
                            }}
                          />
                          <small>{item.unit || "шт."}</small>
                        </div>
                        <button type="button" onClick={() => changeCustomQuantity(item.id, 1)} aria-label="Увеличить">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`field delivery-date-field cart-sheet-date${missingFields.date ? " is-invalid" : ""}`}
                ref={cartDateFieldRef}
              >
                <span>Дата доставки</span>
                <button
                  className={`delivery-date-trigger${deliveryDateParts ? " is-selected" : ""}${missingFields.date ? " is-invalid" : ""}`}
                  type="button"
                  onClick={() => setDatePickerOpen(true)}
                  aria-invalid={missingFields.date}
                >
                  {deliveryDateParts ? (
                    <>
                      <span className="delivery-date-day" aria-hidden="true">{deliveryDateParts.day}</span>
                      <span className="delivery-date-text">
                        <strong>{deliveryDateParts.weekday}</strong>
                        <small>{deliveryDateParts.monthYear}</small>
                      </span>
                      <span className="delivery-date-action">Изменить</span>
                    </>
                  ) : (
                    <>
                      <span className="delivery-date-day is-empty" aria-hidden="true">—</span>
                      <span className="delivery-date-text">
                        <strong>Выберите дату</strong>
                        <small>Когда привезти заказ</small>
                      </span>
                      <span className="delivery-date-action">Календарь</span>
                    </>
                  )}
                </button>
                {missingFields.date && (
                  <p className="field-error-hint">Укажите дату доставки</p>
                )}
              </div>

              <label
                className={`field cart-sheet-address${missingFields.address ? " is-invalid" : ""}`}
                ref={cartAddressFieldRef}
              >
                Адрес доставки
                <select
                  value={addressId}
                  onChange={(e) => updateAddressId(e.target.value)}
                  aria-invalid={missingFields.address}
                >
                  <option value="">Выберите адрес</option>
                  {addresses.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label}{item.isDefault ? " — основной" : ""} · {item.address}
                    </option>
                  ))}
                </select>
                {missingFields.address && (
                  <span className="field-error-hint">Укажите адрес доставки</span>
                )}
              </label>

              <label className="field cart-sheet-comment" style={{ marginTop: 10 }}>
                Комментарий к заказу
                <textarea
                  rows="3"
                  placeholder="Например: позвонить перед доставкой"
                  value={clientComment}
                  onChange={(e) => setClientComment(e.target.value)}
                />
              </label>
              </div>

              <div className="cart-sheet-footer">
                <div className="cart-sheet-total">
                  <span>Итого</span>
                  <strong>{settings.showPrices && total > 0 ? formatMoney(total) : `${cartCount} поз.`}</strong>
                </div>
                <button className="secondary-button" type="button" onClick={() => void clearCart()}>
                  Очистить корзину
                </button>
                <button className="save-order-button" type="button" onClick={submitOrder}>
                  {session.mode === "edit" ? "Сохранить изменения" : "Оформить заказ"}
                </button>
              </div>
            </div>
          </div>
        )}

        {datePickerOpen && (
          <div className="delivery-date-sheet" role="dialog" aria-modal="true" aria-label="Дата доставки">
            <button
              className="delivery-date-sheet-backdrop"
              type="button"
              aria-label="Закрыть выбор даты"
              onClick={closeDatePickerToCart}
            />
            <div className="delivery-date-sheet-panel">
              <div className="delivery-date-sheet-head">
                <strong>Дата доставки</strong>
                <button className="header-button" type="button" onClick={closeDatePickerToCart}>
                  Готово
                </button>
              </div>
              {deliveryDateParts && (
                <div className="delivery-date-preview">
                  <span className="delivery-date-day" aria-hidden="true">{deliveryDateParts.day}</span>
                  <span className="delivery-date-text">
                    <strong>{deliveryDateParts.weekday}</strong>
                    <small>{deliveryDateParts.monthYear}</small>
                  </span>
                </div>
              )}
              <DeliveryDateCalendar
                value={deliveryDate}
                earliestIso={earliestDeliveryDate}
                onPick={handleCalendarPick}
              />
            </div>
          </div>
        )}
      </section>
  );

  if (embedded) {
    return catalogBody;
  }

  return (
    <main className="clover-app">
      <Header title={session.mode === "edit" ? "Редактирование заказа" : session.mode === "repeat" ? "Повтор заказа" : "Новый заказ"}>
        <ManagerContact settings={settings} />
        <button className="header-button" type="button" onClick={onClose}>← Назад</button>
      </Header>
      {catalogBody}
    </main>
  );
}
