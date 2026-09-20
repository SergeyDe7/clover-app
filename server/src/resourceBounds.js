/**
 * Security Stage 4 Package C — application resource bounds.
 *
 * - Public catalog `q` is rejected before prefix search.
 * - Enrichment queue is finite; running jobs are not aborted.
 * - Admin PDF export has per-user single-flight + small global concurrency.
 * - Batch translation already has runLock; no extra queue is added.
 * - WebAuthn ceremonies are expiry-cleaned in SQLite, not a process queue.
 *
 * Overload signals stay internal except for a generic HTTP 503 body.
 */
export const PUBLIC_CATALOG_Q_MAX = 80;
export const ENRICH_QUEUE_MAX_DEFAULT = 32;
export const PDF_EXPORT_CONCURRENCY = 2;

export function readEnrichQueueMax(env = process.env) {
  const raw = Number(env.CLOVER_ENRICH_QUEUE_MAX);
  if (Number.isInteger(raw) && raw >= 1 && raw <= 256) return raw;
  return ENRICH_QUEUE_MAX_DEFAULT;
}

export function publicCatalogQueryTooLong(value) {
  return String(value || "").length > PUBLIC_CATALOG_Q_MAX;
}

export function sendResourceOverloaded(res, _internal = {}) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Retry-After", "10");
  return res.status(503).json({
    error: "Сервер занят. Попробуйте позже.",
    code: "RESOURCE_OVERLOADED",
  });
}

export function rejectOversizedPublicCatalogQuery(req, res) {
  if (!publicCatalogQueryTooLong(req.query?.q)) return false;
  res.setHeader("Cache-Control", "no-store");
  res.status(400).json({
    error: "Слишком длинный поисковый запрос.",
    code: "CATALOG_QUERY_TOO_LONG",
  });
  return true;
}

export function createConcurrencyGate({
  max = PDF_EXPORT_CONCURRENCY,
  perKey = 1,
} = {}) {
  const byKey = new Map();
  let global = 0;
  return {
    size() {
      return global;
    },
    tryEnter(key) {
      const id = String(key || "");
      const held = id ? Number(byKey.get(id) || 0) : 0;
      if (global >= max || (id && held >= perKey)) {
        return { ok: false, leave() {} };
      }
      global += 1;
      if (id) byKey.set(id, held + 1);
      let released = false;
      return {
        ok: true,
        leave() {
          if (released) return;
          released = true;
          global = Math.max(0, global - 1);
          if (id) {
            const next = Number(byKey.get(id) || 1) - 1;
            if (next <= 0) byKey.delete(id);
            else byKey.set(id, next);
          }
        },
      };
    },
  };
}
