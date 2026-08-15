import { readFileSync } from "node:fs";
import path from "node:path";

function readJson(filePath) { return JSON.parse(readFileSync(filePath, "utf8")); }

function installedVersionFromSpec(spec) {
  return String(spec || "").trim().replace(/^[~^]/, "");
}

function verifyExpected(root, expected, label) {
  const errors = [];
  for (const [name, requiredVersion] of Object.entries(expected)) {
    const installedPath = path.join(root, "node_modules", ...name.split("/"), "package.json");
    try {
      const installed = readJson(installedPath);
      const wanted = installedVersionFromSpec(requiredVersion);
      if (installed.version !== wanted) errors.push(`${name}: expected ${wanted} (spec ${requiredVersion}), installed ${installed.version}`);
    } catch { errors.push(`${name}: not installed`); }
  }
  if (errors.length) throw new Error(`Dependency verification failed for ${label}:\n${errors.join("\n")}`);
  return Object.keys(expected).length;
}

function packageDependencies(root) {
  const packageJson = readJson(path.join(root, "package.json"));
  return { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
}

function verifyRuntimeLock(serverRoot, runtimeExpected) {
  const packageJson = readJson(path.join(serverRoot, "package.json"));
  const lock = readJson(path.join(serverRoot, "package-lock.json"));
  const rootLock = lock.packages?.[""]?.dependencies || {};
  const errors = [];
  for (const [name, expectedVersion] of Object.entries(runtimeExpected)) {
    if (packageJson.dependencies?.[name] !== expectedVersion) errors.push(`${name}: package.json must declare exact ${expectedVersion}`);
    if (rootLock[name] !== expectedVersion) errors.push(`${name}: package-lock root must declare exact ${expectedVersion}`);
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry || entry.version !== expectedVersion) errors.push(`${name}: package-lock entry is missing or not ${expectedVersion}`);
    else if (!entry.integrity || !entry.resolved) errors.push(`${name}: package-lock entry has no resolved/integrity metadata`);
  }
  if (errors.length) throw new Error(`Final server lock verification failed:\n${errors.join("\n")}`);
}

const projectRoot = path.resolve(process.cwd());
const runtimeManifest = readJson(path.join(projectRoot, "tools", "runtime-dependencies.json"));
const frontend = verifyExpected(projectRoot, packageDependencies(projectRoot), "frontend");
const serverRoot = path.join(projectRoot, "server");
const serverExpected = packageDependencies(serverRoot);
const server = verifyExpected(serverRoot, serverExpected, "server dependencies");
const runtimeExpected = runtimeManifest.server || {};
verifyRuntimeLock(serverRoot, runtimeExpected);
const runtime = verifyExpected(serverRoot, runtimeExpected, "server V18 integrations");
console.log(`Dependency verification passed: frontend ${frontend}, server ${server}, V18 integrations ${runtime}, complete lock verified.`);
