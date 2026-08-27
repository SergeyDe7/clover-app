import {
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  getSpbDeliveryFee,
} from "../../config/orderConfig.js";

const CART_KEY = "clover-storefront-cart-v1";

function readRaw() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("clover:storefront-cart"));
}

function normalizeStep(step) {
  const value = Math.floor(Number(step) || 1);
  return Number.isFinite(value) && value > 1 ? value : 1;
}

/** Округлить qty до кратности (минимум = step). */
export function snapCartQty(qty, step = 1) {
  const orderStep = normalizeStep(step);
  const raw = Math.floor(Number(qty) || 0);
  if (raw <= 0) return 0;
  if (orderStep <= 1) return Math.max(1, raw);
  return Math.max(orderStep, Math.round(raw / orderStep) * orderStep);
}

export function getCartItems() {
  return readRaw();
}

export function getCartCount() {
  return readRaw().reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

function normalizeUnitSize(unitSize) {
  const value = Math.floor(Number(unitSize) || 1);
  return Number.isFinite(value) && value > 1 ? value : 1;
}

export function addToCart(
  {
    productId,
    code,
    name,
    unit,
    unitLabel,
    price,
    imageUrl,
    orderStep = 1,
    unitSize = 1,
  },
  qty = 1
) {
  const step = normalizeStep(orderStep);
  const size = normalizeUnitSize(unitSize);
  const amount = snapCartQty(qty || step, step);
  const items = readRaw();
  const key = `${productId}::${unit}`;
  const index = items.findIndex(
    (item) => `${item.productId}::${item.unit}` === key
  );
  if (index >= 0) {
    const prevStep = normalizeStep(items[index].orderStep || step);
    items[index] = {
      ...items[index],
      qty: snapCartQty((Number(items[index].qty) || 0) + amount, prevStep),
      orderStep: prevStep,
      unitSize: size > 1 ? size : normalizeUnitSize(items[index].unitSize || 1),
      price: Number(price) || items[index].price,
      name: name || items[index].name,
      imageUrl: imageUrl || items[index].imageUrl,
      unitLabel: unitLabel || items[index].unitLabel,
    };
  } else {
    items.push({
      productId,
      code: code || "",
      name: name || "",
      unit,
      unitLabel: unitLabel || unit,
      price: Number(price) || 0,
      imageUrl: imageUrl || "",
      orderStep: step,
      unitSize: size,
      qty: amount,
    });
  }
  writeRaw(items);
  return items;
}

export function setCartQty(productId, unit, qty, extras = {}) {
  let items = readRaw();
  const existing = items.find(
    (item) =>
      String(item.productId) === String(productId) && item.unit === unit
  );
  const step = normalizeStep(existing?.orderStep || extras.orderStep || 1);
  const amount = snapCartQty(qty, step);
  if (amount <= 0) {
    items = items.filter(
      (item) =>
        !(String(item.productId) === String(productId) && item.unit === unit)
    );
  } else {
    const nextSize =
      extras.unitSize != null
        ? normalizeUnitSize(extras.unitSize)
        : normalizeUnitSize(existing?.unitSize || 1);
    items = items.map((item) =>
      String(item.productId) === String(productId) && item.unit === unit
        ? {
            ...item,
            qty: amount,
            orderStep: step,
            unitSize: nextSize,
            ...(extras.unitLabel ? { unitLabel: extras.unitLabel } : {}),
            ...(extras.price != null
              ? { price: Number(extras.price) || item.price }
              : {}),
          }
        : item
    );
  }
  writeRaw(items);
  return items;
}

export function removeFromCart(productId, unit) {
  return setCartQty(productId, unit, 0);
}

export function clearCart() {
  writeRaw([]);
}

export function cartTotal(items = readRaw()) {
  return items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );
}

/** Сумма товаров без доставки. */
export function cartGoodsTotal(items = readRaw()) {
  return cartTotal(items);
}

export function cartDeliveryFee(items = readRaw()) {
  const goods = cartGoodsTotal(items);
  if (goods <= 0) return 0;
  return getSpbDeliveryFee(goods);
}

export function cartGrandTotal(items = readRaw()) {
  return cartGoodsTotal(items) + cartDeliveryFee(items);
}

export { FREE_DELIVERY_MIN_TOTAL, PAID_DELIVERY_FEE, getSpbDeliveryFee };

export function subscribeCart(listener) {
  const handler = () => listener(getCartItems());
  window.addEventListener("clover:storefront-cart", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("clover:storefront-cart", handler);
    window.removeEventListener("storage", handler);
  };
}
