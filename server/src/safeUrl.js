/**
 * Проверка ссылок, которые попадают в атрибут href на витрине и в кабинете.
 *
 * Карточка товара показывает сертификат обычной ссылкой, а адрес приходит из
 * карточки товара, то есть его задаёт сотрудник. Схемы javascript:, data: и
 * vbscript: в href выполняются при клике, поэтому до разметки должны
 * доходить только http/https и внутренние пути вида /uploads/...
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * @param {unknown} value
 * @returns {string} исходная ссылка либо пустая строка, если она небезопасна
 */
export function safeLinkUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Внутренние файлы (загруженные сертификаты и фото) хранятся относительным
  // путём. Двойной слэш в начале — это protocol-relative адрес на чужой хост,
  // он к внутренним путям не относится.
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return "";
  return raw;
}
