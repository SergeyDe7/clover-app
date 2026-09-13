import { storefrontApi } from "./publicApi.js";

const cached = new Map();
const inflight = new Map();

function localeKey(language) {
  return String(language || "ru");
}

export function peekPublicSite(language = "ru") {
  return cached.get(localeKey(language)) || null;
}

export function loadPublicSite(language = "ru") {
  const key = localeKey(language);
  if (cached.has(key)) return Promise.resolve(cached.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const request = storefrontApi
    .site(key)
    .then((payload) => {
      const site =
        payload?.site && typeof payload.site === "object" ? payload.site : {};
      cached.set(key, site);
      return site;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}
