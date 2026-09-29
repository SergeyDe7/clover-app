export const API_TOKEN_KEY = "clover-api-token";

function read(storage, key) {
  try {
    return storage?.getItem?.(key) || "";
  } catch {
    return "";
  }
}

function remove(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readSessionToken({ sessionStorage, localStorage } = {}) {
  const current = read(sessionStorage, API_TOKEN_KEY);
  if (current) return current;

  // One-time migration removes tokens written by older builds. sessionStorage
  // survives reloads but is discarded with the browser tab/session.
  const legacy = read(localStorage, API_TOKEN_KEY);
  if (!legacy) return "";
  // Keep the legacy value if browser privacy settings reject sessionStorage;
  // otherwise the first API call would succeed and the next would lose auth.
  if (write(sessionStorage, API_TOKEN_KEY, legacy)) {
    remove(localStorage, API_TOKEN_KEY);
  }
  return legacy;
}

export function writeSessionToken(token, { sessionStorage, localStorage } = {}) {
  remove(localStorage, API_TOKEN_KEY);
  if (!token) {
    remove(sessionStorage, API_TOKEN_KEY);
    return false;
  }
  return write(sessionStorage, API_TOKEN_KEY, String(token));
}

export function clearSessionToken({ sessionStorage, localStorage } = {}) {
  remove(sessionStorage, API_TOKEN_KEY);
  remove(localStorage, API_TOKEN_KEY);
}
