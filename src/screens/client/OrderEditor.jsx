// Редактор заказа клиента: каталог, корзина и оформление.
import { useEffect, useMemo, useState } from "react";
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
} from "../../shared/appHelpers";
import { ManagerContact } from "./ManagerContact";
import { CustomItemForm } from "./CustomItemForm";

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
  const [deliveryDate, setDeliveryDate] = useState(initialSource.firstDeliveryDate || "");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [addressId, setAddressId] = useState(initialSource.addressId || defaultAddress?.id || "");
  const [clientComment, setClientComment] = useState(initialSource.clientComment || "");

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

  const changeQuantity = (id, delta) => {
    setCart((current) => {
      const nextValue = Math.max(0, (Number(current[id]) || 0) + delta);
      const next = { ...current };
      if (nextValue) next[id] = nextValue; else delete next[id];
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!selectedItems.length && !customItems.length) return alert("Добавьте хотя бы один товар.");
    if (!deliveryDate || !selectedAddress) return alert("Укажите дату и адрес доставки.");
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
  };

  const catalogBody = (
      <section className={embedded ? "catalog-content embedded-catalog" : "catalog-content"}>
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Каталог</p>
            <h1>
              {session.mode === "edit"
                ? "Редактирование заказа"
                : session.mode === "repeat"
                  ? "Повтор заказа"
                  : "Новый заказ"}
            </h1>
            <p>Сверху — заказ и оформление, ниже — каталог товаров.</p>
          </div>
          <div className="mini-card"><span className="mini-label">Позиций</span><strong>{selectedItems.length + customItems.length}</strong></div>
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

        <div className="catalog-layout">
          <form className="order-summary" id="order-summary" onSubmit={submit}>
            <h2>Ваш заказ</h2>
            {!selectedItems.length && !customItems.length ? <p className="summary-empty">Добавьте товар из каталога или запросите отсутствующую позицию.</p> : (
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

            <div className="field delivery-date-field">
              <span>Дата доставки</span>
              <input
                className="delivery-date-input-desktop"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
              <button
                className={`delivery-date-trigger${deliveryDateParts ? " is-selected" : ""}`}
                type="button"
                onClick={() => setDatePickerOpen(true)}
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
            </div>
            <label className="field" style={{ marginTop: 10 }}>Адрес доставки
              <select value={addressId} onChange={(e) => setAddressId(e.target.value)} required>
                <option value="">Выберите адрес</option>
                {addresses.map((item) => <option value={item.id} key={item.id}>{item.label}{item.isDefault ? " — основной" : ""} · {item.address}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginTop: 10 }}>Комментарий к заказу
              <textarea rows="3" placeholder="Например: позвонить перед доставкой" value={clientComment} onChange={(e) => setClientComment(e.target.value)} />
            </label>
            <div className="summary-total"><span>Итого</span><strong>{settings.showPrices && total > 0 ? formatMoney(total) : `${selectedItems.length + customItems.length} поз.`}</strong></div>
            {settings.enableDrafts && session.mode === "new" && <p className="summary-note">Черновик автоматически сохраняется в этом браузере.</p>}
            <button className="save-order-button" type="submit">{session.mode === "edit" ? "Сохранить изменения" : "Оформить заказ"}</button>
          </form>

          <div>
            <div className="catalog-toolbar">
              <div className="catalog-filter-row">
                <input className="catalog-search" type="search" placeholder="Поиск по названию или коду" value={search} onChange={(e) => setSearch(e.target.value)} />
                {settings.showFavorites && <button className={favoritesOnly ? "category-button active" : "category-button"} type="button" onClick={() => setFavoritesOnly((value) => !value)}>★ Избранное</button>}
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
                    <div className="unit-choice">
                      {UNIT_ORDER.filter((item) => product.saleUnits.includes(item)).map((item) => (
                        <button className={unit === item ? "active" : ""} type="button" key={item} onClick={() => setUnits((current) => ({ ...current, [product.id]: item }))}>{UNIT_CONFIG[item].label}</button>
                      ))}
                    </div>
                    <p className="unit-hint">{multiplier > 1 ? `1 ${UNIT_CONFIG[unit].label.toLowerCase()} = ${multiplier} шт.` : "Количество считается поштучно"}</p>
                    <div className="quantity-control">
                      <button type="button" onClick={() => changeQuantity(product.id, -1)}>−</button>
                      <div className="quantity-input-wrap"><input className="quantity-input" type="number" min="0" value={quantity || ""} placeholder="0" onChange={(e) => setCart((current) => ({ ...current, [product.id]: Math.max(0, Number.parseInt(e.target.value, 10) || 0) }))} /><small>{UNIT_CONFIG[unit].shortLabel}</small></div>
                      <button type="button" onClick={() => changeQuantity(product.id, 1)}>+</button>
                    </div>
                  </article>
                );
              })}
              {!filtered.length && <div className="empty-box">Товары не найдены.</div>}
              {settings.allowCustomItems && <CustomItemForm onAdd={(item) => setCustomItems((current) => [...current, item])} />}
            </section>
          </div>
        </div>

        <div className="mobile-checkout-bar" aria-label="Быстрое оформление">
          <div className="mobile-checkout-bar-info">
            <strong>{selectedItems.length + customItems.length} поз.</strong>
            <span>{settings.showPrices && total > 0 ? formatMoney(total) : "Сумма уточняется"}</span>
          </div>
          <button
            className="mobile-checkout-bar-button"
            type="button"
            onClick={() => {
              const form = document.getElementById("order-summary");
              if (!form) return;
              if (typeof form.requestSubmit === "function") form.requestSubmit();
              else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }}
          >
            {session.mode === "edit" ? "Сохранить" : "Оформить"}
          </button>
        </div>

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
              <label className="field">
                Выберите день
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  autoFocus
                />
              </label>
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
        <ManagerContact settings={settings} profile={profile} orders={orders} />
        <button className="header-button" type="button" onClick={onClose}>← В кабинет</button>
      </Header>
      {catalogBody}
    </main>
  );
}
