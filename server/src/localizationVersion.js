/**
 * In-transaction localization catalog version bump.
 * Does not open its own transaction. Callers must already be inside
 * runInTransaction() or a single-statement write path that does not nest BEGIN.
 */
import { getGlobalState, setGlobalState } from "./db.js";
import {
  LOCALIZATION_SETTINGS_KEY,
  emptyLocalizationSettings,
  normalizeLocalizationSettings,
} from "../../src/shared/i18n/localizationSettings.js";

export function readLocalizationCatalogSettings() {
  return normalizeLocalizationSettings(
    getGlobalState(LOCALIZATION_SETTINGS_KEY, emptyLocalizationSettings())
  );
}

export function bumpLocalizationCatalogVersion(actor = "", patch = {}) {
  const current = readLocalizationCatalogSettings();
  const next = normalizeLocalizationSettings({
    ...current,
    ...(patch && typeof patch === "object" ? patch : {}),
    catalogVersion: Number(current.catalogVersion || 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || current.updatedBy || "",
  });
  setGlobalState(LOCALIZATION_SETTINGS_KEY, next);
  return next;
}
