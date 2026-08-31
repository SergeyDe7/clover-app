/**
 * Ограничение частоты запросов, переживающее перезапуск процесса.
 *
 * Прежний счётчик жил в Map в памяти: сбрасывался каждым деплоем, считал
 * только по email и не ограничивал по IP, поэтому перебор паролей по списку
 * учётных записей ничем не сдерживался.
 *
 * В таблицу пишется только хэш ключа, а не сам email или IP: журнал
 * ограничений не должен становиться ещё одним местом хранения персональных
 * данных. Ни тело запроса, ни токены, ни заголовки сюда не попадают.
 */

import { createHash } from "node:crypto";
import { db } from "./db.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL,
    hits INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS rate_limits_updated_at ON rate_limits(updated_at);
`);

/** Строки живут не дольше самого длинного окна с запасом. */
const RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_EVERY = 200;

let callsSinceCleanup = 0;

const selectBucket = db.prepare(
  "SELECT window_started_at, hits FROM rate_limits WHERE key = ?"
);
const upsertBucket = db.prepare(`
  INSERT INTO rate_limits(key, window_started_at, hits, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    window_started_at = excluded.window_started_at,
    hits = excluded.hits,
    updated_at = excluded.updated_at
`);
const deleteBucket = db.prepare("DELETE FROM rate_limits WHERE key = ?");
const deleteStale = db.prepare("DELETE FROM rate_limits WHERE updated_at < ?");

function hashKey(scope, identifier) {
  return createHash("sha256")
    .update(`${scope}\u0000${String(identifier ?? "")}`)
    .digest("hex")
    .slice(0, 32);
}

function cleanupIfNeeded(now) {
  callsSinceCleanup += 1;
  if (callsSinceCleanup < CLEANUP_EVERY) return;
  callsSinceCleanup = 0;
  try {
    deleteStale.run(now - RETENTION_MS);
  } catch (error) {
    console.warn("Не удалось очистить устаревшие счётчики лимитов", error.message);
  }
}

/**
 * Учитывает попытку и сообщает, укладывается ли она в лимит.
 * Возвращает retryAfterSeconds для заголовка Retry-After.
 */
export function consumeRateLimit({ scope, identifier, limit, windowMs, now = Date.now() }) {
  const key = hashKey(scope, identifier);
  cleanupIfNeeded(now);

  const existing = selectBucket.get(key);
  const windowExpired = !existing || now - existing.window_started_at >= windowMs;

  const windowStartedAt = windowExpired ? now : existing.window_started_at;
  const hits = windowExpired ? 1 : existing.hits + 1;

  upsertBucket.run(key, windowStartedAt, hits, now);

  const allowed = hits <= limit;
  const resetAt = windowStartedAt + windowMs;
  return {
    allowed,
    hits,
    remaining: Math.max(0, limit - hits),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/** Сбрасывает счётчик — вызывается после успешного входа. */
export function resetRateLimit({ scope, identifier }) {
  try {
    deleteBucket.run(hashKey(scope, identifier));
  } catch (error) {
    console.warn("Не удалось сбросить счётчик лимита", error.message);
  }
}

/**
 * Адрес клиента. Требует включённого trust proxy, иначе за nginx все
 * запросы схлопнутся в один адрес и лимит станет глобальным.
 */
export function clientAddress(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown")
    .replace(/^::ffff:/, "")
    .split("%")[0];
}

/**
 * Express-middleware. Ключей может быть несколько (например IP и email):
 * превышение любого из них отклоняет запрос.
 *
 * Ответ намеренно одинаков независимо от того, существует ли учётная запись:
 * лимит не должен превращаться в оракул перечисления пользователей.
 */
export function rateLimit({ scope, limit, windowMs, keys, message }) {
  return (req, res, next) => {
    let worst = null;

    for (const [suffix, extract] of Object.entries(keys)) {
      const identifier = extract(req);
      if (identifier === null || identifier === undefined || identifier === "") continue;

      const result = consumeRateLimit({
        scope: `${scope}:${suffix}`,
        identifier,
        limit: typeof limit === "object" ? limit[suffix] : limit,
        windowMs: typeof windowMs === "object" ? windowMs[suffix] : windowMs,
      });

      if (!result.allowed && (!worst || result.retryAfterSeconds > worst.retryAfterSeconds)) {
        worst = result;
      }
    }

    if (!worst) return next();

    res.setHeader("Retry-After", String(worst.retryAfterSeconds));
    return res.status(429).json({
      error: message || "Слишком много запросов. Попробуйте позже.",
      retryAfter: worst.retryAfterSeconds,
    });
  };
}

/** Только для тестов: полная очистка счётчиков. */
export function clearAllRateLimits() {
  db.exec("DELETE FROM rate_limits");
}
