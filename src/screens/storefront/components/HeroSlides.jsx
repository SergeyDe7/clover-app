import { useEffect, useState } from "react";
import {
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  STOREFRONT_DEFAULT_HERO_SLIDES,
} from "../siteCopy.js";
import { storefrontHref } from "../mode.js";
import { navigateStorefront } from "./StoreHeader.jsx";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  const href = current?.href || "";

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

  return (
    <div
      className="sf-hero-visual"
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
          width="1280"
          height="720"
          loading={slideIndex === 0 ? "eager" : "lazy"}
          className={slideIndex === index ? "is-active" : ""}
        />
      ))}
      {href ? (
        <a
          className="sf-hero-slide-link"
          href={storefrontHref(href)}
          onClick={(event) => {
            event.preventDefault();
            navigateStorefront(href);
          }}
        >
          <span className="sf-hero-slide-btn">
            {current.buttonLabel || "Смотреть товар"}
          </span>
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
