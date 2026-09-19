/**
 * Structural lock for Recovery V3 nginx: /assets/ and /fonts/ proxy the UI
 * origin, never alias private dist, and do not stamp errors as immutable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function stripComments(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, ""))
    .join("\n");
}

export function extractLocation(source, prefix) {
  const config = stripComments(source);
  const re = new RegExp(
    `location\\s+${prefix.replace(/[/]/g, "\\/")}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    "m"
  );
  const match = config.match(re);
  return match ? match[1] : "";
}

export function locationHasYearlyImmutableOnErrors(block) {
  return /add_header\s+Cache-Control\s+"[^"]*immutable[^"]*"\s+always\s*;/.test(
    block
  );
}

function assertProxyLocation(block, label) {
  assert.ok(block, `${label}: location missing`);
  assert.match(block, /proxy_pass\s+http:\/\/[^\s;]+:5273\s*;/, `${label}: UI proxy`);
  assert.doesNotMatch(block, /proxy_pass\s+http:\/\/[^\s;]+:5273\//, `${label}: must keep original URI`);
  assert.match(block, /proxy_set_header\s+Host\s+\$host\s*;/, `${label}: Host preserved`);
  assert.match(block, /proxy_hide_header\s+Cache-Control\s*;/, `${label}: hide upstream Cache-Control`);
  assert.doesNotMatch(block, /\balias\b/, `${label}: no alias`);
  assert.doesNotMatch(block, /\/dist\b/, `${label}: no private dist path`);
  assert.doesNotMatch(block, /expires\s+1y\s*;/, `${label}: no expires 1y`);
  assert.equal(
    locationHasYearlyImmutableOnErrors(block),
    false,
    `${label}: immutable must not use always`
  );
  assert.match(
    block,
    /add_header\s+Cache-Control\s+"public, max-age=31536000, immutable"\s*;/,
    `${label}: success-only immutable`
  );
}

export function verifyNginxStaticCacheTemplates() {
  const snippet = readFileSync(path.join(root, "ops/nginx/static-cache.snippet.conf"), "utf8");
  const example = readFileSync(
    path.join(root, "ops/nginx/clover-spb.ru.with-cache.example"),
    "utf8"
  );
  const umask = readFileSync(
    path.join(root, "ops/systemd/clover-api.service.d/10-umask.conf"),
    "utf8"
  );

  for (const [name, source] of [
    ["static-cache.snippet.conf", snippet],
    ["clover-spb.ru.with-cache.example", example],
  ]) {
    assertProxyLocation(extractLocation(source, "/assets/"), `${name} /assets/`);
    assertProxyLocation(extractLocation(source, "/fonts/"), `${name} /fonts/`);
    const stripped = stripComments(source);
    assert.doesNotMatch(stripped, /\bmap_hash\b/, `${name}: no map_hash`);
    assert.doesNotMatch(
      stripped,
      /location\s+\/(?:assets|fonts)\/[\s\S]{0,400}\balias\b/,
      `${name}: assets/fonts must not alias`
    );
  }

  assert.match(example, /location\s+\/api\//, "API location unchanged");
  assert.match(example, /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3/, "TLS unchanged");
  assert.match(example, /X-Frame-Options/, "security headers unchanged");
  assert.match(example, /location\s+\//, "default UI location unchanged");
  assert.match(umask, /^UMask=0077$/m, "API UMask=0077 must stay");

  const badAlways = `
location /assets/ {
    proxy_pass http://192.168.155.15:5273;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
`;
  assert.equal(locationHasYearlyImmutableOnErrors(extractLocation(badAlways, "/assets/")), true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyNginxStaticCacheTemplates();
  console.log("verify-nginx-static-cache: PASS");
}
