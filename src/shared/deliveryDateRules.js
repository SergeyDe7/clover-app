// Правила выбора даты доставки клиента.
// Воскресенье — нерабочий день доставки.
// До 18:00: с завтрашнего рабочего дня; после 18:00: с послезавтрашнего рабочего дня.
// Доставка «на сегодня» недоступна.

export const DELIVERY_CUTOFF_HOUR = 18;

export const DELIVERY_DATE_MESSAGES = {
  sunday: "В этот день доставка не осуществляется.",
  beforeCutoff: "Доставку можно оформить только на следующий рабочий день.",
  afterCutoff: "После 18:00 доставку можно оформить только на послезавтра в рабочий день.",
};

/** YYYY-MM-DD в локальной таймзоне. */
export function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalIsoDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function addLocalDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

/** Воскресенье = нерабочий день доставки. */
export function isDeliveryClosedDay(date) {
  return date.getDay() === 0;
}

export function isAfterDeliveryCutoff(now = new Date()) {
  return now.getHours() >= DELIVERY_CUTOFF_HOUR;
}

/** Ближайший рабочий день доставки на дату или позже. */
export function nextWorkingDeliveryDay(date) {
  let cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  while (isDeliveryClosedDay(cursor)) {
    cursor = addLocalDays(cursor, 1);
  }
  return cursor;
}

/**
 * Минимально допустимая дата доставки.
 * До 18:00 — завтра (сдвиг на ближайший рабочий).
 * С 18:00 — послезавтра (сдвиг на ближайший рабочий).
 */
export function getEarliestDeliveryDate(now = new Date()) {
  const today = startOfLocalDay(now);
  const offsetDays = isAfterDeliveryCutoff(now) ? 2 : 1;
  return nextWorkingDeliveryDay(addLocalDays(today, offsetDays));
}

export function getEarliestDeliveryDateIso(now = new Date()) {
  return formatLocalIsoDate(getEarliestDeliveryDate(now));
}

/**
 * @returns {{ ok: true } | { ok: false, code: 'invalid'|'sunday'|'too_early', message: string }}
 */
export function validateDeliveryDate(value, now = new Date()) {
  const date = parseLocalIsoDate(value);
  if (!date) {
    return { ok: false, code: "invalid", message: "Укажите дату доставки." };
  }
  if (isDeliveryClosedDay(date)) {
    return { ok: false, code: "sunday", message: DELIVERY_DATE_MESSAGES.sunday };
  }
  const earliest = getEarliestDeliveryDate(now);
  const selectedDay = startOfLocalDay(date);
  if (selectedDay.getTime() < startOfLocalDay(earliest).getTime()) {
    return {
      ok: false,
      code: "too_early",
      message: isAfterDeliveryCutoff(now)
        ? DELIVERY_DATE_MESSAGES.afterCutoff
        : DELIVERY_DATE_MESSAGES.beforeCutoff,
    };
  }
  return { ok: true };
}
