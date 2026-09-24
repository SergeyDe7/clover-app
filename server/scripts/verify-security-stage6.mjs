/**
 * Security Stage 6 — browser/reverse-proxy boundary.
 *
 * Isolated loopback only. Uses a temporary SQLite database and directories.
 * No production, mail, real login/reset/order, or 1C calls.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { prepareArtifact, verifyArtifact } from "./securityStage6Artifact.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const temp = mkdtempSync(path.join(tmpdir(), "clover-security-stage6-"));
const emptyEnvPath = path.join(temp, "empty.env");
writeFileSync(emptyEnvPath, "");

const read = (relative) => readFileSync(path.join(root, ...relative.split("/")), "utf8");

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      const port = address && typeof address === "object" ? address.port : 0;
      socket.close((error) => (error ? reject(error) : resolve(port)));
    });
    socket.on("error", reject);
  });
}

async function waitForHealth(base, child, stderr) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited ${child.exitCode}: ${stderr().slice(-2000)}`);
    }
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // Retry only the isolated loopback process.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server health timeout: ${stderr().slice(-2000)}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function assertNoStore(response, label) {
  const value = String(response.headers.get("cache-control") || "");
  assert.match(value, /(?:^|,)\s*no-store(?:\s*,|$)/i, `${label}: ${value}`);
}

async function verifyServiceWorkerNavigation() {
  const source = read("public/sw.js");
  assert.match(source, /isApiOrUpload\(path\)/, "SW must bypass API/uploads");
  assert.match(source, /requested\.origin === self\.location\.origin/, "notification URL origin gate");

  const handlers = new Map();
  let opened = "";
  let matchedWindows = [];
  const context = {
    URL,
    Response,
    fetch,
    console,
    caches: {
      open: async () => ({ addAll: async () => undefined }),
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    },
    clients: {
      matchAll: async () => matchedWindows,
      openWindow: async (url) => {
        opened = url;
      },
    },
    self: {
      location: { origin: "https://clover-spb.ru" },
      registration: {},
      clients: { claim: async () => undefined, matchAll: async () => [] },
      skipWaiting: () => undefined,
      addEventListener(type, handler) {
        handlers.set(type, handler);
      },
    },
  };
  vm.runInNewContext(source, context, { filename: "public/sw.js" });

  async function click(url) {
    let completion;
    handlers.get("notificationclick")({
      notification: { data: { url }, close() {} },
      waitUntil(promise) {
        completion = Promise.resolve(promise);
      },
    });
    await completion;
    return opened;
  }

  assert.equal(await click("https://evil.example/phish"), "https://clover-spb.ru/lk/");
  assert.equal(await click("/lk/orders"), "https://clover-spb.ru/lk/orders");

  let navigated = "";
  let focusedBeforeNavigation = false;
  let navigationFinished = false;
  matchedWindows = [{
    async navigate(url) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      navigated = url;
      navigationFinished = true;
    },
    async focus() {
      focusedBeforeNavigation = !navigationFinished;
      return undefined;
    },
  }];
  await click("/lk/orders/42");
  assert.equal(navigated, "https://clover-spb.ru/lk/orders/42");
  assert.equal(focusedBeforeNavigation, false, "focus must wait for navigation");

  let focusedAfterRejectedNavigation = false;
  matchedWindows = [{
    async navigate() {
      throw new Error("navigation rejected by test window");
    },
    async focus() {
      focusedAfterRejectedNavigation = true;
      return undefined;
    },
  }];
  await click("/lk/");
  assert.equal(focusedAfterRejectedNavigation, true);
}

function verifyStaticPolicy() {
  const vite = read("vite.config.js");
  const productionEnv = read(".env.production");
  const serverEnvExample = read("server/.env.example");
  const datacenterEnvExample = read("docs/deploy/server.env.datacenter.example");
  const nginxSite = read("ops/security-stage5/package-c/nginx/clover-spb.ru.conf");
  const headers = read("ops/security-stage6/package-b/nginx/clover-security-headers.conf");
  assert.match(vite, /preview:\s*\{[\s\S]*?cors:\s*false/);
  assert.match(productionEnv, /^VITE_PUBLIC_BASE_URL=https:\/\/clover-spb\.ru$/m);
  assert.match(nginxSite, /server_name\s+clover-spb\.ru\s+www\.clover-spb\.ru;/);
  assert.match(serverEnvExample, /^ALLOW_LAN_ORIGINS=false$/m);
  assert.match(datacenterEnvExample, /^ALLOW_LAN_ORIGINS=false$/m);
  assert.match(headers, /Content-Security-Policy\s+"[^"]*frame-ancestors 'self'/);
  assert.match(headers, /Content-Security-Policy-Report-Only/);
  assert.match(headers, /script-src 'self' 'unsafe-inline' https:\/\/mc\.yandex\.ru/);
  assert.match(headers, /frame-src https:\/\/yandex\.ru https:\/\/\*\.yandex\.ru/);
  assert.match(headers, /Cross-Origin-Opener-Policy "same-origin"/);
  assert.match(headers, /X-Permitted-Cross-Domain-Policies "none"/);
}

function findBash() {
  for (const candidate of [
    "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ]) {
    try {
      execFileSync(candidate, ["-c", "true"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("bash is required for the Stage 6 rollback dry-run");
}

function repositoryRelative(target) {
  const relative = path.relative(root, target).replaceAll("\\", "/");
  assert.doesNotMatch(relative, /^\.\.(?:\/|$)/, "test path escaped repository root");
  return relative;
}

function runCommand(executable, args) {
  return new Promise((resolve) => {
    const processHandle = spawn(executable, args, { cwd: root, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    processHandle.stdout.on("data", (chunk) => { stdout += String(chunk); });
    processHandle.stderr.on("data", (chunk) => { stderr += String(chunk); });
    processHandle.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function verifyArtifactAndRollback() {
  const tempParent = path.join(root, ".tmp");
  mkdirSync(tempParent, { recursive: true });
  const dryRunRoot = mkdtempSync(path.join(tempParent, "security-stage6-"));
  try {
    const artifactRoot = path.join(dryRunRoot, "artifact");
    const prepared = prepareArtifact(artifactRoot);
    verifyArtifact(artifactRoot, prepared.manifestSha256);

    const linkedArtifactEntry = path.join(artifactRoot, "external-junction");
    symlinkSync(root, linkedArtifactEntry, "junction");
    assert.throws(
      () => verifyArtifact(artifactRoot, prepared.manifestSha256),
      /artifact link is forbidden/,
    );
    rmdirSync(linkedArtifactEntry);
    verifyArtifact(artifactRoot, prepared.manifestSha256);

    const script = repositoryRelative(
      path.join(artifactRoot, "ops/security-stage6/scripts/promote-package-b.sh"),
    );
    const artifact = repositoryRelative(artifactRoot);
    const failedDestination = path.join(dryRunRoot, "failed-destination");
    const failedTarget = path.join(
      failedDestination,
      "etc/nginx/snippets/clover-security-headers.conf",
    );
    mkdirSync(path.dirname(failedTarget), { recursive: true });
    const original = "stage5-original-header\n";
    writeFileSync(failedTarget, original, "utf8");

    let injectedFailureObserved = false;
    try {
      execFileSync(findBash(), [
        script,
        "--artifact-root", artifact,
        "--expected-manifest", prepared.manifestSha256,
        "--dest-root", repositoryRelative(failedDestination),
        "--test-bootstrap",
        "--fail-after-install",
      ], { cwd: root, stdio: "pipe" });
    } catch (error) {
      injectedFailureObserved = true;
      assert.notEqual(error.status, 0);
    }
    assert.equal(injectedFailureObserved, true, "injected promote failure did not fail");
    assert.equal(readFileSync(failedTarget, "utf8"), original, "rollback was not byte-exact");

    const successDestination = path.join(dryRunRoot, "success-destination");
    const successTarget = path.join(
      successDestination,
      "etc/nginx/snippets/clover-security-headers.conf",
    );
    mkdirSync(path.dirname(successTarget), { recursive: true });
    writeFileSync(successTarget, original, "utf8");
    execFileSync(findBash(), [
      script,
      "--artifact-root", artifact,
      "--expected-manifest", prepared.manifestSha256,
      "--dest-root", repositoryRelative(successDestination),
      "--test-bootstrap",
    ], { cwd: root, stdio: "pipe" });
    assert.equal(
      readFileSync(successTarget, "utf8"),
      read("ops/security-stage6/package-b/nginx/clover-security-headers.conf"),
    );
    execFileSync(findBash(), [
      script,
      "--artifact-root", artifact,
      "--expected-manifest", prepared.manifestSha256,
      "--dest-root", repositoryRelative(successDestination),
      "--test-bootstrap",
      "--rollback",
    ], { cwd: root, stdio: "pipe" });
    assert.equal(
      readFileSync(successTarget, "utf8"),
      original,
      "explicit rollback was not byte-exact",
    );

    const concurrentDestination = path.join(dryRunRoot, "concurrent-destination");
    const concurrentTarget = path.join(
      concurrentDestination,
      "etc/nginx/snippets/clover-security-headers.conf",
    );
    mkdirSync(path.dirname(concurrentTarget), { recursive: true });
    writeFileSync(concurrentTarget, original, "utf8");
    const concurrentBaseArgs = [
      script,
      "--artifact-root", artifact,
      "--expected-manifest", prepared.manifestSha256,
      "--dest-root", repositoryRelative(concurrentDestination),
      "--test-bootstrap",
    ];
    const first = runCommand(findBash(), [...concurrentBaseArgs, "--hold-after-lock", "1"]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const second = runCommand(findBash(), concurrentBaseArgs);
    const concurrentResults = await Promise.all([first, second]);
    assert.deepEqual(
      concurrentResults.map((result) => result.code).sort((a, b) => a - b),
      [0, 68],
      "parallel promote must admit exactly one operator",
    );
    execFileSync(findBash(), [...concurrentBaseArgs, "--rollback"], {
      cwd: root,
      stdio: "pipe",
    });
    assert.equal(readFileSync(concurrentTarget, "utf8"), original);

    for (const [label, testFlag] of [
      ["term", "--self-term-after-install"],
      ["nginx-failure", "--simulate-nginx-failure"],
    ]) {
      const destination = path.join(dryRunRoot, `${label}-destination`);
      const target = path.join(destination, "etc/nginx/snippets/clover-security-headers.conf");
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, original, "utf8");
      assert.throws(() => execFileSync(findBash(), [
        script,
        "--artifact-root", artifact,
        "--expected-manifest", prepared.manifestSha256,
        "--dest-root", repositoryRelative(destination),
        "--test-bootstrap",
        testFlag,
      ], { cwd: root, stdio: "pipe" }));
      assert.equal(readFileSync(target, "utf8"), original, `${label}: rollback mismatch`);
    }

    const corruptDestination = path.join(dryRunRoot, "corrupt-backup-destination");
    const corruptTarget = path.join(
      corruptDestination,
      "etc/nginx/snippets/clover-security-headers.conf",
    );
    mkdirSync(path.dirname(corruptTarget), { recursive: true });
    writeFileSync(corruptTarget, original, "utf8");
    const corruptArgs = [
      script,
      "--artifact-root", artifact,
      "--expected-manifest", prepared.manifestSha256,
      "--dest-root", repositoryRelative(corruptDestination),
      "--test-bootstrap",
    ];
    execFileSync(findBash(), corruptArgs, { cwd: root, stdio: "pipe" });
    const corruptBackup = path.join(
      corruptDestination,
      "var/backups/clover/security-stage6",
      prepared.manifestSha256,
      "clover-security-headers.conf.before",
    );
    writeFileSync(corruptBackup, "corrupted backup\n", "utf8");
    assert.throws(
      () => execFileSync(findBash(), [...corruptArgs, "--rollback"], {
        cwd: root,
        stdio: "pipe",
      }),
      (error) => error.status === 90,
    );
    assert.equal(
      readFileSync(corruptTarget, "utf8"),
      read("ops/security-stage6/package-b/nginx/clover-security-headers.conf"),
      "corrupt backup must not overwrite the installed file",
    );

    const trustedRepo = path.join(dryRunRoot, "trusted-repo");
    const trustedOperator = path.join(trustedRepo, "ops/security-stage6/scripts/promote-package-b.sh");
    const trustedVerifier = path.join(trustedRepo, "server/scripts/securityStage6Artifact.mjs");
    mkdirSync(path.dirname(trustedOperator), { recursive: true });
    mkdirSync(path.dirname(trustedVerifier), { recursive: true });
    copyFileSync(path.join(root, "ops/security-stage6/scripts/promote-package-b.sh"), trustedOperator);
    copyFileSync(path.join(root, "server/scripts/securityStage6Artifact.mjs"), trustedVerifier);
    execFileSync("git", ["init", "-q", trustedRepo], { cwd: root, stdio: "pipe" });
    // The fixture compares raw bootstrap bytes with Git blobs. Windows global
    // autocrlf must not rewrite copied shell/JS files while staging them.
    execFileSync("git", ["-C", trustedRepo, "config", "core.autocrlf", "false"], {
      cwd: root,
      stdio: "pipe",
    });
    execFileSync("git", ["-C", trustedRepo, "add", "."], { cwd: root, stdio: "pipe" });
    execFileSync("git", [
      "-C", trustedRepo,
      "-c", "user.name=Clover Stage6 Test",
      "-c", "user.email=stage6-test@invalid.local",
      "commit", "-q", "-m", "trusted bootstrap fixture",
    ], { cwd: root, stdio: "pipe" });
    const trustedCommit = execFileSync("git", ["-C", trustedRepo, "rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const recovery = path.join(dryRunRoot, "root-owned-recovery");
    mkdirSync(recovery, { recursive: true });
    const recoveryOperator = path.join(recovery, "promote-package-b.sh");
    const recoveryVerifier = path.join(recovery, "securityStage6Artifact.mjs");
    copyFileSync(trustedOperator, recoveryOperator);
    copyFileSync(trustedVerifier, recoveryVerifier);

    const trustedDestination = path.join(dryRunRoot, "trusted-destination");
    const trustedTarget = path.join(
      trustedDestination,
      "etc/nginx/snippets/clover-security-headers.conf",
    );
    mkdirSync(path.dirname(trustedTarget), { recursive: true });
    writeFileSync(trustedTarget, original, "utf8");
    const trustedArgs = [
      repositoryRelative(recoveryOperator),
      "--artifact-root", artifact,
      "--expected-manifest", prepared.manifestSha256,
      "--dest-root", repositoryRelative(trustedDestination),
      "--trusted-source-root", repositoryRelative(trustedRepo),
      "--expected-commit", trustedCommit,
      "--trusted-recovery-root", repositoryRelative(recovery),
      "--trusted-verifier", repositoryRelative(recoveryVerifier),
    ];
    execFileSync(findBash(), trustedArgs, { cwd: root, stdio: "pipe" });
    assert.equal(
      readFileSync(trustedTarget, "utf8"),
      read("ops/security-stage6/package-b/nginx/clover-security-headers.conf"),
    );

    const userOwnedDestination = path.join(dryRunRoot, "user-owned-bootstrap-destination");
    mkdirSync(userOwnedDestination, { recursive: true });
    const userOwnedArgs = trustedArgs.map((value) => value === repositoryRelative(trustedDestination)
      ? repositoryRelative(userOwnedDestination)
      : value);
    assert.throws(
      () => execFileSync(findBash(), [...userOwnedArgs, "--enforce-root-bootstrap"], {
        cwd: root,
        stdio: "pipe",
      }),
      (error) => error.status === 70,
    );
    assert.equal(existsSync(path.join(userOwnedDestination, "etc")), false);

    const tamperedOperator = path.join(recovery, "tampered-operator.sh");
    copyFileSync(recoveryOperator, tamperedOperator);
    writeFileSync(tamperedOperator, `${readFileSync(tamperedOperator, "utf8")}\n# tampered\n`);
    const untouchedOperatorDestination = path.join(dryRunRoot, "tampered-operator-destination");
    mkdirSync(untouchedOperatorDestination, { recursive: true });
    const tamperedOperatorArgs = [
      repositoryRelative(tamperedOperator),
      ...trustedArgs.slice(1).map((value) => value === repositoryRelative(trustedDestination)
        ? repositoryRelative(untouchedOperatorDestination)
        : value),
    ];
    assert.throws(
      () => execFileSync(findBash(), tamperedOperatorArgs, { cwd: root, stdio: "pipe" }),
      (error) => error.status === 69,
    );
    assert.equal(existsSync(path.join(untouchedOperatorDestination, "etc")), false);

    const tamperedVerifier = path.join(recovery, "tampered-verifier.mjs");
    copyFileSync(recoveryVerifier, tamperedVerifier);
    writeFileSync(tamperedVerifier, `${readFileSync(tamperedVerifier, "utf8")}\n// tampered\n`);
    const untouchedVerifierDestination = path.join(dryRunRoot, "tampered-verifier-destination");
    mkdirSync(untouchedVerifierDestination, { recursive: true });
    const tamperedVerifierArgs = trustedArgs.map((value) => {
      if (value === repositoryRelative(trustedDestination)) return repositoryRelative(untouchedVerifierDestination);
      if (value === repositoryRelative(recoveryVerifier)) return repositoryRelative(tamperedVerifier);
      return value;
    });
    assert.throws(
      () => execFileSync(findBash(), tamperedVerifierArgs, { cwd: root, stdio: "pipe" }),
      (error) => error.status === 69,
    );
    assert.equal(existsSync(path.join(untouchedVerifierDestination, "etc")), false);

    const artifactHeader = path.join(
      artifactRoot,
      "ops/security-stage6/package-b/nginx/clover-security-headers.conf",
    );
    const exactArtifactHeader = readFileSync(artifactHeader);
    writeFileSync(artifactHeader, "tampered source\n", "utf8");
    const untouchedSourceDestination = path.join(dryRunRoot, "tampered-source-destination");
    mkdirSync(untouchedSourceDestination, { recursive: true });
    const tamperedSourceArgs = trustedArgs.map((value) => value === repositoryRelative(trustedDestination)
      ? repositoryRelative(untouchedSourceDestination)
      : value);
    assert.throws(() => execFileSync(findBash(), tamperedSourceArgs, {
      cwd: root,
      stdio: "pipe",
    }));
    assert.equal(existsSync(path.join(untouchedSourceDestination, "etc")), false);
    writeFileSync(artifactHeader, exactArtifactHeader);
    verifyArtifact(artifactRoot, prepared.manifestSha256);

    const raceDestination = path.join(dryRunRoot, "artifact-race-destination");
    const raceTarget = path.join(
      raceDestination,
      "etc/nginx/snippets/clover-security-headers.conf",
    );
    mkdirSync(path.dirname(raceTarget), { recursive: true });
    writeFileSync(raceTarget, original, "utf8");
    const raceProcess = runCommand(findBash(), [
      script,
      "--artifact-root", artifact,
      "--expected-manifest", prepared.manifestSha256,
      "--dest-root", repositoryRelative(raceDestination),
      "--test-bootstrap",
      "--hold-after-snapshot", "2",
    ]);
    const snapshotHeader = path.join(
      raceDestination,
      "var/backups/clover/security-stage6",
      prepared.manifestSha256,
      "artifact-snapshot/ops/security-stage6/package-b/nginx/clover-security-headers.conf",
    );
    for (let attempt = 0; attempt < 100 && !existsSync(snapshotHeader); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(existsSync(snapshotHeader), true, "artifact snapshot was not created");
    writeFileSync(artifactHeader, "race mutation\n", "utf8");
    const raceResult = await raceProcess;
    assert.notEqual(raceResult.code, 0, "artifact mutation after snapshot was accepted");
    assert.equal(readFileSync(raceTarget, "utf8"), original);
    writeFileSync(artifactHeader, exactArtifactHeader);
    verifyArtifact(artifactRoot, prepared.manifestSha256);
  } finally {
    rmSync(dryRunRoot, { recursive: true, force: true });
  }
}

async function startIsolatedServer(environment = {}) {
  const port = await freePort();
  let stderrText = "";
  const processHandle = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      DB_PATH: path.join(temp, "clover.sqlite"),
      DOTENV_CONFIG_PATH: emptyEnvPath,
      JWT_SECRET: "clover-security-stage6-isolated-secret-32chars",
      APP_PUBLIC_URL: "https://clover-spb.ru",
      CLOVER_PUBLIC_URL: "https://clover-spb.ru",
      PASSKEY_ORIGIN: "https://clover-spb.ru",
      PASSKEY_RP_ID: "clover-spb.ru",
      ALLOW_DEV_AUTH_LINKS: "false",
      ONEC_PROD_EXCHANGE_ENABLED: "false",
      ONEC_ALLOWED_DATABASES: "TEST",
      ONEC_DEFAULT_EXCHANGE_DATABASE: "TEST",
      ONEC_TEST_EXCHANGE_API_KEY: "clover-security-stage6-test-key-24chars",
      ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
      CLOVER_SERVER_BACKUP_DIR: path.join(temp, "backups"),
      CLOVER_UPLOADS_DIR: path.join(temp, "uploads"),
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      MAIL_FROM: "",
      // Override any parent value unless a case explicitly opts in.
      ALLOW_LAN_ORIGINS: "",
      ...environment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processHandle.stderr.on("data", (chunk) => {
    stderrText += String(chunk);
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base, processHandle, () => stderrText);
  return { child: processHandle, base };
}

let child;
try {
  verifyStaticPolicy();
  await verifyServiceWorkerNavigation();
  await verifyArtifactAndRollback();

  let running = await startIsolatedServer();
  child = running.child;
  let { base } = running;

  const canonical = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://clover-spb.ru" },
  });
  assert.equal(canonical.status, 200);
  assert.equal(canonical.headers.get("access-control-allow-origin"), "https://clover-spb.ru");
  assert.match(String(canonical.headers.get("vary") || ""), /(?:^|,)\s*Origin\s*(?:,|$)/i);
  assertNoStore(canonical, "health");

  const www = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://www.clover-spb.ru" },
  });
  assert.equal(www.headers.get("access-control-allow-origin"), "https://www.clover-spb.ru");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const canonicalPreflight = await fetch(`${base}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://clover-spb.ru",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(canonicalPreflight.status, 204);
    assert.equal(
      canonicalPreflight.headers.get("access-control-allow-origin"),
      "https://clover-spb.ru",
    );
  }

  for (const origin of [
    "https://clover-spb.ru:444",
    "https://www.clover-spb.ru:444",
    "http://127.0.0.1:5273",
    "http://192.168.155.44:5273",
    "https://evil.example",
    "null",
    "not a valid origin",
  ]) {
    const blocked = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
    assert.equal(blocked.headers.get("access-control-allow-origin"), null, origin);

    const blockedPreflight = await fetch(`${base}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(blockedPreflight.headers.get("access-control-allow-origin"), null, origin);
  }

  const serverToServer = await fetch(`${base}/api/health`);
  assert.equal(serverToServer.status, 200);
  assert.equal(serverToServer.headers.get("access-control-allow-origin"), null);
  assertNoStore(serverToServer, "server-to-server health");

  const privateError = await fetch(`${base}/api/state/settings`, { method: "PUT" });
  assert.equal(privateError.status, 401);
  assertNoStore(privateError, "private API error");

  const publicSite = await fetch(`${base}/api/public/site`);
  assert.equal(publicSite.status, 200);
  assert.match(String(publicSite.headers.get("cache-control") || ""), /public/i);
  assert.doesNotMatch(String(publicSite.headers.get("cache-control") || ""), /no-store/i);

  await stop(child);
  child = undefined;
  running = await startIsolatedServer({ NODE_ENV: "", ALLOW_LAN_ORIGINS: "" });
  child = running.child;
  base = running.base;
  const defaultLanBlocked = await fetch(`${base}/api/health`, {
    headers: { Origin: "http://192.168.155.44:5273" },
  });
  assert.equal(defaultLanBlocked.headers.get("access-control-allow-origin"), null);

  await stop(child);
  child = undefined;
  running = await startIsolatedServer({ NODE_ENV: "", ALLOW_LAN_ORIGINS: "true" });
  child = running.child;
  base = running.base;
  const explicitLanAllowed = await fetch(`${base}/api/health`, {
    headers: { Origin: "http://192.168.155.44:5273" },
  });
  assert.equal(
    explicitLanAllowed.headers.get("access-control-allow-origin"),
    "http://192.168.155.44:5273",
  );
  const explicitLanWrongPort = await fetch(`${base}/api/health`, {
    headers: { Origin: "http://192.168.155.44:5274" },
  });
  assert.equal(explicitLanWrongPort.headers.get("access-control-allow-origin"), null);

  console.log("SECURITY_STAGE6_VERIFY: PASS");
} finally {
  await stop(child);
  rmSync(temp, { recursive: true, force: true });
}
