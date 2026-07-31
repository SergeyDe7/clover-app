import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptsDir, "../..");

/**
 * Concatenate frontend sources under src/ so static verifies survive App → screens split.
 */
export function readFrontendUiSource(root = projectRoot) {
  const srcRoot = path.join(root, "src");
  const chunks = [];

  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(jsx?|css)$/i.test(name)) {
        chunks.push(readFileSync(full, "utf8"));
      }
    }
  }

  walk(srcRoot);
  return chunks.join("\n");
}
