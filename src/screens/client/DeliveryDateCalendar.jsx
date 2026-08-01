// Календарь даты доставки: воскресенья и слишком ранние дни недоступны.
import { useMemo, useState } from "react";
import {
  DELIVERY_DATE_MESSAGES,
  formatLocalIsoDate,
  parseLocalIsoDate,
  startOfLocalDay,
  validateDeliveryDate,
} from "../../shared/deliveryDateRules";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function monthTitle(year, monthIndex) {
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
    new Date(year, monthIndex, 1)
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildMonthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  // Пн=0 … Вс=6
  const mondayOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < mondayOffset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, monthIndex, day, 12, 0, 0, 0));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function DeliveryDateCalendar({ value, earliestIso, onPick }) {
  const initial = parseLocalIsoDate(value) || parseLocalIsoDate(earliestIso) || new Date();
  const [cursor, setCursor] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });

  const cells = useMemo(
    () => buildMonthCells(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  );

  const earliest = parseLocalIsoDate(earliestIso);
  const earliestTime = earliest ? startOfLocalDay(earliest).getTime() : 0;

  const shiftMonth = (delta) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1, 12, 0, 0, 0);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const canGoPrev = (() => {
    if (!earliest) return true;
    const prevLast = new Date(cursor.year, cursor.month, 0, 12, 0, 0, 0);
    return startOfLocalDay(prevLast).getTime() >= earliestTime;
  })();

  return (
    <div className="delivery-calendar">
      <div className="delivery-calendar-nav">
        <button type="button" className="header-button" disabled={!canGoPrev} onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
          ←
        </button>
        <strong>{monthTitle(cursor.year, cursor.month)}</strong>
        <button type="button" className="header-button" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
          →
        </button>
      </div>
      <div className="delivery-calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((label) => (
          <span key={label} className={label === "Вс" ? "is-sunday-label" : undefined}>{label}</span>
        ))}
      </div>
      <div className="delivery-calendar-grid" role="grid" aria-label="Календарь доставки">
        {cells.map((date, index) => {
          if (!date) {
            return <span key={`e-${index}`} className="delivery-calendar-cell is-empty" />;
          }
          const iso = formatLocalIsoDate(date);
          const check = validateDeliveryDate(iso);
          const selected = value === iso && check.ok;
          const isSunday = date.getDay() === 0;

          // Воскресенье и недоступные дни — не button: выбрать нельзя.
          if (!check.ok) {
            const message = isSunday
              ? DELIVERY_DATE_MESSAGES.sunday
              : check.message;
            return (
              <button
                key={iso}
                type="button"
                className={`delivery-calendar-cell is-disabled${isSunday ? " is-sunday" : ""}`}
                aria-disabled="true"
                title={message}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPick({ ok: false, message, value: iso });
                }}
              >
                {date.getDate()}
              </button>
            );
          }

          return (
            <button
              key={iso}
              type="button"
              className={`delivery-calendar-cell${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              aria-label={iso}
              onClick={() => onPick({ ok: true, value: iso })}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <p className="delivery-calendar-note muted small">
        Воскресенье недоступно для доставки.
      </p>
    </div>
  );
}
