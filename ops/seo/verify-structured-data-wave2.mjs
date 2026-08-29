#!/usr/bin/env node
/**
 * SEO Structured Data Wave 2 — openingHoursSpecification + WebSite (home only).
 *
 *   node ops/seo/verify-structured-data-wave2.mjs --resolve
 */
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ORGANIZATION_ID,
  STOREFRONT_ORIGIN,
  WEBSITE_ID,
  parseContactHoursToOpeningHoursSpec,
} from "../../src/screens/storefront/storefrontJsonLd.js";

const execFileAsync = promisify(execFile);
const ORIGIN = STOREFRONT_ORIGIN;
const useResolve = process.argv.includes("--resolve");
const CONCURRENCY = Number(process.env.SD_CONCURRENCY || 12);

function curlArgs(url) {
  const args = [
    "-sS",
    "-k",
    "--connect-timeout",
    "20",
    "--max-time",
    "60",
    "--max-redirs",
    "0",
    "-w",
    "\n__META__%{http_code}",
  ];
  if (useResolve) {
    args.push(
      "--resolve",
      "clover-spb.ru:443:127.0.0.1",
      "--resolve",
      "www.clover-spb.ru:443:127.0.0.1"
    );
  }
  args.push(url);
  return args;
}

function parseCurl(stdout, stderr) {
  const out = stdout || "";
  const idx = out.lastIndexOf("\n__META__");
  if (idx < 0) return { code: "000", body: out, err: stderr || "no meta" };
  return {
    code: out.slice(idx + "\n__META__".length).trim(),
    body: out.slice(0, idx),
    err: stderr || "",
  };
}

function curl(url) {
  const r = spawnSync("curl", curlArgs(url), {
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return parseCurl(r.stdout, r.stderr);
}

async function curlAsync(url) {
  try {
    const { stdout, stderr } = await execFileAsync("curl", curlArgs(url), {
      encoding: "utf8",
      timeout: 90_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return parseCurl(stdout, stderr);
  } catch (e) {
    return { code: "000", body: "", err: String(e.message || e) };
  }
}

function api(path) {
  const r = spawnSync(
    "curl",
    ["-sS", "--connect-timeout", "10", "--max-time", "30", `http://127.0.0.1:4100${path}`],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 30 * 1024 * 1024 }
  );
  try {
    return JSON.parse(r.stdout || "{}");
  } catch {
    return {};
  }
}

function extractJsonLd(html) {
  const blocks = [];
  const re =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      blocks.push({ ok: true, data: JSON.parse(raw), raw });
    } catch (e) {
      blocks.push({ ok: false, error: String(e.message || e), raw });
    }
  }
  return blocks;
}

function byType(blocks, type) {
  return blocks.filter((b) => b.ok && b.data?.["@type"] === type).map((b) => b.data);
}

function deepHasType(obj, type) {
  const s = JSON.stringify(obj);
  return s.includes(`"@type":"${type}"`) || s.includes(`"@type": "${type}"`);
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () =>
      worker()
    )
  );
  return results;
}

function specsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const site = api("/api/public/site")?.site || {};
const products = api("/api/public/catalog")?.products || [];
const expectedHours = parseContactHoursToOpeningHoursSpec(site.contactHours || "");

const report = {
  siteHoursRaw: site.contactHours || null,
  hoursParse: expectedHours,
  home: { ok: false, errors: [] },
  organization: { ok: false, errors: [], sample: null },
  website: { ok: false, errors: [] },
  forbidden: { ok: true, failures: [] },
  products: {
    checked: 0,
    withProduct: 0,
    withOffer: 0,
    withHours: 0,
    withWebSite: 0,
    schemaErrors: 0,
    failures: [],
  },
  duplicates: { org: 0, website: 0, product: 0 },
  parseErrors: 0,
  foreignHost: 0,
  sitemapCount: 0,
  storefrontCount: products.length,
};

if (!expectedHours.ok) {
  console.error("FATAL: contactHours parse failed:", expectedHours.reason);
  console.error("raw:", site.contactHours);
  process.exit(2);
}

