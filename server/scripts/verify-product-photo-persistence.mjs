/**
 * Product photo persistence + storefront badge (isolated temp sandbox).
 * Never writes to source worktree server/uploads — all runtime in temp copy.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripProductForSave } from "../../src/shared/appHelpers.js";
import { mergeProductsPreservingOneCLinks } from "../src/oneCProducts.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scratchRoot = path.join(sourceRoot, ".tmp");
mkdirSync(scratchRoot, { recursive: true });
const evidenceDir = mkdtempSync(path.join(scratchRoot, "clover-photo-evidence-"));
const sandbox = mkdtempSync(path.join(scratchRoot, "clover-photo-sandbox-"));
const productId = 9001;
const jwtSecret = "clover-photo-persist-verify-secret-32chars!";
const password = "PhotoPersistVerify!1";
let pwDir = null;

function logEvidence(name, text) {
  writeFileSync(path.join(evidenceDir, name), text);
}

function captureUploadsManifest(rootDir) {
  const uploads = path.join(rootDir, "server/uploads");
  if (!existsSync(uploads)) return [];
  const out = [];
  for (const entry of readdirSync(uploads, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(uploads, entry.name);
    out.push(`${entry.name} ${lstatSync(full).size}`);
  }
  return out.sort();
}

function materializeSandbox() {
  spawnSync("cp", ["-a", `${sourceRoot}/.`, `${sandbox}/`], { encoding: "utf8" });
  for (const rel of ["node_modules", "server/node_modules", "dist", ".git"]) {
    rmSync(path.join(sandbox, rel), { recursive: true, force: true });
  }
  if (!existsSync(path.join(sourceRoot, "node_modules"))) {
    throw new Error("source node_modules missing — run npm ci in worktree first");
  }
  if (!existsSync(path.join(sourceRoot, "server/node_modules"))) {
    throw new Error("source server/node_modules missing — run npm ci in server first");
  }
  mkdirSync(path.join(sandbox, "server"), { recursive: true });
  symlinkSync(path.join(sourceRoot, "node_modules"), path.join(sandbox, "node_modules"));
  symlinkSync(
    path.join(sourceRoot, "server/node_modules"),
    path.join(sandbox, "server/node_modules")
  );
  const uploads = path.join(sandbox, "server/uploads");
  rmSync(uploads, { recursive: true, force: true });
  mkdirSync(uploads, { recursive: true });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitHealth(base, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server health timeout");
}

async function waitUrl(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`url timeout: ${url}`);
}

async function api(base, route, { method = "GET", token, body, formData } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !formData) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${route}`, {
    method,
    headers,
    body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

function seedDatabase(databasePath, seedMetaPath, seedScriptPath, serverDir) {
  writeFileSync(
    seedScriptPath,
    `
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(path.join(serverDir, "package.json"))});
const bcrypt = require("bcryptjs");
import { createUser, setGlobalState } from ${JSON.stringify(path.join(serverDir, "src/db.js"))};

const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 4);
const manager = createUser({
  email: "photo-manager@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "Photo Test", contactName: "Mgr" },
});

setGlobalState("products", [
  {
    id: ${productId},
    name: "Photo persistence test product",
    category: "Прочее",
    code: "PHOTO-9001",
    active: true,
    showOnStorefront: false,
    saleUnits: ["piece"],
    pieceSize: 1,
    pricePiece: 100,
    imageUrl: "",
    imageUpdatedAt: "",
  },
  {
    id: ${productId + 1},
    name: "Storefront visible product",
    category: "Прочее",
    code: "PHOTO-9002",
    active: true,
    showOnStorefront: true,
    saleUnits: ["piece"],
    pieceSize: 1,
    pricePiece: 200,
    imageUrl: "",
    imageUpdatedAt: "",
  },
]);
setGlobalState("settings", { showPrices: true, allowClientEdit: true });
writeFileSync(${JSON.stringify(seedMetaPath)}, JSON.stringify({ managerEmail: manager.email }));
`
  );

  const result = spawnSync(process.execPath, [seedScriptPath], {
    cwd: serverDir,
    env: { ...process.env, DB_PATH: databasePath, JWT_SECRET: jwtSecret },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`seed failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(readFileSync(seedMetaPath, "utf8"));
}

function minimalJpegBuffer() {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP/bAEMAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=",
    "base64"
  );
}

function startServer(serverDir, databasePath, port) {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      PORT: String(port),
      HOST: "127.0.0.1",
      JWT_SECRET: jwtSecret,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      SMTP_HOST: "",
      TELEGRAM_BOT_TOKEN: "",
      ONEC_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return { child, getStderr: () => stderr };
}

function startUiPreview(sandboxRoot, apiPort, uiPort) {
  const previewConfig = path.join(sandboxRoot, "vite.preview.config.mjs");
  writeFileSync(
    previewConfig,
    `
import { defineConfig } from "vite";

export default defineConfig({
  preview: {
    host: "127.0.0.1",
    port: ${uiPort},
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:${apiPort}", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:${apiPort}", changeOrigin: true },
    },
  },
});
`
  );
  const child = spawn(
    process.execPath,
    [
      path.join(sandboxRoot, "node_modules/vite/bin/vite.js"),
      "preview",
      "--config",
      previewConfig,
      "--host",
      "127.0.0.1",
      "--port",
      String(uiPort),
      "--strictPort",
    ],
    {
      cwd: sandboxRoot,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let stderr = "";
  let stdout = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  return { child, getLogs: () => stdout + stderr };
}

function productFromBootstrap(json, id = productId) {
  return (json.products || []).find((p) => String(p.id) === String(id));
}

function assertCertificateChangesAbsent() {
  const oneC = readFileSync(path.join(sourceRoot, "server/src/oneCProducts.js"), "utf8");
  const matrix = readFileSync(
    path.join(sourceRoot, "src/screens/manager/matrixMembership.js"),
    "utf8"
  );
  const diff = spawnSync("git", ["diff"], { cwd: sourceRoot, encoding: "utf8" }).stdout || "";
  for (const token of [
    "certificateUrl",
    "certificateName",
    "certificateUpdatedAt",
    "CATALOG_MEDIA_FIELDS",
  ]) {
    assert.equal(
      diff.includes(token),
      false,
      `production diff must not mention ${token}`
    );
    assert.equal(
      oneC.includes(token),
      false,
      `oneCProducts.js must not preserve ${token}`
    );
    assert.equal(
      matrix.includes(token),
      false,
      `matrixMembership.js must not preserve ${token}`
    );
  }
  assert.ok(oneC.includes('CATALOG_IMAGE_FIELDS = ["imageUrl", "imageUpdatedAt"]'));
}

async function runUiVerification({ uiBase, apiBase, token }) {
  pwDir = path.join(scratchRoot, `clover-photo-pw-${Date.now()}`);
  mkdirSync(pwDir, { recursive: true });
  writeFileSync(
    path.join(pwDir, "package.json"),
    JSON.stringify({ name: "clover-photo-ui", private: true, type: "module" }, null, 2)
  );
  const install = spawnSync("npm", ["install", "--prefix", pwDir, "playwright@1.50.1"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (install.status !== 0) {
    throw new Error(`playwright install failed: ${install.stderr || install.stdout}`);
  }
  const browsers = spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: pwDir,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(pwDir, "browsers") },
  });
  if (browsers.status !== 0) {
    throw new Error(`chromium install failed: ${browsers.stderr || browsers.stdout}`);
  }

  writeFileSync(
    path.join(pwDir, "ui-verify.mjs"),
    `
import assert from "node:assert/strict";
import path from "node:path";
import { chromium, devices } from "playwright";

const evidenceDir = ${JSON.stringify(evidenceDir)};
const uiBase = ${JSON.stringify(uiBase)};
const apiBase = ${JSON.stringify(apiBase)};
const token = ${JSON.stringify(token)};

async function dismissModal(page) {
  const modal = page.locator(".order-thankyou.app-modal-shell");
  if ((await modal.count()) === 0) return;
  const ok = modal.getByRole("button", { name: /Понятно|OK|Закрыть/i });
  if ((await ok.count()) > 0) {
    await ok.first().click();
  } else {
    await page.keyboard.press("Escape");
  }
  await modal.waitFor({ state: "hidden", timeout: 10000 });
}

async function assertPhotoLoads(page, imgLocator, apiBase, label) {
  await imgLocator.waitFor({ state: "visible" });
  const loaded = await imgLocator.evaluate(
    (img) =>
      new Promise((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve(true);
          return;
        }
        img.addEventListener("load", () => resolve(img.naturalWidth > 0), { once: true });
        img.addEventListener("error", () => resolve(false), { once: true });
        setTimeout(() => resolve(false), 15000);
      })
  );
  const src = await imgLocator.getAttribute("src");
  const barePath = String(src || "").split("?")[0];
  const apiStatus = barePath
    ? (await page.request.get(new URL(barePath, apiBase).href)).status()
    : 0;
  assert.ok(loaded, \`\${label}: photo must render in browser (src=\${src}, api=\${apiStatus})\`);
  assert.equal(apiStatus, 200, \`\${label}: uploaded file must exist on api server\`);
}

async function bootstrapImageStatus(page, apiBase, productId) {
  const token = await page.evaluate(() => localStorage.getItem("clover-api-token"));
  const bootRes = await page.request.get(\`\${apiBase}/api/bootstrap\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  assert.equal(bootRes.status(), 200);
  const boot = await bootRes.json();
  const p = (boot.products || []).find((x) => String(x.id) === String(productId));
  const imageUrl = String(p?.imageUrl || "");
  const barePath = imageUrl.split("?")[0];
  const fileCheck = barePath
    ? (await page.request.get(new URL(barePath, apiBase).href)).status()
    : 0;
  return { imageUrl, fileCheck };
}

async function refreshBootstrapCatalogCache(page, apiBase, token) {
  const bootRes = await page.request.get(\`\${apiBase}/api/bootstrap\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  assert.equal(bootRes.status(), 200);
  const bootJson = await bootRes.json();
  const first = (bootJson.products || [])[0];
  if (!first?.id) return;
  const touchName = \`\${String(first.name || "Photo").trim()} \${Date.now()}\`;
  const touchRes = await page.request.put(
    \`\${apiBase}/api/admin/products/\${encodeURIComponent(first.id)}\`,
    {
      headers: {
        Authorization: \`Bearer \${token}\`,
        "Content-Type": "application/json",
      },
      data: { product: { ...first, name: touchName } },
    }
  );
  assert.equal(touchRes.status(), 200, "catalog cache refresh touch must succeed");
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [label, viewport, productNeedle, productId] of [
    ["desktop", { width: 1280, height: 900 }, "Photo persistence test product", "9001"],
    ["mobile", devices["iPhone 13"].viewport, "Storefront visible product", "9002"],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await context.addInitScript(({ t }) => {
      localStorage.setItem("clover-api-token", t);
      localStorage.setItem("clover-server-migrated-manager", "1");
      for (const key of [
        "clover-products",
        "clover-orders",
        "clover-client-profile",
        "clover-addresses",
        "clover-favorites",
        "clover-manager-settings",
        "clover-client-links",
      ]) {
        localStorage.removeItem(key);
      }
    }, { t: token });
    await page.goto(uiBase, { waitUntil: "networkidle" });
    await page.waitForSelector(".manager-nav", { timeout: 90000 });
    await dismissModal(page);
    await page.getByRole("button", { name: "Товары", exact: true }).click();
    await page.waitForSelector(".product-manager-list");

    const offRow = page.locator(".product-manager-row", { hasText: productNeedle });
    if (productId === "9001") {
      await offRow.locator(".badge.red", { hasText: "Не на витрине" }).waitFor({ state: "visible" });
    }
    const onRow = page.locator(".product-manager-row", {
      hasText: "Storefront visible product",
    });
    await onRow.waitFor({ state: "visible" });
    assert.equal(await onRow.locator(".badge.red", { hasText: "Не на витрине" }).count(), 0);
    assert.equal(await onRow.locator(".badge.green", { hasText: "На витрине" }).count(), 0);
    if (productId === "9002") {
      assert.equal(await onRow.locator(".badge.red", { hasText: "Не на витрине" }).count(), 0);
    }

    const editRow = page.locator(".product-manager-row", { hasText: productNeedle });
    await editRow.getByRole("button", { name: "Изменить" }).click();
    await page.waitForSelector(".product-editor-scroll");
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    const jpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
      "base64"
    );
    const uploadWait = page.waitForResponse(
      (res) =>
        res.url().includes(\`/api/admin/products/\${productId}/image\`) &&
        res.request().method() === "POST",
      { timeout: 30000 }
    );
    await fileInput.setInputFiles({
      name: "ui-photo.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
    });
    const uploadRes = await uploadWait;
    assert.equal(uploadRes.status(), 201, "image upload must succeed in UI");
    const uploadJson = await uploadRes.json();
    const uploadedPath = String(uploadJson.imageUrl || "");
    assert.ok(uploadedPath.startsWith("/uploads/"), "upload must return imageUrl");
    assert.equal(
      (await page.request.get(new URL(uploadedPath, apiBase).href)).status(),
      200,
      \`\${label} uploaded file must exist on disk\`
    );
    await page.waitForFunction(
      () => {
        const input = document.querySelector('input[type="file"][accept*="image"]');
        return input && !input.disabled;
      },
      { timeout: 15000 }
    );
    const editorPreview = page.locator(".product-editor-photo-preview img");
    await assertPhotoLoads(page, editorPreview, apiBase, \`\${label} after UI upload\`);
    await dismissModal(page);
    const uiProductName = \`Photo persistence UI \${label}\`;
    await page.locator("label.field", { hasText: "Название товара" }).locator("input").fill(uiProductName);
    const saveWait = page.waitForResponse(
      (res) =>
        res.url().includes(\`/api/admin/products/\${productId}\`) &&
        res.request().method() === "PUT",
      { timeout: 30000 }
    );
    await page.getByRole("button", { name: "Сохранить товар" }).click();
    const saveRes = await saveWait;
    assert.equal(saveRes.status(), 200, \`\${label} save must succeed\`);
    const saveBody = await saveRes.json();
    assert.equal(
      String(saveBody.product?.imageUrl || ""),
      uploadedPath,
      \`\${label} save must preserve uploaded imageUrl\`
    );

    await page.waitForSelector(".product-manager-list", { timeout: 30000 });

    const savedRow = page.locator(".product-manager-row", { hasText: uiProductName });
    const thumb = savedRow.locator(".product-manager-thumb img");
    await assertPhotoLoads(page, thumb, apiBase, \`\${label} after UI save\`);
    assert.equal(
      (await page.request.get(new URL(uploadedPath, apiBase).href)).status(),
      200,
      \`\${label} uploaded file must exist before reload\`
    );

    await refreshBootstrapCatalogCache(page, apiBase, token);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      (await page.request.get(new URL(uploadedPath, apiBase).href)).status(),
      200,
      \`\${label} uploaded file must exist after reload\`
    );
    const bootRes = await page.request.get(\`\${apiBase}/api/bootstrap\`, {
      headers: { Authorization: \`Bearer \${token}\` },
    });
    assert.equal(bootRes.status(), 200);
    const bootJson = await bootRes.json();
    const bootProduct = (bootJson.products || []).find(
      (p) => String(p.id) === String(productId)
    );
    assert.equal(
      bootProduct?.imageUrl,
      uploadedPath,
      \`\${label} bootstrap must keep uploaded imageUrl after reload\`
    );
    await dismissModal(page);
    await page.waitForSelector(".manager-nav", { timeout: 90000 });
    await page.getByRole("button", { name: "Товары", exact: true }).click();
    await page.waitForSelector(".product-manager-list");
    const rowAfter = page.locator(".product-manager-row", { hasText: uiProductName });
    const thumbAfter = rowAfter.locator(".product-manager-thumb img");
    await assertPhotoLoads(page, thumbAfter, apiBase, \`\${label} after F5 reload\`);

    await page.screenshot({
      path: path.join(evidenceDir, \`manager-products-\${label}.png\`),
      fullPage: true,
    });
    await context.close();
  }
  console.log("ui-verify: ok");
} finally {
  await browser.close();
}
`
  );

  const run = spawnSync(process.execPath, ["ui-verify.mjs"], {
    cwd: pwDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: path.join(pwDir, "browsers"),
    },
  });
  logEvidence("ui-verify.stdout.log", run.stdout || "");
  logEvidence("ui-verify.stderr.log", run.stderr || "");
  if (run.status !== 0) {
    throw new Error(`ui verification failed: ${run.stderr || run.stdout}`);
  }
}

async function main() {
  const sourceUploadsBefore = captureUploadsManifest(sourceRoot);
  logEvidence("source-uploads-before.txt", sourceUploadsBefore.join("\n") + "\n");

  assertCertificateChangesAbsent();

  const managerProductsSource = readFileSync(
    path.join(sourceRoot, "src/screens/manager/ManagerProducts.jsx"),
    "utf8"
  );
  assert.ok(managerProductsSource.includes('product.showOnStorefront !== true'));
  assert.ok(managerProductsSource.includes('className="badge red">Не на витрине'));
  assert.equal(managerProductsSource.includes("На витрине</span>"), false);

  materializeSandbox();
  const root = sandbox;
  const serverDir = path.join(root, "server");
  const databasePath = path.join(evidenceDir, "clover-test.sqlite");
  const seedMetaPath = path.join(evidenceDir, "seed.json");
  const seedScriptPath = path.join(evidenceDir, "seed.mjs");

  const { mergeProductsFromCatalogResponse } = await import(
    `${pathToFileURL(path.join(root, "src/screens/manager/matrixMembership.js")).href}?verify=${Date.now()}`
  );

  const merged = mergeProductsPreservingOneCLinks(
    [{ id: productId, name: "partial" }],
    [{ id: productId, name: "stored", imageUrl: "/uploads/x.jpg", imageUpdatedAt: "t" }]
  );
  assert.equal(merged[0].imageUrl, "/uploads/x.jpg");

  const clientMerged = mergeProductsFromCatalogResponse(
    [{ id: productId, imageUrl: "/uploads/x.jpg", imageUpdatedAt: "t", name: "a", saleUnits: ["piece"], pieceSize: 1, pricePiece: 0 }],
    [{ id: productId, name: "b", saleUnits: ["piece"], pieceSize: 1, pricePiece: 0 }]
  );
  assert.equal(
    clientMerged.find((p) => String(p.id) === String(productId))?.imageUrl,
    "/uploads/x.jpg"
  );

  const build = spawnSync("npm", ["run", "build"], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  logEvidence("build.log", (build.stdout || "") + (build.stderr || ""));
  if (build.status !== 0) throw new Error("sandbox build failed");

  const seeded = seedDatabase(databasePath, seedMetaPath, seedScriptPath, serverDir);
  const apiPort = await freePort();
  let uiPort = await freePort();
  while (uiPort === apiPort) uiPort = await freePort();
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const uiBase = `http://127.0.0.1:${uiPort}`;
  const runtime = startServer(serverDir, databasePath, apiPort);
  const preview = startUiPreview(root, apiPort, uiPort);

  try {
    await waitHealth(apiBase);
    await waitUrl(`${uiBase}/`);

    const login = await api(apiBase, "/api/auth/login", {
      method: "POST",
      body: { email: seeded.managerEmail, password },
    });
    assert.equal(login.status, 200);
    const token = login.json.token;

    const formData = new FormData();
    formData.append(
      "image",
      new Blob([minimalJpegBuffer()], { type: "image/jpeg" }),
      "photo-test.jpg"
    );
    const upload = await api(apiBase, `/api/admin/products/${productId}/image`, {
      method: "POST",
      token,
      formData,
    });
    assert.equal(upload.status, 201);
    const uploadedUrl = upload.json.imageUrl;
    assert.ok(uploadedUrl.startsWith("/uploads/"));

    const sandboxUploadPath = path.join(serverDir, "uploads", path.basename(uploadedUrl));
    assert.ok(existsSync(sandboxUploadPath), "upload must land in sandbox uploads only");

    const bootAfterUpload = await api(apiBase, "/api/bootstrap", { token });
    assert.equal(productFromBootstrap(bootAfterUpload.json)?.imageUrl, uploadedUrl);

    const savePayload = stripProductForSave({
      ...productFromBootstrap(bootAfterUpload.json),
      name: "Photo persistence test product (saved)",
    });
    delete savePayload.imageUrl;
    delete savePayload.imageUpdatedAt;
    const singleSave = await api(apiBase, `/api/admin/products/${productId}`, {
      method: "PUT",
      token,
      body: { product: savePayload },
    });
    assert.equal(singleSave.status, 200);
    assert.equal(singleSave.json.product?.imageUrl, uploadedUrl);

    const bootBeforeBulk = await api(apiBase, "/api/bootstrap", { token });
    const staleBulk = (bootBeforeBulk.json.products || []).map((p) => {
      const stripped = stripProductForSave(p);
      if (String(p.id) !== String(productId)) return stripped;
      delete stripped.imageUrl;
      delete stripped.imageUpdatedAt;
      return stripped;
    });
    const bulkSave = await api(apiBase, "/api/state/products", {
      method: "PUT",
      token,
      body: { products: staleBulk },
    });
    assert.equal(bulkSave.status, 200);
    const bulkTarget = (bulkSave.json.products || []).find(
      (p) => String(p.id) === String(productId)
    );
    assert.equal(bulkTarget?.imageUrl, uploadedUrl);

    const bootAfterBulk = await api(apiBase, "/api/bootstrap", { token });
    assert.equal(productFromBootstrap(bootAfterBulk.json)?.imageUrl, uploadedUrl);
    assert.equal((await fetch(`${apiBase}${uploadedUrl}`)).status, 200);

    runtime.child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
    const runtime2 = startServer(serverDir, databasePath, apiPort);
    await waitHealth(apiBase);
    const bootAfterRestart = await api(apiBase, "/api/bootstrap", { token });
    assert.equal(productFromBootstrap(bootAfterRestart.json)?.imageUrl, uploadedUrl);
    assert.equal((await fetch(`${apiBase}${uploadedUrl}`)).status, 200);

    assert.equal((await fetch(`${uiBase}/api/health`)).status, 200, "ui proxy must reach api");
    assert.equal(
      (await fetch(`${uiBase}${uploadedUrl}`)).status,
      200,
      "ui proxy must serve uploads"
    );

    await runUiVerification({ uiBase, apiBase, token });

    runtime2.child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));

    const sourceUploadsAfter = captureUploadsManifest(sourceRoot);
    assert.deepEqual(sourceUploadsAfter, sourceUploadsBefore, "source uploads must remain unchanged");

    const sandboxUploads = captureUploadsManifest(root);
    logEvidence("sandbox-uploads.txt", sandboxUploads.join("\n") + "\n");
    assert.ok(sandboxUploads.length > 0, "sandbox should contain uploaded files");

    console.log("verify-product-photo-persistence: ok");
    console.log(`EVIDENCE_DIR=${evidenceDir}`);
  } catch (error) {
    console.error(runtime.getStderr().slice(-2000));
    console.error(preview.getLogs().slice(-2000));
    throw error;
  } finally {
    if (!runtime.child.killed) runtime.child.kill("SIGTERM");
    if (!preview.child.killed) preview.child.kill("SIGTERM");
    rmSync(sandbox, { recursive: true, force: true });
    if (pwDir) rmSync(pwDir, { recursive: true, force: true });
  }
}

await main();
