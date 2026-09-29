const DRAFT_PREFIX = "clover-order-draft-user";

export const LEGACY_CLIENT_OWNER_KEY = "clover-legacy-client-owner";
export const LEGACY_MANAGER_OWNER_KEY = "clover-legacy-manager-owner";

export const LEGACY_CLIENT_DATA_KEYS = Object.freeze([
  "clover-client-profile",
  "clover-addresses",
  "clover-favorites",
  "clover-orders",
]);

export const LEGACY_MANAGER_DATA_KEYS = Object.freeze([
  "clover-products",
  "clover-manager-settings",
  "clover-client-links",
]);

function normalizedUserId(userId) {
  return String(userId || "").trim();
}

export function userDraftStorageKey(userId) {
  const normalized = normalizedUserId(userId);
  return normalized ? `${DRAFT_PREFIX}:${encodeURIComponent(normalized)}` : "";
}

export function legacyStorageBelongsTo(storage, ownerKey, userId) {
  const normalized = normalizedUserId(userId);
  if (!storage || !normalized) return false;
  try {
    return storage.getItem(ownerKey) === normalized;
  } catch {
    return false;
  }
}

export function legacyClientProfileMatchesUser(profile, user) {
  const profileEmail = String(profile?.email || "").trim().toLowerCase();
  const userEmail = String(user?.email || "").trim().toLowerCase();
  return Boolean(profileEmail && userEmail && profileEmail === userEmail);
}

export function clearStorageKeys(storage, keys) {
  if (!storage) return;
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Browser storage may be disabled. Security remains fail-closed because
      // callers do not expose or migrate unreadable data.
    }
  }
}
