import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import AdmZip from "adm-zip";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import {
  validatePdfContent,
  validateUploadedFileContent,
} from "../src/uploadContentPolicy.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(scriptDirectory, "..");
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "clover-security-stage10c-"));
const fixtureDb = path.join(fixtureRoot, "data", "clover.sqlite");
const fixtureUploads = path.join(fixtureRoot, "custom-uploads-root");
const fixtureBackups = path.join(fixtureRoot, "backups");
const savedEnvironment = Object.fromEntries(
  ["DB_PATH", "CLOVER_UPLOADS_DIR", "CLOVER_SERVER_BACKUP_DIR", "MANAGER_EMAIL", "MANAGER_PASSWORD", "NODE_ENV"]
    .map((name) => [name, process.env[name]])
);

mkdirSync(path.dirname(fixtureDb), { recursive: true });
mkdirSync(fixtureUploads, { recursive: true });
mkdirSync(fixtureBackups, { recursive: true });
process.env.DB_PATH = fixtureDb;
process.env.CLOVER_UPLOADS_DIR = fixtureUploads;
process.env.CLOVER_SERVER_BACKUP_DIR = fixtureBackups;
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
process.env.NODE_ENV = "test";

const dbModule = await import("../src/db.js");
const backupsModule = await import(`../src/backups.js?stage10c=${Date.now()}`);
const { payloadToCsv } = await import("../src/exchange.js");

after(() => {
  try {
    dbModule.db.close();
  } finally {
    for (const [name, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function persistedSnapshot() {
  const { exportedAt, ...snapshot } = dbModule.exportDatabaseSnapshot();
  return snapshot;
}

function clone(value) {
  return structuredClone(value);
}

function uploadFiles(directory = fixtureUploads, prefix = "") {
  const result = {};
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) Object.assign(result, uploadFiles(absolute, relative));
    else if (item.isFile()) result[relative] = readFileSync(absolute, "utf8");
  }
  return result;
}

function writeFixtureUpload(relativeName, contents) {
  const target = path.resolve(fixtureUploads, ...relativeName.split("/"));
  assert.ok(target.startsWith(path.resolve(fixtureUploads) + path.sep), "fixture upload escaped custom root");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents, { flag: "w" });
}

function writeSnapshotBackup(fileName, snapshot) {
  writeFileSync(path.join(fixtureBackups, fileName), JSON.stringify(snapshot), "utf8");
}

function createFullBackupFile(fileName, snapshot, files) {
  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify({
    format: "clover-full-backup",
    formatVersion: 1,
    exportedAt: snapshot.exportedAt,
  })));
  zip.addFile("snapshot.json", Buffer.from(JSON.stringify(snapshot)));
  for (const [name, contents] of Object.entries(files)) {
    zip.addFile(`uploads/${name}`, Buffer.from(contents));
  }
  zip.writeZip(path.join(fixtureBackups, fileName));
}

function createPdfFixture(filePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const document = new PDFDocument({ autoFirstPage: true });
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => {
      writeFileSync(filePath, Buffer.concat(chunks));
      resolve();
    });
    document.text("Clover Stage 10C fixture");
    document.end();
  });
}

const exactDisabledAt = "2026-09-28T10:11:12.345Z";
const exactPermissionsJson = "{\"fullAccess\":false,\"tabs\":[\"orders\",\"clients\"],\"scopes\":{\"clients\":\"read\"}}";
const fixtureUser = dbModule.createUser({
  email: "stage10c-manager@example.invalid",
  passwordHash: "$2b$12$fixture.only.not.a.real.credential.hash",
  role: "manager",
  emailVerified: true,
});
dbModule.db.prepare("UPDATE users SET disabled_at = ?, permissions_json = ? WHERE id = ?")
  .run(exactDisabledAt, exactPermissionsJson, fixtureUser.id);

