/**
 * Progressive catalog card mounting helpers (pure + schedule).
 * Keeps CatalogPage logic testable without React.
 */

export const CATALOG_CARD_RENDER_BATCH = 36;

/** Slice section lists to a global card budget (stable order, no dupes). */
export function sliceSectionsToRenderLimit(sections, renderLimit) {
  let remaining = Math.max(0, Number(renderLimit) || 0);
  const out = [];
  for (const section of sections || []) {
    if (remaining <= 0) break;
    const list = Array.isArray(section?.products) ? section.products : [];
    if (list.length <= remaining) {
      out.push(section);
      remaining -= list.length;
    } else {
      out.push({ ...section, products: list.slice(0, remaining) });
      remaining = 0;
    }
  }
  return out;
}

export function countSectionProducts(sections) {
  return (sections || []).reduce(
    (sum, section) => sum + (section?.products?.length || 0),
    0
  );
}

/** Unique product ids in order of appearance across sections. */
export function orderedProductIds(sections) {
  const ids = [];
  const seen = new Set();
  for (const section of sections || []) {
    for (const product of section?.products || []) {
      const id = product?.id;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Schedule the next render bump.
 * Always arms a timer fallback so a busy main thread cannot stall forever
 * even when requestIdleCallback exists but is delayed past timeout.
 */
export function scheduleCatalogRenderBump(bump, {
  idleTimeoutMs = 120,
  fallbackDelayMs = 48,
  ric = typeof globalThis.requestIdleCallback === "function"
    ? globalThis.requestIdleCallback.bind(globalThis)
    : null,
  cic = typeof globalThis.cancelIdleCallback === "function"
    ? globalThis.cancelIdleCallback.bind(globalThis)
    : null,
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  let cancelled = false;
  let idleHandle = null;
  let timerHandle = null;
  let ran = false;

  const run = () => {
    if (cancelled || ran) return;
    ran = true;
    if (idleHandle != null && cic) {
      try {
        cic(idleHandle);
      } catch {
        /* ignore */
      }
      idleHandle = null;
    }
    if (timerHandle != null) {
      clearTimer(timerHandle);
      timerHandle = null;
    }
    bump();
  };

  if (ric) {
    idleHandle = ric(run, { timeout: idleTimeoutMs });
  }
  // Guaranteed progress: timer fires even if idle callback is starved.
  timerHandle = setTimer(run, ric ? Math.max(fallbackDelayMs, idleTimeoutMs) : fallbackDelayMs);

  return () => {
    cancelled = true;
    if (idleHandle != null && cic) {
      try {
        cic(idleHandle);
      } catch {
        /* ignore */
      }
    }
    if (timerHandle != null) clearTimer(timerHandle);
  };
}

/** Near-end scroll / sentinel: jump ahead so fast scroll does not hit empty tail. */
export function nextRenderLimitAfterDemand(currentLimit, total, batch = CATALOG_CARD_RENDER_BATCH) {
  const cur = Math.max(0, Number(currentLimit) || 0);
  const tot = Math.max(0, Number(total) || 0);
  if (cur >= tot) return tot;
  // Reveal at least two more viewports worth, or the remainder.
  return Math.min(tot, cur + Math.max(batch * 2, batch));
}
