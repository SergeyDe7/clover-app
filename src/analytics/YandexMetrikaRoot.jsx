import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_CONSENT_DENIED,
  ANALYTICS_CONSENT_GRANTED,
  ANALYTICS_CONSENT_UNSET,
  ANALYTICS_SETTINGS_OPEN_EVENT,
  readMetrikaEnvFlag,
} from "./metrikaConfig.js";
import {
  readAnalyticsConsentRecord,
  writeAnalyticsConsent,
} from "./metrikaConsent.js";
import { metrikaRuntime } from "./metrikaBrowser.js";
import { AnalyticsConsentBanner } from "./AnalyticsConsentBanner.jsx";

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Loads the tag only on the allowed storefront surface after opt-in.
 * Leaving to /lk or withdrawing consent tears the counter down.
 */
export function YandexMetrikaRoot({ active }) {
  const [record, setRecord] = useState(() =>
    typeof window === "undefined"
      ? { status: ANALYTICS_CONSENT_UNSET }
      : readAnalyticsConsentRecord(safeStorage())
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setRecord(readAnalyticsConsentRecord(safeStorage()));
    };
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, refresh);
    window.addEventListener(ANALYTICS_SETTINGS_OPEN_EVENT, openSettings);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, refresh);
      window.removeEventListener(ANALYTICS_SETTINGS_OPEN_EVENT, openSettings);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        if (!active) {
          metrikaRuntime.teardown();
          return;
        }
        metrikaRuntime.prepare();
      } catch {
        /* analytics must never block navigation */
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, sync);
    };
  }, [active, record.status]);

  useEffect(() => {
    if (!active) {
      try {
        metrikaRuntime.teardown();
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  const choose = (status) => {
    try {
      writeAnalyticsConsent(safeStorage(), status, window);
      setRecord(readAnalyticsConsentRecord(safeStorage()));
      setSettingsOpen(false);
      if (status === ANALYTICS_CONSENT_GRANTED) {
        metrikaRuntime.prepare();
        metrikaRuntime.trackPageview();
      } else {
        metrikaRuntime.teardown();
      }
    } catch {
      /* ignore */
    }
  };

  if (!active) return null;

  const consentUiEnabled = readMetrikaEnvFlag(import.meta.env);
  const showPrompt =
    consentUiEnabled && record.status === ANALYTICS_CONSENT_UNSET && !settingsOpen;
  const showSettings = consentUiEnabled && settingsOpen;

  return (
    <>
      {showPrompt ? (
        <AnalyticsConsentBanner
          mode="prompt"
          currentStatus={record.status}
          onAllow={() => choose(ANALYTICS_CONSENT_GRANTED)}
          onDeny={() => choose(ANALYTICS_CONSENT_DENIED)}
        />
      ) : null}
      {showSettings ? (
        <AnalyticsConsentBanner
          mode="settings"
          currentStatus={record.status}
          onAllow={() => choose(ANALYTICS_CONSENT_GRANTED)}
          onDeny={() => choose(ANALYTICS_CONSENT_DENIED)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
