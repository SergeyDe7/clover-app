import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDir, "../..");
export const auditBaselineSha = "1fdd7e6ac715f55e407d71a225e5a6037eb9d2e8";

export const sourceFiles = Object.freeze([
  "ops/security-stage5/README.md",
  "ops/security-stage5/PROMOTE_ROLLBACK.md",
  "ops/security-stage5/package-a/systemd/clover-api.service.d/20-hardening.conf",
  "ops/security-stage5/package-a/systemd/clover-ui.service.d/20-hardening.conf",
  "ops/systemd/clover-audit-retention.timer",
  "ops/security-stage5/package-b/sshd/50-clover-security.conf",
  "ops/security-stage5/package-c/systemd/clover-ui.service.d/30-loopback.conf",
  "ops/security-stage5/package-c/nginx/clover-security-headers.conf",
  "ops/security-stage5/package-c/nginx/clover-spb.ru.conf",
]);

function fail(message) {
  throw new Error(message);
}

function normalizeSha(value, label) {
  const sha = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`${label} must be a full 40-character SHA`);
  return sha;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function listFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    const absolute = path.join(root, next);
    if (entry.isSymbolicLink() || lstatSync(absolute).isSymbolicLink()) {
      fail(`symlink is forbidden in artifact: ${next}`);
    }
    if (entry.isDirectory()) out.push(...listFiles(root, next));
    else if (entry.isFile()) out.push(next.split(path.sep).join("/"));
    else fail(`unsupported artifact entry: ${next}`);
  }
  return out.sort();
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || "").trim();
}

function gitBytes(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`git ${args.join(" ")} failed: ${String(result.stderr || result.stdout || "")}`);
  }
  return Buffer.from(result.stdout || []);
}

function assertCleanPinnedCheckout(root, targetSha) {
  const head = normalizeSha(git(root, ["rev-parse", "HEAD"]), "checkout HEAD");
  if (head !== targetSha) fail(`checkout HEAD ${head} does not match target ${targetSha}`);
  const status = git(root, ["status", "--porcelain", "--", ...sourceFiles]);
  if (status) fail("Stage 5 artifact inputs must be committed and clean");
}

