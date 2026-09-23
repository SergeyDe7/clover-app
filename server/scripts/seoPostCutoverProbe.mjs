#!/usr/bin/env node
// One-release HTTP gate. Run from the target-pinned deploy launcher while its
// lock and rollback handler are still active. Does not follow redirects.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const redirects = [
  [
    "/catalog/odnorazovaya-posuda/dlya-sushi-i-lapshi",
    "/ru/catalog/%D0%9E%D0%B4%D0%BD%D0%BE%D1%80%D0%B0%D0%B7%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%BF%D0%BE%D1%81%D1%83%D0%B4%D0%B0/%D0%94%D0%BB%D1%8F%20%D1%81%D1%83%D1%88%D0%B8%20%D0%B8%20%D0%BB%D0%B0%D0%BF%D1%88%D0%B8",
  ],
  [
    "/catalog/himiya-chistyashchie-sredstva/dlya-okon",
    "/ru/catalog/%D0%A5%D0%B8%D0%BC%D0%B8%D1%8F%2C%20%D1%87%D0%B8%D1%81%D1%82%D1%8F%D1%89%D0%B8%D0%B5%20%D1%81%D1%80%D0%B5%D0%B4%D1%81%D1%82%D0%B2%D0%B0/%D0%94%D0%BB%D1%8F%20%D0%BE%D0%BA%D0%BE%D0%BD",
  ],
];
const product = "/product/%D0%9D%D0%A4-00002829";
const productCanonical = "https://clover-spb.ru/ru/product/%D0%9D%D0%A4-00002829";

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index < 0 ? "" : String(argv[index + 1] || "");
}

function validBase(raw, label) {
  const url = new URL(raw);
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label}: base URL must be a bare HTTP(S) origin`);
  }
  return url.origin;
}

export function parseCurlHeaders(raw) {
  const blocks = String(raw).split(/\r?\n\r?\n/u);
  const block = blocks.reverse().find((item) => /^HTTP\/\S+\s+\d{3}\b/u.test(item));
  if (!block) throw new Error("curl returned no HTTP status line");
  const lines = block.split(/\r?\n/u);
  const status = Number(lines[0].match(/^HTTP\/\S+\s+(\d{3})\b/u)?.[1]);
  const headers = new Map();
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim());
  }
  return { status, headers };
}

export function curlRequest({ curl = "curl", url, method = "GET", resolve = "", cacert = "" }) {
  const scratch = mkdtempSync(path.join(tmpdir(), "clover-seo-gate-"));
  try {
    const headerFile = path.join(scratch, "headers");
    const bodyFile = path.join(scratch, "body");
    const args = [
      "--silent", "--show-error", "--noproxy", "*", "--path-as-is", "--globoff",
      "--connect-timeout", "3", "--max-time", "10", "--dump-header", headerFile,
      "--output", bodyFile,
      ...(method === "HEAD" ? ["--head"] : []),
      ...(resolve ? ["--resolve", resolve] : []),
      ...(cacert ? ["--cacert", cacert] : []),
      url,
    ];
    // The sandbox's fake curl is a Bash script on Windows; production invokes
    // the native curl binary directly, as does the existing asset probe.
    const result = process.env.CLOVER_PROBE_BASH
      ? spawnSync(process.env.CLOVER_PROBE_BASH, [curl, ...args], { encoding: "utf8", timeout: 12_000 })
      : spawnSync(curl, args, { encoding: "utf8", timeout: 12_000 });
    if (result.error || result.status !== 0) {
      throw new Error(`curl ${method} failed: ${result.error?.message || result.stderr || result.status}`);
    }
    const response = parseCurlHeaders(readFileSync(headerFile, "utf8"));
    return { ...response, body: method === "HEAD" ? "" : readFileSync(bodyFile, "utf8") };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function expectResponse(response, { status, location, html = false, canonical = "" }, label) {
  if (response.status !== status) throw new Error(`${label}: status ${response.status}, expected ${status}`);
  const actualLocation = response.headers.get("location") || "";
  if (actualLocation !== (location || "")) {
    throw new Error(`${label}: Location ${actualLocation || "<none>"}, expected ${location || "<none>"}`);
  }
  if (html && !/^text\/html(?:\s*;|$)/iu.test(response.headers.get("content-type") || "")) {
    throw new Error(`${label}: expected text/html Content-Type`);
  }
  if (canonical && !response.body.includes(`<link rel="canonical" href="${canonical}"`)) {
    throw new Error(`${label}: RU canonical missing`);
  }
}

export function checkSeoRoutes({ origin, nginx, nginxResolve = "", cacert = "", curl = "curl", mode = "promoted", request = curlRequest }) {
  if (!["promoted", "rolled-back"].includes(mode)) throw new Error(`invalid mode: ${mode}`);
  const surfaces = [
    { name: "origin", base: validBase(origin, "origin"), resolve: "", cacert: "" },
    { name: "nginx", base: validBase(nginx, "nginx"), resolve: nginxResolve, cacert },
  ];
  for (const surface of surfaces) {
    const get = (suffix, method = "GET") => request({
      curl, url: `${surface.base}${suffix}`, method, resolve: surface.resolve, cacert: surface.cacert,
    });
    for (const [source, destination] of redirects) {
      for (const method of ["GET", "HEAD"]) {
        expectResponse(get(source, method), {
          status: mode === "promoted" ? 301 : 404,
          location: mode === "promoted" ? destination : "",
        }, `${surface.name} ${method} ${source}`);
      }
      if (mode === "promoted") {
        expectResponse(get(`${source}?utm_source=release-gate`), {
          status: 301, location: `${destination}?utm_source=release-gate`,
        }, `${surface.name} GET query ${source}`);
        expectResponse(get(destination), { status: 200, html: true }, `${surface.name} destination ${destination}`);
      }
    }
    expectResponse(get(product), { status: 200, html: true, canonical: productCanonical }, `${surface.name} product`);
  }
  return true;
}

function main(argv) {
  const mode = argValue(argv, "--mode");
  checkSeoRoutes({
    origin: argValue(argv, "--origin"),
    nginx: argValue(argv, "--nginx"),
    nginxResolve: argValue(argv, "--nginx-resolve"),
    cacert: argValue(argv, "--cacert"),
    curl: argValue(argv, "--curl") || "curl",
    mode,
  });
  console.log(`SEO_POST_CUTOVER_${mode.toUpperCase()}:PASS`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`SEO_POST_CUTOVER:FAIL ${error.message}`);
    process.exitCode = 1;
  }
}
