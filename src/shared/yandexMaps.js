const MAX_MAPS_URL = 2000;

function stripWrap(value) {
  return String(value || "")
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function withHttps(raw) {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function hostName(hostname) {
  return String(hostname || "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

function isYandexMapsHost(hostname) {
  const host = hostName(hostname);
  if (host === "yandex.ru" || host === "yandex.com") return true;
  if (host === "maps.yandex.ru" || host === "maps.yandex.com") return true;
  if (host.endsWith(".maps.yandex.ru") || host.endsWith(".maps.yandex.com")) {
    return true;
  }
  return false;
}

function looksLikeYandexMaps(url) {
  if (!isYandexMapsHost(url.hostname)) return false;
  const host = hostName(url.hostname);
  const path = String(url.pathname || "").toLowerCase();
  if (host === "maps.yandex.ru" || host === "maps.yandex.com") return true;
  if (host.endsWith(".maps.yandex.ru") || host.endsWith(".maps.yandex.com")) {
    return true;
  }
  if (path.includes("/maps") || path.includes("/map-widget")) return true;
  const um = String(url.searchParams.get("um") || "");
  if (/constructor/i.test(um)) return true;
  if (url.searchParams.get("ll") || url.searchParams.get("pt")) return true;
  return false;
}

export function normalizeYandexMapsUrl(value) {
  const raw = stripWrap(value);
  if (!raw) return "";
  let url;
  try {
    url = new URL(withHttps(raw));
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (!looksLikeYandexMaps(url)) return "";
  url.protocol = "https:";
  return url.toString().slice(0, MAX_MAPS_URL);
}

function parseLonLatPair(raw) {
  const parts = String(raw || "")
    .split(",")
    .map((part) => Number(String(part).trim()));
  if (parts.length < 2) return null;
  const first = parts[0];
  const second = parts[1];
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  let lon = first;
  let lat = second;
  if (Math.abs(first) <= 90 && Math.abs(second) > 90) {
    lon = second;
    lat = first;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lon, lat };
}

export function parseYandexMapsPoint(value) {
  const href = normalizeYandexMapsUrl(value);
  if (!href) return null;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const ptParam = String(url.searchParams.get("pt") || "");
  const pair =
    parseLonLatPair(url.searchParams.get("ll")) ||
    parseLonLatPair(ptParam.split(",").slice(0, 2).join(",")) ||
    parseLonLatPair(url.searchParams.get("whatshere[point]"));
  if (!pair) return null;
  const zoomNum = Number(url.searchParams.get("z"));
  const zoom =
    Number.isFinite(zoomNum) && zoomNum >= 1 && zoomNum <= 21
      ? Math.round(zoomNum)
      : 16;
  return { ...pair, zoom };
}

export function yandexStaticMapSrc(point) {
  if (!point) return "";
  const { lon, lat, zoom = 16 } = point;
  const params = new URLSearchParams({
    ll: `${lon},${lat}`,
    z: String(zoom),
    size: "650,450",
    l: "map",
    pt: `${lon},${lat},pm2rdm`,
    lang: "ru_RU",
  });
  return `https://static-maps.yandex.ru/1.x/?${params.toString()}`;
}

export function yandexMapWidgetSrc(point) {
  if (!point) return "";
  const { lon, lat, zoom = 16 } = point;
  const params = new URLSearchParams({
    ll: `${lon},${lat}`,
    z: String(zoom),
    l: "map",
    pt: `${lon},${lat},pm2rdm`,
  });
  return `https://yandex.ru/map-widget/v1/?${params.toString()}`;
}

export function yandexEmbedSrc(value) {
  const href = normalizeYandexMapsUrl(value);
  if (!href) return "";
  let url;
  try {
    url = new URL(href);
  } catch {
    return "";
  }
  const um = String(url.searchParams.get("um") || "");
  if (/constructor/i.test(um)) {
    const widget = new URL("https://yandex.ru/map-widget/v1/");
    widget.searchParams.set("um", um);
    widget.searchParams.set("source", "constructor");
    return widget.toString();
  }
  const point = parseYandexMapsPoint(href);
  if (point) return yandexMapWidgetSrc(point);
  return "";
}
