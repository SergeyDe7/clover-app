const CLIENT_ID_KEY = "clover-client-id";

export function getOrCreateClientId() {
  const savedClientId = localStorage.getItem(CLIENT_ID_KEY);

  if (savedClientId) {
    return savedClientId;
  }

  const newClientId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `client-${Date.now()}`;

  localStorage.setItem(CLIENT_ID_KEY, newClientId);

  return newClientId;
}
