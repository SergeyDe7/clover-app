import { existsSync, readFileSync } from "node:fs";
import { PUBLIC_LOCALE_ROUTES_ENV_KEY } from "../../src/shared/i18n/localeRoutesBuildFlag.js";

function stripQuotes(value) {
  const next = String(value || "").trim();
  if (
    (next.startsWith('"') && next.endsWith('"')) ||
    (next.startsWith("'") && next.endsWith("'"))
  ) {
    return next.slice(1, -1);
  }
  return next;
}

function dotenvKey(raw) {
  let key = String(raw || "").trim();
  if (key.toLowerCase().startsWith("export ")) {
    key = key.slice(7).trim();
  }
  return key;
}

/**
 * Read only CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED from a dotenv file.
 * Never returns other keys. Last assignment wins.
 * Distinguishes missing file, unreadable file, missing key, and explicit empty.
 */
export function inspectLocaleRoutesFlagFromFile(filePath) {
  if (!filePath) {
    return {
      fileExists: false,
      keyFound: false,
      value: "",
      error: "env-file path is empty",
    };
  }
  if (!existsSync(filePath)) {
    return {
      fileExists: false,
      keyFound: false,
      value: "",
      error: `env-file not found: ${filePath}`,
    };
  }
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    return {
      fileExists: true,
      keyFound: false,
      value: "",
      error: `env-file unreadable: ${error.message}`,
    };
  }
  let keyFound = false;
  let value = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = dotenvKey(line.slice(0, eq));
    if (key !== PUBLIC_LOCALE_ROUTES_ENV_KEY) continue;
    keyFound = true;
    value = stripQuotes(line.slice(eq + 1));
  }
  return { fileExists: true, keyFound, value, error: "" };
}

export function readLocaleRoutesFlagFromFile(filePath) {
  return inspectLocaleRoutesFlagFromFile(filePath).value;
}
