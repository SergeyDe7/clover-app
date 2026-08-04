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
      "Не удалось связаться с сервером. Проверьте интернет и попробуйте снова."
    );
    error.status = 0;
    throw error;
  }

  let payload = {};
  const rawText = await response.text();
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = {
        error: "Не удалось прочитать ответ сервера. Обновите страницу или войдите снова.",
        raw: rawText.slice(0, 120),
      };
    }
  } else if (!response.ok) {
    payload = {
      error: "Сервер не ответил. Войдите снова или попробуйте позже.",
    };
  }

  if (!response.ok) {
    const error = new Error(
      payload.error || "Не удалось выполнить запрос. Попробуйте позже."
    );
    error.status = response.status;
    error.code = payload.code || "";
    error.payload = payload;
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
      "Не удалось связаться с сервером. Проверьте интернет и попробуйте снова."
    );
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Не удалось выполнить запрос. Попробуйте позже.");
  }

  return response.blob();
}

export const api = {
  getPublicManagerContact() {
    return request("/public/manager-contact");
  },

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

  verifyEmail(token) {
    return request("/auth/verify-email", { method: "POST", body: { token } });
  },

  resendVerification(email) {
    return request("/auth/resend-verification", { method: "POST", body: { email } });
  },

  forgotPassword(email) {
    return request("/auth/forgot-password", { method: "POST", body: { email } });
  },

  resetPassword(token, password) {
    return request("/auth/reset-password", { method: "POST", body: { token, password } });
  },

  changePassword(currentPassword, newPassword) {
    return request("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  },

  logoutOtherSessions() {
    return request("/auth/logout-other-sessions", { method: "POST" });
  },

  createManager(email, password) {
    return request("/admin/managers", { method: "POST", body: { email, password } });
  },

  listPasskeys() {
    return request("/passkeys");
  },

  getPasskeyRegistrationOptions() {
    return request("/passkeys/registration/options", { method: "POST" });
  },

  verifyPasskeyRegistration(ceremonyId, response) {
    return request("/passkeys/registration/verify", {
      method: "POST",
      body: { ceremonyId, response },
    });
  },

  deletePasskey(credentialId) {
    return request(`/passkeys/${encodeURIComponent(credentialId)}`, { method: "DELETE" });
  },

  getPasskeyAuthenticationOptions(email) {
    return request("/passkeys/authentication/options", {
      method: "POST",
      body: { email },
    });
  },

  verifyPasskeyAuthentication(email, ceremonyId, response) {
    return request("/passkeys/authentication/verify", {
      method: "POST",
      body: { email, ceremonyId, response },
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

  trashOrder(orderId) {
    return request(`/state/orders/${encodeURIComponent(orderId)}/trash`, {
      method: "POST",
    });
  },

  restoreOrder(orderId) {
    return request(`/admin/orders/${encodeURIComponent(orderId)}/restore`, {
      method: "POST",
    });
  },

  purgeOrder(orderId) {
    return request(`/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "DELETE",
    });
  },

  patchOrderStatus(orderId, status) {
    return request(`/orders/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      body: { status },
    });
  },

  bulkPatchOrderStatus(orderIds, status) {
    return request("/orders/status/bulk", {
      method: "POST",
      body: { orderIds, status },
    });
  },

  getStaffUsers() {
    return request("/admin/staff");
  },

  setUserRole(userId, role) {
    return request(`/admin/users/${encodeURIComponent(userId)}/role`, {
      method: "POST",
      body: { role },
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

  updateClient(clientId, data) {
    return request(`/admin/clients/${encodeURIComponent(clientId)}`, {
      method: "PUT",
      body: data,
    });
  },

  createClientAccess(data) {
    return request("/admin/clients", {
      method: "POST",
      body: data,
    });
  },

  getClientAccessVault() {
    return request("/admin/client-access");
  },

  removeClientAccessVaultEntry(clientId) {
    return request(`/admin/client-access/${encodeURIComponent(clientId)}`, {
      method: "DELETE",
    });
  },

  setClientPassword(clientId, password) {
    return request(`/admin/clients/${encodeURIComponent(clientId)}/password`, {
      method: "POST",
      body: { password },
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

  uploadProductCertificate(productId, file) {
    const formData = new FormData();
    formData.append("certificate", file);
    return request(`/admin/products/${productId}/certificate`, {
      method: "POST",
      body: formData,
    });
  },

  deleteProductCertificate(productId) {
    return request(`/admin/products/${productId}/certificate`, {
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

  getOneCConfig() {
    return request("/admin/one-c/config");
  },

  saveOneCConfig(config) {
    return request("/admin/one-c/config", {
      method: "PUT",
      body: { config },
    });
  },

  testOneCConnection() {
    return request("/admin/one-c/test", {
      method: "POST",
    });
  },

  previewOneCCatalog(type, limit = 20) {
    return request(
      `/admin/one-c/preview/${encodeURIComponent(type)}?limit=${encodeURIComponent(limit)}`
    );
  },

  getOneCProducts({ search = "", limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({
      search,
      limit: String(limit),
      offset: String(offset),
    });
    return request(`/admin/one-c/products?${params.toString()}`);
  },

  getClientMatrixPrices(clientId) {
    return request(
      `/admin/clients/${encodeURIComponent(clientId)}/matrix-prices`
    );
  },

  getOneCProductCandidates(productId) {
    return request(`/admin/one-c/products/${encodeURIComponent(productId)}/candidates`);
  },

  requestOneCProduct(productId, data = {}) {
    return request(`/admin/one-c/products/${encodeURIComponent(productId)}/request`, {
      method: "POST",
      body: data,
    });
  },

  linkOneCProduct(productId, oneCId, item = null) {
    return request(`/admin/one-c/products/${encodeURIComponent(productId)}/link`, {
      method: "POST",
      body: { oneCId, item },
    });
  },

  autoLinkOneCProducts() {
    return request("/admin/one-c/products/auto-link", {
      method: "POST",
    });
  },

  createProductFromOneCCatalog({ oneCId, item = null, clientId = "" } = {}) {
    return request("/admin/one-c/products/from-catalog", {
      method: "POST",
      body: { oneCId, item, clientId: clientId || undefined },
    });
  },

  matchOneCImportRows(rows = []) {
    return request("/admin/one-c/products/match-import", {
      method: "POST",
      body: { rows },
    });
  },

  getOneCClients({ search = "", limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({
      search,
      limit: String(limit),
      offset: String(offset),
    });
    return request(`/admin/one-c/clients?${params.toString()}`);
  },

  getOneCClientCandidates(clientId) {
    return request(`/admin/one-c/clients/${encodeURIComponent(clientId)}/candidates`);
  },

  linkOneCClient(clientId, oneCId, item = null) {
    return request(`/admin/one-c/clients/${encodeURIComponent(clientId)}/link`, {
      method: "POST",
      body: { oneCId, item },
    });
  },

  autoLinkOneCClients() {
    return request("/admin/one-c/clients/auto-link", {
      method: "POST",
    });
  },

  createOneCDraft(orderId) {
    return request(
      `/admin/one-c/orders/${encodeURIComponent(orderId)}/draft`,
      { method: "POST" }
    );
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

  listReconciliation() {
    return request("/reconciliation");
  },

  createReconciliation(data) {
    return request("/reconciliation", { method: "POST", body: data });
  },

  updateReconciliation(requestId, data) {
    return request(`/admin/reconciliation/${encodeURIComponent(requestId)}`, {
      method: "PATCH", body: data,
    });
  },

  uploadReconciliationFile(requestId, file, managerComment = "") {
    const body = new FormData();
    body.append("file", file);
    body.append("managerComment", managerComment);
    return request(`/admin/reconciliation/${encodeURIComponent(requestId)}/file`, {
      method: "POST", body,
    });
  },

  downloadReconciliationFile(requestId) {
    return requestBlob(`/reconciliation/${encodeURIComponent(requestId)}/file`);
  },

  setClientApproval(clientId, status) {
    return request(`/admin/clients/${encodeURIComponent(clientId)}/approval`, {
      method: "PATCH", body: { status },
    });
  },

  getManagerNotifications({ unreadOnly = false, limit = 100 } = {}) {
    const params = new URLSearchParams();
    if (unreadOnly) params.set("unread", "1");
    params.set("limit", String(limit));
    return request(`/admin/notifications?${params.toString()}`);
  },

  readManagerNotification(notificationId) {
    return request(`/admin/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" });
  },

  readAllManagerNotifications() {
    return request("/admin/notifications/read-all", { method: "POST" });
  },

  testManagerNotifications() {
    return request("/admin/notifications/test", { method: "POST" });
  },

  getPushStatus() {
    return request("/push/status");
  },

  subscribePush(subscription, preferences) {
    return request("/push/subscribe", {
      method: "POST", body: { subscription, preferences },
    });
  },

  unsubscribePush(endpoint) {
    return request("/push/unsubscribe", { method: "POST", body: { endpoint } });
  },

  sendPromotion(title, body) {
    return request("/admin/push/promotion", { method: "POST", body: { title, body } });
  },

  resetAll() {
    return request("/admin/reset", {
      method: "POST",
      body: { confirm: "RESET" },
    });
  },
};
