let nextSessionId = 0;
const fallbackSessions = new WeakMap();

// Memory only: no customer data, credentials or browser persistence.
export function createDocumentAiSession() {
  const state = { initialized: false, mode: false, blocked: false };
  return {
    id: ++nextSessionId,
    read: () => ({ ...state }),
    initialize(mode) { if (!state.initialized) { state.initialized = true; state.mode = mode === true; } return { ...state }; },
    setMode(mode) { state.mode = mode === true; },
    setBlocked(blocked) { state.blocked = blocked === true; },
  };
}

export function getDocumentAiSession(api) {
  if (typeof api.getDocumentAiSession === 'function') return api.getDocumentAiSession();
  if (!fallbackSessions.has(api)) fallbackSessions.set(api, createDocumentAiSession());
  return fallbackSessions.get(api);
}
