#!/usr/bin/env node
/**
 * Проверяет production-карту редиректов: покрытие, инварианты, осмысленность целей.
 *
 * По умолчанию работает офлайн. С `--live` дополнительно делает GET по каждой
 * уникальной цели с `redirect: "manual"` и требует прямой 200 без Location.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseRedirectCsv,
  summarizeRows,
  validateProductionRows,
} from "./cloverspb-redirect-map.mjs";
import { STOREFRONT_INFO_SLUGS } from "../../src/screens/storefront/pages/infoPages.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

const EXPECTED_TOTAL = 910;

/** Первые сегменты публичных маршрутов витрины; должны существовать в mode.js. */
const PUBLIC_ROUTE_SEGMENTS = ["catalog", "product", "contacts", "aktsii", "install-app"];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function assertRouteTable(problems) {
  const modeSource = readFileSync(
    path.join(repoRoot, "src/screens/storefront/mode.js"),
    "utf8"
  );
  for (const segment of PUBLIC_ROUTE_SEGMENTS) {
    if (!modeSource.includes(`"${segment}"`)) {
      problems.push(`mode.js не содержит маршрут "${segment}"`);
    }
  }
  if (!modeSource.includes("STOREFRONT_INFO_SLUGS")) {
    problems.push("mode.js не подключает информационные страницы");
  }
}

function targetIsKnownRoute(pathname) {
  if (pathname === "/") return true;
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return true;
  const head = decodeURIComponent(segments[0]);
  if (PUBLIC_ROUTE_SEGMENTS.includes(head)) return true;
  return segments.length === 1 && STOREFRONT_INFO_SLUGS.includes(head);
}

/**
 * Только GET и только чтение: без cookies, без тела, без перехода по редиректам.
 * curl вместо fetch — нужен --resolve, чтобы проверять origin без обращения к внешнему DNS.
 */
async function checkLiveTargets(targets, { delayMs, resolveTo }) {
  const problems = [];
  for (const target of targets) {
    const args = [
      "-sS", "--noproxy", "*", "-o", "/dev/null", "-m", "30",
      "-w", "%{http_code} %{redirect_url}",
      "-A", "clover-seo-precutover-check",
    ];
    if (resolveTo) args.push("--resolve", resolveTo, "-k");
    args.push(target);
    const result = spawnSync("curl", args, { encoding: "utf8" });
    const [code, redirectUrl] = (result.stdout || "").trim().split(" ");
    if (code !== "200") {
      problems.push(`TARGET_STATUS ${target}: HTTP ${code || "n/a"}`);
    }
    if (redirectUrl) {
      problems.push(`TARGET_REDIRECT ${target}: ${redirectUrl}`);
    }
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return problems;
}

async function main() {
  const mapPath = arg("--map", path.join(repoRoot, "docs/seo-migration/cloverspb-production-map.csv"));
  const live = process.argv.includes("--live");
  const delayMs = Number(arg("--delay-ms", "0")) || 0;
  const resolveTo = arg("--resolve-target-origin", "");

  const rows = parseRedirectCsv(readFileSync(mapPath, "utf8"));
  const problems = [];

  const summary = summarizeRows(rows);
  if (summary.total !== EXPECTED_TOTAL) {
    problems.push(`покрытие ${summary.total}/${EXPECTED_TOTAL}`);
  }
  if (summary.other) problems.push(`строк с неизвестным action: ${summary.other}`);

  for (const row of rows) {
    const confidence = String(row.confidence || "").toUpperCase();
    if (confidence === "REVIEW" || confidence === "HUMAN REVIEW") {
      problems.push(`нерешённая строка ${row.old_path}: confidence=${confidence}`);
    }
    if (!String(row.action || "").trim()) {
      problems.push(`строка без action: ${row.old_path}`);
    }
  }

  for (const finding of validateProductionRows(rows)) {
    problems.push(`${finding.code} ${finding.row.old_path}: ${finding.message}`);
  }

  assertRouteTable(problems);

  const targets = [
    ...new Set(rows.filter((row) => row.action === "301").map((row) => row.target_url)),
  ].sort();

  for (const target of targets) {
    const url = new URL(target);
    if (!targetIsKnownRoute(url.pathname)) {
      problems.push(`UNKNOWN_TARGET_ROUTE ${target}`);
    }
    if (url.hostname.endsWith("cloverspb.ru") && url.hostname !== "clover-spb.ru") {
      problems.push(`LOOP_TARGET ${target}`);
    }
  }

  const homepageTargets = rows.filter(
    (row) => row.action === "301" && new URL(row.target_url).pathname === "/"
  );
  if (homepageTargets.length > 1) {
    problems.push(
      `на главную ведёт ${homepageTargets.length} legacy URL — допускается только старая главная`
    );
  }

  if (live) {
    problems.push(...(await checkLiveTargets(targets, { delayMs, resolveTo })));
  }

  const report = {
    map: path.relative(repoRoot, mapPath),
    total: summary.total,
    "301": summary["301"],
    "410": summary["410"],
    "404": summary["404"],
    review: 0,
    uniqueTargets: targets.length,
    liveChecked: live ? targets.length : 0,
    problems: problems.length,
  };
  console.log(JSON.stringify(report, null, 1));

  if (problems.length) {
    console.error("\nНайденные проблемы:");
    for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("verify-cloverspb-redirect-map: PASS");
}

main();