export function prepareArtifact({
  sourceRoot = repositoryRoot,
  output,
  targetSha,
  requireCleanGit = true,
}) {
  const normalizedTarget = normalizeSha(targetSha, "target SHA");
  const root = path.resolve(sourceRoot);
  const artifactRoot = path.resolve(String(output || ""));
  if (!output) fail("output directory is required");
  if (isInside(root, artifactRoot)) fail("artifact output must be outside the source repository");
  if (requireCleanGit) assertCleanPinnedCheckout(root, normalizedTarget);
  if (existsSync(artifactRoot) && readdirSync(artifactRoot).length > 0) {
    fail("artifact output directory must be empty or absent");
  }
  mkdirSync(artifactRoot, { recursive: true });

  const files = sourceFiles.map((relative) => {
    const source = path.join(root, ...relative.split("/"));
    if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) {
      fail(`missing or unsafe source file: ${relative}`);
    }
    const destination = path.join(artifactRoot, ...relative.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    const trustedBytes = requireCleanGit
      ? gitBytes(root, ["show", `${normalizedTarget}:${relative}`])
      : readFileSync(source);
    writeFileSync(destination, trustedBytes);
    return {
      path: relative,
      size: statSync(destination).size,
      sha256: sha256(destination),
    };
  });

  const manifest = {
    schemaVersion: 1,
    kind: "clover-security-stage5-host-hardening",
    targetSha: normalizedTarget,
    auditBaselineSha,
    packages: {
      A: {
        status: "PREPARED",
        scope: "host-hygiene-systemd-retention",
        promotionGate: "exact-runtime-orphan-and-pre-state-plan",
      },
      B: {
        status: "PREPARED",
        scope: "ssh-hardening",
        promotionGate: "two-open-recovery-sessions-and-effective-config-check",
      },
      C: {
        status: "PREPARED",
        scope: "nginx-ui-loopback",
        promotionGate: "pre-state-backup-nginx-test-and-external-smoke",
      },
      D: {
        status: "BLOCKED",
        scope: "firewall-api-bind",
        blocker: "working-1C-source-IP-not-verified",
      },
    },
    files,
  };
  writeFileSync(path.join(artifactRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  return manifest;
}

export function verifyArtifact({
  artifact,
  expectedSha,
  sourceRoot = repositoryRoot,
  requireGit = true,
}) {
  const artifactRoot = path.resolve(String(artifact || ""));
  const normalizedExpected = normalizeSha(expectedSha, "expected SHA");
  if (!existsSync(artifactRoot) || !lstatSync(artifactRoot).isDirectory()) {
    fail("artifact directory does not exist");
  }
  const manifestPath = path.join(artifactRoot, "manifest.json");
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink()) {
    fail("artifact manifest is missing or unsafe");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.kind !== "clover-security-stage5-host-hardening") {
    fail("unsupported Stage 5 manifest");
  }
  if (normalizeSha(manifest.targetSha, "manifest target SHA") !== normalizedExpected) {
    fail("manifest target SHA does not match expected SHA");
  }
  if (manifest.auditBaselineSha !== auditBaselineSha) fail("unexpected audit baseline SHA");
  if (manifest.packages?.D?.status !== "BLOCKED") fail("Package D must remain blocked");
  for (const name of ["A", "B", "C"]) {
    if (manifest.packages?.[name]?.status !== "PREPARED") {
      fail(`Package ${name} must be PREPARED, not promotion-ready`);
    }
  }

  const trustedRoot = path.resolve(sourceRoot);
  if (requireGit) {
    git(trustedRoot, ["cat-file", "-e", `${normalizedExpected}^{commit}`]);
  }

  const expectedPaths = [...sourceFiles].sort();
  const records = Array.isArray(manifest.files) ? manifest.files : [];
  const recordPaths = records.map((entry) => entry.path).sort();
  if (JSON.stringify(recordPaths) !== JSON.stringify(expectedPaths)) {
    fail("manifest file allowlist mismatch");
  }
  const actualFiles = listFiles(artifactRoot).filter((item) => item !== "manifest.json");
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedPaths)) {
    fail("artifact contains missing or extra files");
  }

  for (const record of records) {
    const absolute = path.join(artifactRoot, ...record.path.split("/"));
    if (!lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) {
      fail(`unsafe artifact file: ${record.path}`);
    }
    if (statSync(absolute).size !== record.size) fail(`size mismatch: ${record.path}`);
    if (sha256(absolute) !== record.sha256) fail(`SHA-256 mismatch: ${record.path}`);
    if (requireGit) {
      const trustedBlob = gitBytes(trustedRoot, ["show", `${normalizedExpected}:${record.path}`]);
      const trustedHash = createHash("sha256").update(trustedBlob).digest("hex");
      if (trustedHash !== record.sha256 || trustedBlob.length !== record.size) {
        fail(`Git blob mismatch: ${record.path}`);
      }
    }
  }
  return manifest;
}

function parseCli(argv) {
  const [mode, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`invalid argument near ${key || "end"}`);
    values[key.slice(2)] = value;
  }
  return { mode, values };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const { mode, values } = parseCli(process.argv.slice(2));
    if (mode === "prepare") {
      const manifest = prepareArtifact({
        output: values.output,
        targetSha: values["target-sha"],
      });
      console.log(`STAGE5_PREPARE:PASS target=${manifest.targetSha} files=${manifest.files.length}`);
    } else if (mode === "verify") {
      const manifest = verifyArtifact({
        artifact: values.artifact,
        expectedSha: values["expected-sha"],
        sourceRoot: values["source-root"] || repositoryRoot,
      });
      console.log(`STAGE5_VERIFY:PASS target=${manifest.targetSha} files=${manifest.files.length}`);
    } else {
      fail("usage: securityStage5Artifact.mjs prepare|verify ...");
    }
  } catch (error) {
    console.error(`STAGE5_ARTIFACT:FAIL ${error.message}`);
    process.exit(1);
  }
}
