const TOKEN_KEY = "clover-api-token";

export function getApiToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setApiToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearApiToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getApiToken();
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response;

  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      body:
        options.body &&
        !(options.body instanceof FormData) &&
        typeof options.body !== "string"
          ? JSON.stringify(options.body)
          : options.body,
    });
  } catch {
    const error = new Error(
      "Сервер Clover недоступен. Проверьте, что сервер запущен на порту 4000."
    );
    error.status = 0;
    throw error;
  }

  const payload = await response
    .json()
    .catch(() => ({
      error: "Сервер вернул ответ, который не удалось прочитать.",
    }));

  if (!response.ok) {
    const error = new Error(
      payload.error || `Ошибка сервера: ${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return payload;
}


async function requestBlob(path, options = {}) {
  const token = getApiToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response;

  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Сервер Clover недоступен. Проверьте, что сервер запущен на порту 4000."
    );
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Ошибка сервера: ${response.status}`);
  }

  return response.blob();
}

export const api = {
  register(data) {
    return request("/auth/register", {
      method: "POST",
      body: data,
    });
  },

  login(data) {
    return request("/auth/login", {
      method: "POST",
      body: data,
    });
  },

  bootstrap() {
    return request("/bootstrap");
  },

  saveOrders(orders) {
    return request("/state/orders", {
      method: "PUT",
      body: { orders },
    });
  },

  saveProfile(profile) {
    return request("/state/profile", {
      method: "PUT",
      body: { profile },
    });
  },

  saveAddresses(addresses) {
    return request("/state/addresses", {
      method: "PUT",
      body: { addresses },
    });
  },

  saveFavorites(favorites) {
    return request("/state/favorites", {
      method: "PUT",
      body: { favorites },
    });
  },

  saveProducts(products) {
    return request("/state/products", {
      method: "PUT",
      body: { products },
    });
  },

  saveSettings(settings) {
    return request("/state/settings", {
      method: "PUT",
      body: { settings },
    });
  },

  saveClientLinks(clientLinks) {
    return request("/state/client-links", {
      method: "PUT",
      body: { clientLinks },
    });
  },

  migrateClient(data) {
    return request("/migrate/client", {
      method: "POST",
      body: data,
    });
  },

  migrateManager(data) {
    return request("/migrate/manager", {
      method: "POST",
      body: data,
    });
  },

  uploadProductImage(productId, file) {
    const formData = new FormData();
    formData.append("image", file);
    return request(`/admin/products/${productId}/image`, {
      method: "POST",
      body: formData,
    });
  },

  deleteProductImage(productId) {
    return request(`/admin/products/${productId}/image`, {
      method: "DELETE",
    });
  },

  listBackups() {
    return request("/admin/backups");
  },

  createBackup(data = {}) {
    return request("/admin/backups", {
      method: "POST",
      body: data,
    });
  },

  cleanupBackups(data = {}) {
    return request("/admin/backups/cleanup", {
      method: "POST",
      body: data,
    });
  },

  restoreBackup(fileName) {
    return request(`/admin/backups/${encodeURIComponent(fileName)}/restore`, {
      method: "POST",
    });
  },

  downloadBackup(fileName) {
    return requestBlob(
      `/admin/backups/${encodeURIComponent(fileName)}/download`
    );
  },

  listAudit(limit = 200) {
    return request(`/admin/audit?limit=${encodeURIComponent(limit)}`);
  },

  getExchange(limit = 300) {
    return request(`/admin/exchange?limit=${encodeURIComponent(limit)}`);
  },

  checkExchangeOrder(orderId) {
    return request(`/admin/exchange/orders/${encodeURIComponent(orderId)}/check`, {
      method: "POST",
    });
  },

  sendExchangeOrder(orderId) {
    return request(`/admin/exchange/orders/${encodeURIComponent(orderId)}/send`, {
      method: "POST",
    });
  },

  resetExchangeOrder(orderId) {
    return request(`/admin/exchange/orders/${encodeURIComponent(orderId)}/reset`, {
      method: "POST",
    });
  },

  downloadExchangeOrder(orderId, format = "json") {
    return requestBlob(
      `/admin/exchange/orders/${encodeURIComponent(orderId)}/download?format=${encodeURIComponent(format)}`
    );
  },

  downloadExchangeBatch(format = "json", status = "all") {
    return requestBlob(
      `/admin/exchange/batch/download?format=${encodeURIComponent(format)}&status=${encodeURIComponent(status)}`
    );
  },

  resetAll() {
    return request("/admin/reset", {
      method: "POST",
    });
  },
};
