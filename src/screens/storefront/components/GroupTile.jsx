import { GroupIcon } from "./GroupIcon.jsx";
import { getGroupMeta } from "../productGroups.js";
import { navigateStorefront } from "./StoreHeader.jsx";

function productsCountLabel(count) {
  const n = Math.max(0, Number(count) || 0);
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "товаров";
  if (mod10 === 1 && mod100 !== 11) word = "товар";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "товара";
  }
  return `${n} ${word}`;
}

export function GroupTile({ name, count = null, className = "" }) {
  const meta = getGroupMeta(name);
  const showCount =
    count !== null && count !== undefined && Number.isFinite(Number(count));

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
        <span className="sf-group-tile-name">{name}</span>
        {showCount ? (
          <span className="sf-group-tile-count">{productsCountLabel(count)}</span>
        ) : null}
      </span>
    </button>
  );
}