test("SEC10C-DATA-001 snapshot v6 preserves disabled_at and permissions_json exactly on repeated roundtrip", () => {
  const snapshot = dbModule.exportDatabaseSnapshot();
  assert.equal(snapshot.version, 6);
  const expectedUser = snapshot.users.find((row) => row.id === fixtureUser.id);
  assert.equal(expectedUser.disabled_at, exactDisabledAt);
  assert.equal(expectedUser.permissions_json, exactPermissionsJson);

  dbModule.db.prepare("UPDATE users SET disabled_at = '', permissions_json = '{}' WHERE id = ?").run(fixtureUser.id);
  dbModule.importDatabaseSnapshot(snapshot);
  dbModule.importDatabaseSnapshot(snapshot);

  const restored = dbModule.db.prepare("SELECT disabled_at, permissions_json FROM users WHERE id = ?").get(fixtureUser.id);
  assert.equal(restored.disabled_at, exactDisabledAt);
  assert.equal(restored.permissions_json, exactPermissionsJson);
});

test("SEC10C-DATA-001B v5 restore preserves current security state and disables unknown identities", () => {
  dbModule.db.prepare("UPDATE users SET disabled_at = ?, permissions_json = ? WHERE id = ?")
    .run(exactDisabledAt, exactPermissionsJson, fixtureUser.id);
  const legacy = clone(dbModule.exportDatabaseSnapshot());
  legacy.version = 5;
  legacy.users = legacy.users.map(({ disabled_at, permissions_json, ...row }) => row);
  const unknown = {
    ...legacy.users.find((row) => row.id === fixtureUser.id),
    id: "legacy-unknown-manager",
    email: "legacy-unknown@example.invalid",
  };
  legacy.users.push(unknown);
  writeSnapshotBackup("legacy-v5.json", legacy);

  backupsModule.assertRestorableBackup("legacy-v5.json");
  backupsModule.restoreServerBackup("legacy-v5.json");
  const known = dbModule.db.prepare("SELECT disabled_at, permissions_json FROM users WHERE id = ?").get(fixtureUser.id);
  const added = dbModule.db.prepare("SELECT disabled_at, permissions_json FROM users WHERE id = ?").get(unknown.id);
  assert.equal(known.disabled_at, exactDisabledAt);
  assert.equal(known.permissions_json, exactPermissionsJson);
  assert.ok(String(added.disabled_at), "identity absent from current DB must be restored disabled");
  assert.equal(added.permissions_json, "{}");

  const beforeIdentityConfusion = dbModule.exportDatabaseSnapshot();
  const spoofed = clone(beforeIdentityConfusion);
  spoofed.version = 5;
  spoofed.users = spoofed.users.map(({ disabled_at, permissions_json, ...row }) => (
    row.id === fixtureUser.id ? { ...row, id: "spoofed-id-same-email" } : row
  ));
  writeSnapshotBackup("legacy-v5-same-email-new-id.json", spoofed);
  backupsModule.assertRestorableBackup("legacy-v5-same-email-new-id.json");
  backupsModule.restoreServerBackup("legacy-v5-same-email-new-id.json");
  const spoofedRow = dbModule.db.prepare("SELECT disabled_at, permissions_json FROM users WHERE id = ?")
    .get("spoofed-id-same-email");
  assert.ok(String(spoofedRow.disabled_at), "same email with a different ID must not inherit active security state");
  assert.equal(spoofedRow.permissions_json, "{}");
  dbModule.importDatabaseSnapshot(beforeIdentityConfusion);
  assert.equal(existsSync(path.join(fixtureBackups, ".restore.lock")), false);
});

