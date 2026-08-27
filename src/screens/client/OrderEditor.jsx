// Редактор заказа клиента: каталог, корзина и оформление.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  getUnitOrderStep,
  toQuantityInputValue,
  fromQuantityInputValue,
  quantityInputStep,
  quantityInputUnitLabel,
  orderedSaleUnits,
  productArticle,
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
} from "../../shared/appHelpers";
import {
  getEarliestDeliveryDateIso,
  validateDeliveryDate,
} from "../../shared/deliveryDateRules";
import {
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  getSpbDeliveryFee,
} from "../../config/orderConfig";
import { productImageSrc } from "../../shared/productPhoto";
import { ManagerContact } from "./ManagerContact";
import { DeliveryDateCalendar } from "./DeliveryDateCalendar";
import { CatalogSearchInput } from "./CatalogSearchInput";
import { appAlert, appConfirm } from "../../shared/AppModal";
import { EmptyState } from "../../shared/uxFeedback";

function CatalogViewToggleIcon({ variant }) {
  if (variant === "list") {
    return (
      <span className="view-toggle-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect x="2" y="3.5" width="12" height="1.75" rx="0.875" fill="currentColor" />
          <rect x="2" y="7.125" width="12" height="1.75" rx="0.875" fill="currentColor" />
          <rect x="2" y="10.75" width="12" height="1.75" rx="0.875" fill="currentColor" />
        </svg>
      </span>
    );
  }

  return (
    <span className="view-toggle-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="1.5" y="1.5" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
        <rect x="8.75" y="1.5" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
        <rect x="1.5" y="8.75" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
        <rect x="8.75" y="8.75" width="5.75" height="5.75" rx="1.25" fill="currentColor" />
      </svg>
    </span>
  );
}

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
  profile: _profile,
  orders: _orders,
  catalogPolicy,
  showFullCatalog: _showFullCatalog,
  setShowFullCatalog: _setShowFullCatalog,
  onClose,
  onSave,
  onOpenCatalogAdd: _onOpenCatalogAdd,
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
  const catalogLayoutRef = useRef(null);
  const catalogHostRef = useRef(null);
  const catalogToolbarRef = useRef(null);
  const cartSlotRef = useRef(null);
  const cartPanelRef = useRef(null);
  const earliestDeliveryDate = getEarliestDeliveryDateIso();

  // Один layout-pass: сначала сетка каталог|корзина, потом fixed-тулбар.
  // Иначе на первом входе тулбар меряется на всю ширину и «залипает» до F5.
  useLayoutEffect(() => {
    if (!embedded || typeof window === "undefined") return undefined;

    const shell = catalogLayoutRef.current;
    const slot = cartSlotRef.current;
    const cart = cartPanelRef.current;
    const catalog = catalogHostRef.current;
    const toolbar = catalogToolbarRef.current;
    if (!shell || !catalog) return undefined;

    const clearShell = () => {
      ["display", "grid-template-columns", "column-gap", "gap", "align-items", "width", "box-sizing"].forEach((n) =>
        shell.style.removeProperty(n)
      );
      ["min-width", "max-width", "overflow", "overflow-x", "width"].forEach((n) =>
        catalog.style.removeProperty(n)
      );
      if (slot) {
        ["width", "min-width", "max-width", "min-height", "height"].forEach((n) =>
          slot.style.removeProperty(n)
        );
      }
      if (cart) {
        [
          "display",
          "width",
          "min-width",
          "max-width",
          "position",
          "top",
          "left",
          "right",
          "inset",
          "float",
          "transform",
          "margin",
          "z-index",
          "box-sizing",
          "padding",
          "border-radius",
          "align-self",
        ].forEach((n) => cart.style.removeProperty(n));
      }
    };

    const clearToolbar = () => {
      catalog.style.removeProperty("--catalog-order-chrome-h");
      if (!toolbar) return;
      ["position", "top", "left", "width", "max-width", "right", "z-index", "visibility"].forEach((n) =>
        toolbar.style.removeProperty(n)
      );
    };

    const applyDesktopShell = () => {
      shell.style.setProperty("display", "grid", "important");
      shell.style.setProperty("grid-template-columns", "minmax(0, 1fr) 300px", "important");
      shell.style.setProperty("column-gap", "20px", "important");
      shell.style.setProperty("align-items", "start", "important");
      shell.style.setProperty("width", "100%", "important");
      shell.style.setProperty("box-sizing", "border-box", "important");

      catalog.style.setProperty("min-width", "0", "important");
      catalog.style.setProperty("max-width", "100%", "important");
      catalog.style.setProperty("overflow-x", "hidden", "important");

      if (slot) {
        slot.style.setProperty("width", "300px", "important");
        slot.style.setProperty("min-width", "300px", "important");
        slot.style.setProperty("max-width", "300px", "important");
      }

      if (cart && slot) {
        const slotRect = slot.getBoundingClientRect();
        const left = Math.max(0, Math.round(slotRect.left));
        cart.style.setProperty("display", "block", "important");
        cart.style.setProperty("position", "fixed", "important");
        cart.style.setProperty("top", "var(--clover-chrome-offset, 56px)", "important");
        cart.style.setProperty("left", `${left}px`, "important");
        cart.style.setProperty("width", "300px", "important");
        cart.style.setProperty("min-width", "300px", "important");
        cart.style.setProperty("max-width", "300px", "important");
        cart.style.setProperty("right", "auto", "important");
        cart.style.setProperty("inset", "auto", "important");
        cart.style.setProperty("float", "none", "important");
        cart.style.setProperty("transform", "none", "important");
        cart.style.setProperty("margin", "0", "important");
        cart.style.setProperty("z-index", "90", "important");
        cart.style.setProperty("box-sizing", "border-box", "important");
        cart.style.setProperty("padding", "18px 16px", "important");
        cart.style.setProperty("border-radius", "16px", "important");
        cart.style.setProperty("align-self", "start", "important");
        const cartH = Math.ceil(cart.getBoundingClientRect().height);
        slot.style.setProperty("min-height", `${Math.max(cartH, 1)}px`, "important");
      }
    };

    const applyToolbar = () => {
      if (!toolbar) return;

      const hostBox = catalog.getBoundingClientRect();
      let left = Math.max(0, Math.round(hostBox.left));
      let width = Math.max(0, Math.round(hostBox.width));

      // До слота корзины минус gap — страховка, если колонка ещё на всю ширину.
      if (slot && window.matchMedia("(min-width: 901px)").matches) {
        const slotBox = slot.getBoundingClientRect();
        const gap = 20;
        const untilSlot = Math.round(slotBox.left - gap - hostBox.left);
        if (untilSlot > 120) width = untilSlot;
      }

      toolbar.style.setProperty("position", "fixed", "important");
      toolbar.style.setProperty("top", "var(--clover-chrome-offset, 56px)", "important");
      toolbar.style.setProperty("left", `${left}px`, "important");
      toolbar.style.setProperty("width", `${width}px`, "important");
      toolbar.style.setProperty("max-width", `${width}px`, "important");
      toolbar.style.setProperty("right", "auto", "important");
      toolbar.style.setProperty("z-index", "95", "important");
      toolbar.style.setProperty("visibility", "visible", "important");

      const toolbarRect = toolbar.getBoundingClientRect();
      const hostTopDoc = catalog.getBoundingClientRect().top + window.scrollY;
      const alreadyBelow = hostTopDoc - toolbarRect.top;
      const height = Math.max(
        0,
        Math.ceil(toolbarRect.height - Math.max(0, alreadyBelow))
      );
      catalog.style.setProperty("--catalog-order-chrome-h", `${height}px`);
    };

    const apply = () => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        clearShell();
        clearToolbar();
        return;
      }
      applyDesktopShell();
      applyToolbar();
    };

    if (toolbar) {
      toolbar.style.setProperty("visibility", "hidden", "important");
    }

    apply();
    const raf1 = window.requestAnimationFrame(() => {
      apply();
      window.requestAnimationFrame(apply);
    });

    const mq = window.matchMedia("(min-width: 901px)");
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", apply, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(shell);
    ro?.observe(catalog);
    if (slot) ro?.observe(slot);
    if (cart) ro?.observe(cart);
    // Не observe(toolbar): смена width/height иначе крутит ResizeObserver.

    return () => {
      window.cancelAnimationFrame(raf1);
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", apply, true);
      ro?.disconnect();
      clearShell();
      clearToolbar();
    };
  }, [embedded]);

  // Один адрес в списке — всегда подставляем автоматически.
  useEffect(() => {
    if (addresses.length !== 1) return;
    const soleId = addresses[0].id;
    if (addressId !== soleId) {
      setAddressId(soleId);
      setMissingFields((current) => ({ ...current, address: false }));
    }
  }, [addresses, addressId]);

  useLayoutEffect(() => {
    if (!cartSheetOpen && !datePickerOpen) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    html.classList.add("clover-cart-open");
    body.classList.add("clover-cart-open");
    html.style.overflow = "hidden";
    html.style.overflowX = "hidden";
    body.style.overflow = "hidden";
    body.style.overflowX = "hidden";
    body.style.position = "fixed";
    body.style.left = "0";
    body.style.width = "100%";
    body.style.maxWidth = "100%";
    body.style.top = `-${scrollY}px`;

    let startX = 0;
    let startY = 0;
    const scrollRoot = (event) =>
      event.target instanceof Element
        ? event.target.closest(".cart-sheet-scroll, .delivery-date-sheet-panel")
        : null;
    const onTouchStart = (event) => {
      startX = event.touches[0]?.clientX ?? 0;
      startY = event.touches[0]?.clientY ?? 0;
      const scroll = scrollRoot(event);
      if (!scroll) return;
      const max = scroll.scrollHeight - scroll.clientHeight;
      if (max <= 0) return;
      if (scroll.scrollTop <= 0) scroll.scrollTop = 1;
      else if (scroll.scrollTop >= max) scroll.scrollTop = max - 1;
    };
    const onTouchMove = (event) => {
      const x = event.touches[0]?.clientX ?? startX;
      const y = event.touches[0]?.clientY ?? startY;
      const dx = x - startX;
      const dy = y - startY;
      if (Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault();
        return;
      }
      const scroll = scrollRoot(event);
      if (!scroll) {
        event.preventDefault();
        return;
      }
      const max = scroll.scrollHeight - scroll.clientHeight;
      const atTop = scroll.scrollTop <= 0;
      const atBottom = scroll.scrollTop >= max - 1;
      if (max <= 0 || (atTop && dy > 0) || (atBottom && dy < 0)) {
        event.preventDefault();
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      html.classList.remove("clover-cart-open");
      body.classList.remove("clover-cart-open");
      html.style.overflow = "";
      html.style.overflowX = "";
      body.style.overflow = "";
      body.style.overflowX = "";
      body.style.position = "";
      body.style.left = "";
      body.style.width = "";
      body.style.maxWidth = "";
      body.style.top = "";
      window.scrollTo(0, scrollY);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [cartSheetOpen, datePickerOpen]);

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
    return products.filter((item) => {
      const byCategory = category === "Все" || item.category === category;
      const bySearch = matchesCatalogPrefixSearch(
        productCatalogSearchHaystack(item),
        search
      );
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
        code: productArticle(product),
        oneCId: product.oneCId || "",
        oneCCode: String(product.oneCCode || product.oneCMatchCode || "").trim(),
        name: product.name,
        category: product.category,
        quantity,
        unit,
        multiplier: getUnitMultiplier(product, unit),
        orderStep: getUnitOrderStep(product, unit),
        unitPrice,
        lineTotal: quantity * unitPrice,
        pieceSize: product.pieceSize,
        pieceOrderMultiple: product.pieceOrderMultiple,
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
  const deliveryFee =
    settings.showPrices && total > 0 ? getSpbDeliveryFee(total) : 0;
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

  const changeQuantity = (id, delta, step = 1) => {
    const orderStep = Math.max(1, Number(step) || 1);
    clearQtyDraft(id);
    setCart((current) => {
      const nextValue = Math.max(
        0,
        (Number(current[id]) || 0) + delta * orderStep
      );
      const next = { ...current };
      if (nextValue) next[id] = nextValue;
      else delete next[id];
      return next;
    });
  };

  const setItemQuantity = (id, value, multiplier = 1, orderStep = 1) => {
    const nextValue = fromQuantityInputValue(value, multiplier, orderStep);
    setCart((current) => {
      const next = { ...current };
      if (nextValue) next[id] = nextValue;
      else delete next[id];
      return next;
    });
  };

  const commitQtyDraft = (id, multiplier = 1, orderStep = 1) => {
    if (qtyDrafts[id] === undefined) return;
    setItemQuantity(id, qtyDrafts[id], multiplier, orderStep);
    clearQtyDraft(id);
  };

  const quantityFieldValue = (id, quantity, multiplier) => {
    if (qtyDrafts[id] !== undefined) return qtyDrafts[id];
    return quantity ? String(toQuantityInputValue(quantity, multiplier)) : "";
  };

  const setProductUnit = (productId, nextUnit) => {
    const product = products.find((item) => item.id === productId);
    const currentUnit =
      units[productId] || (product ? orderedSaleUnits(product)[0] : nextUnit);
    if (currentUnit === nextUnit) return;

    clearQtyDraft(productId);
    setUnits((current) => ({ ...current, [productId]: nextUnit }));
    setCart((current) => {
      if (!(productId in current)) return current;
      const next = { ...current };
      delete next[productId];
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

    const deliveryFee =
      settings.showPrices && total > 0 ? getSpbDeliveryFee(total) : 0;
    if (deliveryFee > 0) {
      const needMore = Math.max(0, FREE_DELIVERY_MIN_TOTAL - total);
      const ok = await appConfirm({
        title: "Платная доставка",
        message:
          `Сумма заказа меньше ${formatMoney(FREE_DELIVERY_MIN_TOTAL)}. ` +
          `Доставка по Санкт-Петербургу — ${formatMoney(PAID_DELIVERY_FEE)}. ` +
          `Добавьте товаров ещё на ${formatMoney(needMore)} для бесплатной доставки ` +
          `либо оформите заказ с платной доставкой.`,
        confirmLabel: `Оформить (+${formatMoney(PAID_DELIVERY_FEE)})`,
        cancelLabel: "Вернуться к заказу",
        tone: "warn",
      });
      if (!ok) return;
    }

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
        deliveryFee,
        deliveryNote:
          deliveryFee > 0
            ? `Доставка по СПб платная: ${PAID_DELIVERY_FEE} ₽ (заказ менее ${FREE_DELIVERY_MIN_TOTAL} ₽)`
            : "Доставка по СПб бесплатная",
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

  const catalogBody = (
      <section
        className={embedded ? "catalog-content embedded-catalog client-order-catalog" : "catalog-content"}
      >
        {embedded ? (
          <style>{`
/* Shell: каталог | корзина 300px */
@media (min-width: 901px) {
  .lk-order-shell[data-lk-shell="v3"] {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 300px !important;
    column-gap: 20px !important;
    align-items: start !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .lk-order-shell[data-lk-shell="v3"] > .lk-order-catalog {
    min-width: 0 !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
  }
  .lk-order-shell[data-lk-shell="v3"] > .lk-order-cart-slot {
    width: 300px !important;
    min-width: 300px !important;
    max-width: 300px !important;
    box-sizing: border-box !important;
  }
  .lk-order-shell[data-lk-shell="v3"] .lk-order-cart {
    display: block !important;
    width: 300px !important;
    min-width: 300px !important;
    max-width: 300px !important;
    position: fixed !important;
    top: var(--clover-chrome-offset, 56px) !important;
    z-index: 90 !important;
    margin: 0 !important;
    padding: 18px 16px !important;
    border-radius: 16px !important;
    box-sizing: border-box !important;
  }
}
@media (max-width: 900px) {
  .lk-order-shell[data-lk-shell="v3"] > .lk-order-cart-slot,
  .lk-order-shell[data-lk-shell="v3"] .lk-order-cart { display: none !important; }
}

/* Тулбар эталон «Буду поздно» — fixed в колонке каталога (4 карточки) */
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar,
.client-order-catalog .client-order-catalog-toolbar,
main.clover-app > .client-order-catalog-toolbar {
  margin: 0 !important;
  padding: 8px 10px 10px !important;
  box-sizing: border-box !important;
}
.embedded-catalog.client-order-catalog .client-order-catalog-toolbar,
.lk-order-catalog > .client-order-catalog-toolbar {
  position: relative !important;
  top: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  z-index: 95 !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar::before,
.client-order-catalog .client-order-catalog-toolbar::before,
main.clover-app > .client-order-catalog-toolbar::before {
  left: 0 !important;
  right: 0 !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar-spacer,
.client-order-catalog .client-order-catalog-toolbar-spacer {
  display: block !important;
  height: var(--catalog-order-chrome-h, 80px) !important;
  margin: 0 !important;
  pointer-events: none !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .catalog-search,
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .catalog-search-input,
.client-order-catalog .client-order-catalog-toolbar .catalog-search,
.client-order-catalog .client-order-catalog-toolbar .catalog-search-input,
main.clover-app > .client-order-catalog-toolbar .catalog-search,
main.clover-app > .client-order-catalog-toolbar .catalog-search-input {
  min-height: 36px !important;
  height: 36px !important;
  max-height: 36px !important;
  padding: 6px 12px !important;
  font-size: 14px !important;
  line-height: 1.2 !important;
  border-radius: 10px !important;
  box-sizing: border-box !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .catalog-filter-actions,
.client-order-catalog .client-order-catalog-toolbar .catalog-filter-actions,
main.clover-app > .client-order-catalog-toolbar .catalog-filter-actions {
  gap: 6px !important;
  align-items: center !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .catalog-view-toggle,
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .catalog-view-toggle button,
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .catalog-filter-actions > .category-button,
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .client-order-positions-chip,
.client-order-catalog .client-order-catalog-toolbar .catalog-view-toggle,
.client-order-catalog .client-order-catalog-toolbar .catalog-view-toggle button,
.client-order-catalog .client-order-catalog-toolbar .catalog-filter-actions > .category-button,
.client-order-catalog .client-order-catalog-toolbar .client-order-positions-chip,
main.clover-app > .client-order-catalog-toolbar .catalog-view-toggle,
main.clover-app > .client-order-catalog-toolbar .catalog-view-toggle button,
main.clover-app > .client-order-catalog-toolbar .catalog-filter-actions > .category-button,
main.clover-app > .client-order-catalog-toolbar .client-order-positions-chip {
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  box-sizing: border-box !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .catalog-view-toggle button,
.client-order-catalog .client-order-catalog-toolbar .catalog-view-toggle button,
main.clover-app > .client-order-catalog-toolbar .catalog-view-toggle button {
  min-width: 36px !important;
  width: 36px !important;
  padding: 0 !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .category-list,
.client-order-catalog .client-order-catalog-toolbar .category-list,
main.clover-app > .client-order-catalog-toolbar .category-list {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  height: auto !important;
  min-height: 32px !important;
  max-height: none !important;
  gap: 6px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  width: 100% !important;
}
@media (max-width: 900px) {
  .lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .category-list,
  .client-order-catalog .client-order-catalog-toolbar .category-list,
  main.clover-app > .client-order-catalog-toolbar .category-list {
    flex-wrap: nowrap !important;
    height: 32px !important;
    max-height: 32px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    overscroll-behavior-x: contain !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
  }
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .category-list::-webkit-scrollbar,
.client-order-catalog .client-order-catalog-toolbar .category-list::-webkit-scrollbar,
main.clover-app > .client-order-catalog-toolbar .category-list::-webkit-scrollbar {
  display: none !important;
  height: 0 !important;
  width: 0 !important;
}
.lk-order-shell[data-lk-shell="v3"] .client-order-catalog-toolbar .category-list .category-button,
.client-order-catalog .client-order-catalog-toolbar .category-list .category-button,
main.clover-app > .client-order-catalog-toolbar .category-list .category-button {
  flex: 0 0 auto !important;
  height: 32px !important;
  min-height: 32px !important;
  max-height: 32px !important;
  padding: 0 10px !important;
  font-size: 12px !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  border-radius: 10px !important;
  box-sizing: border-box !important;
}
          `}</style>
        ) : null}
        <div
          className={embedded ? "lk-order-shell" : "catalog-layout"}
          ref={embedded ? catalogLayoutRef : undefined}
          data-lk-shell={embedded ? "v3" : undefined}
        >
          <div
            className={embedded ? "lk-order-catalog" : "catalog-main"}
            ref={embedded ? catalogHostRef : undefined}
          >
            {/* В embedded заголовок убираем — toolbar fixed занимает верх колонки. */}
            {!embedded ? (
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
                <div className="mini-card">
                  <span className="mini-label">Позиций</span>
                  <strong>{cartCount}</strong>
                </div>
              </div>
            ) : null}

            {(() => {
              const toolbar = (
                <div
                  className={
                    embedded
                      ? "catalog-toolbar client-order-catalog-toolbar"
                      : "catalog-toolbar"
                  }
                  ref={embedded ? catalogToolbarRef : undefined}
                >
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
                          <CatalogViewToggleIcon variant="cards" />
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
                          <CatalogViewToggleIcon variant="list" />
                          <span className="view-toggle-label">Список</span>
                        </button>
                      </div>
                      {embedded ? (
                        <div className="mini-card client-order-positions-chip">
                          <span className="mini-label">Позиций</span>
                          <strong>{cartCount}</strong>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="category-list">
                    {categories.map((item) => (
                      <button
                        className={category === item ? "category-button active" : "category-button"}
                        type="button"
                        key={item}
                        onClick={() => setCategory(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              );

              if (!embedded) return toolbar;

              return (
                <>
                  {toolbar}
                  <div className="client-order-catalog-toolbar-spacer" aria-hidden="true" />
                </>
              );
            })()}

            {catalogPolicy.matrixMode === "pending" && (
              <div className="matrix-catalog-note pending">
                В матрице пока нет закреплённых товаров. Добавьте позиции
                через «Добавить товары из каталога» — они сохранятся
                автоматически. Заказ оформляется из этой матрицы.
              </div>
            )}

            <div className="catalog-products">
            <section className={catalogView === "list" ? "product-grid product-grid-list" : "product-grid"}>
              {filtered.map((product) => {
                const unit = units[product.id] || orderedSaleUnits(product)[0];
                const quantity = Number(cart[product.id]) || 0;
                const multiplier = getUnitMultiplier(product, unit);
                const orderStep = getUnitOrderStep(product, unit);
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
                          <img className="product-image" src={productImageSrc(product)} alt={product.name} loading="lazy" />
                        ) : (
                          <span className="product-image-placeholder">Фото товара пока не загружено</span>
                        )}
                      </div>
                    )}
                    <h2>{product.name}</h2>
                    <p className="product-code">Код: {productArticle(product)}</p>
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
                        <button type="button" onClick={() => changeQuantity(product.id, -1, orderStep)} aria-label="Уменьшить">−</button>
                        <div className="quantity-input-wrap">
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            step={quantityInputStep(multiplier, orderStep)}
                            inputMode="numeric"
                            value={quantityFieldValue(product.id, quantity, multiplier)}
                            placeholder="0"
                            onChange={(e) => setQtyDrafts((current) => ({ ...current, [product.id]: e.target.value }))}
                            onBlur={() => commitQtyDraft(product.id, multiplier, orderStep)}
                          />
                          <small>{quantityInputUnitLabel(unit, multiplier)}</small>
                        </div>
                        <button type="button" onClick={() => changeQuantity(product.id, 1, orderStep)} aria-label="Увеличить">+</button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!filtered.length && <div className="empty-box">Товары не найдены.</div>}
            </section>
            </div>
          </div>

          {(() => {
            const cartBody = (
              <>
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
                    {settings.showPrices && total > 0 ? (
                      <p className={`summary-delivery-note${deliveryFee > 0 ? " is-paid" : " is-free"}`}>
                        {deliveryFee > 0
                          ? `Доставка по СПб — ${formatMoney(PAID_DELIVERY_FEE)}. До бесплатной ещё ${formatMoney(FREE_DELIVERY_MIN_TOTAL - total)}.`
                          : "Доставка по СПб — бесплатно."}
                      </p>
                    ) : null}
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
              </>
            );

            if (embedded) {
              return (
                <div className="lk-order-cart-slot" ref={cartSlotRef}>
                  <aside
                    className="order-summary lk-order-cart"
                    id="order-summary"
                    ref={cartPanelRef}
                  >
                    {cartBody}
                  </aside>
                </div>
              );
            }

            return (
              <aside className="order-summary" id="order-summary">
                {cartBody}
              </aside>
            );
          })()}
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

        {cartSheetOpen && typeof document !== "undefined"
          ? createPortal(
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
                      <div className="cart-sheet-item-head">
                        <div className="cart-sheet-item-main">
                          <strong>{item.name}</strong>
                          {(item.multiplier > 1 || (settings.showPrices && item.lineTotal > 0)) ? (
                            <small>
                              {item.multiplier > 1 ? `${item.quantity * item.multiplier} шт. всего` : ""}
                              {settings.showPrices && item.lineTotal > 0
                                ? `${item.multiplier > 1 ? " · " : ""}${formatMoney(item.lineTotal)}`
                                : ""}
                            </small>
                          ) : null}
                        </div>
                        <div className="cart-sheet-item-actions">
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
                          <div className="quantity-control cart-sheet-qty">
                            <button type="button" onClick={() => changeQuantity(item.productId, -1, item.orderStep)} aria-label="Уменьшить">−</button>
                            <div className="quantity-input-wrap">
                              <input
                                className="quantity-input"
                                type="number"
                                min="0"
                                step={quantityInputStep(item.multiplier, item.orderStep)}
                                inputMode="numeric"
                                value={quantityFieldValue(item.productId, item.quantity, item.multiplier)}
                                onChange={(e) => setQtyDrafts((current) => ({ ...current, [item.productId]: e.target.value }))}
                                onBlur={() => commitQtyDraft(item.productId, item.multiplier, item.orderStep)}
                              />
                              <small>{quantityInputUnitLabel(item.unit, item.multiplier)}</small>
                            </div>
                            <button type="button" onClick={() => changeQuantity(item.productId, 1, item.orderStep)} aria-label="Увеличить">+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {customItems.map((item) => (
                    <div className="cart-sheet-item" key={item.id}>
                      <div className="cart-sheet-item-head">
                        <div className="cart-sheet-item-main">
                          <strong>{item.name}</strong>
                          <small>Товар вне матрицы · {item.unit || "шт."}</small>
                        </div>
                        <div className="cart-sheet-item-actions">
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
                {settings.showPrices && total > 0 ? (
                  <p className={`cart-sheet-delivery-note${deliveryFee > 0 ? " is-paid" : " is-free"}`}>
                    {deliveryFee > 0
                      ? `Доставка по СПб — ${formatMoney(PAID_DELIVERY_FEE)}. Добавьте ещё на ${formatMoney(FREE_DELIVERY_MIN_TOTAL - total)} для бесплатной доставки.`
                      : "Доставка по Санкт-Петербургу — бесплатно."}
                  </p>
                ) : null}
                <button className="secondary-button" type="button" onClick={() => void clearCart()}>
                  Очистить корзину
                </button>
                <button className="save-order-button" type="button" onClick={submitOrder}>
                  {session.mode === "edit" ? "Сохранить изменения" : "Оформить заказ"}
                </button>
              </div>
            </div>
          </div>,
          document.documentElement
        )
        : null}

        {datePickerOpen && typeof document !== "undefined"
          ? createPortal(
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
          </div>,
          document.documentElement
        )
        : null}
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
