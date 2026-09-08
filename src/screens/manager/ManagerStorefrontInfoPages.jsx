import { useState } from "react";
import {
  STOREFRONT_INFO_PAGES,
  cloneStorefrontInfoPages,
  isStorefrontLegalInfoSlug,
  normalizeStorefrontInfoRoute,
  resolveStorefrontInfoPage,
  storefrontInfoPageUrl,
} from "../../shared/storefrontInfoPages.js";

const BLOCK_TYPE_OPTIONS = [
  { value: "lead", label: "Лид" },
  { value: "p", label: "Абзац" },
  { value: "h2", label: "Подзаголовок" },
  { value: "list", label: "Список" },
  { value: "route", label: "Ссылка на страницу" },
];

const ROUTE_OPTIONS = [
  { value: "home", label: "Главная" },
  { value: "catalog", label: "Каталог" },
  { value: "aktsii", label: "Акции" },
  { value: "contacts", label: "Контакты" },
  ...STOREFRONT_INFO_PAGES.map((page) => ({
    value: `info:${page.slug}`,
    label: page.heading,
  })),
];

function routeSelectValue(route) {
  const next = normalizeStorefrontInfoRoute(route) || { name: "contacts" };
  if (next.name === "info") return `info:${next.slug}`;
  return next.name;
}

function routeFromSelect(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("info:")) {
    return normalizeStorefrontInfoRoute({
      name: "info",
      slug: raw.slice(5),
    }) || { name: "contacts" };
  }
  return normalizeStorefrontInfoRoute({ name: raw }) || { name: "contacts" };
}

function emptyBlock(type) {
  if (type === "list") return { type: "list", items: [""] };
  if (type === "route") {
    return { type: "route", label: "Связаться с нами", route: { name: "contacts" } };
  }
  if (type === "h2") return { type: "h2", text: "" };
  if (type === "lead") return { type: "lead", text: "" };
  return { type: "p", text: "" };
}

function clonePage(page) {
  return {
    heading: String(page?.heading || ""),
    title: String(page?.title || ""),
    description: String(page?.description || ""),
    blocks: Array.isArray(page?.blocks)
      ? page.blocks.map((block) => {
          if (block?.type === "list") {
            return {
              type: "list",
              items: Array.isArray(block.items) ? block.items.slice() : [""],
            };
          }
          if (block?.type === "route") {
            return {
              type: "route",
              label: String(block.label || ""),
              route: { ...(block.route || { name: "contacts" }) },
            };
          }
          return {
            type: block?.type || "p",
            text: String(block?.text || ""),
          };
        })
      : [],
    updatedAt: page?.updatedAt || null,
  };
}

