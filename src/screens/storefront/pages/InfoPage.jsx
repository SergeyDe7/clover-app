import { storefrontHref } from "../mode.js";
import { resolveStorefrontInfoPage } from "../../../shared/storefrontInfoPages.js";

function go(route) {
  window.history.pushState({}, "", storefrontHref(route));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Block({ block, index }) {
  if (block.type === "lead") {
    return <p className="sf-info-lead">{block.text}</p>;
  }
  if (block.type === "h2") {
    return <h2>{block.text}</h2>;
  }
  if (block.type === "list") {
    return (
      <ul className="sf-info-list">
        {block.items.map((item, idx) => (
          <li key={`item-${index}-${idx}`}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "route") {
    return (
      <a
        className="sf-btn sf-btn-ghost sf-btn-sm sf-info-link"
        href={storefrontHref(block.route)}
        onClick={(event) => {
          event.preventDefault();
          go(block.route);
        }}
      >
        {block.label}
      </a>
    );
  }
  return <p>{block.text}</p>;
}

export function InfoPage({ slug, infoPages }) {
  const page = resolveStorefrontInfoPage(slug, infoPages);
  if (!page || !page.blocks?.length) return null;

  return (
    <div className="sf-info-page">
      <header className="sf-section-head">
        <h1>{page.heading}</h1>
      </header>
      <div className="sf-info-body">
        {page.blocks.map((block, index) => (
          <Block key={`${page.slug}-${index}`} block={block} index={index} />
        ))}
      </div>
    </div>
  );
}
