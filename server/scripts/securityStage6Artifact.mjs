import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const auditBaselineSha = "8b6f7ee5d3b5e2ba638882ebb4177f9ceece82bc";
export const manifestName = "SECURITY_STAGE6_MANIFEST.json";
export const checksumsName = "SHA256SUMS.txt";
export const sourceFiles = Object.freeze([
  "docs/deploy/server.env.datacenter.example",
  "docs/technical/SECURITY_STAGE6_PREPARE.md",
  "ops/security-stage6/README.md",
  "ops/security-stage6/package-b/nginx/clover-security-headers.conf",
  "ops/security-stage6/scripts/promote-package-b.sh",
  "public/sw.js",
  "server/.env.example",
  "server/package.json",
  "server/scripts/securityStage6Artifact.mjs",
  "server/scripts/verify-security-stage6.mjs",
  "server/src/server.js",
  "vite.config.js",
]);

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function artifactPath(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relative.split("/"));
  assert.ok(
    resolved.startsWith(`${resolvedRoot}${path.sep}`),
    `artifact path escaped root: ${relative}`,
  );
  return resolved;
}

function assertNoLinks(root, relative) {
  let current = path.resolve(root);
  assert.equal(lstatSync(current).isSymbolicLink(), false, "artifact root must not be a link");
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    const status = lstatSync(current);
    assert.equal(status.isSymbolicLink(), false, `artifact link is forbidden: ${relative}`);
  }
}

function walk(root, current = "") {
  const directory = path.join(root, current);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(current.replaceAll("\\", "/"), entry.name);
    const status = lstatSync(path.join(root, ...relative.split("/")));
    assert.equal(status.isSymbolicLink(), false, `artifact link is forbidden: ${relative}`);
    if (status.isDirectory()) return walk(root, relative);
    assert.ok(status.isFile(), `artifact entry is not a regular file: ${relative}`);
    return [relative];
  });
}

export function prepareArtifact(targetRoot) {
  const resolved = path.resolve(targetRoot);
  assert.equal(existsSync(resolved), false, `artifact target already exists: ${resolved}`);
  mkdirSync(resolved, { recursive: true });

  const files = sourceFiles.map((relative) => {
    const source = artifactPath(repositoryRoot, relative);
    assertNoLinks(repositoryRoot, relative);
    assert.ok(lstatSync(source).isFile(), `missing source file: ${relative}`);
    const destination = artifactPath(resolved, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    return {
      path: relative,
      bytes: statSync(destination).size,
      sha256: sha256(destination),
    };
  });

  const manifest = {
    schema: "clover-security-stage6/v1",
    baseCommit: auditBaselineSha,
    files,
  };
  const manifestPath = artifactPath(resolved, manifestName);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  assertNoLinks(resolved, manifestName);
  const manifestSha256 = sha256(manifestPath);
  const checksumLines = [
    ...files.map((file) => `${file.sha256}  ${file.path}`),
    `${manifestSha256}  ${manifestName}`,
  ];
  writeFileSync(
    artifactPath(resolved, checksumsName),
    `${checksumLines.join("\n")}\n`,
    "utf8",
  );
  verifyArtifact(resolved, manifestSha256);
  return { root: resolved, manifestSha256 };
}

export function verifyArtifact(targetRoot, expectedManifestSha256 = "") {
  const resolved = path.resolve(targetRoot);
  const manifestPath = artifactPath(resolved, manifestName);
  const manifestSha256 = sha256(manifestPath);
  if (expectedManifestSha256) {
    assert.equal(manifestSha256, expectedManifestSha256, "manifest SHA-256 mismatch");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema, "clover-security-stage6/v1");
  assert.equal(manifest.baseCommit, auditBaselineSha);
  assert.deepEqual(manifest.files.map((file) => file.path), [...sourceFiles]);
  for (const file of manifest.files) {
    const filePath = artifactPath(resolved, file.path);
    assertNoLinks(resolved, file.path);
    assert.equal(lstatSync(filePath).size, file.bytes, `${file.path}: size mismatch`);
    assert.equal(sha256(filePath), file.sha256, `${file.path}: SHA-256 mismatch`);
  }

  const expectedChecksums = [
    ...manifest.files.map((file) => `${file.sha256}  ${file.path}`),
    `${manifestSha256}  ${manifestName}`,
    "",
  ].join("\n");
  assert.equal(
    readFileSync(artifactPath(resolved, checksumsName), "utf8"),
    expectedChecksums,
    "checksum inventory mismatch",
  );
  assert.deepEqual(
    walk(resolved).sort(),
    [...sourceFiles, manifestName, checksumsName].sort(),
    "artifact contains missing or extra files",
  );
  return { manifestSha256 };
}

export function snapshotArtifact(sourceRoot, expectedManifestSha256, snapshotRoot) {
  const source = path.resolve(sourceRoot);
  const snapshot = path.resolve(snapshotRoot);
  assert.equal(existsSync(snapshot), false, `snapshot target already exists: ${snapshot}`);

  assertNoLinks(source, manifestName);
  const manifestBuffer = readFileSync(artifactPath(source, manifestName));
  const manifestSha256 = createHash("sha256").update(manifestBuffer).digest("hex");
  assert.equal(manifestSha256, expectedManifestSha256, "manifest SHA-256 mismatch");
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  assert.equal(manifest.schema, "clover-security-stage6/v1");
  assert.equal(manifest.baseCommit, auditBaselineSha);
  assert.deepEqual(manifest.files.map((file) => file.path), [...sourceFiles]);

  mkdirSync(snapshot, { recursive: false });
  for (const file of manifest.files) {
    assertNoLinks(source, file.path);
    const bytes = readFileSync(artifactPath(source, file.path));
    assert.equal(bytes.length, file.bytes, `${file.path}: size mismatch`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.sha256,
      `${file.path}: SHA-256 mismatch`,
    );
    const destination = artifactPath(snapshot, file.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  writeFileSync(artifactPath(snapshot, manifestName), manifestBuffer);
  assertNoLinks(source, checksumsName);
  const checksums = readFileSync(artifactPath(source, checksumsName));
  writeFileSync(artifactPath(snapshot, checksumsName), checksums);
  verifyArtifact(snapshot, expectedManifestSha256);
  return { manifestSha256, snapshotRoot: snapshot };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, targetRoot, expectedManifestSha256 = "", snapshotRoot = ""] = process.argv.slice(2);
  if (!targetRoot || !["prepare", "verify", "snapshot"].includes(command)) {
    throw new Error(
      "usage: node securityStage6Artifact.mjs <prepare|verify> <artifact-root> [manifest-sha256] [snapshot-root]",
    );
  }
  if (command === "snapshot" && !snapshotRoot) {
    throw new Error("snapshot requires manifest-sha256 and snapshot-root");
  }
  const result = command === "prepare"
    ? prepareArtifact(targetRoot)
    : command === "verify"
      ? verifyArtifact(targetRoot, expectedManifestSha256)
      : snapshotArtifact(targetRoot, expectedManifestSha256, snapshotRoot);
  console.log(JSON.stringify({ ok: true, command, ...result }));
}
