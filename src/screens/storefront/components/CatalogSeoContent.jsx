import { navigateStorefront } from "../components/StoreHeader.jsx";
import { parseStorefrontRoute } from "../mode.js";
import { getCatalogPageContent } from "../storefrontCatalogContent.js";

function SeoInternalLink({ path, children }) {
  return (
    <a
      href={path}
      className="sf-seo-link"
      onClick={(event) => {
        event.preventDefault();
        navigateStorefront(parseStorefrontRoute(path));
      }}
    >
      {children}
    </a>
  );
}

/** Короткое вступление под H1 (до чипов и сетки). */
export function CatalogSeoIntro({ category, subcategory, facet }) {
  const content = getCatalogPageContent({
    name: "catalog",
    category,
    subcategory,
    facet,
  });
  if (!content?.intro) return null;
  return (
    <p className="sf-seo-intro" data-seo-content="intro">
      {content.intro}
    </p>
  );
}

/** Ассортимент, перелинковка и FAQ — после товарной сетки. */
export function CatalogSeoBelowFold({ category, subcategory, facet }) {
  const content = getCatalogPageContent({
    name: "catalog",
    category,
    subcategory,
    facet,
  });
  if (!content) return null;

  return (
    <div className="sf-seo-below" data-seo-content="below">
      {content.assortment?.length ? (
        <section className="sf-seo-block" aria-labelledby="sf-seo-assortment-title">
          <h2 id="sf-seo-assortment-title" className="sf-seo-heading">
            Что входит в ассортимент
          </h2>
          <ul className="sf-seo-list">
            {content.assortment.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.links?.length ? (
        <section className="sf-seo-block" aria-labelledby="sf-seo-links-title">
          <h2 id="sf-seo-links-title" className="sf-seo-heading">
            Смотрите также
          </h2>
          <ul className="sf-seo-links">
            {content.links.map((link) => (
              <li key={link.path}>
                <SeoInternalLink path={link.path}>{link.label}</SeoInternalLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.faq?.length ? (
        <section className="sf-seo-block" aria-labelledby="sf-seo-faq-title">
          <h2 id="sf-seo-faq-title" className="sf-seo-heading">
            Частые вопросы
          </h2>
          <div className="sf-seo-faq">
            {content.faq.map((item) => (
              <details key={item.q} className="sf-seo-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
