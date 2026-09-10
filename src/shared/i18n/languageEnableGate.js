/** Pure decisions for foreign language enable toggles (ManagerLanguages). */

export function canSendForeignLanguageEnablePut({
  code,
  nextEnabled,
  overviewReady,
  completeness,
}) {
  if (code === "ru") return false;
  if (!nextEnabled) return true;
  return overviewReady === true && completeness?.[code]?.complete === true;
}

export function shouldShowIncompleteEnableBlock({
  nextEnabled,
  overviewReady,
  completeness,
  code,
}) {
  return (
    nextEnabled === true &&
    overviewReady === true &&
    completeness?.[code]?.complete !== true
  );
}

/** Foreign languages that are currently OFF stay disabled until overview is ready. */
export function isForeignEnableToggleDisabled({
  code,
  locked,
  busy,
  overviewReady,
  currentlyEnabled,
}) {
  if (busy || locked || code === "ru") return true;
  if (!currentlyEnabled && overviewReady !== true) return true;
  return false;
}
