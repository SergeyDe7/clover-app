import { orderedSaleUnits, UNIT_CONFIG, getUnitMultiplier } from "../../../shared/appHelpers.js";

export function storefrontUnitLabel(unit) {
  const short = UNIT_CONFIG[unit]?.shortLabel || unit;
  return String(short).replace(/\.$/, "");
}

/** Кнопки выбора единицы продажи (шт / уп / кор …). Одна единица — тоже одна active-кнопка. */
export function StorefrontUnitChoice({
  product,
  unit,
  onChange,
  compact = false,
}) {
  const units = orderedSaleUnits(product);
  if (!units.length) return null;

  return (
    <div
      className={`sf-unit-choice${compact ? " is-compact" : ""}${
        units.length === 1 ? " is-single" : ""
      }`}
      role="group"
      aria-label="Единица измерения"
      onClick={(event) => event.stopPropagation()}
    >
      {units.map((item) => {
        const size = getUnitMultiplier(product, item);
        const label = storefrontUnitLabel(item);
        const active = unit === item;
        return (
          <button
            key={item}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            title={size > 1 ? `${size} шт в «${label}»` : undefined}
            onClick={() => {
              if (units.length === 1) return;
              if (item !== unit) onChange(item);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
