import { Children, useEffect, useId, useRef, useState } from 'react';
import { nextDocumentOption } from './documentSelectNavigation.js';
import './DocumentSelect.css';

export default function DocumentSelect({ children, value, onChange, id, disabled = false, required, ...ariaProps }) {
  const generatedId = useId();
  const triggerId = id || `${generatedId}-select`;
  const menuId = `${triggerId}-options`;
  const root = useRef(null);
  const trigger = useRef(null);
  const optionRefs = useRef(new Map());
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(null);
  const options = Children.toArray(children).filter(child => child?.type === 'option').map(child => ({ value: String(child.props.value ?? ''), label: child.props.children, disabled: child.props.disabled === true }));
  const selected = options.find(option => option.value === String(value ?? ''));
  const active = options.find(option => option.value === activeValue && !option.disabled) || selected && !selected.disabled && selected || options.find(option => !option.disabled);

  useEffect(() => {
    if (!open) return;
    const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const observer = new MutationObserver(() => { if (trigger.current?.matches(':disabled') || trigger.current?.closest('[hidden]')) setOpen(false); });
    for (let ancestor = trigger.current?.parentElement; ancestor; ancestor = ancestor.parentElement) observer.observe(ancestor, { attributes: true, attributeFilter: ['disabled', 'hidden'] });
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('focusin', closeOutside); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open && !disabled) optionRefs.current.get(active?.value)?.focus(); }, [open, disabled, active?.value]);

  function blocked() { return disabled || trigger.current?.matches(':disabled') || !options.some(option => !option.disabled); }
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  function choose(option, event) {
    event.preventDefault(); event.stopPropagation();
    if (blocked() || option.disabled) { close(); return; }
    close(true);
    onChange?.({ target: { value: option.value } });
  }
  function handleKey(event) {
    if (blocked()) { close(); return; }
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      setActiveValue(nextDocumentOption(options, open ? active?.value : selected?.value, event.key)); setOpen(true); return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation();
      if (open && active) choose(active, event); else { setActiveValue(selected?.value ?? null); setOpen(true); }
    }
  }
  return <div className="document-select" ref={root}>
    <button {...ariaProps} id={triggerId} ref={trigger} type="button" role="combobox" disabled={disabled} className="document-select-trigger" aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={menuId} aria-required={required || undefined} onKeyDown={handleKey} onClick={event => { event.preventDefault(); if (!blocked()) { setActiveValue(selected?.value ?? null); setOpen(current => !current); } }}>
      <span>{selected?.label || options[0]?.label || 'Нет вариантов'}</span>
      <svg className="document-select-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {open && !disabled && <div id={menuId} role="listbox" className="document-select-menu" aria-label={ariaProps['aria-label']} aria-labelledby={ariaProps['aria-labelledby']}>
      {options.map((option, index) => <div key={option.value} id={`${menuId}-${index}`} ref={element => { if (element) optionRefs.current.set(option.value, element); else optionRefs.current.delete(option.value); }} role="option" aria-selected={option.value === String(value ?? '')} aria-disabled={option.disabled || undefined} tabIndex={option.value === active?.value ? 0 : -1} onKeyDown={handleKey} onClick={event => choose(option, event)}>{option.label}</div>)}
    </div>}
  </div>;
}