test("SEC10C-DATA-002 malformed snapshots are rejected before any mutation", () => {
  const baseline = persistedSnapshot();
  const current = dbModule.exportDatabaseSnapshot();
  const cases = [
    [
      "malformed-v6.json",
      {
        ...clone(current),
        users: current.users.map((row, index) => index === 0 ? { ...row, permissions_json: "NOT_JSON{" } : row),
      },
      "BACKUP_SECURITY_STATE_INVALID",
    ],
    [
      "missing-user-security-field.json",
      {
        ...clone(current),
        users: current.users.map((row, index) => {
          if (index !== 0) return row;
          const { email_verified, ...missing } = row;
          return missing;
        }),
      },
      "BACKUP_SECURITY_STATE_MISSING",
    ],
    [
      "coerced-email-verification.json",
      {
        ...clone(current),
        users: current.users.map((row, index) => index === 0 ? { ...row, email_verified: "0" } : row),
      },
      "BACKUP_SECURITY_STATE_INVALID",
    ],
    [
      "missing-security-section.json",
      (() => {
        const missing = clone(current);
        delete missing.authTokens;
        return missing;
      })(),
      "BACKUP_SECURITY_STATE_MISSING",
    ],
    [
      "external-reconciliation-path.json",
      {
        ...clone(current),
        reconciliationRequests: [{
          id: "malicious-path",
          user_id: fixtureUser.id,
          period_type: "all",
          year: null,
          date_from: "",
          date_to: "",
          status: "ready",
          client_comment: "",
          manager_comment: "",
          file_name: "outside.pdf",
          file_path: path.resolve(fixtureRoot, "outside.pdf"),
          created_at: "2026-09-28T10:00:00.000Z",
          updated_at: "2026-09-28T10:00:00.000Z",
        }],
      },
      "BACKUP_SECURITY_STATE_INVALID",
    ],
  ];

  for (const [fileName, snapshot, expectedCode] of cases) {
    writeSnapshotBackup(fileName, snapshot);
    assert.throws(
      () => backupsModule.restoreServerBackup(fileName),
      (error) => error?.code === expectedCode,
      `${fileName} must be rejected with ${expectedCode}`
    );
    assert.deepEqual(persistedSnapshot(), baseline, `${fileName} mutated fixture DB before rejection`);
  }
});

