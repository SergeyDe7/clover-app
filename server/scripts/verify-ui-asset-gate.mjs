/**
 * Isolated asset-gate regressions: MIME/HTML, readiness, umask-077 proxy,
 * and Vite preview /fonts SPA fallback. Temp dirs only. No production.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAssetResponse,
  collectBuildAssets,
  inspectReleaseNamespace,
  missingDistAssets,
  waitForConsecutiveReady,
} from "./uiAssetProbe.mjs";
import {
  assertValidReleaseId,
  createReleaseId,
  rewriteFontPublicUrls,
} from "./releaseNamespace.js";
import { staticAssetRelativePath } from "../../src/shared/staticAssetGuard.js";
import { locationHasYearlyImmutableOnErrors } from "./verify-nginx-static-cache.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
assert.notEqual(path.resolve(root), path.resolve("/opt/clover/clover-app"));

const html = `<link rel="modulepreload" href="/assets/vendor-AAA.js">
<link rel="stylesheet" href="/assets/index-AAA.css">
<link rel="preload" href="/fonts/manrope-latin-700-normal.woff2" as="font">
<link rel="stylesheet" href="/fonts/manrope.css">
<script src="/assets/index-AAA.js"></script>`;

{
  const assets = collectBuildAssets({ html, distDir: "" });
  assert.ok(assets.includes("/assets/index-AAA.js"));
  assert.ok(assets.includes("/assets/vendor-AAA.js"));
  assert.ok(assets.includes("/assets/index-AAA.css"));
  assert.ok(assets.includes("/fonts/manrope.css"));
  assert.ok(assets.includes("/fonts/manrope-latin-700-normal.woff2"));
  console.log("EXTRACT_HTML_ASSETS:PASS");
}

{
  assert.throws(() => assertValidReleaseId("r403u20260918"), /recovery suffix/);
  const first = createReleaseId({ env: { CLOVER_UI_RELEASE_ID: "alpha111" } });
  const second = createReleaseId({ env: { CLOVER_UI_RELEASE_ID: "beta2222" } });
  assert.equal(first, "alpha111");
  assert.notEqual(first, second);
  assert.match(
    rewriteFontPublicUrls('src:url("/fonts/manrope.css")', "alpha111"),
    /\/fonts\/alpha111\/manrope\.css/
  );
  const goodHtml = `<meta name="clover-ui-build" content="ui-alpha111"><meta name="clover-public-locale-routes" content="disabled"><script src="/assets/alpha111/index-x.js"></script><link href="/assets/alpha111/index-x.css" rel="stylesheet"><link href="/fonts/alpha111/manrope.css" rel="stylesheet">`;
  const dist = mkdtempSync(path.join(tmpdir(), "clover-ns-ok-"));
  mkdirSync(path.join(dist, "assets/alpha111"), { recursive: true });
  mkdirSync(path.join(dist, "fonts/alpha111"), { recursive: true });
  writeFileSync(path.join(dist, "assets/alpha111/index-x.js"), 'import "./vendor-x.js";\n');
  writeFileSync(path.join(dist, "assets/alpha111/vendor-x.js"), "export const v=1;\n");
  writeFileSync(path.join(dist, "assets/alpha111/index-x.css"), "body{color:#111}");
  writeFileSync(
    path.join(dist, "fonts/alpha111/manrope.css"),
    '@font-face{src:url("/fonts/alpha111/manrope.woff2")}'
  );
  writeFileSync(path.join(dist, "fonts/alpha111/manrope.woff2"), "w2");
  writeFileSync(path.join(dist, "sw.js"), 'const CACHE_NAME = "clover-shell-ui-alpha111";\n');
  const ok = inspectReleaseNamespace({
    html: goodHtml,
    distDir: dist,
    swSource: readFileSync(path.join(dist, "sw.js"), "utf8"),
  });
  assert.equal(ok.ok, true, ok.failures.join("\n"));
  const poisoned = inspectReleaseNamespace({
    html: `<meta name="clover-ui-build" content="ui-alpha111"><script src="/assets/index-B2GFFiD2.js"></script><link href="/assets/index-x.css" rel="stylesheet">`,
    distDir: dist,
  });
  assert.equal(poisoned.ok, false);
  assert.match(poisoned.failures.join("\n"), /outside release namespace/);
  rmSync(dist, { recursive: true, force: true });
  console.log("RELEASE_NAMESPACE_GRAPH:PASS");
}

{
  assert.equal(staticAssetRelativePath("/fonts/missing.woff2"), "fonts/missing.woff2");
  assert.equal(staticAssetRelativePath("/assets/x.js"), "assets/x.js");
  assert.equal(staticAssetRelativePath("/lk"), "");
  console.log("STATIC_ASSET_GUARD:PASS");
}

{
  assert.equal(
    classifyAssetResponse({
      assetPath: "/assets/a.js",
      status: 403,
      contentType: "application/javascript",
      body: "x",
    }).ok,
    false
  );
  assert.equal(
    classifyAssetResponse({
      assetPath: "/assets/a.js",
      status: 200,
      contentType: "text/html",
      body: "<!doctype html>",
    }).ok,
    false
  );
  assert.equal(
    classifyAssetResponse({
      assetPath: "/assets/a.js",
      status: 200,
      contentType: "text/javascript",
      body: "export default 1",
    }).ok,
    true
  );
  console.log("CLASSIFY_ASSET_RESPONSE:PASS");
}

{
  const dist = mkdtempSync(path.join(tmpdir(), "clover-assets-missing-"));
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  writeFileSync(path.join(dist, "assets/index-AAA.js"), "export default 1");
  const missing = missingDistAssets(dist, collectBuildAssets({ html, distDir: dist }));
  assert.ok(missing.includes("/assets/index-AAA.css"));
  assert.ok(missing.includes("/assets/vendor-AAA.js"));
  rmSync(dist, { recursive: true, force: true });
  console.log("MISSING_DIST_ASSETS:PASS");
}

{
  let calls = 0;
  const result = await waitForConsecutiveReady({
    deadlineSec: 5,
    consecutiveNeeded: 2,
    sleepMs: 1,
    now: Date.now,
    sleep: async () => {},
    probe: async () => {
      calls += 1;
      return { ok: calls >= 2, detail: `call-${calls}` };
    },
  });
  assert.equal(result.ok, true);
  assert.ok(calls >= 3, `first failure then two passes, got ${calls}`);
  console.log("READY_TRANSIENT_THEN_PASS:PASS");
}

{
  const started = Date.now();
  const result = await waitForConsecutiveReady({
    deadlineSec: 1,
    consecutiveNeeded: 2,
    sleepMs: 20,
    probe: async () => ({ ok: false, detail: "403" }),
  });
  assert.equal(result.ok, false);
  assert.ok(Date.now() - started < 3000, "deadline must stay bounded");
  console.log("READY_PERMANENT_FAIL_BOUNDED:PASS");
}

{
  const bad = `add_header Cache-Control "public, max-age=31536000, immutable" always;`;
  const good = `add_header Cache-Control "public, max-age=31536000, immutable";`;
  assert.equal(locationHasYearlyImmutableOnErrors(bad), true);
  assert.equal(locationHasYearlyImmutableOnErrors(good), false);
  console.log("ERROR_RESPONSES_NOT_IMMUTABLE:PASS");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

{
  const dist = mkdtempSync(path.join(tmpdir(), "clover-umask-dist-"));
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  const filePath = path.join(dist, "assets/index-UMASK.js");
  writeFileSync(filePath, "export default 1;\n");
  try {
    chmodSync(path.dirname(filePath), 0o700);
    chmodSync(filePath, 0o600);
  } catch {
    // Windows may ignore POSIX modes; origin still serves the owner-readable file.
  }
  const originPort = await freePort();
  const proxyPort = await freePort();
  const origin = createHttpServer((req, res) => {
    if (req.url === "/assets/index-UMASK.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(readFileSync(filePath));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    res.end("Not found");
  });
  const proxy = createHttpServer((req, res) => {
    const forwarded = httpRequest(
      {
        hostname: "127.0.0.1",
        port: originPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: req.headers.host },
      },
      (up) => {
        res.writeHead(up.statusCode || 500, up.headers);
        up.pipe(res);
      }
    );
    forwarded.on("error", (error) => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(String(error.message));
    });
    req.pipe(forwarded);
  });
  await new Promise((resolve) => origin.listen(originPort, "127.0.0.1", resolve));
  await new Promise((resolve) => proxy.listen(proxyPort, "127.0.0.1", resolve));
  try {
    const originRes = await fetch(`http://127.0.0.1:${originPort}/assets/index-UMASK.js`);
    const proxyRes = await fetch(`http://127.0.0.1:${proxyPort}/assets/index-UMASK.js`);
    assert.equal(originRes.status, 200);
    assert.equal(proxyRes.status, 200);
    assert.match(originRes.headers.get("content-type") || "", /javascript/);
    assert.match(proxyRes.headers.get("content-type") || "", /javascript/);
    assert.equal(await proxyRes.text(), "export default 1;\n");
    const snippet = readFileSync(path.join(root, "ops/nginx/static-cache.snippet.conf"), "utf8");
    assert.doesNotMatch(snippet, /location \/assets\/[\s\S]{0,300}\balias\b/);
  } finally {
    await new Promise((resolve) => origin.close(resolve));
    await new Promise((resolve) => proxy.close(resolve));
    rmSync(dist, { recursive: true, force: true });
  }
  console.log("UMASK077_PROXY_SCHEME:PASS");
}

{
  const outDir = mkdtempSync(path.join(tmpdir(), "clover-font-preview-"));
  writeFileSync(
    path.join(outDir, "index.html"),
    `<!doctype html><html><head><title>fixture</title></head><body>ok</body></html>`
  );
  mkdirSync(path.join(outDir, "fonts"), { recursive: true });
  writeFileSync(path.join(outDir, "fonts/manrope.css"), "body{font-family:Manrope}");
  const port = await freePort();
  const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
  const preview = spawn(
    process.execPath,
    [viteBin, "preview", "--outDir", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: root, env: { ...process.env, HOME: outDir }, stdio: "pipe" }
  );
  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("preview start timeout"));
      }
    }, 20000);
    const onData = (chunk) => {
      const text = String(chunk);
      if (!settled && (text.includes("Local:") || text.includes("127.0.0.1") || text.includes(String(port)))) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };
    preview.stdout.on("data", onData);
    preview.stderr.on("data", onData);
    preview.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    preview.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`preview exited ${code}`));
      }
    });
  });
  try {
    const missing = await fetch(`http://127.0.0.1:${port}/fonts/missing-not-real.woff2`);
    const missingBody = await missing.text();
    assert.equal(missing.status, 404, `unknown font must not be HTML 200, got ${missing.status}`);
    assert.doesNotMatch(missing.headers.get("content-type") || "", /html/i);
    assert.doesNotMatch(missingBody, /<!doctype html|<html/i);
    assert.doesNotMatch(missing.headers.get("cache-control") || "", /immutable/i);
    const present = await fetch(`http://127.0.0.1:${port}/fonts/manrope.css`);
    assert.equal(present.status, 200);
    assert.match(present.headers.get("content-type") || "", /css/i);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /fixture/);
  } finally {
    preview.kill("SIGTERM");
    rmSync(outDir, { recursive: true, force: true });
  }
  console.log("FONTS_UNKNOWN_URL_NOT_HTML:PASS");
}

{
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  const probe = spawnSync(
    process.execPath,
    [
      path.join(root, "server/scripts/uiAssetProbe.mjs"),
      "check-http",
      "--html",
      '<script src="/assets/index-AAA.js"></script><link rel="stylesheet" href="/assets/index-AAA.css">',
      "--origin",
      "http://127.0.0.1:1",
      "--nginx",
      "https://clover-spb.ru",
      "--nginx-resolve",
      "clover-spb.ru:443:127.0.0.1",
      "--curl",
      curl,
    ],
    { encoding: "utf8" }
  );
  assert.notEqual(probe.status, 0);
  assert.match(`${probe.stderr}\n${probe.stdout}`, /Not a browser smoke PASS/i);
  console.log("HAIRPIN_NOT_BROWSER_PASS:PASS");
}

function resolveTool(names) {
  for (const name of names) {
    for (const flag of ["-V", "version"]) {
      const result = spawnSync(name, [flag], { encoding: "utf8" });
      if (
        !result.error &&
        /OpenSSL|curl \d|libcurl/i.test(`${result.stdout}\n${result.stderr}`)
      ) {
        return name;
      }
    }
  }
  return "";
}

function writeTlsMaterial(dir, { cn, caName }) {
  const openssl =
    resolveTool([
      path.join("C:\\Program Files\\Git\\usr\\bin", "openssl.exe"),
      "openssl",
    ]) || "";
  assert.ok(openssl, "openssl required for local TLS fixture");
  const caKey = path.join(dir, `${caName}.key`);
  const caCrt = path.join(dir, `${caName}.crt`);
  const serverKey = path.join(dir, `${cn}.key`);
  const serverCsr = path.join(dir, `${cn}.csr`);
  const serverCrt = path.join(dir, `${cn}.crt`);
  const ext = path.join(dir, `${cn}.ext`);
  writeFileSync(ext, `subjectAltName=DNS:${cn}\n`);
  const run = (args) => {
    const result = spawnSync(openssl, args, { encoding: "utf8" });
    assert.equal(result.status, 0, `openssl ${args[0]} failed: ${result.stderr}\n${result.stdout}`);
  };
  run(["genrsa", "-out", caKey, "2048"]);
  run([
    "req",
    "-x509",
    "-new",
    "-nodes",
    "-key",
    caKey,
    "-sha256",
    "-days",
    "1",
    "-out",
    caCrt,
    "-subj",
    `/CN=${caName}`,
  ]);
  run(["genrsa", "-out", serverKey, "2048"]);
  run(["req", "-new", "-key", serverKey, "-out", serverCsr, "-subj", `/CN=${cn}`]);
  run([
    "x509",
    "-req",
    "-in",
    serverCsr,
    "-CA",
    caCrt,
    "-CAkey",
    caKey,
    "-CAcreateserial",
    "-out",
    serverCrt,
    "-days",
    "1",
    "-sha256",
    "-extfile",
    ext,
  ]);
  return { caCrt, serverKey, serverCrt };
}

{
  const curl = resolveTool([
    path.join("C:\\Program Files\\Git\\mingw64\\bin", "curl.exe"),
    path.join("C:\\Program Files\\Git\\usr\\bin", "curl.exe"),
    process.platform === "win32" ? "curl.exe" : "curl",
    "curl",
  ]);
  assert.ok(curl, "curl required for local TLS fixture");
  const tlsDir = mkdtempSync(path.join(tmpdir(), "clover-tls-"));
  const bashCandidates = [
    path.join("C:\\Program Files\\Git\\usr\\bin", "bash.exe"),
    path.join("C:\\Program Files\\Git\\bin", "bash.exe"),
    "bash",
  ];
  const bash =
    bashCandidates.find((cmd) => spawnSync(cmd, ["-c", "echo ok"], { encoding: "utf8" }).status === 0) ||
    "";
  let probeCurl = curl;
  if (process.platform === "win32") {
    assert.ok(bash, "Git bash required to run the Windows TLS curl wrapper");
    process.env.CLOVER_PROBE_BASH = bash;
    probeCurl = path.join(tlsDir, "curl-tls");
    writeFileSync(
      probeCurl,
      `#!/usr/bin/env bash
# Test-only: Windows schannel has no CRL for a 1-day fixture cert.
# Certificate + hostname verification stay enabled. Never -k/--insecure.
exec "${curl.replace(/\\/g, "/")}" --ssl-no-revoke "$@"
`
    );
  }
  const originPort = await freePort();
  const tlsPort = await freePort();
  const trusted = writeTlsMaterial(tlsDir, {
    cn: "clover-deploy-tls.test",
    caName: "clover-deploy-test-ca",
  });
  const untrusted = writeTlsMaterial(tlsDir, {
    cn: "other-deploy-tls.test",
    caName: "clover-untrusted-ca",
  });
  const assetJs = "export default 1;\n";
  const assetCss = "body{color:#111}";
  const origin = createHttpServer((req, res) => {
    if (req.url === "/assets/index-AAA.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(assetJs);
      return;
    }
    if (req.url === "/assets/index-AAA.css") {
      res.writeHead(200, { "Content-Type": "text/css" });
      res.end(assetCss);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("missing");
  });
  const hostsSeen = [];
  const tlsServer = createHttpsServer(
    {
      key: readFileSync(trusted.serverKey),
      cert: readFileSync(trusted.serverCrt),
    },
    (req, res) => {
      hostsSeen.push(req.headers.host || "");
      if (req.url === "/assets/index-AAA.js") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        res.end(assetJs);
        return;
      }
      if (req.url === "/assets/index-AAA.css") {
        res.writeHead(200, { "Content-Type": "text/css" });
        res.end(assetCss);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("missing");
    }
  );
  await new Promise((resolve) => origin.listen(originPort, "127.0.0.1", resolve));
  await new Promise((resolve) => tlsServer.listen(tlsPort, "127.0.0.1", resolve));
  const probeJs = path.join(root, "server/scripts/uiAssetProbe.mjs");
  const html = '<script src="/assets/index-AAA.js"></script><link rel="stylesheet" href="/assets/index-AAA.css">';
  const runProbe = (args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [probeJs, "check-http", "--html", html, ...args], {
        encoding: "utf8",
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
  try {
    const trustedPass = await runProbe([
      "--origin",
      `http://127.0.0.1:${originPort}`,
      "--nginx",
      `https://clover-deploy-tls.test:${tlsPort}`,
      "--nginx-resolve",
      `clover-deploy-tls.test:${tlsPort}:127.0.0.1`,
      "--cacert",
      trusted.caCrt,
      "--curl",
      probeCurl,
    ]);
    assert.equal(trustedPass.status, 0, `trusted TLS must PASS: ${trustedPass.stderr}\n${trustedPass.stdout}`);
    assert.match(trustedPass.stdout, /check-http: origin PASS/);
    assert.match(trustedPass.stdout, /check-http: nginx PASS/);
    assert.ok(hostsSeen.some((host) => host.startsWith("clover-deploy-tls.test")));
    assert.doesNotMatch(`${trustedPass.stderr}\n${trustedPass.stdout}`, /\s-k\b|--insecure/);
    console.log("TLS_TRUSTED_HOST_SNI_PASS:PASS");

    const wrongHost = await runProbe([
      "--origin",
      `http://127.0.0.1:${originPort}`,
      "--nginx",
      `https://wrong-hostname.test:${tlsPort}`,
      "--nginx-resolve",
      `wrong-hostname.test:${tlsPort}:127.0.0.1`,
      "--cacert",
      trusted.caCrt,
      "--curl",
      probeCurl,
    ]);
    assert.notEqual(wrongHost.status, 0, "wrong hostname/SNI must FAIL");
    assert.match(`${wrongHost.stderr}\n${wrongHost.stdout}`, /certificate|SSL|TLS|unable to|not a browser smoke PASS/i);
    console.log("TLS_WRONG_HOSTNAME_FAIL:PASS");

    const untrustedCert = await runProbe([
      "--origin",
      `http://127.0.0.1:${originPort}`,
      "--nginx",
      `https://clover-deploy-tls.test:${tlsPort}`,
      "--nginx-resolve",
      `clover-deploy-tls.test:${tlsPort}:127.0.0.1`,
      "--cacert",
      untrusted.caCrt,
      "--curl",
      probeCurl,
    ]);
    assert.notEqual(untrustedCert.status, 0, "untrusted CA must FAIL");
    assert.match(`${untrustedCert.stderr}\n${untrustedCert.stdout}`, /certificate|SSL|TLS|unable to|not a browser smoke PASS/i);
    console.log("TLS_UNTRUSTED_CERT_FAIL:PASS");
  } finally {
    await new Promise((resolve) => origin.close(resolve));
    await new Promise((resolve) => tlsServer.close(resolve));
    rmSync(tlsDir, { recursive: true, force: true });
  }
}

void existsSync;
console.log("verify-ui-asset-gate: PASS");
