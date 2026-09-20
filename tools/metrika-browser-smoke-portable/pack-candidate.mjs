#!/usr/bin/env node
/**
 * Pack the current worktree candidate, including uncommitted files.
 * Does not follow node_modules, and does not copy .env / DBs / secrets.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const portableDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(portableDir, "../..");

const EXCLUDE_RE = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.env($|\.|[^/]*$)/,
  /(^|\/)server\.env(\.|$)/,
  /(^|\/)releases(\/|$)/,
  /\.(db|sqlite|sqlite3)$/i,
  /(^|\/)dist(\/|$)/,
  /(^|\/)dist\./,
  /(^|\/)coverage(\/|$)/,
  /(^|\/)\.tmp(\/|$)/,
  /(^|\/)uploads(\/|$)/,
  /(^|\/)backups(\/|$)/,
  /(^|\/)deployments(\/|$)/,
  /\.log$/i,
  /(^|\/)pack-output(\/|$)/,
  /\.tar\.gz$/,
];

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function shouldPack(rel) {
  const norm = rel.replaceAll("\\", "/");
  if (norm.startsWith("tools/metrika-browser-smoke-portable/evidence/")) {
    return /\.(html|md|json|diff)$/i.test(norm);
  }
  return !EXCLUDE_RE.some((re) => re.test(norm));
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const head = git(["rev-parse", "HEAD"]);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
let originMain = "";
try {
  originMain = git(["rev-parse", "origin/main"]);
} catch {
  originMain = "";
}
const status = git(["status", "--short", "--untracked-files=all"]);
const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const extra = git(["ls-files", "-z", "--others", "--exclude-standard"])
  .split("\0")
  .filter(Boolean);
const files = [...new Set([...tracked, ...extra])].filter(shouldPack).sort();

const stamped = new Date().toISOString().replaceAll(":", "").replace(/\.\d+Z$/, "Z");
const outDir = process.env.CLOVER_METRIKA_PACK_DIR
  ? path.resolve(process.env.CLOVER_METRIKA_PACK_DIR)
  : path.join("/tmp", `clover-metrika-candidate-${stamped}`);
mkdirSync(outDir, { recursive: true });

const entries = [];
for (const rel of files) {
  const full = path.join(root, rel);
  if (!existsSync(full)) continue;
  const lst = lstatSync(full);
  if (lst.isSymbolicLink() || !lst.isFile()) continue;
  const st = statSync(full);
  entries.push({
    path: rel.replaceAll("\\", "/"),
    bytes: st.size,
    sha256: sha256(full),
  });
}

const identity = {
  packedAt: new Date().toISOString(),
  sourceRoot: root,
  branch,
  head,
  originMain,
  dirty: Boolean(status),
  statusLines: status ? status.split("\n") : [],
  fileCount: entries.length,
  byteTotal: entries.reduce((sum, row) => sum + row.bytes, 0),
  excludes: [
    "node_modules",
    ".git",
    ".env*",
    "databases",
    "dist",
    "uploads",
    "secrets",
  ],
  note: "Working tree including uncommitted Metrika files. Not HEAD-only. Not origin/main.",
};

const manifest = { identity, files: entries };
writeFileSync(path.join(outDir, "IDENTITY.json"), JSON.stringify(identity, null, 2));
writeFileSync(path.join(outDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2));
writeFileSync(
  path.join(outDir, "SHA256SUMS"),
  entries.map((row) => `${row.sha256}  ${row.path}`).join("\n") + "\n"
);

const listFile = path.join(outDir, "FILES.txt");
writeFileSync(listFile, entries.map((row) => row.path).join("\n") + "\n");
const archive = path.join(outDir, "yandex-metrika-safe-init-candidate.tar.gz");
execFileSync(
  "tar",
  ["-czf", archive, "-C", root, "--files-from", listFile],
  { stdio: "inherit" }
);

const evidenceDir = path.join(portableDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  path.join(evidenceDir, "candidate-manifest.json"),
  JSON.stringify(
    {
      ...identity,
      archive,
      archiveSha256: sha256(archive),
      archiveBytes: statSync(archive).size,
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      archive,
      archiveSha256: sha256(archive),
      outDir,
      fileCount: entries.length,
      head,
      branch,
      dirty: Boolean(status),
    },
    null,
    2
  )
);