export function ManagerStorefrontInfoPages({ pages, onChange }) {
  const stored = cloneStorefrontInfoPages(pages);
  const [selectedSlug, setSelectedSlug] = useState(STOREFRONT_INFO_PAGES[0].slug);
  const selected = STOREFRONT_INFO_PAGES.find((page) => page.slug === selectedSlug)
    || STOREFRONT_INFO_PAGES[0];
  const view = clonePage(resolveStorefrontInfoPage(selected.slug, stored));
  const legal = isStorefrontLegalInfoSlug(selected.slug);
  const publicUrl = storefrontInfoPageUrl(selected.slug);

  function writePage(nextPage) {
    onChange({
      ...stored,
      [selected.slug]: {
        heading: nextPage.heading,
        title: nextPage.title,
        description: nextPage.description,
        blocks: nextPage.blocks,
      },
    });
  }

  function patchPage(patch) {
    writePage({ ...view, ...patch });
  }

  function patchBlock(index, patch) {
    const blocks = view.blocks.map((block, idx) =>
      idx === index ? { ...block, ...patch } : block
    );
    patchPage({ blocks });
  }

  function moveBlock(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= view.blocks.length) return;
    const blocks = view.blocks.slice();
    const [item] = blocks.splice(index, 1);
    blocks.splice(nextIndex, 0, item);
    patchPage({ blocks });
  }

  function resetSelected() {
    const next = { ...stored };
    delete next[selected.slug];
    onChange(next);
  }

  return (
    <div className="manager-contact-settings" style={{ marginTop: 20 }}>
      <h3>Информационные страницы</h3>
      <p className="storefront-settings-hint">
        Редактирование текстов и SEO данных страниц «О нас», «Доставка»,
        «Оплата» и других информационных разделов сайта.
      </p>

      <div className="storefront-info-layout">
        <div className="storefront-info-nav" role="tablist" aria-label="Информационные страницы">
          {STOREFRONT_INFO_PAGES.map((page) => (
            <button
              key={page.slug}
              type="button"
              role="tab"
              aria-selected={page.slug === selected.slug}
              className={
                page.slug === selected.slug
                  ? "storefront-info-nav-btn is-active"
                  : "storefront-info-nav-btn"
              }
              onClick={() => setSelectedSlug(page.slug)}
            >
              {page.heading}
            </button>
          ))}
        </div>

        <div className="storefront-info-editor">
          <p className="storefront-info-url">
            Публичный адрес: <code>{publicUrl}</code>
          </p>

          {legal ? (
            <p className="storefront-info-legal-warning">
              Изменение этого текста сразу отобразится на публичном сайте.
              Проверьте юридическую формулировку перед сохранением.
            </p>
          ) : null}

          {legal && view.updatedAt ? (
            <p className="storefront-settings-hint">
              Последнее сохранение: {new Date(view.updatedAt).toLocaleString("ru-RU")}
            </p>
          ) : null}

          <label className="field field-wide">
            Заголовок страницы (H1)
            <input
              value={view.heading}
              onChange={(event) => patchPage({ heading: event.target.value })}
            />
          </label>
          <label className="field field-wide">
            SEO title
            <input
              value={view.title}
              onChange={(event) => patchPage({ title: event.target.value })}
            />
          </label>
          <label className="field field-wide">
            SEO description
            <textarea
              rows={3}
              value={view.description}
              onChange={(event) => patchPage({ description: event.target.value })}
            />
          </label>

          <div className="storefront-info-blocks">
            {view.blocks.map((block, index) => (
              <div key={`block-${selected.slug}-${index}`} className="storefront-info-block">
                <div className="storefront-info-block-toolbar">
                  <label className="field">
                    Тип блока
                    <select
                      value={block.type}
                      onChange={(event) =>
                        patchBlock(index, emptyBlock(event.target.value))
                      }
                    >
                      {BLOCK_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="storefront-info-block-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === 0}
                      onClick={() => moveBlock(index, -1)}
                    >
                      Вверх
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === view.blocks.length - 1}
                      onClick={() => moveBlock(index, 1)}
                    >
                      Вниз
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        patchPage({
                          blocks: view.blocks.filter((_, idx) => idx !== index),
                        })
                      }
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                {block.type === "list" ? (
                  <label className="field field-wide">
                    Пункты списка (каждый с новой строки)
                    <textarea
                      rows={6}
                      value={(block.items || []).join("\n")}
                      onChange={(event) =>
                        patchBlock(index, {
                          items: event.target.value.split("\n"),
                        })
                      }
                    />
                  </label>
                ) : block.type === "route" ? (
                  <div className="form-grid">
                    <label className="field">
                      Текст ссылки
                      <input
                        value={block.label || ""}
                        onChange={(event) =>
                          patchBlock(index, { label: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Страница
                      <select
                        value={routeSelectValue(block.route)}
                        onChange={(event) =>
                          patchBlock(index, {
                            route: routeFromSelect(event.target.value),
                          })
                        }
                      >
                        {ROUTE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <label className="field field-wide">
                    Текст
                    <textarea
                      rows={block.type === "h2" ? 2 : 4}
                      value={block.text || ""}
                      onChange={(event) =>
                        patchBlock(index, { text: event.target.value })
                      }
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="storefront-info-block-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                patchPage({ blocks: [...view.blocks, emptyBlock("p")] })
              }
            >
              Добавить абзац
            </button>
            <button type="button" className="secondary-button" onClick={resetSelected}>
              Вернуть текст по умолчанию
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
