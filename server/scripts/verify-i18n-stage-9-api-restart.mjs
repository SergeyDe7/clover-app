/**
 * Stage 9 gap: real isolated API process stop/start must keep localizationSettings.
 * Temp DB only — never production.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapSrc =
  process.env.CLOVER_STAGE9_DB_SNAP ||
  "/opt/clover/worktrees/build-artifacts/i18n-stage-9/clover-readonly-snap.sqlite";
const artifact = path.join(
  root,
  "server/scripts/fixtures/stage9-product-name-gap/artifact.json"
);
const productionData = path.resolve("/opt/clover/clover-app/server/data");

const tmp = mkdtempSync(path.join(tmpdir(), "clover-stage9-api-restart-"));
const dbPath = path.join(tmp, "clover.sqlite");
cpSync(snapSrc, dbPath);
assert.equal(path.resolve(dbPath).startsWith(productionData), false);
process.env.DB_PATH = dbPath;
process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "disabled";
process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED = "1";
process.env.ONEC_WRITE_ENABLED = "0";
process.env.ONEC_PROD_EXCHANGE_ENABLED = "0";

const { applyStage9ProductNameImport } = await import("../src/stage9ProductNameImport.js");
const { writeLocalizationSettings, readLocalizationSettings } = await import(
  "../src/localizationStore.js"
);

applyStage9ProductNameImport(artifact, "stage9-api-restart");
const enabled = writeLocalizationSettings(
  { enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh", "ar"] },
  "stage9-api-restart-admin"
);
assert.deepEqual(
  [...enabled.settings.enabledLanguages].sort(),
  ["ar", "en", "ky", "ru", "tg", "uz", "zh"].sort()
);
const catalogVersion = enabled.settings.catalogVersion;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function waitRuntime(port, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/public/localization/runtime`);
      if (res.ok) return res.json();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`API runtime not ready on ${port}`);
}

function startApi(port) {
  const prodEnv = loadDotEnv("/opt/clover/clover-app/server/.env");
  return spawn(process.execPath, [path.join(root, "server/src/server.js")], {
    cwd: path.join(root, "server"),
    env: {
      ...process.env,
      ...prodEnv,
      DB_PATH: dbPath,
      PORT: String(port),
      HOST: "127.0.0.1",
      CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
      CLOVER_PRODUCT_TRANSLATION_PROVIDER: "disabled",
      ONEC_WRITE_ENABLED: "0",
      ONEC_PROD_EXCHANGE_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stopApi(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const port1 = await freePort();
let api = startApi(port1);
try {
  const runtime1 = await waitRuntime(port1);
  assert.ok(runtime1.enabledLanguages.includes("en"));
  assert.ok(runtime1.enabledLanguages.includes("ar"));
  assert.deepEqual(
    [...runtime1.enabledLanguages].sort(),
    ["ar", "en", "ky", "ru", "tg", "uz", "zh"].sort()
  );

  await stopApi(api);

  // New process, same DB — settings must survive real process restart.
  const port2 = await freePort();
  api = startApi(port2);
  const runtime2 = await waitRuntime(port2);
  assert.deepEqual(
    [...runtime2.enabledLanguages].sort(),
    ["ar", "en", "ky", "ru", "tg", "uz", "zh"].sort()
  );

  const after = readLocalizationSettings();
  assert.deepEqual(
    [...after.enabledLanguages].sort(),
    ["ar", "en", "ky", "ru", "tg", "uz", "zh"].sort()
  );
  assert.equal(after.catalogVersion, catalogVersion);

  console.log(
    JSON.stringify({
      ok: true,
      before: runtime1.enabledLanguages,
      afterRestart: runtime2.enabledLanguages,
      catalogVersion: after.catalogVersion,
    })
  );
  console.log("verify-i18n-stage-9-api-restart: ok");
} finally {
  await stopApi(api);
  rmSync(tmp, { recursive: true, force: true });
}
