/**
 * Prepared UI dist manifest: write and verify SHA-256 inventories.
 * Used by prepare/promote deploy. Never talks to production.
 * A manifest is evidence about files, not permission to install.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PREPARED_DIST_SCHEMA = "clover-prepared-dist/v1";

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function assertSafeRelPath(relPath) {
  const rel = String(relPath || "").replace(/\\/g, "/");
  if (!rel || rel.startsWith("/") || rel.includes("\0")) {
    throw new Error(`unsafe prepared path: ${relPath || "(empty)"}`);
  }
  if (rel.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`path traversal in prepared entry: ${relPath}`);
  }
  return rel;
}

export function assertRegularFileUnder(rootDir, relPath) {
  const rel = assertSafeRelPath(relPath);
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`prepared path escapes dist: ${rel}`);
  }
  if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`symlink rejected: ${rel}`);
  }
  let cursor = root;
  for (const part of rel.split("/")) {
    cursor = path.join(cursor, part);
    if (!existsSync(cursor)) {
      throw new Error(`missing prepared file: ${rel}`);
    }
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`symlink rejected: ${rel}`);
    }
  }
  const st = lstatSync(resolved);
  if (!st.isFile() || st.isSymbolicLink()) {
    throw new Error(`unsuitable prepared file type: ${rel}`);
  }
  return resolved;
}

export function listRegularFiles(distDir) {
  const root = path.resolve(distDir);
  const files = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      const full = path.join(dir, name.name);
      if (name.isSymbolicLink() || lstatSync(full).isSymbolicLink()) {
        throw new Error(`symlink rejected: ${rel}`);
      }
      if (name.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!name.isFile()) {
        throw new Error(`unsuitable prepared file type: ${rel}`);
      }
      files.push(rel.replace(/\\/g, "/"));
    }
  };
  walk(root, "");
  return files.sort();
}

export function inventoryDist(distDir) {
  return listRegularFiles(distDir).map((rel) => {
    const filePath = assertRegularFileUnder(distDir, rel);
    const st = statSync(filePath);
    return { path: rel, sha256: sha256File(filePath), size: st.size };
  });
}

export function writePreparedManifest({
  distDir,
  outFile,
  targetSha,
  releaseId,
  expectedLocaleStamp,
  buildTag,
}) {
  if (!/^[0-9a-fA-F]{40}$/.test(String(targetSha || ""))) {
    throw new Error("manifest targetSha must be a full 40-char commit hash");
  }
  const locale = String(expectedLocaleStamp || "").trim();
  if (locale !== "enabled" && locale !== "disabled") {
    throw new Error("manifest expectedLocaleStamp must be enabled or disabled");
  }
  const files = inventoryDist(distDir);
  const manifest = {
    schema: PREPARED_DIST_SCHEMA,
    targetSha: String(targetSha).toLowerCase(),
    releaseId: String(releaseId || "").trim(),
    buildTag: String(buildTag || "").trim(),
    expectedLocaleStamp: locale,
    files,
  };
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function countTopLevelObjectKeys(rawText) {
  const s = String(rawText);
  const counts = new Map();
  let i = 0;
  const n = s.length;
  const skipWs = () => {
    while (i < n && (s[i] === " " || s[i] === "\n" || s[i] === "\r" || s[i] === "\t")) i += 1;
  };
  const readString = () => {
    if (s[i] !== '"') throw new Error("manifest is not valid JSON");
    i += 1;
    let out = "";
    while (i < n) {
      const c = s[i];
      i += 1;
      if (c === "\\") {
        if (i >= n) throw new Error("manifest is not valid JSON");
        const escaped = s[i];
        i += 1;
        if (escaped === "u") {
          const hex = s.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("manifest is not valid JSON");
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 4;
        } else {
          out += escaped;
        }
        continue;
      }
      if (c === '"') return out;
      out += c;
    }
    throw new Error("manifest is not valid JSON");
  };
  const skipValue = () => {
    skipWs();
    if (i >= n) throw new Error("manifest is not valid JSON");
    const c = s[i];
    if (c === '"') {
      readString();
      return;
    }
    if (c === "{") {
      i += 1;
      skipWs();
      if (s[i] === "}") {
        i += 1;
        return;
      }
      while (i < n) {
        skipWs();
        readString();
        skipWs();
        if (s[i] !== ":") throw new Error("manifest is not valid JSON");
        i += 1;
        skipValue();
        skipWs();
        if (s[i] === ",") {
          i += 1;
          continue;
        }
        if (s[i] === "}") {
          i += 1;
          return;
        }
        throw new Error("manifest is not valid JSON");
      }
      throw new Error("manifest is not valid JSON");
    }
    if (c === "[") {
      i += 1;
      skipWs();
      if (s[i] === "]") {
        i += 1;
        return;
      }
      while (i < n) {
        skipValue();
        skipWs();
        if (s[i] === ",") {
          i += 1;
          continue;
        }
        if (s[i] === "]") {
          i += 1;
          return;
        }
        throw new Error("manifest is not valid JSON");
      }
      throw new Error("manifest is not valid JSON");
    }
    if (c === "t" || c === "f" || c === "n" || c === "-" || (c >= "0" && c <= "9")) {
      while (i < n && !",}] \n\r\t".includes(s[i])) i += 1;
      return;
    }
    throw new Error("manifest is not valid JSON");
  };
  skipWs();
  if (s[i] !== "{") throw new Error("manifest is not a JSON object");
  i += 1;
  skipWs();
  if (s[i] === "}") return counts;
  while (i < n) {
    skipWs();
    const key = readString();
    counts.set(key, (counts.get(key) || 0) + 1);
    skipWs();
    if (s[i] !== ":") throw new Error("manifest is not valid JSON");
    i += 1;
    skipValue();
    skipWs();
    if (s[i] === ",") {
      i += 1;
      continue;
    }
    if (s[i] === "}") break;
    throw new Error("manifest is not valid JSON");
  }
  return counts;
}

export function assertUniqueTargetShaKey(rawText) {
  const counts = countTopLevelObjectKeys(rawText);
  if ((counts.get("targetSha") || 0) > 1) {
    throw new Error("ambiguous prepared manifest: duplicate targetSha");
  }
}

export function readPreparedManifest(filePath) {
  const text = readFileSync(filePath, "utf8");
  assertUniqueTargetShaKey(text);
  const raw = JSON.parse(text);
  if (raw?.schema !== PREPARED_DIST_SCHEMA) {
    throw new Error(`unsupported prepared manifest schema: ${raw?.schema || "(missing)"}`);
  }
  if (!/^[0-9a-fA-F]{40}$/.test(String(raw.targetSha || ""))) {
    throw new Error("manifest targetSha is not a full 40-char commit hash");
  }
  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new Error("manifest file list is empty");
  }
  return raw;
}

export function verifyPreparedDist({
  distDir,
  manifest,
  expectedTargetSha = "",
  expectedLocaleStamp = "",
  expectedReleaseId = "",
}) {
  const failures = [];
  if (expectedTargetSha && String(manifest.targetSha).toLowerCase() !== String(expectedTargetSha).toLowerCase()) {
    failures.push(
      `manifest targetSha ${manifest.targetSha} does not match expected ${expectedTargetSha}`
    );
  }
  if (
    expectedLocaleStamp &&
    String(manifest.expectedLocaleStamp) !== String(expectedLocaleStamp)
  ) {
    failures.push(
      `manifest locale ${manifest.expectedLocaleStamp} does not match expected ${expectedLocaleStamp}`
    );
  }
  if (expectedReleaseId && String(manifest.releaseId) !== String(expectedReleaseId)) {
    failures.push(
      `manifest releaseId ${manifest.releaseId} does not match expected ${expectedReleaseId}`
    );
  }
  const listed = new Map();
  for (const entry of manifest.files) {
    try {
      const rel = assertSafeRelPath(entry.path);
      if (listed.has(rel)) failures.push(`duplicate manifest path: ${rel}`);
      listed.set(rel, entry);
    } catch (error) {
      failures.push(String(error.message || error));
    }
  }
  let present = [];
  try {
    present = listRegularFiles(distDir);
  } catch (error) {
    failures.push(String(error.message || error));
    return { ok: false, failures };
  }
  for (const rel of present) {
    if (!listed.has(rel)) failures.push(`extra prepared file: ${rel}`);
  }
  for (const [rel, entry] of listed) {
    try {
      const filePath = assertRegularFileUnder(distDir, rel);
      const digest = sha256File(filePath);
      if (digest !== String(entry.sha256 || "").toLowerCase()) {
        failures.push(`changed prepared file: ${rel}`);
      }
    } catch (error) {
      const message = String(error.message || error);
      if (message.startsWith("missing prepared file:")) {
        failures.push(`missing prepared file: ${rel}`);
      } else {
        failures.push(message);
      }
    }
  }
  return { ok: failures.length === 0, failures };
}

export function copyManifestFiles(srcDist, destDist, manifest) {
  mkdirSync(destDist, { recursive: true });
  for (const entry of manifest.files) {
    const src = assertRegularFileUnder(srcDist, entry.path);
    if (sha256File(src) !== String(entry.sha256 || "").toLowerCase()) {
      throw new Error(`changed prepared file: ${entry.path}`);
    }
    const dest = path.resolve(destDist, assertSafeRelPath(entry.path));
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    if (sha256File(dest) !== String(entry.sha256 || "").toLowerCase()) {
      throw new Error(`copy checksum mismatch: ${entry.path}`);
    }
  }
}

export function assertTrustedPreparedDir(preparedDir, stagingRoot) {
  const staging = realpathSync(path.resolve(stagingRoot));
  const preparedAbs = path.resolve(preparedDir);
  if (!existsSync(preparedAbs)) {
    throw new Error("prepared artifact path does not exist");
  }
  if (lstatSync(preparedAbs).isSymbolicLink()) {
    throw new Error("prepared artifact path must not be a symlink");
  }
  const resolved = realpathSync(path.resolve(preparedDir));
  if (resolved !== staging && !resolved.startsWith(`${staging}${path.sep}`)) {
    throw new Error("prepared artifact must live under trusted staging");
  }
  const manifestPath = path.join(resolved, "manifest.json");
  const distDir = path.join(resolved, "dist");
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error("prepared manifest.json missing");
  }
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    throw new Error("prepared dist directory missing");
  }
  if (lstatSync(manifestPath).isSymbolicLink() || lstatSync(distDir).isSymbolicLink()) {
    throw new Error("prepared manifest/dist must not be symlinks");
  }
  return { preparedDir: resolved, manifestPath, distDir };
}

function argValue(args, name) {
  const idx = args.indexOf(name);
  if (idx < 0) return "";
  return String(args[idx + 1] || "");
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === "write") {
    const manifest = writePreparedManifest({
      distDir: argValue(argv, "--dist"),
      outFile: argValue(argv, "--out"),
      targetSha: argValue(argv, "--target-sha"),
      releaseId: argValue(argv, "--release-id"),
      expectedLocaleStamp: argValue(argv, "--expected-locale"),
      buildTag: argValue(argv, "--build-tag"),
    });
    console.log(`prepared-manifest: ${manifest.files.length} files release=${manifest.releaseId}`);
    return 0;
  }
  if (command === "inspect-sha") {
    const manifest = readPreparedManifest(argValue(argv, "--manifest"));
    process.stdout.write(`${String(manifest.targetSha).toLowerCase()}\n`);
    return 0;
  }
  if (command === "verify") {
    const stagingRoot = argValue(argv, "--staging");
    const preparedDir = argValue(argv, "--prepared");
    const trusted = stagingRoot
      ? assertTrustedPreparedDir(preparedDir, stagingRoot)
      : {
          preparedDir,
          manifestPath: path.join(preparedDir, "manifest.json"),
          distDir: path.join(preparedDir, "dist"),
        };
    const manifest = readPreparedManifest(trusted.manifestPath);
    const result = verifyPreparedDist({
      distDir: trusted.distDir,
      manifest,
      expectedTargetSha: argValue(argv, "--expected-target-sha"),
      expectedLocaleStamp: argValue(argv, "--expected-locale"),
      expectedReleaseId: argValue(argv, "--expected-release-id"),
    });
    if (!result.ok) {
      console.error(`prepared dist mismatch:\n${result.failures.join("\n")}`);
      return 1;
    }
    console.log(
      `prepared-verify: ${manifest.targetSha} ${manifest.releaseId} ${manifest.files.length} files`
    );
    return 0;
  }
  if (command === "verify-files") {
    const manifest = readPreparedManifest(argValue(argv, "--manifest"));
    const result = verifyPreparedDist({
      distDir: argValue(argv, "--dist"),
      manifest,
      expectedTargetSha: argValue(argv, "--expected-target-sha"),
      expectedLocaleStamp: argValue(argv, "--expected-locale"),
      expectedReleaseId: argValue(argv, "--expected-release-id"),
    });
    if (!result.ok) {
      console.error(`prepared dist mismatch:\n${result.failures.join("\n")}`);
      return 1;
    }
    console.log(
      `prepared-verify-files: ${manifest.targetSha} ${manifest.releaseId} ${manifest.files.length} files`
    );
    return 0;
  }
  if (command === "copy") {
    const manifest = readPreparedManifest(argValue(argv, "--manifest"));
    const checked = verifyPreparedDist({
      distDir: argValue(argv, "--from"),
      manifest,
    });
    if (!checked.ok) {
      console.error(`prepared dist mismatch:\n${checked.failures.join("\n")}`);
      return 1;
    }
    copyManifestFiles(argValue(argv, "--from"), argValue(argv, "--to"), manifest);
    const recopied = verifyPreparedDist({
      distDir: argValue(argv, "--to"),
      manifest,
    });
    if (!recopied.ok) {
      console.error(`trusted copy mismatch:\n${recopied.failures.join("\n")}`);
      return 1;
    }
    console.log(`prepared-copy: ${manifest.files.length} files`);
    return 0;
  }
  console.error("usage: preparedDist.mjs write|verify|inspect-sha|verify-files|copy");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
