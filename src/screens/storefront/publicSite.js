import { storefrontApi } from "./publicApi.js";

let cached = null;
let inflight = null;

export function peekPublicSite() {
  return cached;
}

export function loadPublicSite() {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = storefrontApi
    .site()
    .then((payload) => {
      const site =
        payload?.site && typeof payload.site === "object" ? payload.site : {};
      cached = site;
      return site;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
