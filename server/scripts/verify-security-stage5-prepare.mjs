import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
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
import { extractVerifierPreamble, runSecurityStage5OperatorTests } from "./verify-security-stage5-operator.mjs";

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
const destinationDirs = [
  "/etc/systemd/system/clover-api.service.d",
  "/etc/systemd/system/clover-ui.service.d",
  "/etc/ssh/sshd_config.d",
  "/etc/nginx/snippets",
];
for (const required of [
  "cp --preserve=all",
  "sha256sum",
  ".absent",
  ".dir-created",
  "ensure_destination_dir",
  "rollback_created_dir",
  "rmdir --",
  "sshd -T -C",
  "sshd -t",
  "nginx -t",
  "systemctl daemon-reload",
  "systemctl restart clover-api.service",
  "systemctl restart clover-ui.service",
  "systemctl reload nginx.service",
  "VERIFIER_REL=server/scripts/securityStage5Artifact.mjs",
  "--source-root /opt/clover/clover-app",
  "/etc/ssh/sshd_config.d/50-clover-security.conf",
  "/etc/nginx/sites-enabled/clover-spb.ru",
  "a-dir-clover-api.service.d",
  "a-dir-clover-ui.service.d",
  "b-dir-sshd_config.d",
  "c-dir-clover-ui.service.d",
  "c-dir-nginx-snippets",
  "recovery marker already exists",
  "could not create directory",
  "could not write directory marker",
  "marker kept",
  ...destinationDirs,
]) {
  assert.ok(rollback.includes(required), `rollback contract missing ${required}`);
}
assert.doesNotMatch(rollback, /rm\s+-rf|pkill|kill\s+-9/);
assert.ok(sourceFiles.includes("ops/security-stage5/scripts/promote-package-a.sh"));
assert.match(rollback, /ops\/security-stage5\/scripts\/promote-package-a\.sh/);
assert.match(rollback, /10-umask\.conf` is \*\*not\*\* a\s+destination/);
assert.match(rollback, /Never restore\s+`10-umask\.conf`/);
assert.doesNotMatch(rollback, /restore_exact[^\n]*10-umask/);
assert.match(rollback, /The first\s+change is `systemctl stop clover-audit-retention\.timer`/);
assert.match(rollback, /exits `40` when rollback completes and\s+`41`/);
assert.match(rollback, /sudo \/bin\/bash -c '/);
assert.match(rollback, /--no-replace-objects/);
assert.match(rollback, /hash-object --no-filters/);
assert.match(rollback, /--expected-manifest/);
assert.match(rollback, /--target /);
assert.match(rollback, /VERIFIER_BOOTSTRAP: PASS/);
assert.match(rollback, /require_trusted_recovery|recovery mode/);
assert.doesNotMatch(rollback, /git show[\s\S]{0,80}\| sudo \/bin\/bash -s/);
assert.doesNotMatch(rollback, /\| sudo tee/);
assert.doesNotMatch(
  read("ops/security-stage5/scripts/promote-package-a.sh"),
  /CLOVER_OPERATOR_AS_ROOT=|exec sudo -n env|git show \| sudo \/bin\/bash -s|require_bash_s_launch/
);
assert.match(
  read("ops/security-stage5/scripts/promote-package-a.sh"),
  /unset CLOVER_OPERATOR_AS_ROOT/
);
assert.match(read("ops/security-stage5/scripts/promote-package-a.sh"), /--no-replace-objects/);
assert.match(read("ops/security-stage5/scripts/promote-package-a.sh"), /require_trusted_self/);
assert.match(read("ops/security-stage5/scripts/promote-package-a.sh"), /require_trusted_recovery/);
assert.match(read("ops/security-stage5/scripts/promote-package-a.sh"), /verifier object id mismatch/);
for (const dir of destinationDirs) {
  const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.doesNotMatch(
    rollback,
    new RegExp(`install -d -m 0[0-7]{3} ${escaped}`),
    `direct install -d is forbidden for ${dir}`
  );
  assert.match(
    rollback,
    new RegExp(`ensure_destination_dir ${escaped} `),
    `missing ensure_destination_dir for ${dir}`
  );
  assert.match(
    rollback,
    new RegExp(`rollback_created_dir ${escaped} `),
    `missing rollback_created_dir for ${dir}`
  );
}

const ensureKeys = [...rollback.matchAll(/ensure_destination_dir \S+ (\S+) 0755/g)].map(
  (match) => match[1]
);
const rollbackKeys = [...rollback.matchAll(/rollback_created_dir \S+ (\S+)/g)].map(
  (match) => match[1]
);
assert.deepEqual([...ensureKeys].sort(), [...rollbackKeys].sort());
assert.equal(ensureKeys.length, new Set(ensureKeys).size, "directory recovery keys must be unique");
assert.deepEqual(
  [...ensureKeys].sort(),
  [
    "a-dir-clover-api.service.d",
    "a-dir-clover-ui.service.d",
    "b-dir-sshd_config.d",
    "c-dir-clover-ui.service.d",
    "c-dir-nginx-snippets",
  ].sort()
);
assert.notEqual(
  "a-dir-clover-ui.service.d",
  "c-dir-clover-ui.service.d",
  "A and C must not share the UI directory marker"
);
assert.match(
  rollback,
  /ensure_destination_dir \/etc\/systemd\/system\/clover-ui\.service\.d a-dir-clover-ui\.service\.d 0755/
);
assert.match(
  rollback,
  /ensure_destination_dir \/etc\/systemd\/system\/clover-ui\.service\.d c-dir-clover-ui\.service\.d 0755/
);

function extractBashFunction(source, name) {
  const start = source.indexOf(`${name}() {`);
  assert.ok(start >= 0, `missing bash function ${name}`);
  let depth = 0;
  let end = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  assert.ok(end > start, `unclosed bash function ${name}`);
  return source.slice(start, end);
}

function findBash() {
  const candidates = [
    "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-c", "echo ok"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("bash is required to exercise destination-dir helpers");
}

function runHelperScript(body, extras = "") {
  const bash = findBash();
  const scriptDir = mkdtempSync(path.join(tmpdir(), "clover-stage5-dir-helper-"));
  const scriptPath = path.join(scriptDir, "run.sh");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
set -u
sudo() { "$@"; }
${extractBashFunction(rollback, "ensure_destination_dir")}
${extractBashFunction(rollback, "rollback_created_dir")}
install() {
  printf '%s\\n' "install $*" >> "$RECOVERY/commands.log"
  command install "$@"
}
rmdir() {
  printf '%s\\n' "rmdir $*" >> "$RECOVERY/commands.log"
  command rmdir "$@"
}
rm() {
  printf '%s\\n' "rm $*" >> "$RECOVERY/commands.log"
  command rm "$@"
}
touch() {
  printf '%s\\n' "touch $*" >> "$RECOVERY/commands.log"
  command touch "$@"
}
chmod() {
  printf '%s\\n' "chmod $*" >> "$RECOVERY/commands.log"
  command chmod "$@"
}
${extras}
${body}
`
  );
  try {
    return execFileSync(bash, [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`${error.stderr || ""}${error.stdout || ""}${error.message}`);
  } finally {
    rmSync(scriptDir, { recursive: true, force: true });
  }
}

const helperTemp = mkdtempSync(path.join(tmpdir(), "clover-stage5-dir-contract-"));
try {
  const posix = (value) => value.split(path.sep).join("/");
  const existingRoot = posix(path.join(helperTemp, "existing"));
  const createdRoot = posix(path.join(helperTemp, "created"));
  const fileRoot = posix(path.join(helperTemp, "as-file"));
  const nonemptyRoot = posix(path.join(helperTemp, "nonempty"));
  const sharedRoot = posix(path.join(helperTemp, "shared"));
  const failRoot = posix(path.join(helperTemp, "fail"));
  const recovery = posix(path.join(helperTemp, "recovery"));
  mkdirSync(existingRoot, { recursive: true });
  mkdirSync(createdRoot, { recursive: true });
  mkdirSync(fileRoot, { recursive: true });
  mkdirSync(nonemptyRoot, { recursive: true });
  mkdirSync(sharedRoot, { recursive: true });
  mkdirSync(failRoot, { recursive: true });
  mkdirSync(recovery, { recursive: true });

  const existingDir = `${existingRoot}/clover-api.service.d`;
  mkdirSync(existingDir);
  writeFileSync(path.join(existingDir, "pre-state.conf"), "keep\n");
  runHelperScript(`
RECOVERY="${recovery}"
command chmod 0700 "${existingDir}" || true
before_mode=$(stat -c %a "${existingDir}" 2>/dev/null || echo unknown)
: > "${recovery}/commands.log"
ensure_destination_dir "${existingDir}" a-dir-clover-api.service.d 0755
rollback_created_dir "${existingDir}" a-dir-clover-api.service.d
after_mode=$(stat -c %a "${existingDir}" 2>/dev/null || echo unknown)
test -f "${existingDir}/pre-state.conf"
test -d "${existingDir}"
test ! -e "${recovery}/a-dir-clover-api.service.d.dir-created"
if [ "$before_mode" != "unknown" ] && [ "$after_mode" != "unknown" ]; then
  test "$before_mode" = "$after_mode"
fi
if grep -q '^install ' "${recovery}/commands.log" 2>/dev/null; then
  echo "existing directory must not call install -d" >&2
  exit 1
fi
if grep -q '^rmdir ' "${recovery}/commands.log" 2>/dev/null; then
  echo "pre-existing directory must not be rmdir'd" >&2
  exit 1
fi
if grep -q '^chmod ' "${recovery}/commands.log" 2>/dev/null; then
  echo "helper must not chmod an existing directory" >&2
  exit 1
fi
`);

  const newDir = `${createdRoot}/sshd_config.d`;
  runHelperScript(`
RECOVERY="${recovery}"
: > "${recovery}/commands.log"
ensure_destination_dir "${newDir}" b-dir-sshd_config.d 0755
test -d "${newDir}"
test -f "${recovery}/b-dir-sshd_config.d.dir-created"
grep -q '^install -d -m 0755 -- ${newDir}$' "${recovery}/commands.log"
rollback_created_dir "${newDir}" b-dir-sshd_config.d
test ! -e "${newDir}"
test ! -e "${recovery}/b-dir-sshd_config.d.dir-created"
grep -q '^rmdir -- ${newDir}$' "${recovery}/commands.log"
if grep -Eq '^rm[[:space:]]+-rf' "${recovery}/commands.log"; then
  echo "rollback must not use rm -rf" >&2
  exit 1
fi
`);

  const notDir = `${fileRoot}/snippets`;
  writeFileSync(notDir, "not-a-directory\n");
  assert.throws(
    () =>
      runHelperScript(`
RECOVERY="${recovery}"
ensure_destination_dir "${notDir}" c-dir-nginx-snippets 0755
`),
    /exists and is not a directory/
  );
  assert.equal(existsSync(path.join(recovery, "c-dir-nginx-snippets.dir-created")), false);

  const leftoverDir = `${nonemptyRoot}/clover-ui.service.d`;
  assert.throws(
    () =>
      runHelperScript(`
RECOVERY="${recovery}"
: > "${recovery}/commands.log"
ensure_destination_dir "${leftoverDir}" c-dir-clover-ui.service.d 0755
printf 'foreign\\n' > "${leftoverDir}/foreign.conf"
rollback_created_dir "${leftoverDir}" c-dir-clover-ui.service.d
`),
    /not empty or not a directory/
  );
  assert.equal(
    readFileSync(path.join(nonemptyRoot, "clover-ui.service.d", "foreign.conf"), "utf8"),
    "foreign\n"
  );
  assert.equal(existsSync(path.join(recovery, "c-dir-clover-ui.service.d.dir-created")), true);
  assert.doesNotMatch(
    readFileSync(path.join(helperTemp, "recovery", "commands.log"), "utf8"),
    /^rm\s+-rf/m
  );

  const sharedUi = `${sharedRoot}/clover-ui.service.d`;
  runHelperScript(`
RECOVERY="${recovery}"
: > "${recovery}/commands.log"
rm -f -- "${recovery}/c-dir-clover-ui.service.d.dir-created"
ensure_destination_dir "${sharedUi}" a-dir-clover-ui.service.d 0755
ensure_destination_dir "${sharedUi}" c-dir-clover-ui.service.d 0755
test -d "${sharedUi}"
test -f "${recovery}/a-dir-clover-ui.service.d.dir-created"
test ! -e "${recovery}/c-dir-clover-ui.service.d.dir-created"
rollback_created_dir "${sharedUi}" c-dir-clover-ui.service.d
test -d "${sharedUi}"
test -f "${recovery}/a-dir-clover-ui.service.d.dir-created"
if grep -q '^rmdir -- ${sharedUi}$' "${recovery}/commands.log"; then
  echo "package C must not rmdir a directory created by package A" >&2
  exit 1
fi
`);

  const foreignDir = `${sharedRoot}/preexisting`;
  mkdirSync(foreignDir);
  writeFileSync(path.join(recovery, "a-dir-clover-ui.service.d.dir-created"), "");
  runHelperScript(`
RECOVERY="${recovery}"
: > "${recovery}/commands.log"
rollback_created_dir "${posix(foreignDir)}" c-dir-clover-ui.service.d
test -d "${posix(foreignDir)}"
if grep -q '^rmdir ' "${recovery}/commands.log"; then
  echo "foreign marker must not cause rmdir" >&2
  exit 1
fi
`);

  const rerunDir = `${failRoot}/api.service.d`;
  assert.throws(
    () =>
      runHelperScript(`
RECOVERY="${recovery}"
ensure_destination_dir "${rerunDir}" a-dir-clover-api.service.d 0755
ensure_destination_dir "${rerunDir}" a-dir-clover-api.service.d 0755
`),
    /recovery marker already exists/
  );

  const installFailDir = `${failRoot}/sshd_config.d`;
  assert.throws(
    () =>
      runHelperScript(
        `
RECOVERY="${recovery}"
: > "${recovery}/commands.log"
ensure_destination_dir "${installFailDir}" b-dir-sshd_config.d 0755
`,
        `
install() {
  printf '%s\\n' "install $*" >> "$RECOVERY/commands.log"
  return 1
}
`
      ),
    /could not create directory/
  );
  assert.equal(existsSync(path.join(recovery, "b-dir-sshd_config.d.dir-created")), false);
  assert.equal(existsSync(installFailDir), false);

  const touchFailDir = `${failRoot}/snippets`;
  assert.throws(
    () =>
      runHelperScript(
        `
RECOVERY="${recovery}"
: > "${recovery}/commands.log"
ensure_destination_dir "${touchFailDir}" c-dir-nginx-snippets 0755
`,
        `
touch() {
  printf '%s\\n' "touch $*" >> "$RECOVERY/commands.log"
  return 1
}
`
      ),
    /could not write directory marker/
  );
  assert.equal(existsSync(path.join(recovery, "c-dir-nginx-snippets.dir-created")), false);
  assert.equal(existsSync(touchFailDir), false);
} finally {
  rmSync(helperTemp, { recursive: true, force: true });
}

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
  assert.ok(manifest.files.length >= 10);
  assert.ok(manifest.files.some((entry) => entry.path === "ops/security-stage5/scripts/promote-package-a.sh"));
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

{
  const replaceDir = mkdtempSync(path.join(tmpdir(), "clover-stage5-replace-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: replaceDir });
    execFileSync("git", ["config", "user.email", "replace@example.invalid"], { cwd: replaceDir });
    execFileSync("git", ["config", "user.name", "Replace Test"], { cwd: replaceDir });
    for (const relative of sourceFiles) {
      const destination = path.join(replaceDir, ...relative.split("/"));
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join(root, ...relative.split("/")), destination);
    }
    execFileSync("git", ["add", "--", ...sourceFiles], { cwd: replaceDir });
    execFileSync("git", ["commit", "--quiet", "-m", "replace fixture"], { cwd: replaceDir });
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: replaceDir, encoding: "utf8" }).trim();
    const operatorRelPath = "ops/security-stage5/scripts/promote-package-a.sh";
    const honestOid = execFileSync(
      "git",
      ["--no-replace-objects", "rev-parse", `${sha}:${operatorRelPath}`],
      { cwd: replaceDir, encoding: "utf8" }
    ).trim();
    const evilFile = path.join(replaceDir, "evil.sh");
    writeFileSync(evilFile, "# evil replace\n");
    const evilOid = execFileSync("git", ["hash-object", "-w", evilFile], {
      cwd: replaceDir,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["replace", honestOid, evilOid], { cwd: replaceDir });
    const replaced = execFileSync("git", ["show", `${sha}:${operatorRelPath}`], {
      cwd: replaceDir,
      encoding: "utf8",
    });
    assert.match(replaced, /evil replace/, "control: replace ref swaps bytes without --no-replace-objects");
    const pinned = execFileSync("git", ["--no-replace-objects", "show", `${sha}:${operatorRelPath}`], {
      cwd: replaceDir,
      encoding: "utf8",
    });
    assert.doesNotMatch(pinned, /evil replace/);
    const artifactOut = path.join(tmpdir(), `clover-stage5-replace-art-${process.pid}`);
    rmSync(artifactOut, { recursive: true, force: true });
    const manifest = prepareArtifact({ sourceRoot: replaceDir, output: artifactOut, targetSha: sha });
    const operatorRecord = manifest.files.find((entry) => entry.path === operatorRelPath);
    assert.equal(operatorRecord.sha256, createHash("sha256").update(pinned).digest("hex"));
    verifyArtifact({ artifact: artifactOut, expectedSha: sha, sourceRoot: replaceDir });
  } finally {
    rmSync(replaceDir, { recursive: true, force: true });
    rmSync(path.join(tmpdir(), `clover-stage5-replace-art-${process.pid}`), { recursive: true, force: true });
  }
}

