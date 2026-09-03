import { useEffect, useState } from "react";
import {
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  STOREFRONT_DEFAULT_HERO_SLIDES,
  isStorefrontAppHeroSlide,
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
    return {
      name: "product",
      code: decodeURIComponent(path.slice("/product/".length)),
    };
  }
  return path;
}

const APP_PERKS = [
  { icon: "⚡", label: "Быстрый заказ" },
  { icon: "▦", label: "Удобный каталог" },
  { icon: "◷", label: "История покупок" },
];

export function HeroSlides({ slides, intervalSec, onActiveAppChange }) {
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
  const isAppSlide = isStorefrontAppHeroSlide(current, index);
  const linkLabel =
    current?.buttonLabel ||
    current?.alt ||
    "Инструкция по установке приложения";
  const installHref = storefrontHref({ name: "install-app" });

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
    onActiveAppChange?.(isAppSlide);
  }, [isAppSlide, onActiveAppChange]);

  useEffect(() => {
    if (list.length < 2 || paused || prefersReducedMotion()) return undefined;
    const timer = window.setInterval(() => {
      setIndex((currentIndex) => (currentIndex + 1) % list.length);
    }, Math.max(2, seconds) * 1000);
    return () => window.clearInterval(timer);
  }, [list.length, paused, seconds]);

  const openSlideLink = (targetHref) => {
    if (!targetHref) return;
    const route = heroRouteFromHref(targetHref);
    if (route) navigateStorefront(route);
  };

  return (
    <div
      className={[
        "sf-hero-visual",
        href || isAppSlide ? "has-slide-link" : "",
        isAppSlide ? "sf-hero-visual--app" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-roledescription="carousel"
      aria-label="Слайды на главной"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {list.map((slide, slideIndex) => {
        if (!loadedIndexes.has(slideIndex)) return null;
        const isFirstPaint = slideIndex === 0;
        const slideIsApp = isStorefrontAppHeroSlide(slide, slideIndex);
        // App slide image is rendered inside the HTML phone frame, not full-bleed.
        if (slideIsApp) return null;
        return (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt || ""}
            width="1400"
            height="746"
            loading={isFirstPaint ? "eager" : "lazy"}
            fetchPriority={isFirstPaint ? "high" : "low"}
            decoding={isFirstPaint ? "sync" : "async"}
            className={slideIndex === index ? "is-active" : ""}
          />
        );
      })}

      {isAppSlide ? (
        <a
          className="sf-hero-app"
          href={installHref}
          aria-label={linkLabel}
          onClick={(event) => {
            event.preventDefault();
            openSlideLink("/install-app");
          }}
        >
          <div className="sf-hero-app-copy">
            <p className="sf-hero-app-brand">Clover</p>
            <h2 className="sf-hero-app-title">
              Первое мобильное
              <br />
              приложение для
              <br />
              заказов хозтоваров
            </h2>
            <p className="sf-hero-app-sub">
              Заказывайте в любое время —
              <br />
              прямо с телефона
            </p>
            <ul className="sf-hero-app-perks">
              {APP_PERKS.map((perk) => (
                <li key={perk.label}>
                  <span className="sf-hero-app-perk-icon" aria-hidden="true">
                    {perk.icon}
                  </span>
                  <span>{perk.label}</span>
                </li>
              ))}
            </ul>
            <span className="sf-hero-app-cta">Установить приложение</span>
          </div>
          <div className="sf-hero-app-phone" aria-hidden="true">
            {current?.src ? (
              <img
                src={current.src}
                alt=""
                width="1400"
                height="746"
                loading="eager"
                fetchPriority="high"
                decoding="sync"
                className="is-app-slide is-active"
              />
            ) : null}
          </div>
        </a>
      ) : null}

      {href && !isAppSlide ? (
        <a
          className={`sf-hero-slide-link${current?.buttonLabel ? "" : " is-cover-only"}`}
          href={storefrontHref(heroRouteFromHref(href) || href)}
          aria-label={linkLabel}
          onClick={(event) => {
            event.preventDefault();
            openSlideLink(href);
          }}
        >
          {current?.buttonLabel ? (
            <span className="sf-hero-slide-btn">{current.buttonLabel}</span>
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
