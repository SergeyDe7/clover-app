#!/usr/bin/env node
/**
 * Генерирует nginx map-файлы старого домена из production-карты редиректов.
 *
 * Ни один legacy URL не содержит query-строки, поэтому отдельные query-карты не
 * создаются: неизвестный путь всегда попадает в default 404.
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  parseRedirectCsv,
  validateProductionRows,
} from "./cloverspb-redirect-map.mjs";

const HEADER = [
  "# Сгенерировано scripts/seo/generate-cloverspb-nginx-map.mjs — не редактировать вручную.",
  "# Источник: docs/seo-migration/cloverspb-production-map.csv",
];

/** nginx читает строку в кавычках: экранируем обратный слэш, кавычку и управляющие символы. */
export function escapeNginxString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "");
}

function sortByPath(rows) {
  return [...rows].sort((a, b) => (a.old_path < b.old_path ? -1 : a.old_path > b.old_path ? 1 : 0));
}

export function renderPathRedirectMap(rows) {
  const lines = [...HEADER];
  for (const row of sortByPath(rows.filter((item) => item.action === "301"))) {
    lines.push(
      `"${escapeNginxString(row.old_path)}" "${escapeNginxString(row.target_url)}";`
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderPathGoneMap(rows) {
  const lines = [...HEADER];
  for (const row of sortByPath(rows.filter((item) => item.action === "410"))) {
    lines.push(`"${escapeNginxString(row.old_path)}" 1;`);
  }
  return `${lines.join("\n")}\n`;
}

function writeAtomic(filePath, text) {
  const temporary = `${filePath}.tmp`;
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, filePath);
  return createHash("sha256").update(text).digest("hex");
}

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function main() {
  const input = arg("--input", "docs/seo-migration/cloverspb-production-map.csv");
  const redirectsOut = arg(
    "--path-redirects",
    "ops/nginx/legacy-domain/cloverspb-path-redirects.map"
  );
  const goneOut = arg("--path-gone", "ops/nginx/legacy-domain/cloverspb-path-gone.map");

  const rows = parseRedirectCsv(readFileSync(input, "utf8"));
  const findings = validateProductionRows(rows);
  if (findings.length) {
    console.error("Генерация остановлена: production-карта не прошла инварианты.");
    for (const item of findings.slice(0, 20)) {
      console.error(`  - ${item.code} ${item.row.old_path}: ${item.message}`);
    }
    process.exit(1);
  }

  const redirects = renderPathRedirectMap(rows);
  const gone = renderPathGoneMap(rows);
  const redirectsHash = writeAtomic(redirectsOut, redirects);
  const goneHash = writeAtomic(goneOut, gone);

  console.log(
    JSON.stringify(
      {
        redirects: {
          file: redirectsOut,
          entries: rows.filter((row) => row.action === "301").length,
          sha256: redirectsHash,
        },
        gone: {
          file: goneOut,
          entries: rows.filter((row) => row.action === "410").length,
          sha256: goneHash,
        },
        default404: rows.filter((row) => row.action === "404").length,
      },
      null,
      1
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
