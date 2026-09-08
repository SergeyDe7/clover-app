import { getGlobalState, setGlobalState } from "./db.js";
import { PUBLIC_LOCALE_CODES } from "../../src/shared/i18n/languageRegistry.js";
import {
  LOCALIZATION_SETTINGS_KEY,
  applyEnabledLanguages,
  buildTranslationRows,
  computeLanguageCompleteness,
  emptyLocalizationSettings,
  emptyTranslationStore,
  filterTranslationRows,
  namespaceToCompletenessDomain,
  normalizeLocalizationSettings,
  saveSettingsPreservingTranslations,
} from "../../src/shared/i18n/localizationSettings.js";

function completenessItems(store) {
  const rows = buildTranslationRows(store);
  const items = [];
  for (const row of rows) {
    const domain = namespaceToCompletenessDomain(row.namespace);
    for (const [language, cell] of Object.entries(row.languages || {})) {
      items.push({
        domain,
        language,
        state: cell.state,
        stale: cell.stale,
        critical: row.critical,
        value: cell.value,
      });
    }
  }
  return items;
}

export function readLocalizationSettings() {
  return normalizeLocalizationSettings(
    getGlobalState(LOCALIZATION_SETTINGS_KEY, emptyLocalizationSettings())
  );
}

export function readTranslationStore() {
  return emptyTranslationStore();
}

export function completenessByLanguage(store = readTranslationStore()) {
  const items = completenessItems(store);
  const reports = {};
  for (const code of PUBLIC_LOCALE_CODES) {
    reports[code] = computeLanguageCompleteness(code, items);
  }
  return reports;
}

export function writeLocalizationSettings(patch = {}, actor = "") {
  const current = readLocalizationSettings();
  const translations = readTranslationStore();
  const reports = completenessByLanguage(translations);
  const applied = applyEnabledLanguages(
    current.enabledLanguages,
    patch.enabledLanguages ?? current.enabledLanguages,
    reports
  );
  const saved = saveSettingsPreservingTranslations(current, translations, {
    enabledLanguages: applied.enabledLanguages,
    updatedBy: actor,
  });
  setGlobalState(LOCALIZATION_SETTINGS_KEY, saved.settings);
  return {
    settings: saved.settings,
    rejected: applied.rejected,
    completeness: reports,
  };
}

export function listWorkspaceRows(filters = {}) {
  return filterTranslationRows(buildTranslationRows(readTranslationStore()), filters);
}
