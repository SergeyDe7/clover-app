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

export function getCartItems() {
  return readRaw();
}

export function getCartCount() {
  return readRaw().reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

export function addToCart(
  { productId, code, name, unit, unitLabel, price, imageUrl },
  qty = 1
) {
  const amount = Math.max(1, Math.floor(Number(qty) || 1));
  const items = readRaw();
  const key = `${productId}::${unit}`;
  const index = items.findIndex(
    (item) => `${item.productId}::${item.unit}` === key
  );
  if (index >= 0) {
    items[index] = {
      ...items[index],
      qty: (Number(items[index].qty) || 0) + amount,
      price: Number(price) || items[index].price,
      name: name || items[index].name,
      imageUrl: imageUrl || items[index].imageUrl,
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
      qty: amount,
    });
  }
  writeRaw(items);
  return items;
}

export function setCartQty(productId, unit, qty) {
  const amount = Math.floor(Number(qty) || 0);
  let items = readRaw();
  if (amount <= 0) {
    items = items.filter(
      (item) =>
        !(String(item.productId) === String(productId) && item.unit === unit)
    );
  } else {
    items = items.map((item) =>
      String(item.productId) === String(productId) && item.unit === unit
        ? { ...item, qty: amount }
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

export function subscribeCart(listener) {
  const handler = () => listener(getCartItems());
  window.addEventListener("clover:storefront-cart", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("clover:storefront-cart", handler);
    window.removeEventListener("storage", handler);
  };
}