// Home
{
  const { code, body } = curl(`${ORIGIN}/`);
  const blocks = extractJsonLd(body);
  report.parseErrors += blocks.filter((b) => !b.ok).length;
  const orgs = byType(blocks, "Organization");
  const sites = byType(blocks, "WebSite");
  const productsLd = byType(blocks, "Product");
  const faqs = byType(blocks, "FAQPage");
  const locals = byType(blocks, "LocalBusiness");
  const errors = [];

  if (code !== "200") errors.push(`HTTP ${code}`);
  if (orgs.length !== 1) errors.push(`Organization count=${orgs.length}`);
  if (sites.length !== 1) errors.push(`WebSite count=${sites.length}`);
  if (productsLd.length) errors.push("Product on home");
  if (faqs.length) errors.push("FAQPage on home");
  if (locals.length) errors.push("LocalBusiness on home");

  const org = orgs[0] || {};
  report.organization.sample = org;
  if (org["@id"] !== ORGANIZATION_ID) errors.push(`org @id=${org["@id"]}`);
  if (site.contactPhone && org.telephone !== site.contactPhone) {
    errors.push("telephone mismatch");
  }
  if (site.contactEmail && org.email !== site.contactEmail) {
    errors.push("email mismatch");
  }
  if (
    site.contactAddress &&
    org.address?.streetAddress !== site.contactAddress
  ) {
    errors.push("address mismatch");
  }
  if (!specsEqual(org.openingHoursSpecification, expectedHours.specs)) {
    errors.push("openingHoursSpecification mismatch vs site API");
  }

  const ws = sites[0] || {};
  if (ws["@id"] !== WEBSITE_ID) errors.push(`website @id=${ws["@id"]}`);
  if (ws.url !== `${ORIGIN}/`) errors.push(`website url=${ws.url}`);
  if (ws.name !== "КЛЕВЕР") errors.push(`website name=${ws.name}`);
  if (ws.publisher?.["@id"] !== ORGANIZATION_ID) {
    errors.push(`publisher=${JSON.stringify(ws.publisher)}`);
  }
  if (deepHasType(ws, "SearchAction") || ws.potentialAction) {
    errors.push("SearchAction present");
  }

  for (const b of blocks) {
    if (!b.ok) continue;
    for (const m of JSON.stringify(b.data).matchAll(/https?:\/\/[^"\\]+/g)) {
      try {
        const host = new URL(m[0]).host.toLowerCase();
        if (host === "schema.org" || host === "www.schema.org") continue;
        if (host !== "clover-spb.ru") report.foreignHost += 1;
      } catch {
        /* ignore */
      }
    }
  }

  report.home.errors = errors;
  report.home.ok = errors.length === 0;
  report.organization.ok =
    orgs.length === 1 &&
    !errors.some((e) => e.startsWith("org") || e.includes("openingHours") || e.includes("telephone") || e.includes("email") || e.includes("address"));
  report.website.ok =
    sites.length === 1 &&
    !errors.some((e) => e.startsWith("website") || e.includes("publisher") || e.includes("SearchAction"));
  report.duplicates.org += Math.max(0, orgs.length - 1);
  report.duplicates.website += Math.max(0, sites.length - 1);
  console.log(`Home: ${report.home.ok ? "PASS" : "FAIL"}`);
}

// Non-home: WebSite must be 0; Organization hours present
const spotPaths = [
  "/catalog",
  "/catalog/odnorazovaya-posuda",
  "/catalog/odnorazovaya-posuda/stakany",
  "/contacts",
  "/cart",
  "/product/%D0%9D%D0%A4-00000004",
];
for (const path of spotPaths) {
  const { code, body } = curl(`${ORIGIN}${path}`);
  const blocks = extractJsonLd(body);
  report.parseErrors += blocks.filter((b) => !b.ok).length;
  const orgs = byType(blocks, "Organization");
  const sites = byType(blocks, "WebSite");
  const faqs = byType(blocks, "FAQPage");
  const locals = byType(blocks, "LocalBusiness");
  if (sites.length) {
    report.forbidden.ok = false;
    report.forbidden.failures.push({ path, issue: `WebSite count=${sites.length}` });
  }
  if (faqs.length) {
    report.forbidden.ok = false;
    report.forbidden.failures.push({ path, issue: "FAQPage" });
  }
  if (locals.length) {
    report.forbidden.ok = false;
    report.forbidden.failures.push({ path, issue: "LocalBusiness" });
  }
  if (orgs.length !== 1) {
    report.forbidden.ok = false;
    report.forbidden.failures.push({ path, issue: `Organization count=${orgs.length}` });
  } else if (
    !specsEqual(orgs[0].openingHoursSpecification, expectedHours.specs)
  ) {
    report.forbidden.ok = false;
    report.forbidden.failures.push({ path, issue: "hours mismatch" });
  }
  if (code === "000") {
    report.forbidden.ok = false;
    report.forbidden.failures.push({ path, issue: `HTTP ${code}` });
  }
  report.duplicates.org += Math.max(0, orgs.length - 1);
  report.duplicates.website += Math.max(0, sites.length - 1);
}

// All products: Wave1 invariants + hours on Org, no WebSite
console.log(`Checking ${products.length} products…`);
const productResults = await mapPool(products, CONCURRENCY, async (product) => {
  const path = `/product/${encodeURIComponent(product.code)}`;
  const { code, body } = await curlAsync(`${ORIGIN}${path}`);
  const blocks = extractJsonLd(body);
  const errors = [];
  const orgs = byType(blocks, "Organization");
  const prods = byType(blocks, "Product");
  const sites = byType(blocks, "WebSite");
  const parseFail = blocks.filter((b) => !b.ok).length;

  if (code !== "200") errors.push(`HTTP ${code}`);
  if (orgs.length !== 1) errors.push(`Organization=${orgs.length}`);
  if (prods.length !== 1) errors.push(`Product=${prods.length}`);
  if (sites.length) errors.push(`WebSite=${sites.length}`);
  if (orgs[0] && !specsEqual(orgs[0].openingHoursSpecification, expectedHours.specs)) {
    errors.push("hours mismatch");
  }
  const p = prods[0] || {};
  const price = Number(product?.prices?.piece) || 0;
  if (p.sku !== product.code) errors.push("sku");
  if (p.name !== product.name) errors.push("name");
  if (price > 0) {
    if (!p.offers || String(p.offers.price) !== price.toFixed(2)) errors.push("offer");
    if (p.offers?.priceCurrency !== "RUB") errors.push("currency");
    if (p.offers?.seller?.["@id"] !== ORGANIZATION_ID) errors.push("seller");
  }
  if (p.brand || /"availability"\s*:/.test(JSON.stringify(p))) errors.push("brand/availability");

  return {
    errors,
    hasProduct: prods.length === 1,
    hasOffer: Boolean(p.offers),
    hasHours: Boolean(orgs[0]?.openingHoursSpecification),
    hasWebSite: sites.length > 0,
    parseFail,
    dupOrg: Math.max(0, orgs.length - 1),
    dupProduct: Math.max(0, prods.length - 1),
    code: product.code,
  };
});

for (const r of productResults) {
  report.products.checked += 1;
  if (r.hasProduct) report.products.withProduct += 1;
  if (r.hasOffer) report.products.withOffer += 1;
  if (r.hasHours) report.products.withHours += 1;
  if (r.hasWebSite) report.products.withWebSite += 1;
  report.parseErrors += r.parseFail;
  report.duplicates.org += r.dupOrg;
  report.duplicates.product += r.dupProduct;
  if (r.errors.length) {
    report.products.schemaErrors += 1;
    if (report.products.failures.length < 15) {
      report.products.failures.push({ code: r.code, errors: r.errors });
    }
  }
}

{
  const sm = curl(`${ORIGIN}/sitemap.xml`);
  report.sitemapCount = [
    ...(sm.body || "").matchAll(/<loc>([^<]+)<\/loc>/g),
  ].length;
}

console.log(
  `Products: ${report.products.checked}/${report.products.withProduct} Product / ${report.products.withOffer} Offer / hours=${report.products.withHours} / WebSite-on-product=${report.products.withWebSite} / errors=${report.products.schemaErrors}`
);

const summary = {
  home: report.home.ok ? "PASS" : "FAIL",
  homeErrors: report.home.errors,
  organization: report.organization.ok ? "PASS" : "FAIL",
  website: report.website.ok ? "PASS" : "FAIL",
  forbiddenSpot: report.forbidden,
  products: `${report.products.checked} / ${report.products.withProduct} Product / ${report.products.withOffer} Offer / hours ${report.products.withHours} / WebSite-on-product ${report.products.withWebSite} / errors ${report.products.schemaErrors}`,
  productFailures: report.products.failures,
  duplicates: report.duplicates,
  parseErrors: report.parseErrors,
  foreignHost: report.foreignHost,
  sitemapCount: report.sitemapCount,
  storefrontCount: report.storefrontCount,
  organizationSample: report.organization.sample,
  expectedHours: expectedHours.specs,
};

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));

const hardFail =
  !report.home.ok ||
  !report.forbidden.ok ||
  report.products.schemaErrors > 0 ||
  report.products.withWebSite > 0 ||
  report.products.withHours !== report.products.checked ||
  report.parseErrors > 0 ||
  report.foreignHost > 0 ||
  report.duplicates.org + report.duplicates.website + report.duplicates.product >
    0 ||
  report.sitemapCount !== 730 ||
  report.storefrontCount !== 676;

process.exit(hardFail ? 1 : 0);
