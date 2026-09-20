/**
 * Production Metrika bake gate for prepare/promote.
 * Reads ONE allowlisted key from the committed flags file.
 * Does not source dotenv and does not read server/.env.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const METRIKA_FLAGS_REL = "scripts/linux/production-ui-build.flags";
export const METRIKA_ENABLED_KEY = "VITE_YANDEX_METRIKA_ENABLED";
const ALLOWED_KEYS = new Set([METRIKA_ENABLED_KEY]);
const FORBIDDEN_SUBSTRINGS = [
  "VITE_YANDEX_METRIKA_TEST_MODE",
  "VITE_YANDEX_METRIKA_TAG_SRC",
  "JWT_",
  "PASSWORD",
  "SECRET",
  "ONEC_",
];

export function normalizeMetrikaExpect(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "on" || raw === "1" || raw === "enabled") return "on";
  if (raw === "off" || raw === "0" || raw === "disabled" || raw === "") return "off";
  throw new Error(`metrika expect must be on or off, got: ${value}`);
}

export function parseProductionUiBuildFlags(text) {
  const values = {};
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^export\s+/i.test(trimmed)) {
      throw new Error("production-ui-build.flags must not use export");
    }
    if (!/^[A-Z][A-Z0-9_]*=/.test(trimmed)) {
      throw new Error(`unsupported flags line: ${trimmed.slice(0, 80)}`);
    }
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (FORBIDDEN_SUBSTRINGS.some((needle) => key.includes(needle) || trimmed.includes(needle))) {
      throw new Error(`flags file must not contain ${key}`);
    }
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`flags file may only set ${METRIKA_ENABLED_KEY}`);
    }
    if (value !== "" && value !== "0" && value !== "1") {
      throw new Error(`${METRIKA_ENABLED_KEY} must be 0, 1, or empty`);
    }
    values[key] = value;
  }
  const blob = String(text || "");
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    if (blob.includes(needle)) {
      throw new Error(`flags file must not contain ${needle}`);
    }
  }
  return values;
}

export function readProductionUiBuildFlags(filePath) {
  const text = readFileSync(filePath, "utf8");
  return parseProductionUiBuildFlags(text);
}

export function expectMetrikaFromFlags(values) {
  return String(values?.[METRIKA_ENABLED_KEY] || "").trim() === "1" ? "on" : "off";
}

export function viteExportValue(expect) {
  return normalizeMetrikaExpect(expect) === "on" ? "1" : "";
}

function listJsFiles(distDir) {
  const root = path.resolve(distDir);
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, name.name);
      if (name.isDirectory()) {
        walk(full);
        continue;
      }
      if (name.isFile() && name.name.endsWith(".js")) files.push(full);
    }
  };
  walk(root);
  return files;
}

export function inspectBakedMetrika(distDir) {
  let enabled = false;
  let testMode = false;
  for (const file of listJsFiles(distDir)) {
    const text = readFileSync(file, "utf8");
    if (
      /VITE_YANDEX_METRIKA_ENABLED\s*:\s*`1`/.test(text) ||
      /VITE_YANDEX_METRIKA_ENABLED"\s*:\s*"1"/.test(text)
    ) {
      enabled = true;
    }
    if (
      /VITE_YANDEX_METRIKA_TEST_MODE\s*:\s*`1`/.test(text) ||
      /VITE_YANDEX_METRIKA_TEST_MODE"\s*:\s*"1"/.test(text)
    ) {
      testMode = true;
    }
  }
  return { enabled, testMode };
}

export function assertBakedMetrika(distDir, expect) {
  const wanted = normalizeMetrikaExpect(expect);
  const baked = inspectBakedMetrika(distDir);
  if (wanted === "on") {
    if (!baked.enabled) {
      throw new Error("expected Metrika ON in artifact, but VITE_YANDEX_METRIKA_ENABLED=1 was not baked");
    }
    if (baked.testMode) {
      throw new Error("production Metrika ON artifact must not bake VITE_YANDEX_METRIKA_TEST_MODE=1");
    }
  } else if (baked.enabled) {
    throw new Error("expected Metrika OFF in artifact, but VITE_YANDEX_METRIKA_ENABLED=1 was baked");
  }
  return baked;
}

function argValue(args, name) {
  const idx = args.indexOf(name);
  if (idx < 0) return "";
  return String(args[idx + 1] || "");
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--print-expect")) {
    const flagsFile = argValue(argv, "--flags-file");
    if (!flagsFile) throw new Error("--flags-file is required");
    const expect = expectMetrikaFromFlags(readProductionUiBuildFlags(flagsFile));
    process.stdout.write(`${expect}\n`);
    return 0;
  }
  if (argv.includes("--print-export")) {
    const flagsFile = argValue(argv, "--flags-file");
    if (!flagsFile) throw new Error("--flags-file is required");
    process.stdout.write(
      `${viteExportValue(expectMetrikaFromFlags(readProductionUiBuildFlags(flagsFile)))}\n`
    );
    return 0;
  }
  if (argv.includes("--dist")) {
    const dist = argValue(argv, "--dist");
    const expect = argValue(argv, "--expect");
    assertBakedMetrika(dist, expect);
    console.log(`metrika-artifact: ${normalizeMetrikaExpect(expect)}`);
    return 0;
  }
  throw new Error(
    "usage: assert-metrika-release.mjs --print-expect|--print-export --flags-file <file> | --dist <dir> --expect on|off"
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(String(error.message || error));
    process.exit(1);
  }
}
