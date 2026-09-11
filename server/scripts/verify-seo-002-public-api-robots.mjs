/**
 * SEO-002 — robots crawl contract for Google product rendering.
 *
 * Googlebot must be allowed to fetch /api/public/* (JS XHR for ProductPage)
 * while the rest of /api/ stays disallowed. Public JSON must send X-Robots-Tag: noindex.
 *
 * Usage:
 *   node server/scripts/verify-seo-002-public-api-robots.mjs
 *   node server/scripts/verify-seo-002-public-api-robots.mjs --check-live-headers
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const checkLive = process.argv.includes("--check-live-headers");

/**
 * Google-like robots matching for User-agent: *:
 * longest matching Allow/Disallow wins; equal length → Allow wins.
 */
export function evaluateRobotsPath(robotsText, pathName) {
  const path = String(pathName || "/");
  const lines = String(robotsText || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let inStarGroup = false;
  const rules = [];
  for (const line of lines) {
    const ua = /^User-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      inStarGroup = ua[1].trim() === "*";
      continue;
    }
    if (!inStarGroup) continue;
    const rule = /^(Allow|Disallow):\s*(.*)$/i.exec(line);
    if (!rule) continue;
    const type = rule[1].toLowerCase();
    const pattern = rule[2];
    if (pattern === "") continue;
    rules.push({ type, pattern });
  }

  let best = null;
  for (const rule of rules) {
    if (!path.startsWith(rule.pattern)) continue;
    const len = rule.pattern.length;
    if (
      !best ||
      len > best.len ||
      (len === best.len && rule.type === "allow" && best.type === "disallow")
    ) {
      best = { ...rule, len };
    }
  }
  if (!best) return { allowed: true, rule: null };
  return { allowed: best.type === "allow", rule: best };
}

function assertAllowed(robots, pathName, label) {
  const result = evaluateRobotsPath(robots, pathName);
  assert.equal(
    result.allowed,
    true,
    `${label}: expected ALLOW for ${pathName}, got DISALLOW via ${JSON.stringify(result.rule)}`
  );
}

function assertDisallowed(robots, pathName, label) {
  const result = evaluateRobotsPath(robots, pathName);
  assert.equal(
    result.allowed,
    false,
    `${label}: expected DISALLOW for ${pathName}, got ALLOW via ${JSON.stringify(result.rule)}`
  );
}

const robotsPath = path.join(projectRoot, "public/robots.txt");
assert.ok(existsSync(robotsPath), "public/robots.txt missing");
const robots = readFileSync(robotsPath, "utf8");

assert.match(robots, /Sitemap:\s*https:\/\/clover-spb\.ru\/sitemap\.xml/);

// Product HTML + catalog must stay crawlable
assertAllowed(robots, "/", "home");
assertAllowed(robots, "/catalog", "catalog");
assertAllowed(
  robots,
  "/product/%D0%9D%D0%A4-00000243",
  "product-html"
);

// Critical SEO-002 contract: public API must be crawlable for WRS/XHR
assertAllowed(
  robots,
  "/api/public/catalog/%D0%9D%D0%A4-00000243",
  "public-product-api"
);
assertAllowed(robots, "/api/public/catalog", "public-catalog-api");
assertAllowed(robots, "/api/public/site", "public-site-api");

// Private / non-public API must remain blocked
assertDisallowed(robots, "/api/bootstrap", "bootstrap-api");
assertDisallowed(robots, "/api/auth", "auth-api");
assertDisallowed(robots, "/api/admin/products", "admin-api");
assertDisallowed(robots, "/api/internal-test", "internal-api-path");

assertDisallowed(robots, "/lk", "lk");
assertDisallowed(robots, "/vitrina/lk", "vitrina-lk");

// Source contract: middleware sets X-Robots-Tag on /api/public
const serverSrc = readFileSync(
  path.join(projectRoot, "server/src/server.js"),
  "utf8"
);
assert.match(
  serverSrc,
  /app\.use\(\s*["']\/api\/public["'][\s\S]*?X-Robots-Tag[\s\S]*?noindex/,
  "server must set X-Robots-Tag: noindex for /api/public"
);
assert.doesNotMatch(
  serverSrc,
  /app\.use\(\s*["']\/api["']\s*,[\s\S]{0,80}X-Robots-Tag/,
  "must not blanket-noindex all /api"
);

if (checkLive) {
  const base = process.env.CLOVER_API_BASE || "http://127.0.0.1:4100";
  const res = await fetch(
    `${base}/api/public/catalog/${encodeURIComponent("НФ-00000243")}`
  );
  assert.equal(res.status, 200, "live public product status");
  const tag = String(res.headers.get("x-robots-tag") || "");
  assert.match(tag, /noindex/i, `live X-Robots-Tag missing noindex: ${tag}`);
  const body = await res.json();
  assert.equal(body.product?.code, "НФ-00000243");
}

console.log(
  JSON.stringify({
    SEO002_PUBLIC_API_ROBOTS: "PASS",
    liveHeadersChecked: checkLive,
  })
);
