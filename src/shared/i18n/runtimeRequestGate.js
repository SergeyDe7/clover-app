/** Small generation gate shared by the provider and its deterministic verifier. */
export function createRuntimeRequestGate() {
  let generation = 0;
  return Object.freeze({
    next() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(candidate) {
      return candidate === generation;
    },
  });
}

/** Latest-request-only async snapshot transition used by LocalizationProvider. */
export function createRuntimeSnapshotLoader({ requestSnapshot, applySnapshot }) {
  const gate = createRuntimeRequestGate();
  return Object.freeze({
    async load(language) {
      const generation = gate.next();
      try {
        const snapshot = await requestSnapshot(language || "ru");
        if (!gate.isCurrent(generation)) return null;
        applySnapshot(snapshot);
        return snapshot;
      } catch {
        return null;
      }
    },
    invalidate() {
      gate.invalidate();
    },
  });
}

export function applyRuntimeDocumentLocale(documentLike, { locale, direction }) {
  if (!documentLike?.documentElement) return;
  const root = documentLike.documentElement;
  const appRoot = documentLike.getElementById?.("root");
  root.dir = direction;
  root.lang = locale;
  if (appRoot) appRoot.dir = direction;
}
