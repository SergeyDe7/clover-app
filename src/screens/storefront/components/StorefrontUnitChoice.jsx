import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { orderedSaleUnits, getUnitMultiplier } from "../../../shared/appHelpers.js";
import { unitDisplayShort } from "../../../shared/i18n/unitDisplay.js";

export function storefrontUnitLabel(unit, t) {
  const short = unitDisplayShort(unit, t) || unit;
  return String(short).replace(/\.$/, "");
}

/** Кнопки выбора единицы продажи (шт / уп / кор …). Одна единица — тоже одна active-кнопка. */
export function StorefrontUnitChoice({
  product,
  unit,
  onChange,
  compact = false,
}) {
  const { t } = useLocalization();
  const units = orderedSaleUnits(product);
  if (!units.length) return null;

  return (
    <div
      className={`sf-unit-choice${compact ? " is-compact" : ""}${
        units.length === 1 ? " is-single" : ""
      }`}
      role="group"
      aria-label={t("storefront.unitOfMeasure")}
      onClick={(event) => event.stopPropagation()}
    >
      {units.map((item) => {
        const size = getUnitMultiplier(product, item);
        const label = storefrontUnitLabel(item, t);
        const active = unit === item;
        return (
          <button
            key={item}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            title={size > 1 ? t("storefront.unit.piecesInNamed", { size, label }) : undefined}
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
