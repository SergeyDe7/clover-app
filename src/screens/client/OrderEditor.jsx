// Редактор заказа клиента: каталог, корзина и оформление.
import { useEffect, useMemo, useRef, useState } from "react";
import { Header, CustomRequestPhoto } from "../../shared/SharedPanels";
import {
  UNIT_CONFIG,
  UNIT_ORDER,
  STORAGE,
  safeRead,
  safeWrite,
  makeId,
  formatMoney,
  getUnitMultiplier,
  getUnitPrice,
  CATALOG_NARROW_MQ,
} from "../../shared/appHelpers";
import {
  getEarliestDeliveryDateIso,
  validateDeliveryDate,
} from "../../shared/deliveryDateRules";
import { ManagerContact } from "./ManagerContact";
import { DeliveryDateCalendar } from "./DeliveryDateCalendar";
import { appAlert } from "../../shared/AppModal";
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
  const defaultAddress = addresses.find((item) => item.isDefault) || addresses[0];
  const savedDraft = session.mode === "new" && settings.enableDrafts ? safeRead(STORAGE.draft, null) : null;
  const initialSource = initialOrder || savedDraft || {};

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cart, setCart] = useState(() => {
    const result = {};
    (initialSource.items || []).forEach((item) => { result[item.productId ?? item.id] = item.quantity; });
    return result;
  });
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
  const [addressId, setAddressId] = useState(initialSource.addressId || defaultAddress?.id || "");
  const [clientComment, setClientComment] = useState(initialSource.clientComment || "");
  const [missingFields, setMissingFields] = useState({ date: false, address: false });
  const summaryDateFieldRef = useRef(null);
  const summaryAddressFieldRef = useRef(null);
  const cartDateFieldRef = useRef(null);
  const cartAddressFieldRef = useRef(null);
  const earliestDeliveryDate = getEarliestDeliveryDateIso();

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
  };

  const updateAddressId = (value) => {
    setAddressId(value);
    if (value) setMissingFields((current) => ({ ...current, address: false }));
  };

  const focusMissingFields = (dateMissing, addressMissing) => {
    setMissingFields({ date: dateMissing, address: addressMissing });
    const isNarrow =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia(CATALOG_NARROW_MQ).matches;

    if (isNarrow) {
      setCartSheetOpen(true);
    }

    window.setTimeout(() => {
      const target = dateMissing
        ? (isNarrow ? cartDateFieldRef.current : summaryDateFieldRef.current)
        : (isNarrow ? cartAddressFieldRef.current : summaryAddressFieldRef.current);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, isNarrow ? 80 : 0);
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
      const unit = units[product.id] || product.saleUnits[0];
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

  const total = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0) + customItems.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
  const cartCount = selectedItems.length + customItems.length;
  const selectedAddress = addresses.find((item) => item.id === addressId);
  const deliveryDateParts = getDeliveryDateParts(deliveryDate);

  useEffect(() => {
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

  // Пока открыта корзина/календарь — фон страницы не листается (iOS/Android).
  useEffect(() => {
    if (!cartSheetOpen && !datePickerOpen) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      body.style.left = previous.bodyLeft;
      body.style.right = previous.bodyRight;
      window.scrollTo(0, scrollY);
    };
  }, [cartSheetOpen, datePickerOpen]);

  const changeQuantity = (id, delta) => {
    setCart((current) => {
      const nextValue = Math.max(0, (Number(current[id]) || 0) + delta);
      const next = { ...current };
      if (nextValue) next[id] = nextValue; else delete next[id];
      return next;
    });
  };

  const setItemQuantity = (id, value) => {
    const nextValue = Math.max(0, Number.parseInt(value, 10) || 0);
    setCart((current) => {
      const next = { ...current };
      if (nextValue) next[id] = nextValue; else delete next[id];
      return next;
    });
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

  const submitOrder = async () => {
    if (!selectedItems.length && !customItems.length) {
      await appAlert({
        title: "Корзина пуста",
        message: "Добавьте хотя бы один товар.",
        tone: "warn",
      });
      return;
    }
    const dateMissing = !deliveryDate;
    const addressMissing = !selectedAddress;
    if (dateMissing || addressMissing) {
      focusMissingFields(dateMissing, addressMissing);
      if (dateMissing) {
        setDatePickerOpen(true);
        return;
      }
      await appAlert({
        title: "Укажите адрес доставки",
        message: "Выберите адрес из списка или добавьте новый.",
        tone: "warn",
      });
      return;
    }
    const dateCheck = validateDeliveryDate(deliveryDate);
    if (!dateCheck.ok) {
      focusMissingFields(true, false);
      setDeliveryDate("");
      setDatePickerOpen(true);
      return;
    }
    setMissingFields({ date: false, address: false });
    onSave({
      items: selectedItems,
      customItems,
      firstDeliveryDate: deliveryDate,
      addressId,
      address: selectedAddress.address,
      addressLabel: selectedAddress.label,
      clientComment: clientComment.trim(),
    });
    localStorage.removeItem(STORAGE.draft);
    setCartSheetOpen(false);
  };

  const confirmDeliveryDateAndSubmit = () => {
    if (!deliveryDate || !validateDeliveryDate(deliveryDate).ok) return;
    setDatePickerOpen(false);
    void submitOrder();
  };

  const submit = (event) => {
    event.preventDefault();
    submitOrder();
  };

  const catalogBody = (
      <section className={embedded ? "catalog-content embedded-catalog" : "catalog-content"}>
        <div className="catalog-layout">
          <form className="order-summary" id="order-summary" onSubmit={submit}>
            <h2>Ваш заказ</h2>
            {!selectedItems.length && !customItems.length ? (
              <EmptyState
                title="Корзина пуста"
                message="Добавьте товар из каталога или запросите отсутствующую позицию."
                actionLabel="К каталогу"
                onAction={() => {
                  document.querySelector(".product-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            ) : (
              <div className="summary-list">
                {selectedItems.map((item) => (
                  <div className="summary-item" key={item.productId}>
                    <span>{item.name}<small>{item.multiplier > 1 ? `${item.quantity * item.multiplier} шт. всего` : item.category}</small></span>
                    <strong>{item.quantity} {UNIT_CONFIG[item.unit].shortLabel}<small>{settings.showPrices && item.lineTotal > 0 ? formatMoney(item.lineTotal) : ""}</small></strong>
                  </div>
                ))}
                {customItems.map((item) => (
                  <div className="summary-item custom-line" key={item.id}>
                    <span>
                      {item.name}
                      <small>Товар вне матрицы · {item.details || "без уточнений"}</small>
                      <CustomRequestPhoto photo={item.photo} className="custom-request-photo-small" />
                    </span>
                    <strong>{item.quantity} {item.unit}<button className="danger-text" style={{ border: 0, background: "transparent", fontSize: 9 }} type="button" onClick={() => setCustomItems((current) => current.filter((value) => value.id !== item.id))}>Убрать</button></strong>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`field delivery-date-field${missingFields.date ? " is-invalid" : ""}`}
              ref={summaryDateFieldRef}
            >
              <span>Дата доставки</span>
              <button
                className={`delivery-date-trigger delivery-date-trigger-desktop${deliveryDateParts ? " is-selected" : ""}${missingFields.date ? " is-invalid" : ""}`}
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
              {deliveryDateParts && (
                <p className="delivery-date-desktop-hint muted small">
                  Выбрано: {deliveryDateParts.weekday}, {deliveryDateParts.monthYear}
                </p>
              )}
              <p className="muted small" style={{ marginTop: 6 }}>
                Ближайшая доставка: с {earliestDeliveryDate.split("-").reverse().join(".")}. Воскресенье недоступно.
              </p>
              {missingFields.date && (
                <p className="field-error-hint">Укажите дату доставки</p>
              )}
            </div>
            <label
              className={`field${missingFields.address ? " is-invalid" : ""}`}
              style={{ marginTop: 10 }}
              ref={summaryAddressFieldRef}
            >
              Адрес доставки
              <select
                value={addressId}
                onChange={(e) => updateAddressId(e.target.value)}
                required
                aria-invalid={missingFields.address}
              >
                <option value="">Выберите адрес</option>
                {addresses.map((item) => <option value={item.id} key={item.id}>{item.label}{item.isDefault ? " — основной" : ""} · {item.address}</option>)}
              </select>
              {missingFields.address && (
                <span className="field-error-hint">Укажите адрес доставки</span>
              )}
            </label>
            <label className="field" style={{ marginTop: 10 }}>Комментарий к заказу
              <textarea
                rows="3"
                placeholder="Например: позвонить перед доставкой, запросить интересующий товар"
                value={clientComment}
                onChange={(e) => setClientComment(e.target.value)}
              />
            </label>
            <div className="summary-total"><span>Итого</span><strong>{settings.showPrices && total > 0 ? formatMoney(total) : `${selectedItems.length + customItems.length} поз.`}</strong></div>
            {settings.enableDrafts && session.mode === "new" && <p className="summary-note">Черновик автоматически сохраняется в этом браузере.</p>}
            <button className="save-order-button" type="submit">{session.mode === "edit" ? "Сохранить изменения" : "Оформить заказ"}</button>
          </form>

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
                товаров и персональные цены. Нужный товар можно указать
                в комментарии к заказу.
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
                <input className="catalog-search" type="search" placeholder="Поиск по названию или коду" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              </div>
              <div className="category-list">
                {categories.map((item) => <button className={category === item ? "category-button active" : "category-button"} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}
              </div>
            </div>

            <section className="product-grid">
              {filtered.map((product) => {
                const unit = units[product.id] || product.saleUnits[0];
                const quantity = Number(cart[product.id]) || 0;
                const multiplier = getUnitMultiplier(product, unit);
                const price = getUnitPrice(product, unit);
                return (
                  <article className="product-card" key={product.id}>
                    <div className="product-card-top">
                      <span className="product-category">{product.category}</span>
                      {settings.showFavorites && <button className={favorites.includes(product.id) ? "favorite-button active" : "favorite-button"} type="button" onClick={() => setFavorites((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])}>★</button>}
                    </div>
                    <div className="product-image-wrap">
                      {product.imageUrl ? (
                        <img className="product-image" src={product.imageUrl} alt={product.name} />
                      ) : (
                        <span className="product-image-placeholder">Фото товара пока не загружено</span>
                      )}
                    </div>
                    <h2>{product.name}</h2>
                    <p className="product-code">Код: {product.code}</p>
                    <p className="product-price">
                      {settings.showPrices && price > 0
                        ? <>{formatMoney(price)} <small>/ {UNIT_CONFIG[unit].shortLabel}</small></>
                        : "Цена уточняется"}
                    </p>
                    <div className="product-card-controls">
                      <div className="unit-choice">
                        {UNIT_ORDER.filter((item) => product.saleUnits.includes(item)).map((item) => (
                          <button className={unit === item ? "active" : ""} type="button" key={item} onClick={() => setUnits((current) => ({ ...current, [product.id]: item }))}>{UNIT_CONFIG[item].label}</button>
                        ))}
                      </div>
                      <p className="unit-hint">{multiplier > 1 ? `1 ${UNIT_CONFIG[unit].label.toLowerCase()} = ${multiplier} шт.` : "Количество считается поштучно"}</p>
                      <div className="quantity-control">
                        <button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label="Уменьшить">−</button>
                        <div className="quantity-input-wrap">
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={quantity || ""}
                            placeholder="0"
                            onChange={(e) => setItemQuantity(product.id, e.target.value)}
                          />
                          <small>{UNIT_CONFIG[unit].shortLabel}</small>
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

        <div className="mobile-checkout-bar" aria-label="Быстрое оформление">
          <div className="mobile-checkout-bar-info">
            <strong>{cartCount} поз.</strong>
            <span>{settings.showPrices && total > 0 ? formatMoney(total) : "Сумма уточняется"}</span>
          </div>
          <button
            className="mobile-checkout-bar-cart"
            type="button"
            onClick={() => setCartSheetOpen(true)}
          >
            Корзина
          </button>
          <button
            className="mobile-checkout-bar-button"
            type="button"
            onClick={submitOrder}
          >
            {session.mode === "edit" ? "Сохранить" : "Оформить"}
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
                        <div className="unit-choice cart-sheet-units">
                          {UNIT_ORDER.filter((unitId) => {
                            const product = products.find((row) => String(row.id) === String(item.productId));
                            return product?.saleUnits?.includes(unitId);
                          }).map((unitId) => (
                            <button
                              className={item.unit === unitId ? "active" : ""}
                              type="button"
                              key={unitId}
                              onClick={() => setUnits((current) => ({ ...current, [item.productId]: unitId }))}
                            >
                              {UNIT_CONFIG[unitId].label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="quantity-control cart-sheet-qty">
                        <button type="button" onClick={() => changeQuantity(item.productId, -1)} aria-label="Уменьшить">−</button>
                        <div className="quantity-input-wrap">
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={item.quantity || ""}
                            onChange={(e) => setItemQuantity(item.productId, e.target.value)}
                          />
                          <small>{UNIT_CONFIG[item.unit].shortLabel}</small>
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

              <label className="field cart-sheet-comment">
                Комментарий к заказу
                <textarea
                  rows="3"
                  placeholder="Например: позвонить перед доставкой, запросить интересующий товар"
                  value={clientComment}
                  onChange={(e) => setClientComment(e.target.value)}
                />
              </label>

              <div className="cart-sheet-footer">
                <div className="cart-sheet-total">
                  <span>Итого</span>
                  <strong>{settings.showPrices && total > 0 ? formatMoney(total) : `${cartCount} поз.`}</strong>
                </div>
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
              onClick={() => setDatePickerOpen(false)}
            />
            <div className="delivery-date-sheet-panel">
              <div className="delivery-date-sheet-head">
                <strong>Дата доставки</strong>
                <button className="header-button" type="button" onClick={() => setDatePickerOpen(false)}>
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
              <button
                className="primary-button save-order-button delivery-date-sheet-submit"
                type="button"
                disabled={!deliveryDate || !validateDeliveryDate(deliveryDate).ok}
                onClick={confirmDeliveryDateAndSubmit}
              >
                {session.mode === "edit" ? "Сохранить изменения" : "Оформить заказ"}
              </button>
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
