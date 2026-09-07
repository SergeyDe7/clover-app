#!/usr/bin/env node
/**
 * Собирает production-карту редиректов из discovery-карты и утверждённых решений.
 *
 * Detерминированно: одинаковый вход даёт побайтово одинаковый выход, поэтому
 * результат можно перегенерировать и сверить в ревью.
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import {
  PRODUCTION_COLUMNS,
  parseRedirectCsv,
  serializeRedirectCsv,
  summarizeRows,
  validateProductionRows,
} from "./cloverspb-redirect-map.mjs";

export const DISPOSITIONS = new Set([
  "PROMOTE_301",
  "PROMOTE_410",
  "CONFIRM_404",
  "KEEP_REVIEW",
]);

export function buildProductionRows(discoveryRows, decisionRows) {
  const errors = [];
  const decisions = new Map();

  for (const decision of decisionRows) {
    const key = decision.old_path;
    if (decisions.has(key)) {
      errors.push(`дублирующее решение для ${key}`);
      continue;
    }
    if (!DISPOSITIONS.has(decision.disposition)) {
      errors.push(`неизвестная disposition "${decision.disposition}" для ${key}`);
      continue;
    }
    if (decision.disposition === "PROMOTE_301") {
      if (!decision.approved_target_url) {
        errors.push(`PROMOTE_301 без approved_target_url: ${key}`);
      }
    } else if (decision.approved_target_url) {
      errors.push(`${decision.disposition} не должен иметь approved_target_url: ${key}`);
    }
    if (!decision.evidence || !decision.reviewer || !decision.reviewed_at) {
      errors.push(`решение без evidence/reviewer/reviewed_at: ${key}`);
    }
    decisions.set(key, decision);
  }

  const required = new Set(
    discoveryRows
      .filter((row) => row.action !== "301")
      .map((row) => row.old_path)
  );
  for (const key of required) {
    if (!decisions.has(key)) errors.push(`нет решения для ${key}`);
  }
  for (const key of decisions.keys()) {
    if (!required.has(key)) errors.push(`лишнее решение для ${key}`);
  }

  const rows = [];
  for (const row of discoveryRows) {
    const decision = decisions.get(row.old_path);
    if (!decision) {
      rows.push({ ...row });
      continue;
    }
    if (decision.source_action !== row.action) {
      errors.push(
        `source_action "${decision.source_action}" не совпадает с discovery "${row.action}" для ${row.old_path}`
      );
    }
    if (decision.disposition === "KEEP_REVIEW") {
      errors.push(`нерешённый KEEP_REVIEW остаётся в наборе: ${row.old_path}`);
      continue;
    }
    if (decision.disposition === "PROMOTE_301") {
      const target = new URL(decision.approved_target_url);
      rows.push({
        ...row,
        target_url: decision.approved_target_url,
        target_path: target.pathname,
        target_status: "200",
        target_type: "info",
        confidence: "EXACT",
        reason: decision.evidence,
        action: "301",
      });
      continue;
    }
    rows.push({
      ...row,
      target_url: "",
      target_path: "",
      target_status: "",
      target_type: "",
      confidence: "NO_MATCH",
      reason: decision.evidence,
      action: decision.disposition === "PROMOTE_410" ? "410" : "404",
    });
  }

  return { rows, errors };
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function main() {
  const discoveryPath = arg("--discovery", "docs/seo-migration/cloverspb-redirect-map.csv");
  const decisionsPath = arg("--decisions", "docs/seo-migration/cloverspb-review-decisions.csv");
  const outputPath = arg("--output", "docs/seo-migration/cloverspb-production-map.csv");

  const discovery = parseRedirectCsv(readFileSync(discoveryPath, "utf8"));
  const decisions = parseRedirectCsv(readFileSync(decisionsPath, "utf8"));
  const { rows, errors } = buildProductionRows(discovery, decisions);

  if (errors.length) {
    console.error("Решения не согласованы с discovery-картой:");
    for (const message of errors) console.error(`  - ${message}`);
    process.exit(1);
  }

  const findings = validateProductionRows(rows);
  if (findings.length) {
    console.error("Инварианты production-карты нарушены:");
    for (const item of findings.slice(0, 20)) {
      console.error(`  - ${item.code} ${item.row.old_path}: ${item.message}`);
    }
    process.exit(1);
  }

  const text = serializeRedirectCsv(rows, PRODUCTION_COLUMNS);
  const temporary = `${outputPath}.tmp`;
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, outputPath);

  const summary = summarizeRows(rows);
  console.log(`production map: ${path.relative(process.cwd(), outputPath)}`);
  console.log(JSON.stringify(summary));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
