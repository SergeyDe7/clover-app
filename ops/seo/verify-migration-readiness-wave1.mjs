#!/usr/bin/env node
/**
 * SEO Domain Migration readiness verifier (без активации 301).
 *
 *   node ops/seo/verify-migration-readiness-wave1.mjs --resolve
 *
 * Классификации: 301 exact product | subcategory | category | 410 gone |
 * generic fallback | unmapped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseMapConf } from "./category-mapping-audit.mjs";
import {
  listCategorySlugEntries,
  buildStorefrontPath,
} from "../../src/screens/storefront/storefrontSlugs.js";
import { isCatalogPageNoindex } from "../../src/screens/storefront/storefrontCatalogSeo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://clover-spb.ru";
const useResolve = process.argv.includes("--resolve");
const MAP_FILE = path.join(__dirname, "magazin-301-classified.map.conf");
const SOURCE_FILE = path.join(__dirname, "magazin-urls-source.txt");
const GONE_FILE = path.join(__dirname, "magazin-410-gone.json");

function curlMeta(url) {
  const args = [
    "-sS",
    "-k",
    "--max-redirs",
    "0",
    "--connect-timeout",
    "15",
    "--max-time",
    "40",
    "-o",
    "/tmp/mig-ready-body.html",
    "-w",
    "%{http_code}|%{redirect_url}",
  ];
  if (useResolve) args.push("--resolve", "clover-spb.ru:443:127.0.0.1");
  args.push(url);
  const r = spawnSync("curl", args, {
    encoding: "utf8",
    timeout: 50_000,
    maxBuffer: 15 * 1024 * 1024,
  });
  const meta = (r.stdout || "").trim();
  const [code, location = ""] = meta.split("|");
  let body = "";
  try {
    body = fs.readFileSync("/tmp/mig-ready-body.html", "utf8");
  } catch {
    body = "";
  }
  return { code: code || "000", location, body };
}

function pick(re, html) {
  const m = html.match(re);
  return m ? m[1].trim() : "";
}

function buildTaxonomy() {
  const pages = new Map();
  for (const entry of listCategorySlugEntries()) {
    const cat = { name: "catalog", category: entry.name };
    const catPath = buildStorefrontPath(cat);
    pages.set(catPath, {
      path: catPath,
      noindex: isCatalogPageNoindex(cat),
      subcategory: "",
    });
    for (const child of entry.children || []) {
      const route = {
        name: "catalog",
        category: entry.name,
        subcategory: child.name,
      };
      const p = buildStorefrontPath(route);
      pages.set(p, {
        path: p,
        noindex: isCatalogPageNoindex(route),
        subcategory: child.name,
      });
    }
  }
  return pages;
}

function classify301Target(toUrl, tax) {
  const pathOnly = toUrl.replace(ORIGIN, "") || "/";
  if (pathOnly === "/" || pathOnly === "") return "fallback_home";
  if (pathOnly === "/catalog") return "fallback_catalog";
  if (pathOnly.includes("/product/")) return "exact_product";
  const meta = tax.get(pathOnly);
  if (meta?.subcategory) return "exact_subcategory";
  if (meta) return "exact_category";
  return "catalog_unknown";
}

function loadSourcePaths() {
  if (!fs.existsSync(SOURCE_FILE)) return [];
  return fs
    .readFileSync(SOURCE_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      try {
        return new URL(l).pathname;
      } catch {
        return l.startsWith("/") ? l : `/${l}`;
      }
    });
}

function loadGone() {
  if (!fs.existsSync(GONE_FILE)) return [];
  const data = JSON.parse(fs.readFileSync(GONE_FILE, "utf8"));
  return Array.isArray(data.entries) ? data.entries : [];
}

const tax = buildTaxonomy();
const mapEntries = parseMapConf(MAP_FILE, fs);
const mapping = [...mapEntries.entries()].map(([from, to]) => ({
  from,
  to: String(to).replace(/;$/, ""),
}));
const goneEntries = loadGone();
const goneByFrom = new Map(
  goneEntries.map((e) => [e.from || e.oldUrl, e])
);

const sourceSet = new Set(loadSourcePaths());
const classifiedFrom = new Set([
  ...mapping.map((e) => e.from),
  ...goneByFrom.keys(),
]);

const unmapped = [...sourceSet].filter((p) => !classifiedFrom.has(p)).sort();
const fromCount = new Map();
for (const e of mapping) {
  fromCount.set(e.from, (fromCount.get(e.from) || 0) + 1);
}
for (const from of goneByFrom.keys()) {
  fromCount.set(from, (fromCount.get(from) || 0) + 1);
}
const conflicts = [...fromCount.entries()].filter(([, n]) => n > 1);

// Overlap map+gone = conflict
const overlap = mapping.filter((e) => goneByFrom.has(e.from));

const classes = {
  exact_product: 0,
  exact_subcategory: 0,
  exact_category: 0,
  fallback_catalog: 0,
  fallback_home: 0,
  catalog_unknown: 0,
  gone_410: goneEntries.length,
};

for (const e of mapping) {
  const c = classify301Target(e.to, tax);
  e.class = c;
  e.toPath = e.to.replace(ORIGIN, "") || "/";
  classes[c] = (classes[c] || 0) + 1;
}

const generics = mapping.filter(
  (e) => e.class === "fallback_catalog" || e.class === "fallback_home"
);

const uniqueTargets = [...new Set(mapping.map((e) => e.to))];
const targetResults = new Map();
let target200 = 0;
let target404 = 0;
let targetRedirect = 0;
let targetNoindex = 0;
let targetSoft404 = 0;
let foreignHost = 0;
const noindexMapped = [];
const problemTargets = [];

for (const url of uniqueTargets) {
  if (!String(url).startsWith(ORIGIN)) {
    foreignHost += 1;
    problemTargets.push({ url, kind: "foreign_host" });
  }
  const { code, location, body } = curlMeta(url);
  const canonical =
    pick(/rel=["']canonical["'][^>]+href=["']([^"']+)/i, body) ||
    pick(/href=["']([^"']+)["'][^>]+rel=["']canonical/i, body);
  const robots =
    pick(/name=["']robots["'][^>]+content=["']([^"']+)/i, body) ||
    pick(/content=["']([^"']+)["'][^>]+name=["']robots/i, body);
  const pathOnly = url.replace(ORIGIN, "") || "/";
  const taxNoindex = Boolean(tax.get(pathOnly)?.noindex);
  const metaNoindex = Boolean(robots && /\bnoindex\b/i.test(robots));
  const soft404 = code === "200" && /Страница не найдена/i.test(body);
  const selfCanonical = Boolean(canonical && canonical === url);
  const row = {
    url,
    code,
    location,
    canonical,
    taxNoindex,
    metaNoindex,
    soft404,
    selfCanonical,
  };
  targetResults.set(url, row);

  if (code === "200") target200 += 1;
  else if (String(code).startsWith("3")) {
    targetRedirect += 1;
    problemTargets.push({ ...row, kind: "redirect" });
  } else if (code === "404") {
    target404 += 1;
    problemTargets.push({ ...row, kind: "404" });
  } else problemTargets.push({ ...row, kind: "http_other" });

  if (taxNoindex || metaNoindex) {
    targetNoindex += 1;
    problemTargets.push({ ...row, kind: "noindex" });
  }
  if (soft404) {
    targetSoft404 += 1;
    problemTargets.push({ ...row, kind: "soft404" });
  }
  if (code === "200" && canonical && !selfCanonical) {
    problemTargets.push({ ...row, kind: "canonical" });
  }
}

for (const e of mapping) {
  const t = targetResults.get(e.to);
  if (
    t &&
    (t.taxNoindex || t.metaNoindex || /\/prochee(?:\/|$)/.test(e.toPath))
  ) {
    noindexMapped.push({
      from: e.from,
      to: e.to,
      class: e.class,
      taxNoindex: t.taxNoindex,
      metaNoindex: t.metaNoindex,
    });
  }
}

const goneMissingReason = goneEntries.filter(
  (e) => !String(e.reason || e.justification || "").trim()
);
const chains = [...targetResults.values()].filter((t) =>
  String(t.code).startsWith("3")
).length;
const loops = mapping.filter((e) => e.from === e.toPath).length;

const totalClassified = mapping.length + goneEntries.length;
const pct = (n) =>
  totalClassified ? Math.round((10000 * n) / totalClassified) / 100 : 0;

const pass =
  sourceSet.size > 0 &&
  unmapped.length === 0 &&
  conflicts.length === 0 &&
  overlap.length === 0 &&
  loops === 0 &&
  chains === 0 &&
  target404 === 0 &&
  targetRedirect === 0 &&
  targetSoft404 === 0 &&
  foreignHost === 0 &&
  generics.length === 0 &&
  noindexMapped.length === 0 &&
  classes.catalog_unknown === 0 &&
  goneMissingReason.length === 0 &&
  target200 === uniqueTargets.length;

const report = {
  pass,
  totals: {
    TOTAL_OLD_URLS: sourceSet.size || totalClassified,
    classified: totalClassified,
    map_301_entries: mapping.length,
    exact_product: classes.exact_product,
    exact_subcategory: classes.exact_subcategory,
    exact_category: classes.exact_category,
    gone_410: classes.gone_410,
    generic_fallback: generics.length,
    unmapped: unmapped.length,
    target_200: target200,
    target_404: target404,
    target_noindex_unique: targetNoindex,
    target_redirect: targetRedirect,
    noindex_mapped_entries: noindexMapped.length,
    chains,
    loops,
    conflicts: conflicts.length,
  },
  percentages: {
    exact_product: pct(classes.exact_product),
    exact_subcategory: pct(classes.exact_subcategory),
    exact_category: pct(classes.exact_category),
    gone_410: pct(classes.gone_410),
    generic_fallback: pct(generics.length),
  },
  unmapped,
  conflicts: conflicts.map(([from, n]) => ({ from, count: n })),
  overlap_map_and_gone: overlap.map((e) => e.from),
  generics,
  noindexMapped,
  goneEntries,
  goneMissingReason: goneMissingReason.map((e) => e.from || e.oldUrl),
  problemTargets: problemTargets.slice(0, 40),
};

console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
