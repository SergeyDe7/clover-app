async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api/public${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body:
        options.body && typeof options.body !== "string"
          ? JSON.stringify(options.body)
          : options.body,
    });
  } catch {
    const error = new Error("Не удалось связаться с сервером.");
    error.status = 0;
    throw error;
  }

  let payload = {};
  const raw = await response.text();
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: "Некорректный ответ сервера." };
    }
  }

  if (!response.ok) {
    const error = new Error(payload.error || "Ошибка запроса.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export const storefrontApi = {
  site() {
    return request("/site");
  },
  catalog(params = {}) {
    const query = new URLSearchParams();
    if (params.category) query.set("category", params.category);
    if (params.subcategory) query.set("subcategory", params.subcategory);
    if (params.facet) query.set("facet", params.facet);
    if (params.q) query.set("q", params.q);
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/catalog${suffix}`);
  },
  product(code) {
    return request(`/catalog/${encodeURIComponent(code)}`);
  },
  placeOrder(body) {
    return request("/orders", { method: "POST", body });
  },
};
