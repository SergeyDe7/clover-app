import { useState } from "react";
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
 * Боковое меню категорий — как в ЛК «Добавить товары из каталога»:
 * кнопки category-button + стрелка для подкатегорий.
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
  const goGroup = (name) => {
    navigateStorefront({ name: "catalog", category: name });
    if (groups.find((g) => g.name === name)?.children?.length) {
      setOpenParents((prev) => {
        const next = new Set(prev);
        // Клик по названию и раскрывает, и сворачивает.
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    }
  };
  const goSub = (category, subcategory) => {
    navigateStorefront({ name: "catalog", category, subcategory });
    setOpenParents((prev) => {
      const next = new Set(prev);
      next.add(category);
      return next;
    });
  };

  return (
    <nav
      className={`sf-group-nav sf-group-nav-${variant}`}
      aria-label="Группы товаров"
    >
      <button
        type="button"
        className={`sf-cat-btn${!activeCategory ? " is-active" : ""}`}
        onClick={goAll}
      >
        Все
      </button>

      {groups.map((group) => {
        const hasChildren = group.children.length > 0;
        const isOpen = openParents.has(group.name);
        const isActive =
          activeCategory === group.name && !activeSubcategory;

        return (
          <div key={group.name} className="sf-group-nav-block">
            <div className="sf-group-nav-row">
              <button
                type="button"
                className={`sf-cat-btn${isActive ? " is-active" : ""}`}
                onClick={() => goGroup(group.name)}
              >
                {group.name}
              </button>
              {hasChildren ? (
                <button
                  type="button"
                  className={`sf-group-nav-toggle${isOpen ? " is-open" : ""}`}
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen
                      ? `Скрыть подкатегории: ${group.name}`
                      : `Показать подкатегории: ${group.name}`
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleParent(group.name);
                  }}
                >
                  <NavChevron />
                </button>
              ) : null}
            </div>
            {hasChildren && isOpen ? (
              <div className="sf-group-nav-children">
                {group.children.map((child) => (
                  <button
                    key={child.name}
                    type="button"
                    className={`sf-cat-btn is-child${
                      activeCategory === group.name &&
                      canonicalizeProductSubcategory(activeSubcategory) ===
                        child.name
                        ? " is-active"
                        : ""
                    }`}
                    onClick={() => goSub(group.name, child.name)}
                  >
                    {child.name}
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