test("SEC10C-DATA-003 upload storage uses the custom root and opaque traversal-safe physical names", () => {
  assert.equal(path.resolve(backupsModule.uploadsDirectory), path.resolve(fixtureUploads));
  const serverSource = readFileSync(path.join(serverDirectory, "src", "server.js"), "utf8");
  assert.match(serverSource, /import\s*\{[\s\S]*?uploadsDirectory[\s\S]*?\}\s*from\s*["']\.\/backups\.js["']/u);
  const reconciliationUsesDomainId = /path\.resolve\(reconciliationDirectory,\s*`[^`]*\$\{(?:current|request|req(?:uest)?)\.(?:id|params|body|query|user)/u
    .test(serverSource);
  assert.equal(
    reconciliationUsesDomainId,
    false,
    "reconciliation physical filename must not expose a route/domain identifier"
  );

  const fileNameBlocks = [...serverSource.matchAll(/filename\(req,\s*file,\s*callback\)\s*\{([\s\S]*?)\n\s*\},/gu)];
  assert.ok(fileNameBlocks.length >= 5, "expected all multer filename callbacks to be visible to the verifier");
  for (const [, body] of fileNameBlocks) {
    assert.match(body, /randomUUID\(\)/u, "upload filename must include an opaque random UUID");
    assert.doesNotMatch(
      body,
      /\$\{(?:req|current|request)\.(?:id|params|body|query|user)/u,
      "upload filename must not interpolate request or domain identifiers"
    );
    assert.doesNotMatch(body, /\.\.\//u, "upload filename must not contain traversal segments");
  }
});

test("SEC10C-DATA-004 full backup restores v6 security state and the complete custom uploads tree", () => {
  writeFixtureUpload("product-fixture.txt", "original-product");
  writeFixtureUpload("nested/certificate-fixture.txt", "original-certificate");
  const expectedUploads = uploadFiles();
  const expectedSnapshot = persistedSnapshot();
  const backup = backupsModule.createServerBackup({ label: "stage10c", reason: "fixture-only full restore" });

  dbModule.db.prepare("UPDATE users SET disabled_at = '', permissions_json = '{}' WHERE id = ?").run(fixtureUser.id);
  rmSync(path.join(fixtureUploads, "nested"), { recursive: true, force: true });
  writeFixtureUpload("product-fixture.txt", "mutated-product");
  writeFixtureUpload("extra.txt", "must-disappear");

  const first = backupsModule.restoreServerBackup(backup.fileName);
  assert.equal(first.restoredPhotos, Object.keys(expectedUploads).length);
  assert.deepEqual(persistedSnapshot(), expectedSnapshot);
  assert.deepEqual(uploadFiles(), expectedUploads);

  const repeated = backupsModule.restoreServerBackup(backup.fileName);
  assert.equal(repeated.restoredPhotos, Object.keys(expectedUploads).length);
  assert.deepEqual(persistedSnapshot(), expectedSnapshot);
  assert.deepEqual(uploadFiles(), expectedUploads);
});

test("SEC10C-DATA-005 failed full restore rolls DB and uploads back without production hooks", () => {
  const baselineSnapshot = persistedSnapshot();
  const baselineUploads = uploadFiles();
  const invalidCommitSnapshot = dbModule.exportDatabaseSnapshot();
  invalidCommitSnapshot.orders = [{
    id: "orphan-order",
    user_id: "missing-user",
    payload_json: "{}",
    created_at: "2026-09-28T10:00:00.000Z",
    updated_at: "2026-09-28T10:00:00.000Z",
  }];
  createFullBackupFile("stage10c-failing-commit.zip", invalidCommitSnapshot, {
    "replacement.txt": "must-be-rolled-back",
  });

  assert.throws(
    () => backupsModule.restoreServerBackup("stage10c-failing-commit.zip"),
    (error) => error?.code === "BACKUP_COMMIT_FAILED"
  );
  assert.deepEqual(persistedSnapshot(), baselineSnapshot);
  assert.deepEqual(uploadFiles(), baselineUploads);
  assert.equal(existsSync(path.join(fixtureBackups, ".restore-journal.json")), false);
  assert.equal(existsSync(path.join(fixtureBackups, ".restore.lock")), false);
  assert.equal(
    readdirSync(path.dirname(fixtureUploads)).some((name) => name.startsWith(`${path.basename(fixtureUploads)}.restore-`)),
    false,
    "restore stage/rollback artifacts must be cleaned after successful rollback"
  );
});

test("SEC10C-DATA-006 CSV export neutralizes spreadsheet formulas without changing numeric cells", () => {
  const csv = payloadToCsv({
    order: { number: "=CMD()", externalId: "\t@SUM(1,1)", deliveryDate: "2026-09-28" },
    client: { oneCId: "+danger", companyName: " -danger" },
    items: [{
      oneCId: "safe-id",
      code: "@danger",
      name: "\r=HYPERLINK(\"https://example.invalid\")",
      unitName: "шт",
      quantity: -5,
      multiplier: 1,
      totalPieces: -5,
      unitPrice: 10,
      lineTotal: -50,
    }],
  });
  assert.match(csv, /"'=CMD\(\)"/u);
  assert.match(csv, /"'\t@SUM\(1,1\)"/u);
  assert.match(csv, /"'\+danger"/u);
  assert.match(csv, /"' -danger"/u);
  assert.match(csv, /"'@danger"/u);
  assert.match(csv, /"'\r=HYPERLINK\(""https:\/\/example\.invalid""\)"/u);
  assert.match(csv, /;"-5";"1";"-5";"10";"-50"/u);
  assert.doesNotMatch(csv, /(?:^|;)"[\uFEFF\u0000-\u0020]*[=+@]/mu);
});

test("SEC10C-DATA-007 reconciliation multipart fields are bounded and failed uploads are cleaned", () => {
  const serverSource = readFileSync(path.join(serverDirectory, "src", "server.js"), "utf8");
  const uploadStart = serverSource.indexOf("const reconciliationUpload = multer({");
  const uploadEnd = serverSource.indexOf("const port =", uploadStart);
  const uploadSlice = serverSource.slice(uploadStart, uploadEnd);
  assert.match(uploadSlice, /fieldSize:\s*8\s*\*\s*1024/u);
  assert.match(uploadSlice, /fields:\s*1/u);
  assert.match(uploadSlice, /parts:\s*2/u);
  const routeStart = serverSource.indexOf('"/api/admin/reconciliation/:requestId/file"');
  const routeEnd = serverSource.indexOf('app.get("/api/reconciliation/:requestId/file"', routeStart);
  const routeSlice = serverSource.slice(routeStart, routeEnd);
  assert.match(routeSlice, /reconciliationUploadFieldsSchema\.parse\(req\.body \|\| \{\}\)/u);
  assert.match(routeSlice, /unlinkSync\(req\.file\.path\)/u);
});

test("SEC10C-DATA-008 upload contents must match the declared image or PDF type", async () => {
  const validPng = path.join(fixtureRoot, "valid.png");
  const jpegAsPng = path.join(fixtureRoot, "jpeg-as-png.bin");
  const fakePng = path.join(fixtureRoot, "fake-png.bin");
  const validPdf = path.join(fixtureRoot, "valid.pdf");
  const fakePdf = path.join(fixtureRoot, "fake.pdf");

  await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 0, g: 128, b: 255 },
    },
  }).png().toFile(validPng);
  await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).jpeg().toFile(jpegAsPng);
  writeFileSync(fakePng, "<script>alert(1)</script>", "utf8");
  await createPdfFixture(validPdf);
  writeFileSync(fakePdf, "not a pdf", "ascii");
  const headerOnlyPdf = path.join(fixtureRoot, "header-only.pdf");
  writeFileSync(headerOnlyPdf, "%PDF-1.7\nfixture without objects or trailer", "ascii");

  assert.deepEqual(
    await validateUploadedFileContent({ path: validPng, mimetype: "image/png" }),
    { kind: "image", format: "png", width: 1, height: 1 }
  );
  await assert.rejects(
    validateUploadedFileContent({ path: jpegAsPng, mimetype: "image/png" }),
    (error) => error?.code === "UPLOAD_CONTENT_INVALID" && error?.status === 400
  );
  assert.throws(
    () => validatePdfContent(Buffer.from("%PDF-1.7\nfixture without objects or trailer", "ascii")),
    (error) => error?.code === "UPLOAD_CONTENT_INVALID" && error?.status === 400
  );
  await assert.rejects(
    validateUploadedFileContent({ path: fakePng, mimetype: "image/png" }),
    (error) => error?.code === "UPLOAD_CONTENT_INVALID" && error?.status === 400
  );
  assert.deepEqual(
    await validateUploadedFileContent({ path: validPdf, mimetype: "application/pdf" }),
    { kind: "pdf", format: "pdf" }
  );
  await assert.rejects(
    validateUploadedFileContent({ path: fakePdf, mimetype: "application/pdf" }),
    (error) => error?.code === "UPLOAD_CONTENT_INVALID" && error?.status === 400
  );
  await assert.rejects(
    validateUploadedFileContent({ path: headerOnlyPdf, mimetype: "application/pdf" }),
    (error) => error?.code === "UPLOAD_CONTENT_INVALID" && error?.status === 400
  );

  const serverSource = readFileSync(path.join(serverDirectory, "src", "server.js"), "utf8");
  assert.equal(
    [...serverSource.matchAll(/\.single\("(?:image|certificate|file)"\),\s*requireValidatedUploadedContent/gu)].length,
    6,
    "all six disk upload routes must validate file contents after multer writes them"
  );
});

test("SEC10C-DATA-009 reconciliation requests are isolated by the authenticated 1C contour", () => {
  const testRequest = dbModule.createReconciliationRequest({
    userId: fixtureUser.id,
    database: "TEST",
    periodType: "all",
  });
  const vlavkaRequest = dbModule.createReconciliationRequest({
    userId: fixtureUser.id,
    database: "VLAVKA",
    periodType: "all",
  });

  assert.equal(testRequest.database, "TEST");
  assert.equal(vlavkaRequest.database, "VLAVKA");
  assert.deepEqual(
    dbModule.listReconciliationRequests(null, "TEST").map((row) => row.id),
    [testRequest.id]
  );
  assert.deepEqual(
    dbModule.listReconciliationRequests(null, "VLAVKA").map((row) => row.id),
    [vlavkaRequest.id]
  );
  assert.equal(dbModule.getReconciliationRequestInternal(vlavkaRequest.id, "TEST"), null);
  assert.equal(
    dbModule.updateReconciliationRequest(vlavkaRequest.id, { status: "ready" }, "TEST"),
    null
  );
  assert.equal(dbModule.getReconciliationRequest(vlavkaRequest.id, "VLAVKA").status, "new");
  assert.equal(dbModule.deleteReconciliationRequest(vlavkaRequest.id, "TEST"), null);
  assert.equal(dbModule.getReconciliationRequest(vlavkaRequest.id, "VLAVKA").id, vlavkaRequest.id);

  const serverSource = readFileSync(path.join(serverDirectory, "src", "server.js"), "utf8");
  const oneCRouteStart = serverSource.indexOf('app.get("/api/one-c/reconciliation/requests"');
  const clientRouteStart = serverSource.indexOf('app.get("/api/reconciliation"', oneCRouteStart);
  const oneCRouteSlice = serverSource.slice(oneCRouteStart, clientRouteStart);
  assert.match(oneCRouteSlice, /listReconciliationRequests\(null, database\)/u);
  assert.match(oneCRouteSlice, /getReconciliationRequestInternal\(req\.params\.requestId, database\)/u);
  assert.match(oneCRouteSlice, /updateReconciliationRequest\([\s\S]*?\}, database\)/u);
  assert.ok(
    oneCRouteSlice.indexOf("updateReconciliationRequest(current.id") <
      oneCRouteSlice.indexOf("unlinkSync(currentFilePath)"),
    "1C upload must commit the replacement before deleting the previous act"
  );
  assert.match(oneCRouteSlice, /validatePdfContent\(buffer\)/u);

  const adminUploadStart = serverSource.indexOf('"/api/admin/reconciliation/:requestId/file"');
  const adminUploadEnd = serverSource.indexOf('app.get("/api/reconciliation/:requestId/file"', adminUploadStart);
  const adminUploadSlice = serverSource.slice(adminUploadStart, adminUploadEnd);
  assert.match(adminUploadSlice, /let fileCommitted = false/u);
  assert.match(adminUploadSlice, /fileCommitted = true/u);
  assert.match(adminUploadSlice, /if \(!fileCommitted && req\.file\?\.path/u);
});

test("SEC10C-DATA-010 legacy reconciliation schema adds contour before creating its index", () => {
  const legacyRoot = path.join(fixtureRoot, "legacy-reconciliation-migration");
  const legacyDbPath = path.join(legacyRoot, "clover.sqlite");
  mkdirSync(legacyRoot, { recursive: true });
  const legacyDb = new DatabaseSync(legacyDbPath);
  try {
    legacyDb.exec(`
      CREATE TABLE reconciliation_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        period_type TEXT NOT NULL,
        year INTEGER,
        date_from TEXT NOT NULL DEFAULT '',
        date_to TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        client_comment TEXT NOT NULL DEFAULT '',
        manager_comment TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO reconciliation_requests(
        id, user_id, period_type, status, created_at, updated_at
      ) VALUES ('legacy-request', 'legacy-user', 'all', 'new', '2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.000Z');
    `);
  } finally {
    legacyDb.close();
  }

  const migrationScript = `
    process.env.DB_PATH = ${JSON.stringify(legacyDbPath)};
    process.env.NODE_ENV = "test";
    process.env.MANAGER_EMAIL = "";
    process.env.MANAGER_PASSWORD = "";
    const module = await import(${JSON.stringify(new URL("../src/db.js", import.meta.url).href)});
    const columns = module.db.prepare("PRAGMA table_info(reconciliation_requests)").all().map((row) => row.name);
    if (!columns.includes("database")) process.exit(21);
    const row = module.db.prepare("SELECT database FROM reconciliation_requests WHERE id = 'legacy-request'").get();
    if (row?.database !== "VLAVKA") process.exit(22);
    const indexes = module.db.prepare("PRAGMA index_list(reconciliation_requests)").all().map((row) => row.name);
    if (!indexes.includes("idx_reconciliation_database_status")) process.exit(23);
    module.db.close();
  `;
  const denied = spawnSync(process.execPath, ["--input-type=module", "--eval", migrationScript], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      DB_PATH: legacyDbPath,
      NODE_ENV: "test",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      CLOVER_LEGACY_RECONCILIATION_DATABASE: "",
    },
    encoding: "utf8",
  });
  assert.notEqual(denied.status, 0, "legacy rows without an explicit contour must fail closed");
  assert.match(`${denied.stdout}\n${denied.stderr}`, /RECONCILIATION_CONTOUR_MIGRATION_REQUIRED/u);

  execFileSync(process.execPath, ["--input-type=module", "--eval", migrationScript], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      DB_PATH: legacyDbPath,
      NODE_ENV: "test",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      CLOVER_LEGACY_RECONCILIATION_DATABASE: "VLAVKA",
    },
    stdio: "pipe",
  });
});

