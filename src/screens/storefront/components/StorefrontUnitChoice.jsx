import { orderedSaleUnits, UNIT_CONFIG, getUnitMultiplier } from "../../../shared/appHelpers.js";

export function storefrontUnitLabel(unit) {
  const short = UNIT_CONFIG[unit]?.shortLabel || unit;
  return String(short).replace(/\.$/, "");
}

/** Кнопки выбора единицы продажи (шт / уп / кор …), как в ЛК. */
export function StorefrontUnitChoice({
  product,
  unit,
  onChange,
  compact = false,
}) {
  const units = orderedSaleUnits(product);
  if (units.length <= 1) return null;

  return (
    <div
      className={`sf-unit-choice${compact ? " is-compact" : ""}`}
      role="group"
      aria-label="Единица измерения"
      onClick={(event) => event.stopPropagation()}
    >
      {units.map((item) => {
        const size = getUnitMultiplier(product, item);
        const label = storefrontUnitLabel(item);
        return (
          <button
            key={item}
            type="button"
            className={unit === item ? "is-active" : ""}
            aria-pressed={unit === item}
            title={size > 1 ? `${size} шт в «${label}»` : undefined}
            onClick={() => {
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
