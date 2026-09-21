import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditBaselineSha,
  prepareArtifact,
  repositoryRoot,
  sourceFiles,
  verifyArtifact,
} from "./securityStage5Artifact.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
assert.equal(root, repositoryRoot);

const read = (relative) => readFileSync(path.join(root, ...relative.split("/")), "utf8");

const timer = read("ops/systemd/clover-audit-retention.timer");
assert.match(timer, /Unit=clover-audit-retention-dry-run\.service/);
assert.doesNotMatch(timer, /Unit=clover-audit-retention-apply\.service/);

for (const unit of ["clover-api", "clover-ui"]) {
  const hardening = read(`ops/security-stage5/package-a/systemd/${unit}.service.d/20-hardening.conf`);
  for (const required of [
    "UMask=0077",
    "ProtectSystem=full",
    "ProtectHome=read-only",
    "PrivateDevices=true",
    "ProtectKernelTunables=true",
    "ProtectKernelModules=true",
    "ProtectControlGroups=true",
    "RestrictSUIDSGID=true",
    "LockPersonality=true",
    "RestrictNamespaces=true",
    "CapabilityBoundingSet=",
    "AmbientCapabilities=",
    "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
  ]) {
    assert.ok(hardening.includes(required), `${unit} missing ${required}`);
  }
}

const ssh = read("ops/security-stage5/package-b/sshd/50-clover-security.conf");
assert.match(ssh, /^PermitRootLogin no$/m);
assert.match(ssh, /^PasswordAuthentication no$/m);
assert.match(ssh, /^AuthenticationMethods publickey$/m);
assert.doesNotMatch(ssh, /AllowUsers|AllowGroups/);

const uiLoopback = read(
  "ops/security-stage5/package-c/systemd/clover-ui.service.d/30-loopback.conf"
);
assert.match(uiLoopback, /^ExecStart=$/m);
assert.match(uiLoopback, /--host 127\.0\.0\.1 --port 5273/);
assert.doesNotMatch(uiLoopback, /0\.0\.0\.0/);

const nginx = read("ops/security-stage5/package-c/nginx/clover-spb.ru.conf");
assert.match(nginx, /listen 443 ssl http2;/);
assert.match(nginx, /client_max_body_size 24m;/);
assert.match(nginx, /proxy_connect_timeout 5s;/);
assert.match(nginx, /proxy_read_timeout 90s;/);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:5273;/);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4100;/);
assert.doesNotMatch(nginx, /192\.168\.155\.15/);
assert.doesNotMatch(nginx, /limit_req|nft|iptables|ONEC|credential/i);
assert.doesNotMatch(nginx, /Cache-Control "[^"]*immutable" always;/);
const headerIncludes = nginx.match(/include \/etc\/nginx\/snippets\/clover-security-headers\.conf;/g) || [];
assert.ok(headerIncludes.length >= 10, "security headers must be restored in cache locations");

const doc = read("ops/security-stage5/README.md");
assert.match(doc, /Package D — perimeter \(BLOCKED\)/);
assert.match(doc, /working 1C source IP and route are proven/);
assert.doesNotMatch(doc, /enable --now clover-audit-retention\.timer/);

const rollback = read("ops/security-stage5/PROMOTE_ROLLBACK.md");
for (const required of [
  "cp --preserve=all",
  "sha256sum",
  ".absent",
  "sshd -T -C",
  "sshd -t",
  "nginx -t",
  "systemctl daemon-reload",
  "systemctl restart clover-api.service",
  "systemctl restart clover-ui.service",
  "systemctl reload nginx.service",
  "git -C /opt/clover/clover-app show",
  "--source-root /opt/clover/clover-app",
  "/etc/ssh/sshd_config.d/50-clover-security.conf",
  "/etc/nginx/sites-enabled/clover-spb.ru",
]) {
  assert.ok(rollback.includes(required), `rollback contract missing ${required}`);
}
assert.doesNotMatch(rollback, /rm\s+-rf|pkill|kill\s+-9/);

const artifactSource = read("server/scripts/securityStage5Artifact.mjs");
assert.match(artifactSource, /gitBytes/);
assert.match(artifactSource, /Git blob mismatch/);
assert.match(artifactSource, /values\["source-root"\]/);

const temp = mkdtempSync(path.join(tmpdir(), "clover-stage5-artifact-"));
const fixtureRoot = path.join(temp, "source");
const artifact = path.join(temp, "prepared");
try {
  for (const relative of sourceFiles) {
    const source = path.join(root, ...relative.split("/"));
    const destination = path.join(fixtureRoot, ...relative.split("/"));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  execFileSync("git", ["init", "--quiet"], { cwd: fixtureRoot });
  execFileSync("git", ["config", "user.email", "stage5-test@example.invalid"], { cwd: fixtureRoot });
  execFileSync("git", ["config", "user.name", "Stage 5 Test"], { cwd: fixtureRoot });
  execFileSync("git", ["add", "--", ...sourceFiles], { cwd: fixtureRoot });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: fixtureRoot });
  const fixtureSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  }).trim();

  const manifest = prepareArtifact({
    sourceRoot: fixtureRoot,
    output: artifact,
    targetSha: fixtureSha,
  });
  assert.equal(manifest.targetSha, fixtureSha);
  assert.equal(manifest.auditBaselineSha, auditBaselineSha);
  assert.equal(manifest.packages.A.status, "PREPARED");
  assert.equal(manifest.packages.B.status, "PREPARED");
  assert.equal(manifest.packages.C.status, "PREPARED");
  assert.equal(manifest.packages.D.status, "BLOCKED");
  assert.ok(manifest.files.length >= 9);
  verifyArtifact({ artifact, expectedSha: fixtureSha, sourceRoot: fixtureRoot });

  const tampered = path.join(
    artifact,
    "ops",
    "security-stage5",
    "package-b",
    "sshd",
    "50-clover-security.conf"
  );
  writeFileSync(tampered, `${readFileSync(tampered, "utf8")}# tampered\n`);
  const manifestPath = path.join(artifact, "manifest.json");
  const forgedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const forgedRecord = forgedManifest.files.find(
    (entry) => entry.path === "ops/security-stage5/package-b/sshd/50-clover-security.conf"
  );
  forgedRecord.size = statSync(tampered).size;
  forgedRecord.sha256 = createHash("sha256").update(readFileSync(tampered)).digest("hex");
  writeFileSync(manifestPath, `${JSON.stringify(forgedManifest, null, 2)}\n`);
  assert.throws(
    () => verifyArtifact({ artifact, expectedSha: fixtureSha, sourceRoot: fixtureRoot }),
    /Git blob mismatch/
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("SECURITY_STAGE5_PREPARE:PASS");