test("SEC10C-DATA-011 full restore remaps legacy absolute upload paths into the active safe root", () => {
  const request = dbModule.createReconciliationRequest({
    userId: fixtureUser.id,
    database: "TEST",
    periodType: "all",
  });
  const relativeName = `reconciliation/act-${request.id}.pdf`;
  writeFixtureUpload(relativeName, "portable-fixture-pdf");
  const currentPath = path.resolve(fixtureUploads, ...relativeName.split("/"));
  dbModule.updateReconciliationRequest(request.id, {
    status: "ready",
    fileName: "portable.pdf",
    filePath: currentPath,
  }, "TEST");

  const snapshot = dbModule.exportDatabaseSnapshot();
  const snapshotRow = snapshot.reconciliationRequests.find((row) => row.id === request.id);
  snapshotRow.file_path = `D:\\old-clover-root\\uploads\\reconciliation\\${path.basename(currentPath)}`;
  createFullBackupFile("stage10c-cross-root.zip", snapshot, {
    [relativeName]: "portable-fixture-pdf",
  });

  rmSync(currentPath, { force: true });
  const restored = backupsModule.restoreServerBackup("stage10c-cross-root.zip");
  assert.equal(restored.restoredPhotos, 1);
  const restoredRow = dbModule.getReconciliationRequestInternal(request.id, "TEST");
  assert.equal(restoredRow.file_path, currentPath);
  assert.equal(readFileSync(currentPath, "utf8"), "portable-fixture-pdf");
});

test("SEC10C-DATA-012 backup fails closed when a referenced managed upload is missing", () => {
  const request = dbModule.createReconciliationRequest({
    userId: fixtureUser.id,
    database: "TEST",
    periodType: "all",
  });
  const missingPath = path.resolve(fixtureUploads, "reconciliation", `missing-${request.id}.pdf`);
  dbModule.updateReconciliationRequest(request.id, {
    status: "ready",
    fileName: "missing.pdf",
    filePath: missingPath,
  }, "TEST");
  assert.equal(existsSync(missingPath), false);
  assert.throws(
    () => backupsModule.createServerBackup({ label: "missing-upload", reason: "fixture-only" }),
    (error) => error?.code === "BACKUP_SECURITY_STATE_INVALID"
  );
});
