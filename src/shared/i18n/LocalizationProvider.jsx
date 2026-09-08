import { createContext, useContext } from "react";
import { createLocalizationRuntime } from "./translationRuntime.js";

const defaultRuntime = createLocalizationRuntime();
const LocalizationContext = createContext(defaultRuntime);

export function LocalizationProvider({
  children,
  locale,
  dictionaries,
  allowForeignRuntime,
}) {
  const value = createLocalizationRuntime({
    locale,
    dictionaries,
    allowForeignRuntime,
  });

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
