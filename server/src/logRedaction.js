/**
 * Затирание чувствительных значений перед выводом в журнал сервера.
 *
 * Логи сервера читает не только администратор Clover: они попадают в
 * journald, в вывод systemd и в архивы. Ошибка обработчика может тянуть за
 * собой тело запроса (например, разобранное с ошибкой тело формы входа) или
 * заголовок авторизации, поэтому перед выводом строки и объекты проходят
 * через маску.
 *
 * Здесь не затрагивается хранение выданных доступов: это только про
 * случайное попадание значений в лог.
 */

export const REDACTED = "[скрыто]";

const SENSITIVE_KEY = /(pass|secret|token|apikey|api_key|authorization|cookie|jwt|vapid|credential)/i;

const PATTERNS = [
  // JWT
  /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+/g,
  // Заголовок авторизации в свободном тексте
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // Логин и пароль внутри URL
  /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
  // Пары вида password=..., api_key: "..."
  /\b([A-Za-z0-9_-]*(?:pass|secret|token|key)[A-Za-z0-9_-]*\s*[=:]\s*)"?[^\s"',;&}]+/gi,
];

const MAX_DEPTH = 4;
const MAX_STRING = 2000;

export function redactString(value) {
  let text = String(value);
  for (const pattern of PATTERNS) {
    text = text.replace(pattern, (match, prefix) => (prefix ? `${prefix}${REDACTED}` : REDACTED));
  }
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
}

export function redactSecrets(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[…]";

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactSecrets(item, depth + 1));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactSecrets(item, depth + 1);
  }
  return result;
}

/**
 * Приводит ошибку к безопасному для журнала виду.
 *
 * У ошибок разбора тела запроса body-parser кладёт в свойство body исходный
 * текст запроса — вместе с паролем, если сломалась форма входа. Такие поля
 * в журнал не переносятся вовсе.
 */
export function redactError(error) {
  if (!error || typeof error !== "object") return redactSecrets(error);

  const safe = {
    name: error.name,
    message: redactString(error.message ?? ""),
  };
  if (error.code !== undefined) safe.code = error.code;
  if (error.status !== undefined) safe.status = error.status;
  if (error.type !== undefined) safe.type = error.type;
  if (error.stack) safe.stack = redactString(error.stack);
  if (error.cause) safe.cause = redactError(error.cause);
  return safe;
}

export function logError(context, error) {
  console.error(context, redactError(error));
}
