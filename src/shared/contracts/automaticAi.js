export const automaticAiKey = (importId, sheetId = '') => JSON.stringify([importId, sheetId]);

export function skippedAiMessage(aiNeed) {
  return aiNeed?.reason === 'LOCAL_FACTS_COMPLETE'
    ? 'Реквизиты распознаны локально — ИИ не понадобился.'
    : 'ИИ не вызван: недостающие сведения нужно уточнить по документам.';
}

export function canAutomaticallyEnhanceCard({ mode, consent, available, onlyWhenNeeded = false, aiNeed, importId, sheetId = '', selectionRequired = false, manualChanges = {}, blocked = false, attemptedKeys = new Set() }) {
  return (onlyWhenNeeded !== true || aiNeed?.needed === true) && mode === true && consent === true && available === true && Boolean(importId) && !selectionRequired && !blocked &&
    !Object.values(manualChanges).some(Boolean) && !attemptedKeys.has(automaticAiKey(importId, sheetId));
}

export function blocksAutomaticAiSession(code) {
  return ['AI_AUTH_FAILED', 'AI_ACCESS_DENIED', 'AI_KEY_REQUIRED', 'AI_MODEL_UNAVAILABLE', 'AI_QUOTA_EXCEEDED', 'AI_CREDITS_EXHAUSTED', 'AI_ORG_BUDGET_EXCEEDED', 'AI_PROJECT_BUDGET_EXCEEDED', 'AI_ORG_USAGE_EXCEEDED', 'AI_LIMIT_REACHED', 'AI_REGION_UNSUPPORTED'].includes(code);
}

export async function runAutomaticCardEnhancement(settings, enhance) {
  if (!canAutomaticallyEnhanceCard(settings)) return false;
  settings.attemptedKeys.add(automaticAiKey(settings.importId, settings.sheetId));
  await enhance();
  return true;
}
