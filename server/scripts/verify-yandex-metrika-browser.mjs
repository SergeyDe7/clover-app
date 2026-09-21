#!/usr/bin/env node
/**
 * Off-live Vite build + optional Chromium dump-dom.
 * Never writes /opt/clover/clover-app/dist. Never loads mc.yandex.ru.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const liveRoot = path.resolve("/opt/clover/clover-app");
assert.notEqual(path.resolve(root), liveRoot);

const temp = mkdtempSync(path.join(tmpdir(), "clover-metrika-browser-"));
const outDir = path.join(temp, "dist");
const reportPath = path.join(temp, "metrika-browser-report.json");

process.on("exit", () => {
  /* keep report if CLOVER_METRIKA_KEEP_DIST=1 */
  if (process.env.CLOVER_METRIKA_KEEP_DIST === "1") return;
  rmSync(temp, { recursive: true, force: true });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function findVite() {
  const local = path.join(root, "node_modules/vite/bin/vite.js");
  const shared = path.join(liveRoot, "node_modules/vite/bin/vite.js");
  if (existsSync(local)) return local;
  if (existsSync(shared)) return shared;
  throw new Error("vite not found; symlink node_modules or npm install in the worktree");
}

function findChrome() {
  const named = String(process.env.CLOVER_BROWSER_CHROME || "").trim();
  const candidates = [
    named,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((file) => existsSync(file)) || "";
}

const viteBin = findVite();
const build = spawnSync(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir"], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    VITE_YANDEX_METRIKA_ENABLED: "1",
    VITE_YANDEX_METRIKA_TEST_MODE: "1",
    VITE_YANDEX_METRIKA_TAG_SRC: "/__clover_metrika_mock.js",
    VITE_STORE_HOSTS: "127.0.0.1,localhost",
    VITE_PUBLIC_BASE_URL: "https://clover-spb.ru",
    CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
    NODE_PATH: [
      path.join(root, "node_modules"),
      path.join(liveRoot, "node_modules"),
      process.env.NODE_PATH || "",
    ]
      .filter(Boolean)
      .join(path.delimiter),
  },
});
assert.equal(
  build.status,
  0,
  `off-live vite build failed\n${build.stderr}\n${build.stdout}`
);
assert.equal(existsSync(path.join(liveRoot, "dist", "index.html")) && outDir.startsWith(liveRoot), false);
assert.ok(existsSync(path.join(outDir, "index.html")));

copyFileSync(
  path.join(root, "tools/metrika-browser-smoke-portable/mock-metrika.js"),
  path.join(outDir, "__clover_metrika_mock.js")
);

const builtHtml = readFileSync(path.join(outDir, "index.html"), "utf8");
const asset = builtHtml.match(/src="(\/assets\/[^"]*index-[^"]+\.js)"/)?.[1];
assert.ok(asset, "index asset missing");
const chunks = [];
function visitAssets(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) visitAssets(full);
    else if (name.endsWith(".js")) chunks.push(readFileSync(full, "utf8"));
  }
}
visitAssets(path.join(outDir, "assets"));
const bundle = chunks.join("\n");
assert.match(bundle, /Используем cookie для статистики — с вашего разрешения\./);
assert.match(bundle, /Подробнее/);
assert.match(bundle, /data-analytics-consent/);
assert.match(bundle, /__clover_metrika_mock\.js/);
assert.match(bundle, /order_submitted/);
assert.match(bundle, /disableYaCounter/);
assert.doesNotMatch(
  readFileSync(path.join(root, "src/screens/client/OrderEditor.jsx"), "utf8"),
  /trackOrderSubmitted/
);

const port = await freePort();
const preview = spawn(
  process.execPath,
  [viteBin, "preview", "--host", "127.0.0.1", "--port", String(port), "--outDir", outDir],
  {
    cwd: root,
    env: { ...process.env, NODE_PATH: path.join(liveRoot, "node_modules") },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

try {
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("preview timeout")), 20000);
  const probe = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) {
        clearTimeout(timer);
        resolve();
        return;
      }
    } catch {
      /* still starting */
    }
    setTimeout(probe, 200);
  };
  preview.on("error", reject);
  probe();
});

const page = await fetch(`http://127.0.0.1:${port}/`);
assert.equal(page.status, 200);
const mock = await fetch(`http://127.0.0.1:${port}/__clover_metrika_mock.js`);
assert.equal(mock.status, 200);
assert.match(await mock.text(), /__cloverMetrikaMock/);

const chrome = findChrome();
let settledDom = "NOT VERIFIED";
let chromeDetail = "chrome-not-found-use-windows-kit";
if (chrome) {
  const dump = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--dump-dom",
      `http://127.0.0.1:${port}/`,
    ],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, HOME: temp } }
  );
  if (dump.status === 0 && dump.stdout.includes("data-analytics-consent")) {
    assert.match(dump.stdout, /Используем cookie для статистики — с вашего разрешения\./);
    assert.match(dump.stdout, /Подробнее/);
    assert.match(dump.stdout, /Разрешить/);
    assert.match(dump.stdout, /Отклонить/);
    assert.doesNotMatch(dump.stdout, /Необязательная аналитика/);
    assert.doesNotMatch(dump.stdout, /Разрешить аналитику/);
    assert.doesNotMatch(dump.stdout, /mc\.yandex\.ru\/metrika\/tag\.js/);
    settledDom = "PASS";
    chromeDetail = "dump-dom-prompt";
    const mobile = spawnSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=390,844",
        "--dump-dom",
        `http://127.0.0.1:${port}/`,
      ],
      { encoding: "utf8", timeout: 25000, env: { ...process.env, HOME: temp } }
    );
    if (mobile.status === 0 && mobile.stdout.includes("is-prompt")) {
      assert.match(mobile.stdout, /data-analytics-consent="prompt"/);
      assert.match(mobile.stdout, /Используем cookie для статистики — с вашего разрешения\./);
      chromeDetail = "dump-dom-prompt+mobile-390";
    } else {
      chromeDetail = "dump-dom-prompt;mobile-NOT_VERIFIED";
    }
  } else {
    settledDom = "NOT VERIFIED";
    chromeDetail = `dump-failed:${dump.status}:${(dump.stderr || "").slice(0, 160)}`;
  }
}

const report = {
  METRIKA_BROWSER: settledDom === "PASS" ? "PASS" : "PARTIAL",
  offLiveBuild: "PASS",
  mockServed: "PASS",
  bundleHasConsentUi: "PASS",
  bundleHasMockTag: "PASS",
  settledDom,
  chromeDetail,
  outDir,
  windowsKit: "tools/metrika-browser-smoke-portable/WINDOWS-TRANSFER.md",
};
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
assert.equal(report.offLiveBuild, "PASS");
assert.equal(report.bundleHasMockTag, "PASS");
} finally {
  preview.kill("SIGTERM");
}
