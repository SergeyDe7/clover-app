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
  if (path === "/install-app") return { name: "install-app" };
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
    return { name: "product", code: decodeURIComponent(path.slice("/product/".length)) };
  }
  return path;
}

export function HeroSlides({ slides, intervalSec }) {
  const list =
    Array.isArray(slides) && slides.length
      ? slides
      : STOREFRONT_DEFAULT_HERO_SLIDES;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const seconds = Number(intervalSec) || STOREFRONT_DEFAULT_HERO_INTERVAL_SEC;
  const current = list[index] || list[0];
  const href = resolveStorefrontHeroSlideHref(current, index);
  const linkLabel =
    current?.buttonLabel || current?.alt || "Инструкция по установке приложения";

  useEffect(() => {
    setIndex((currentIndex) => (currentIndex < list.length ? currentIndex : 0));
  }, [list.length]);

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
      aria-label="Слайды на главной"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {list.map((slide, slideIndex) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt || ""}
          width="1400"
          height="746"
          loading={slideIndex === 0 ? "eager" : "lazy"}
          className={[
            slideIndex === index ? "is-active" : "",
            slide.src.includes("hero-app") ? "is-app-slide" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
      {href ? (
        <a
          className={`sf-hero-slide-link${current?.buttonLabel ? "" : " is-cover-only"}`}
          href={storefrontHref(heroRouteFromHref(href) || href)}
          aria-label={linkLabel}
          onClick={(event) => {
            event.preventDefault();
            openSlideLink();
          }}
        >
          {current?.buttonLabel ? (
            <span className="sf-hero-slide-btn">
              {current.buttonLabel}
            </span>
          ) : null}
        </a>
      ) : null}
      {list.length > 1 ? (
        <div className="sf-hero-dots" role="tablist" aria-label="Слайды">
          {list.map((slide, slideIndex) => (
            <button
              key={slide.src}
              type="button"
              role="tab"
              aria-label={`Слайд ${slideIndex + 1}`}
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
