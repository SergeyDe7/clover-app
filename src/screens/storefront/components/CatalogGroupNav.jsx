import { useState } from "react";
import { GroupIcon } from "./GroupIcon.jsx";
import { buildGroupNav, canonicalizeProductSubcategory } from "../productGroups.js";
import { navigateStorefront } from "./StoreHeader.jsx";

function NavChevron() {
  return (
    <svg
      className="sf-group-nav-chevron"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.2 4.2 L6 8 L9.8 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Боковое меню: группы → подгруппы.
 * Третье древо (facets) показывается на странице после выбора подгруппы.
 */
export function CatalogGroupNav({
  categories = [],
  activeCategory = "",
  activeSubcategory = "",
  variant = "side",
}) {
  const groups = buildGroupNav(categories);
  const [openParents, setOpenParents] = useState(() => new Set());

  const toggleParent = (name) => {
    setOpenParents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const goAll = () => navigateStorefront({ name: "catalog" });
  const goGroup = (name) =>
    navigateStorefront({ name: "catalog", category: name });
  const goSub = (category, subcategory) =>
    navigateStorefront({ name: "catalog", category, subcategory });

  return (
    <nav
      className={`sf-group-nav sf-group-nav-${variant}`}
      aria-label="Группы товаров"
    >
      <button
        type="button"
        className={`sf-group-nav-item${!activeCategory ? " is-active" : ""}`}
        onClick={goAll}
      >
        <span className="sf-group-nav-label">Все группы</span>
      </button>

      {groups.map((group) => {
        const hasChildren = group.children.length > 0;
        // Только openParents — иначе при активной группе стрелка не сворачивает.
        const isOpen = openParents.has(group.name);
        const isActive =
          activeCategory === group.name && !activeSubcategory;

        return (
          <div key={group.name} className="sf-group-nav-block">
            <div className="sf-group-nav-row">
              <button
                type="button"
                className={`sf-group-nav-item${isActive ? " is-active" : ""}`}
                onClick={() => {
                  goGroup(group.name);
                  if (hasChildren) {
                    setOpenParents((prev) => {
                      const next = new Set(prev);
                      next.delete(group.name);
                      return next;
                    });
                  }
                }}
              >
                <GroupIcon name={group.icon} className="sf-group-nav-icon" />
                <span className="sf-group-nav-label">{group.name}</span>
              </button>
              {hasChildren ? (
                <button
                  type="button"
                  className={`sf-group-nav-toggle${isOpen ? " is-open" : ""}`}
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? `Скрыть подгруппы: ${group.name}`
                      : `Показать подгруппы: ${group.name}`
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleParent(group.name);
                  }}
                >
                  <NavChevron />
                </button>
              ) : (
                <span
                  className="sf-group-nav-toggle is-placeholder"
                  aria-hidden="true"
                />
              )}
            </div>
            {hasChildren && isOpen ? (
              <div className="sf-group-nav-children">
                {group.children.map((child) => (
                  <button
                    key={child.name}
                    type="button"
                    className={`sf-group-nav-item is-child${
                      activeCategory === group.name &&
                      canonicalizeProductSubcategory(activeSubcategory) ===
                        child.name
                        ? " is-active"
                        : ""
                    }`}
                    onClick={() => goSub(group.name, child.name)}
                  >
                    <span className="sf-group-nav-label">{child.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
