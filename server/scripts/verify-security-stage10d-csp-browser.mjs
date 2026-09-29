import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { launchTestChromium } from "./playwrightRuntime.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const headerSource = readFileSync(
  path.join(repoRoot, "ops/security-stage6/package-b/nginx/clover-security-headers.conf"),
  "utf8"
);
const csp = headerSource.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1] || "";
assert.ok(csp.includes("default-src 'self'"), "enforced CSP must be readable from tracked nginx candidate");

function listen(app) {
  const server = createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const blockedOrigin = express();
let blockedExternalRequests = 0;
blockedOrigin.get("/forbidden.js", (_req, res) => {
  blockedExternalRequests += 1;
  res.type("application/javascript").send("window.forbiddenScriptRan = true;");
});
const blockedServer = await listen(blockedOrigin);
const blockedPort = blockedServer.address().port;

const app = express();
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", csp);
  next();
});
app.get("/self.js", (_req, res) => {
  res.type("application/javascript").send("window.selfScriptRan = true;");
});
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html><html><head><style>body { color: rgb(1, 2, 3); }</style></head><body>
    <button id="attribute" onclick="window.attributeHandlerRan = true">attribute</button>
    <button id="listener">listener</button>
    <script>
      window.inlineBlockRan = true;
      window.cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.cspViolations.push(event.violatedDirective);
      });
      document.getElementById("listener").addEventListener("click", () => {
        window.listenerRan = true;
      });
    </script>
    <script src="/self.js"></script>
    <script src="http://127.0.0.1:${blockedPort}/forbidden.js"></script>
  </body></html>`);
});

const offlineHtml = readFileSync(path.join(repoRoot, "public/offline.html"), "utf8");
let offlineHits = 0;
app.get("/offline.html", (_req, res) => {
  offlineHits += 1;
  res.type("html").send(offlineHtml);
});
const appServer = await listen(app);
const appPort = appServer.address().port;

let browser;
try {
  browser = await launchTestChromium();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${appPort}/`, { waitUntil: "load" });
  await page.locator("#attribute").click();
  await page.locator("#listener").click();
  await page.waitForFunction(() => window.selfScriptRan === true);
  const state = await page.evaluate(() => ({
    inlineBlockRan: window.inlineBlockRan === true,
    attributeHandlerRan: window.attributeHandlerRan === true,
    listenerRan: window.listenerRan === true,
    selfScriptRan: window.selfScriptRan === true,
    forbiddenScriptRan: window.forbiddenScriptRan === true,
    violations: window.cspViolations || [],
    color: getComputedStyle(document.body).color,
  }));
  assert.equal(state.inlineBlockRan, true, "current inline blocks must remain compatible");
  assert.equal(state.attributeHandlerRan, false, "script-src-attr must block onclick");
  assert.equal(state.listenerRan, true, "programmatic/React-style listeners must work");
  assert.equal(state.selfScriptRan, true, "same-origin scripts must work");
  assert.equal(state.forbiddenScriptRan, false, "unlisted script origin must be blocked");
  assert.equal(blockedExternalRequests, 0, "blocked script must not reach the foreign origin");
  assert.ok(state.violations.includes("script-src-attr"));
  assert.ok(state.violations.some((item) => item === "script-src-elem" || item === "script-src"));
  assert.equal(state.color, "rgb(1, 2, 3)", "current inline styles must remain compatible");

  const offline = await browser.newPage();
  await offline.goto(`http://127.0.0.1:${appPort}/offline.html`, { waitUntil: "load" });
  const before = offlineHits;
  await offline.locator("#retry").click();
  await offline.waitForLoadState("load");
  assert.ok(offlineHits > before, "offline retry must reload without an inline event attribute");
  console.log("SECURITY_STAGE10D_CSP_BROWSER: PASS");
} finally {
  await browser?.close();
  await new Promise((resolve) => appServer.close(resolve));
  await new Promise((resolve) => blockedServer.close(resolve));
}
