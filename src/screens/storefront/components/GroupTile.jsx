import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { categoryDisplayNameFromCanonical } from "../../../shared/i18n/categoryDisplayProjection.js";
import { storefrontCategoryDisplayOptions } from "../../../shared/i18n/storefrontCategoryDisplay.js";
import { GroupIcon } from "./GroupIcon.jsx";
import { getGroupMeta } from "../productGroups.js";
import { navigateStorefront } from "./StoreHeader.jsx";

/** Длинные имена: две строки по словам, без разрыва внутри слова. */
const TWO_LINE_GROUP_NAMES = {
  "Пакеты, упаковочные материалы": ["Пакеты,", "упаковочные материалы"],
  "Химия, чистящие средства": ["Химия,", "чистящие средства"],
};

function groupNameLines(canonicalName, displayName) {
  if (displayName !== canonicalName) return null;
  if (TWO_LINE_GROUP_NAMES[canonicalName]) return TWO_LINE_GROUP_NAMES[canonicalName];
  const text = String(displayName || "").trim();
  const comma = text.indexOf(",");
  if (comma <= 0 || comma >= text.length - 1) return null;
  return [text.slice(0, comma + 1), text.slice(comma + 1).trim()];
}

function productsCountLabel(count, t) {
  const n = Math.max(0, Number(count) || 0);
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = t("storefront.products2");
  if (mod10 === 1 && mod100 !== 11) word = t("storefront.product");
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = t("storefront.products");
  }
  return `${n} ${word}`;
}

export function GroupTile({ name, count = null, className = "" }) {
  const { t, locale } = useLocalization();
  const displayName = categoryDisplayNameFromCanonical(
    name,
    "",
    storefrontCategoryDisplayOptions(locale)
  );
  const meta = getGroupMeta(name);
  const showCount =
    count !== null && count !== undefined && Number.isFinite(Number(count));
  const lines = groupNameLines(name, displayName);

  return (
    <button
      type="button"
      className={`sf-group-tile ${className}`.trim()}
      onClick={() =>
        navigateStorefront({
          name: "catalog",
          category: name,
        })
      }
    >
      <span className="sf-group-tile-icon" aria-hidden="true">
        <GroupIcon name={meta.icon} />
      </span>
      <span className="sf-group-tile-body">
        <span className={`sf-group-tile-name${lines ? " is-two-line" : ""}`}>
          {lines ? (
            <>
              {lines[0]}
              <br />
              {lines[1]}
            </>
          ) : (
            displayName
          )}
        </span>
        {showCount ? (
          <span className="sf-group-tile-count">{productsCountLabel(count, t)}</span>
        ) : null}
      </span>
    </button>
  );
}
