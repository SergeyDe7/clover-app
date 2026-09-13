import { useEffect, useId, useRef, useState } from "react";
import { useLocalization } from "./LocalizationProvider.jsx";
import { toPublicLocaleCode } from "./languageRegistry.js";
import { getLanguageOptions } from "./languageSelectorPresentation.js";

function FlagIcon({ language }) {
  const commonProps = {
    className: "language-flag",
    viewBox: "0 0 36 24",
    "aria-hidden": "true",
    focusable: "false",
  };

  if (language === "ru") {
    return <svg {...commonProps}><path fill="#fff" d="M0 0h36v8H0z" /><path fill="#1c57a7" d="M0 8h36v8H0z" /><path fill="#d52b1e" d="M0 16h36v8H0z" /></svg>;
  }
  if (language === "en") {
    return (
      <svg {...commonProps}>
        <path fill="#21468b" d="M0 0h36v24H0z" />
        <path stroke="#fff" strokeWidth="5" d="m0 0 36 24M36 0 0 24" />
        <path stroke="#cf142b" strokeWidth="2.5" d="m0 0 36 24M36 0 0 24" />
        <path fill="#fff" d="M15 0h6v24h-6zM0 9h36v6H0z" />
        <path fill="#cf142b" d="M16.5 0h3v24h-3zM0 10.5h36v3H0z" />
      </svg>
    );
  }
  if (language === "uz") {
    return (
      <svg {...commonProps}>
        <path fill="#1eb5e9" d="M0 0h36v7H0z" /><path fill="#fff" d="M0 8h36v8H0z" /><path fill="#1eb53a" d="M0 17h36v7H0z" />
        <path fill="#ce1126" d="M0 7h36v1H0zM0 16h36v1H0z" />
        <path fill="#fff" d="M7 1.5a3 3 0 1 0 0 5 2.4 2.4 0 1 1 0-5Z" />
        <circle cx="12" cy="2.4" r=".55" fill="#fff" /><circle cx="15" cy="2.4" r=".55" fill="#fff" /><circle cx="13.5" cy="4.6" r=".55" fill="#fff" />
      </svg>
    );
  }
  if (language === "ky") {
    return (
      <svg {...commonProps}>
        <path fill="#e8112d" d="M0 0h36v24H0z" />
        <g stroke="#ffef00" strokeWidth="1.1" transform="translate(18 12)">
          <path d="M0-9v18M-9 0H9M-6.4-6.4 6.4 6.4M6.4-6.4-6.4 6.4" />
          <circle r="5.5" fill="#ffef00" stroke="none" />
          <path d="M-3.5-2.5c2 1.2 5 1.2 7 0M-3.5 0c2 1.2 5 1.2 7 0M-3.5 2.5c2 1.2 5 1.2 7 0" stroke="#e8112d" fill="none" />
        </g>
      </svg>
    );
  }
  if (language === "tg") {
    return (
      <svg {...commonProps}>
        <path fill="#cc0000" d="M0 0h36v7H0z" /><path fill="#fff" d="M0 7h36v10H0z" /><path fill="#006600" d="M0 17h36v7H0z" />
        <path fill="#f8c300" d="m18 9 1.2 2 2.3-.4-1.5 1.8.9 2.1-2.1-.9-1.8 1.3-1.8-1.3-2.1.9.9-2.1-1.5-1.8 2.3.4Z" />
        <circle cx="12.5" cy="10" r=".7" fill="#f8c300" /><circle cx="23.5" cy="10" r=".7" fill="#f8c300" />
      </svg>
    );
  }
  if (language === "zh") {
    return (
      <svg {...commonProps}>
        <path fill="#de2910" d="M0 0h36v24H0z" />
        <path fill="#ffde00" d="m7 3 1 2.2 2.4.2-1.8 1.6.6 2.4L7 8.2 4.8 9.4 5.4 7 3.6 5.4l2.4-.2Z" />
        <circle cx="13" cy="4" r="1" fill="#ffde00" /><circle cx="15.5" cy="7" r="1" fill="#ffde00" /><circle cx="15" cy="11" r="1" fill="#ffde00" /><circle cx="12" cy="13" r="1" fill="#ffde00" />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <path fill="#006c35" d="M0 0h36v24H0z" />
      <text x="18" y="10.5" fill="#fff" fontSize="5.6" textAnchor="middle">الله</text>
      <path stroke="#fff" strokeWidth="1" strokeLinecap="round" d="M10 16h16m-2-1.5 2 1.5-2 1.5" />
    </svg>
  );
}

/** One compact, keyboard- and touch-friendly selector shared by application shells. */
export function LanguageSelector({ onLanguageChange, className = "" }) {
  const { locale, enabledLanguages, setLanguage, t } = useLocalization();
  const selected = toPublicLocaleCode(locale);
  const accessibleLabel = t("admin.languages.language");
  const options = getLanguageOptions(enabledLanguages);
  const selectedOption = options.find((option) => option.language === selected) || options[0];
  const [open, setOpen] = useState(false);
  const [focusedLanguage, setFocusedLanguage] = useState(selectedOption?.language || "ru");
  const triggerRef = useRef(null);
  const optionRefs = useRef(new Map());
  const rootRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current.get(focusedLanguage)?.focus();
  }, [focusedLanguage, open]);

  function chooseLanguage(language) {
    if (!options.some((option) => option.language === language)) return;
    setOpen(false);
    if (typeof onLanguageChange === "function") onLanguageChange(language);
    void setLanguage(language);
    triggerRef.current?.focus();
  }

  function moveFocus(language, offset) {
    const index = Math.max(0, options.findIndex((option) => option.language === language));
    const next = (index + offset + options.length) % options.length;
    setFocusedLanguage(options[next].language);
  }

  function openMenu(language = selectedOption?.language) {
    setFocusedLanguage(language || options[0]?.language || "ru");
    setOpen(true);
  }

  function handleTriggerKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = Math.max(0, options.findIndex((option) => option.language === selectedOption?.language));
      const offset = event.key === "ArrowDown" ? 1 : -1;
      openMenu(options[(index + offset + options.length) % options.length]?.language);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  function handleOptionKeyDown(event, language) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(language, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setFocusedLanguage(options[event.key === "Home" ? 0 : options.length - 1].language);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseLanguage(language);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Tab") setOpen(false);
  }

  if (!selectedOption) return null;

  return (
    <div
      className={`language-selector${className ? ` ${className}` : ""}`}
      ref={rootRef}
      data-selected-language={selectedOption.language}
    >
      <span className="language-selector-label">{accessibleLabel}</span>
      <button
        ref={triggerRef}
        className="language-selector-trigger"
        type="button"
        aria-label={`${accessibleLabel}: ${selectedOption.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <FlagIcon language={selectedOption.language} />
      </button>
      {open ? (
        <div
          className="language-selector-menu"
          id={menuId}
          role="listbox"
          aria-label={accessibleLabel}
        >
          {options.map((option) => (
            <button
              key={option.language}
              ref={(node) => {
                if (node) optionRefs.current.set(option.language, node);
                else optionRefs.current.delete(option.language);
              }}
              className="language-selector-option"
              type="button"
              role="option"
              aria-selected={option.language === selectedOption.language}
              tabIndex={option.language === focusedLanguage ? 0 : -1}
              data-language={option.language}
              data-flag-symbol={option.flag}
              data-language-name={option.name}
              onClick={() => chooseLanguage(option.language)}
              onKeyDown={(event) => handleOptionKeyDown(event, option.language)}
            >
              <FlagIcon language={option.language} />
              <span className="language-selector-option-name">{option.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
