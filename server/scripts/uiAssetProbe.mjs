/**
 * Extract and probe UI assets from a built index.html.
 * Used by deploy readiness and isolated regressions. Never talks to production.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractJsReferencedPaths,
  namespaceFailures,
} from "./releaseNamespace.js";

export const ASSET_PATH_RE =
  /(?:src|href)\s*=\s*["'](\/(?:assets|fonts)\/[^"'?#]+)(?:[?#][^"']*)?["']/gi;
export const CSS_URL_RE =
  /url\(\s*["']?(\/(?:assets|fonts)\/[^"')?#]+)(?:[?#][^"')]+)?["']?\s*\)/gi;

export function extractReferencedPaths(html) {
  const paths = [];
  const seen = new Set();
  const source = String(html || "");
  for (const re of [ASSET_PATH_RE, CSS_URL_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source))) {
      const assetPath = match[1];
      if (!seen.has(assetPath)) {
        seen.add(assetPath);
        paths.push(assetPath);
      }
    }
  }
  return paths;
}

export function extractCssFontPaths(css) {
  return extractReferencedPaths(css).filter((item) => item.startsWith("/fonts/"));
}

export function collectBuildAssets({ html, distDir, readFile = readFileSync } = {}) {
  const paths = extractReferencedPaths(html);
  const seen = new Set(paths);
  const add = (assetPath) => {
    if (!assetPath || seen.has(assetPath)) return false;
    seen.add(assetPath);
    paths.push(assetPath);
    return true;
  };
  if (distDir) {
    let growing = true;
    while (growing) {
      growing = false;
      for (const assetPath of [...paths]) {
        if (assetPath.includes("..")) continue;
        let filePath;
        try {
          filePath = assertSafeDistFile(distDir, assetPath);
        } catch {
          continue;
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
        if (assetPath.endsWith(".css")) {
          for (const item of extractCssFontPaths(readFile(filePath, "utf8"))) {
            if (add(item)) growing = true;
          }
        }
        if (assetPath.endsWith(".js")) {
          for (const item of extractJsReferencedPaths(readFile(filePath, "utf8"), {
            fromAssetPath: assetPath,
          })) {
            if (add(item)) growing = true;
          }
        }
      }
    }
  }
  return paths;
}

export function inspectReleaseNamespace({
  html,
  distDir,
  swSource = "",
  readFile = readFileSync,
} = {}) {
  const assets = collectBuildAssets({ html, distDir, readFile });
  const jsRefs = [];
  if (distDir) {
    for (const assetPath of assets) {
      if (!assetPath.endsWith(".js")) continue;
      const filePath = distFilePath(distDir, assetPath);
      if (!existsSync(filePath)) continue;
      jsRefs.push(
        ...extractJsReferencedPaths(readFile(filePath, "utf8"), { fromAssetPath: assetPath })
      );
    }
  }
  const localeMatch = String(html || "").match(
    /name=["']clover-public-locale-routes["'][^>]*content=["']([^"']+)["']/i
  );
  return namespaceFailures({
    html,
    assets,
    jsRefs,
    swSource,
    localeStamp: localeMatch?.[1] || "",
  });
}

export function distFilePath(distDir, assetPath) {
  const relative = String(assetPath || "").replace(/^\/+/, "");
  return path.resolve(distDir, relative);
}

export function assertSafeDistFile(distDir, assetPath) {
  const resolved = distFilePath(distDir, assetPath);
  const root = path.resolve(distDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`asset path escapes dist: ${assetPath}`);
  }
  return resolved;
}

export function missingDistAssets(distDir, assetPaths) {
  const missing = [];
  for (const assetPath of assetPaths) {
    const filePath = assertSafeDistFile(distDir, assetPath);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      missing.push(assetPath);
    }
  }
  return missing;
}

export function expectedMimePattern(assetPath) {
  if (assetPath.endsWith(".js")) return /^(application|text)\/(javascript|ecmascript)(;|$)/i;
  if (assetPath.endsWith(".css")) return /^text\/css(;|$)/i;
  if (assetPath.endsWith(".woff2")) return /^(font\/woff2|application\/font-woff2)(;|$)/i;
  if (assetPath.endsWith(".woff")) return /^(font\/woff|application\/font-woff)(;|$)/i;
  return null;
}

export function bodyLooksLikeHtml(body) {
  const sample = String(body || "")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .slice(0, 200)
    .toLowerCase();
  return (
    sample.startsWith("<!doctype html") ||
    sample.startsWith("<html") ||
    sample.startsWith("<head") ||
    sample.startsWith("<!doctype")
  );
}

export function classifyAssetResponse({ assetPath, status, contentType, body }) {
  const mime = String(contentType || "").split(";")[0].trim();
  if (Number(status) !== 200) {
    return { ok: false, reason: `${assetPath} HTTP ${status}` };
  }
  if (/html/i.test(mime) || bodyLooksLikeHtml(body)) {
    return { ok: false, reason: `${assetPath} body/MIME is HTML` };
  }
  const expected = expectedMimePattern(assetPath);
  if (expected && !expected.test(String(contentType || ""))) {
    return {
      ok: false,
      reason: `${assetPath} MIME ${contentType || "missing"}`,
    };
  }
  return { ok: true, reason: `${assetPath} 200 ${mime || "ok"}` };
}

export function joinUrl(base, assetPath) {
  const trimmed = String(base || "").replace(/\/+$/, "");
  return `${trimmed}${assetPath}`;
}

function parseHeaderBlock(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  const headers = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function spawnCurl(curlBin, args) {
  const result = spawnSync(curlBin, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error?.code === "ENOENT" && process.env.CLOVER_PROBE_BASH) {
    return spawnSync(process.env.CLOVER_PROBE_BASH, [curlBin, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  }
  return result;
}

export function curlAsset({
  curlBin,
  url,
  resolveSpec,
  extraArgs = [],
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "clover-asset-probe-"));
  const headerFile = path.join(dir, "headers").replace(/\\/g, "/");
  const bodyFile = path.join(dir, "body").replace(/\\/g, "/");
  try {
    const result = spawnCurl(curlBin, [
      "-sS",
      "--max-time",
      "8",
      "-D",
      headerFile,
      "-o",
      bodyFile,
      ...extraArgs,
      ...(resolveSpec ? ["--resolve", resolveSpec] : []),
      url,
    ]);
    const headerRaw = existsSync(headerFile) ? readFileSync(headerFile, "utf8") : "";
    const statusMatch = headerRaw.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/m);
    const status = statusMatch ? Number(statusMatch[1]) : 0;
    const headers = parseHeaderBlock(headerRaw);
    const body = existsSync(bodyFile)
      ? readFileSync(bodyFile).subarray(0, 4096).toString("utf8")
      : "";
    return {
      status: Number.isInteger(status) ? status : 0,
      contentType: headers["content-type"] || "",
      body,
      stderr: String(result.stderr || ""),
      spawnStatus: result.status,
      error: result.error,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function probeAssetList({
  curlBin,
  base,
  assetPaths,
  resolveSpec,
  extraArgs = [],
  label,
}) {
  const failures = [];
  const notes = [];
  if (!base) {
    return {
      ok: false,
      skipped: false,
      failures: [`${label}: base URL missing`],
      notes,
    };
  }
  for (const assetPath of assetPaths) {
    const url = joinUrl(base, assetPath);
    const probed = curlAsset({ curlBin, url, resolveSpec, extraArgs });
    if (probed.error || (probed.spawnStatus && probed.spawnStatus !== 0 && !probed.status)) {
      failures.push(
        `${label} ${assetPath}: unreachable (${probed.error?.message || probed.stderr || "curl failed"}). Not a browser smoke PASS.`
      );
      continue;
    }
    const classified = classifyAssetResponse({
      assetPath,
      status: probed.status,
      contentType: probed.contentType,
      body: probed.body,
    });
    if (probed.stderr) notes.push(`${label} ${assetPath} stderr=${probed.stderr.trim()}`);
    notes.push(`${label} ${classified.reason}`);
    if (!classified.ok) {
      failures.push(
        `${label} ${classified.reason}${probed.stderr ? ` (${probed.stderr.trim()})` : ""}`
      );
    }
  }
  return { ok: failures.length === 0, skipped: false, failures, notes };
}

export async function waitForConsecutiveReady({
  probe,
  deadlineSec = 60,
  consecutiveNeeded = 2,
  sleepMs = 1000,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadlineMs = Number(deadlineSec) * 1000;
  const started = now();
  let consecutive = 0;
  let last = { ok: false, detail: "not started" };
  while (now() - started < deadlineMs) {
    last = await probe();
    if (last.ok) {
      consecutive += 1;
      if (consecutive >= consecutiveNeeded) {
        return { ok: true, consecutive, last };
      }
    } else {
      consecutive = 0;
    }
    if (now() - started + sleepMs >= deadlineMs) break;
    await sleep(sleepMs);
  }
  return { ok: false, consecutive, last };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function argValue(args, name) {
  const idx = args.indexOf(name);
  if (idx < 0) return "";
  return String(args[idx + 1] || "");
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === "extract") {
    const htmlFile = argValue(argv, "--html-file");
    const distDir = argValue(argv, "--dist");
    const html = readFileSync(htmlFile, "utf8");
    printJson(collectBuildAssets({ html, distDir }));
    return 0;
  }
  if (command === "check-dist") {
    const htmlFile = argValue(argv, "--html-file");
    const distDir = argValue(argv, "--dist");
    const html = readFileSync(htmlFile, "utf8");
    const assets = collectBuildAssets({ html, distDir });
    const missing = missingDistAssets(distDir, assets);
    if (missing.length) {
      console.error(`missing dist assets:\n${missing.join("\n")}`);
      return 1;
    }
    if (!assets.some((item) => item.endsWith(".js"))) {
      console.error("HTML has no /assets/*.js entry");
      return 1;
    }
    if (!assets.some((item) => item.endsWith(".css"))) {
      console.error("HTML/CSS graph has no stylesheet");
      return 1;
    }
    const swPath = path.join(distDir, "sw.js");
    const swSource = existsSync(swPath) ? readFileSync(swPath, "utf8") : "";
    const ns = inspectReleaseNamespace({ html, distDir, swSource });
    if (!ns.ok) {
      console.error(`release namespace mismatch:\n${ns.failures.join("\n")}`);
      return 1;
    }
    console.log(`check-dist: ${assets.length} assets present namespace=${ns.releaseId}`);
    return 0;
  }
  if (command === "check-namespace") {
    const htmlFile = argValue(argv, "--html-file");
    const distDir = argValue(argv, "--dist");
    const html = readFileSync(htmlFile, "utf8");
    const swPath = distDir && path.join(distDir, "sw.js");
    const swSource = swPath && existsSync(swPath) ? readFileSync(swPath, "utf8") : "";
    const ns = inspectReleaseNamespace({ html, distDir, swSource });
    if (!ns.ok) {
      console.error(`release namespace mismatch:\n${ns.failures.join("\n")}`);
      return 1;
    }
    console.log(`check-namespace: ${ns.tag} ${ns.releaseId}`);
    return 0;
  }
  if (command === "check-http") {
    const htmlFile = argValue(argv, "--html-file");
    const distDir = argValue(argv, "--dist");
    const origin = argValue(argv, "--origin");
    const nginx = argValue(argv, "--nginx");
    const curlBin = argValue(argv, "--curl") || "curl";
    const resolveSpec = argValue(argv, "--nginx-resolve");
    const html = htmlFile
      ? readFileSync(htmlFile, "utf8")
      : argValue(argv, "--html") || "";
    const assets = collectBuildAssets({ html, distDir });
    const originResult = probeAssetList({
      curlBin,
      base: origin,
      assetPaths: assets,
      label: "origin",
    });
    const cacert = argValue(argv, "--cacert");
    const nginxExtra = [];
    if (cacert) nginxExtra.push("--cacert", cacert);
    if (nginxExtra.some((item) => item === "-k" || item === "--insecure")) {
      console.error("TLS verification must stay enabled");
      return 2;
    }
    const nginxResult = nginx
      ? probeAssetList({
          curlBin,
          base: nginx,
          assetPaths: assets,
          resolveSpec,
          extraArgs: nginxExtra,
          label: "nginx",
        })
      : {
          ok: false,
          skipped: false,
          failures: ["nginx: base URL missing"],
          notes: [],
        };
    if (!originResult.ok || !nginxResult.ok) {
      for (const line of [...originResult.failures, ...nginxResult.failures]) {
        console.error(line);
      }
      return 1;
    }
    console.log("check-http: origin PASS");
    console.log("check-http: nginx PASS");
    return 0;
  }
  console.error("usage: uiAssetProbe.mjs extract|check-dist|check-namespace|check-http");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
