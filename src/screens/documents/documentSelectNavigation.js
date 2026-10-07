export function nextDocumentOption(options, currentValue, key) {
  const enabled = options.filter(option => !option.disabled);
  if (!enabled.length) return null;
  if (key === 'Home') return enabled[0].value;
  if (key === 'End') return enabled.at(-1).value;
  const current = enabled.findIndex(option => option.value === currentValue);
  const offset = key === 'ArrowUp' ? -1 : 1;
  return enabled[(Math.max(0, current) + offset + enabled.length) % enabled.length].value;
}
