import { useLocalization } from "../../shared/i18n/LocalizationProvider";
import { useState } from "react";
import {
  STOREFRONT_INFO_PAGES,
  applyEditorInfoPagesPatch,
  isStorefrontLegalInfoSlug,
  normalizeStorefrontInfoRoute,
  readEditorStorefrontInfoPage,
  storefrontInfoPageUrl,
} from "../../shared/storefrontInfoPages.js";

const BLOCK_TYPE_OPTIONS = [
  { value: "lead", labelKey: "manager.lead" },
  { value: "p", labelKey: "manager.paragraph" },
  { value: "h2", labelKey: "manager.subtitle" },
  { value: "list", labelKey: "client.view.list" },
  { value: "route", labelKey: "manager.pageLink" },
];

const ROUTE_OPTIONS = [
  { value: "home", labelKey: "storefront.nav.home" },
  { value: "catalog", labelKey: "storefront.nav.catalog" },
  { value: "aktsii", labelKey: "storefront.nav.promos" },
  { value: "contacts", labelKey: "storefront.nav.contacts" },
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
    return { type: "route", label: "Напишите нам", route: { name: "contacts" } };
  }
  if (type === "h2") return { type: "h2", text: "" };
  if (type === "lead") return { type: "lead", text: "" };
  return { type: "p", text: "" };
}

export function ManagerStorefrontInfoPages({ pages, onChange }) {
  const { t } = useLocalization();
    const [selectedSlug, setSelectedSlug] = useState(STOREFRONT_INFO_PAGES[0].slug);
  const selected = STOREFRONT_INFO_PAGES.find((page) => page.slug === selectedSlug)
    || STOREFRONT_INFO_PAGES[0];
  const view = readEditorStorefrontInfoPage(selected.slug, pages);
  const legal = isStorefrontLegalInfoSlug(selected.slug);
  const publicUrl = storefrontInfoPageUrl(selected.slug);

  function patchPage(patch) {
    onChange(applyEditorInfoPagesPatch(pages, selected.slug, patch));
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
    const next =
      pages && typeof pages === "object" && !Array.isArray(pages) ? { ...pages } : {};
    delete next[selected.slug];
    onChange(next);
  }

  return (
    <div className="manager-contact-settings" style={{ marginTop: 20 }}>
      <h3>{t("manager.infoPages")}</h3>
      <p className="storefront-settings-hint">{
        t("manager.editingTextsAndSeoForAbout")
      }</p>

      <div className="storefront-info-layout">
        <div className="storefront-info-nav" role="tablist" aria-label={t("manager.infoPages")}>
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
          <p className="storefront-info-url">{
            t("manager.publicUrl") }<code>{publicUrl}</code>
          </p>

          {legal ? (
            <p className="storefront-info-legal-warning">{
              t("manager.changingThisTextAppearsOnThe")
            }</p>
          ) : null}

          {legal && view.updatedAt ? (
            <p className="storefront-settings-hint">
              Последнее сохранение: {new Date(view.updatedAt).toLocaleString("ru-RU")}
            </p>
          ) : null}

          <label className="field field-wide">{
            t("manager.pageHeadingH1")
            }<input
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
                  <label className="field">{
                    t("manager.blockType")
                    }<select
                      value={block.type}
                      onChange={(event) =>
                        patchBlock(index, emptyBlock(event.target.value))
                      }
                    >
                      {BLOCK_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
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
                    >{
                      t("manager.up")
                    }</button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === view.blocks.length - 1}
                      onClick={() => moveBlock(index, 1)}
                    >{
                      t("manager.down")
                    }</button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        patchPage({
                          blocks: view.blocks.filter((_, idx) => idx !== index),
                        })
                      }
                    >{
                      t("shared.action.delete")
                    }</button>
                  </div>
                </div>

                {block.type === "list" ? (
                  <label className="field field-wide">{
                    t("manager.listItemsOnePerLine")
                    }<textarea
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
                    <label className="field">{
                      t("manager.linkText")
                      }<input
                        value={block.label || ""}
                        onChange={(event) =>
                          patchBlock(index, { label: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">{
                      t("manager.page")
                      }<select
                        value={routeSelectValue(block.route)}
                        onChange={(event) =>
                          patchBlock(index, {
                            route: routeFromSelect(event.target.value),
                          })
                        }
                      >
                        {ROUTE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.labelKey ? t(option.labelKey) : option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <label className="field field-wide">{
                    t("manager.text19")
                    }<textarea
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
            >{
              t("manager.addParagraph")
            }</button>
            <button type="button" className="secondary-button" onClick={resetSelected}>{
              t("manager.restoreDefaultText")
            }</button>
          </div>
        </div>
      </div>
    </div>
  );
}
