#!/usr/bin/env node
/**
 * Полная проверка карты редиректов (326 URL) + все 187 category mappings.
 * node ops/seo/verify-magazin-redirect-map.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { auditCategoryMapping, parseMapConf } from "./category-mapping-audit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://clover-spb.ru";
const HOST = "clover-spb.ru";
const RESOLVE = ["--resolve", `${HOST}:443:127.0.0.1`];

function curlHead(url) {
  const args = ["-sS", "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}", "-I", "-k", ...RESOLVE, url];
  const r = spawnSync("curl", args, { encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) return { code: "000", location: "", error: r.stderr || r.stdout };
  const parts = (r.stdout || "").trim().split(" ");
  return { code: parts[0] || "000", location: parts.slice(1).join(" ").trim() };
}

function curlFinal(url) {
  const args = [
    "-sS",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code} %{url_effective} %{num_redirects}",
    "-L",
    "--max-redirs",
    "5",
    "-k",
    ...RESOLVE,
    url,
  ];
  const r = spawnSync("curl", args, { encoding: "utf8", timeout: 20000 });
  if (r.status !== 0) return { code: "000", effective: url, redirects: -1, error: r.stderr };
  const parts = (r.stdout || "").trim().split(" ");
  const code = parts[0] || "000";
  const redirects = Number(parts[parts.length - 1]) || 0;
  const effective = parts.slice(1, -1).join(" ") || url;
  return { code, effective, redirects };
}

function classifyEntry(from, to) {
  if (from.startsWith("/magazin/folder/")) return "folder";
  if (to.includes("/product/")) return "exact_product";
  return "category";
}

async function main() {
  const classified = JSON.parse(
    fs.readFileSync(path.join(__dirname, "magazin-fallback-classified.json"), "utf8")
  );
  const mapEntries = parseMapConf(path.join(__dirname, "magazin-301-classified.map.conf"), fs);

  const categoryResults = classified.groups.confident_category.map((item) => ({
    oldSlug: item.oldSlug,
    target: item.target,
    ...auditCategoryMapping(item),
  }));
  const categorySummary = {
    total: categoryResults.length,
    ok: categoryResults.filter((r) => r.status === "ok").length,
    error: categoryResults.filter((r) => r.status === "error").length,
    warn: 0,
  };

  const byType = { exact_product: 0, category: 0, folder: 0 };
  const mapIssues = {
    genericCatalog: [],
    badOrigin: [],
    cycles: [],
    chains: [],
    notFound: [],
    errors: [],
  };

  for (const [from, to] of mapEntries) {
    byType[classifyEntry(from, to)] += 1;
    if (!to.startsWith(`${ORIGIN}/`)) {
      mapIssues.badOrigin.push({ from, to });
    }
    if (to === `${ORIGIN}/catalog` || to === `${ORIGIN}/catalog/`) {
      mapIssues.genericCatalog.push({ from, to });
    }
    if (to.includes("cloverspb.ru")) {
      mapIssues.cycles.push({ from, to, issue: "target on old domain" });
    }
    const toPath = to.replace(ORIGIN, "");
    if (mapEntries.has(toPath)) {
      mapIssues.cycles.push({ from, to, next: mapEntries.get(toPath) });
    }
  }

  const uniqueTargets = [...new Set(mapEntries.values())];
  console.error(`Checking ${uniqueTargets.length} unique target URLs...`);

  for (const target of uniqueTargets) {
    const head = curlHead(target);

    if (head.code === "301" || head.code === "308") {
      const final = curlFinal(target);
      if (final.redirects > 1) {
        mapIssues.chains.push({ target, redirects: final.redirects, effective: final.effective });
      }
      const finalCode = final.code;
      if (finalCode === "404") {
        mapIssues.notFound.push({ target, code: finalCode });
      } else if (!String(final.effective).startsWith(ORIGIN)) {
        mapIssues.errors.push({ target, issue: "final URL not on clover-spb.ru", effective: final.effective });
      }
    } else if (head.code === "404") {
      mapIssues.notFound.push({ target, code: head.code });
    } else if (!["200", "301", "308"].includes(head.code)) {
      mapIssues.errors.push({ target, issue: `unexpected ${head.code}` });
    }
  }

  const report = {
    categoryMappings: categorySummary,
    map: {
      total: mapEntries.size,
      byType,
      genericCatalog: mapIssues.genericCatalog.length,
      badOrigin: mapIssues.badOrigin.length,
      cycles: mapIssues.cycles.length,
      chains: mapIssues.chains.length,
      notFound: mapIssues.notFound.length,
      otherErrors: mapIssues.errors.length,
    },
    samples: {
      categoryErrors: categoryResults.filter((r) => r.status === "error").slice(0, 5),
      notFound: mapIssues.notFound.slice(0, 10),
      chains: mapIssues.chains.slice(0, 5),
    },
  };

  fs.writeFileSync(path.join(__dirname, "magazin-redirect-verify.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const fail =
    categorySummary.error > 0 ||
    mapIssues.genericCatalog.length > 0 ||
    mapIssues.cycles.length > 0 ||
    mapIssues.chains.length > 0 ||
    mapIssues.notFound.length > 0 ||
    mapIssues.badOrigin.length > 0 ||
    mapIssues.errors.length > 0;

  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
