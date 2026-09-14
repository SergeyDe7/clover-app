import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { useEffect, useState } from "react";
import {
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  STOREFRONT_DEFAULT_HERO_SLIDES,
  resolveStorefrontHeroSlideHref,
} from "../siteCopy.js";
import { storefrontHref } from "../mode.js";
import { navigateStorefront } from "./StoreHeader.jsx";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function heroRouteFromHref(href) {
  const path = String(href || "").trim();
  if (!path) return null;
  if (path === "/install-app" || path.endsWith("/install-app")) {
    return { name: "install-app" };
  }
  if (path === "/cart") return { name: "cart" };
  if (path === "/contacts") return { name: "contacts" };
  if (path === "/catalog" || path.startsWith("/catalog/")) {
    const parts = path.slice("/catalog".length).split("/").filter(Boolean);
    return {
      name: "catalog",
      category: parts[0] ? decodeURIComponent(parts[0]) : "",
      subcategory: parts[1] ? decodeURIComponent(parts[1]) : "",
      facet: parts[2] ? decodeURIComponent(parts[2]) : "",
    };
  }
  if (path.startsWith("/product/")) {
    return {
      name: "product",
      code: decodeURIComponent(path.slice("/product/".length)),
    };
  }
  return path;
}

/** Known default/CMS RU alts for the install hero slide → UI catalog. */
const INSTALL_SLIDE_ALT_RU = new Set([
  "Мобильное приложение Clover",
  "Расходники для кафе и ресторанов",
]);

function isInstallHeroHref(href) {
  return heroRouteFromHref(href)?.name === "install-app";
}

export function HeroSlides({ slides, intervalSec }) {
  const { t } = useLocalization();
  const list =
    Array.isArray(slides) && slides.length
      ? slides
      : STOREFRONT_DEFAULT_HERO_SLIDES;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Only first slide loads at start; others unlock when shown (all stacked
  // imgs are in-viewport, so loading="lazy" alone does not defer them).
  const [loadedIndexes, setLoadedIndexes] = useState(() => new Set([0]));
  const seconds = Number(intervalSec) || STOREFRONT_DEFAULT_HERO_INTERVAL_SEC;
  const current = list[index] || list[0];
  const href = resolveStorefrontHeroSlideHref(current, index);
  const installHref = isInstallHeroHref(href);
  // Optional CMS operator button only — do not auto-inject a visible install CTA.
  const operatorButton = String(current?.buttonLabel || "").trim();
  // Accessible name: operator button, else localized install guide (never raw RU CMS alt).
  const linkLabel =
    operatorButton ||
    (installHref
      ? t("storefront.appInstallGuide")
      : String(current?.alt || "").trim()) ||
    t("storefront.appInstallGuide");

  const slideImgAlt = (slide, slideIndex) => {
    const raw = String(slide?.alt || "").trim();
    const slideHref = resolveStorefrontHeroSlideHref(slide, slideIndex);
    if (isInstallHeroHref(slideHref)) {
      if (!raw || INSTALL_SLIDE_ALT_RU.has(raw)) {
        return t("storefront.cloverMobileApp");
      }
    }
    return raw;
  };

  useEffect(() => {
    setIndex((currentIndex) => (currentIndex < list.length ? currentIndex : 0));
    setLoadedIndexes(new Set([0]));
  }, [list.length]);

  useEffect(() => {
    setLoadedIndexes((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, [index]);

  useEffect(() => {
    if (list.length < 2 || paused || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(() => {
      setIndex((currentIndex) => (currentIndex + 1) % list.length);
    }, Math.max(2, seconds) * 1000);
    return () => window.clearInterval(timer);
  }, [list.length, paused, seconds]);

  const openSlideLink = () => {
    if (!href) return;
    const route = heroRouteFromHref(href);
    if (route) navigateStorefront(route);
  };

  return (
    <div
      className={`sf-hero-visual${href ? " has-slide-link" : ""}`}
      aria-roledescription="carousel"
      aria-label={t("storefront.homeSlides")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {list.map((slide, slideIndex) => {
        if (!loadedIndexes.has(slideIndex)) return null;
        const isFirstPaint = slideIndex === 0;
        return (
          <img
            key={slide.src}
            src={slide.src}
            alt={slideImgAlt(slide, slideIndex)}
            width="1400"
            height="746"
            loading={isFirstPaint ? "eager" : "lazy"}
            fetchPriority={isFirstPaint ? "high" : "low"}
            decoding={isFirstPaint ? "sync" : "async"}
            className={slideIndex === index ? "is-active" : ""}
          />
        );
      })}
      {href ? (
        <a
          className={`sf-hero-slide-link${operatorButton ? "" : " is-cover-only"}`}
          href={storefrontHref(heroRouteFromHref(href) || href)}
          aria-label={linkLabel}
          onClick={(event) => {
            event.preventDefault();
            openSlideLink();
          }}
        >
          {operatorButton ? (
            <span className="sf-hero-slide-btn">{operatorButton}</span>
          ) : null}
        </a>
      ) : null}
      {list.length > 1 ? (
        <div className="sf-hero-dots" role="tablist" aria-label={t("storefront.slides")}>
          {list.map((slide, slideIndex) => (
            <button
              key={slide.src}
              type="button"
              role="tab"
              aria-label={t("storefront.hero.slideAria", { index: slideIndex + 1 })}
              aria-selected={slideIndex === index}
              className={slideIndex === index ? "is-active" : ""}
              onClick={() => setIndex(slideIndex)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