runSecurityStage5OperatorTests();

{
  const verifierBody = extractVerifierPreamble(rollback);
  const work = mkdtempSync(path.join(tmpdir(), "clover-stage5-verpre-"));
  const toPosix = (value) => {
    const resolved = path.resolve(value);
    if (/^[A-Za-z]:[\\/]/.test(resolved)) {
      return `/${resolved[0].toLowerCase()}/${resolved.slice(3).split(path.sep).join("/")}`;
    }
    return resolved.split(path.sep).join("/");
  };
  const findBash = () => {
    try {
      return execFileSync("bash", ["-lc", "command -v bash"], { encoding: "utf8" }).trim();
    } catch {
      return "C:/Program Files/Git/bin/bash.exe";
    }
  };
  const bash = findBash();
  try {
    const sourceRoot = path.join(work, "source");
    const artifact = path.join(work, "artifact");
    const mockBin = path.join(work, "mock-bin");
    const stateDir = path.join(work, "state");
    mkdirSync(mockBin);
    mkdirSync(stateDir);
    for (const relative of [...sourceFiles, "server/scripts/securityStage5Artifact.mjs"]) {
      const destination = path.join(sourceRoot, ...relative.split("/"));
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join(root, ...relative.split("/")), destination);
    }
    execFileSync("git", ["init", "--quiet"], { cwd: sourceRoot });
    execFileSync("git", ["config", "user.email", "verpre@example.invalid"], { cwd: sourceRoot });
    execFileSync("git", ["config", "user.name", "Verifier Preamble"], { cwd: sourceRoot });
    execFileSync("git", ["add", "--", ...sourceFiles, "server/scripts/securityStage5Artifact.mjs"], {
      cwd: sourceRoot,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "verifier preamble fixture"], { cwd: sourceRoot });
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
    prepareArtifact({ sourceRoot, output: artifact, targetSha: sha });
    // prepareArtifact only packs sourceFiles; verifier still lives in the git tree for root-copy.

    const realGit = execFileSync(bash, ["-lc", "command -v git"], { encoding: "utf8" }).trim();
    const writeExec = (filePath, body) => {
      writeFileSync(filePath, body.replace(/\r\n/g, "\n"));
      chmodSync(filePath, 0o755);
    };
    writeExec(
      path.join(mockBin, "trusted-git"),
      `#!/usr/bin/env bash
STATE="${toPosix(stateDir)}"
REAL_GIT="${realGit}"
if [ -f "$STATE/git.empty" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then exit 0; fi
  done
fi
if [ -f "$STATE/git.trunc" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then
      "$REAL_GIT" "$@" | dd bs=200 count=1 2>/dev/null
      exit 0
    fi
  done
fi
if [ -f "$STATE/tamper.after" ]; then
  for arg in "$@"; do
    if [ "$arg" = "hash-object" ]; then
      echo deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
      exit 0
    fi
  done
fi
exec "$REAL_GIT" "$@"
`
    );
    writeExec(
      path.join(mockBin, "node"),
      `#!/usr/bin/env bash
printf '%s\\n' "node $*" >> "${toPosix(stateDir)}/commands.log"
exit 0
`
    );
    writeExec(
      path.join(mockBin, "stat"),
      `#!/usr/bin/env bash
if [ "$1" = "-c" ]; then
  target="\${3:-}"
  case "$2" in
    %a)
      case "$target" in *securityStage5Artifact*) echo 500 ;; *) echo 700 ;; esac
      ;;
    %U:%G) echo root:root ;;
    %h) echo 1 ;;
    %F)
      case "$target" in *securityStage5Artifact*) echo "regular file" ;; *) echo directory ;; esac
      ;;
    *) echo ok ;;
  esac
  exit 0
fi
exec /usr/bin/stat "$@"
`
    );
    writeExec(
      path.join(mockBin, "install"),
      `#!/usr/bin/env bash
if [ "$1" = "-d" ]; then mkdir -p -- "\${@: -1}"; exit 0; fi
exit 0
`
    );
    writeExec(
      path.join(mockBin, "chown"),
      `#!/usr/bin/env bash
exit 0
`
    );
    writeExec(
      path.join(mockBin, "chmod"),
      `#!/usr/bin/env bash
if [ -f "${toPosix(stateDir)}/tamper.copy" ]; then
  for arg in "$@"; do
    case "$arg" in
      *securityStage5Artifact*) printf '\\n# tampered\\n' >> "$arg" ;;
    esac
  done
fi
exit 0
`
    );

    const runPreamble = (recoveryName, extraState = null) => {
      if (extraState) writeFileSync(path.join(stateDir, extraState), "1");
      writeFileSync(path.join(stateDir, "commands.log"), "");
      const recovery = path.join(work, recoveryName);
      const script = path.join(work, `${recoveryName}.sh`);
      writeFileSync(
        script,
        `${verifierBody.replaceAll("/usr/bin/git", toPosix(path.join(mockBin, "trusted-git")))}\n`
      );
      const result = (() => {
        try {
          return {
            status: 0,
            stdout: execFileSync(
              bash,
              [
                "-lc",
                `export PATH="${toPosix(mockBin)}:$PATH"
id() { if [ "$1" = "-u" ]; then echo 0; else echo "uid=0(root)"; fi; }
export -f id
bash -c "$(cat ${toPosix(script)})" -- --target ${sha} --artifact ${toPosix(artifact)} --source-root ${toPosix(sourceRoot)} --recovery ${toPosix(recovery)}`,
              ],
              { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
            ),
            stderr: "",
          };
        } catch (error) {
          return {
            status: error.status ?? 1,
            stdout: String(error.stdout || ""),
            stderr: String(error.stderr || ""),
          };
        }
      })();
      if (extraState) rmSync(path.join(stateDir, extraState), { force: true });
      return result;
    };

    const happy = runPreamble("recovery-ok");
    assert.equal(happy.status, 0, `${happy.stdout}\n${happy.stderr}`);
    assert.match(`${happy.stdout}${happy.stderr}`, /VERIFIER_BOOTSTRAP: PASS/);
    assert.match(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /^node /m);

    const empty = runPreamble("recovery-empty", "git.empty");
    assert.notEqual(empty.status, 0);
    assert.match(`${empty.stdout}${empty.stderr}`, /empty verifier blob|VERIFIER_BOOTSTRAP: FAIL/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /^node /m);

    const trunc = runPreamble("recovery-trunc", "git.trunc");
    assert.notEqual(trunc.status, 0);
    assert.match(`${trunc.stdout}${trunc.stderr}`, /object id mismatch|VERIFIER_BOOTSTRAP: FAIL/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /^node /m);

    const tamper = runPreamble("recovery-tamper", "tamper.copy");
    assert.notEqual(tamper.status, 0);
    assert.match(`${tamper.stdout}${tamper.stderr}`, /object id mismatch|VERIFIER_BOOTSTRAP: FAIL/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /^node /m);

    const verifierRel = "server/scripts/securityStage5Artifact.mjs";
    const honestOid = execFileSync("git", ["--no-replace-objects", "rev-parse", `${sha}:${verifierRel}`], {
      cwd: sourceRoot,
      encoding: "utf8",
    }).trim();
    const evilPath = path.join(work, "evil-verifier.mjs");
    writeFileSync(evilPath, "console.log('evil replace verifier')\n");
    const evilOid = execFileSync("git", ["hash-object", "-w", evilPath], {
      cwd: sourceRoot,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["replace", honestOid, evilOid], { cwd: sourceRoot });
    const swapped = execFileSync("git", ["show", `${sha}:${verifierRel}`], {
      cwd: sourceRoot,
      encoding: "utf8",
    });
    assert.match(swapped, /evil replace verifier/);
    const replacePinned = runPreamble("recovery-replace");
    assert.equal(
      replacePinned.status,
      0,
      `replace ref must not change trusted verifier preamble\n${replacePinned.stdout}\n${replacePinned.stderr}`
    );
    assert.match(`${replacePinned.stdout}${replacePinned.stderr}`, /VERIFIER_BOOTSTRAP: PASS/);
    assert.doesNotMatch(
      readFileSync(path.join(work, "recovery-replace", `securityStage5Artifact-${sha}.mjs`), "utf8"),
      /evil replace verifier/
    );
    execFileSync("git", ["replace", "-d", honestOid], { cwd: sourceRoot });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log("SECURITY_STAGE5_PREPARE:PASS");
