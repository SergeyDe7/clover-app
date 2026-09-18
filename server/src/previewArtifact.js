import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import {
  assertNoSymlinkPathComponents,
  isSymlinkOrJunction,
  nativeRealpath,
} from "./safeFsPath.js";

export const CLIENT_PREVIEW_FILE = "clients-preview.json";
export const PRODUCTS_PREVIEW_FILE = "products-preview.json";
export const PREVIEW_FILE_MODE = 0o600;

const CLIENT_PREVIEW_KEEP = [
  "id",
  "code",
  "name",
  "inn",
  "priceTypeId",
  "priceTypeName",
  "priceTypeCode",
];

function previewError(message, code = "PREVIEW_PATH_INVALID") {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function toClientPreviewItem(item = {}) {
  const preview = {};
  for (const key of CLIENT_PREVIEW_KEEP) {
    const value = item?.[key];
    preview[key] = value == null ? "" : value;
  }
  return preview;
}

export function toClientPreviewItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => toClientPreviewItem(item));
}

export function previewTargetIsSymlink(filePath) {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

function unlinkIfRegularFile(filePath) {
  try {
    const lst = lstatSync(filePath);
    if (lst.isSymbolicLink() || !lst.isFile()) return;
    unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export function writePreviewArtifact(filePath, payload, deps = {}) {
  const renameFn = typeof deps.renameFn === "function" ? deps.renameFn : renameSync;
  const io = {
    lstatSync: deps.lstatSync || lstatSync,
    realpathSync: deps.realpathSync || realpathSync,
    mkdirSync: deps.mkdirSync || mkdirSync,
  };
  const resolved = path.resolve(filePath);
  const directory = path.dirname(resolved);
  try {
    assertNoSymlinkPathComponents(directory, { allowMissing: true, fs: io });
  } catch (error) {
    if (error?.code === "SAFE_PATH_SYMLINK") {
      throw previewError("preview directory is a symlink", "PREVIEW_SYMLINK");
    }
    throw error;
  }
  io.mkdirSync(directory, { recursive: true });
  try {
    assertNoSymlinkPathComponents(directory, { allowMissing: false, fs: io });
  } catch (error) {
    if (error?.code === "SAFE_PATH_SYMLINK") {
      throw previewError("preview directory is a symlink", "PREVIEW_SYMLINK");
    }
    throw error;
  }
  const dirStats = io.lstatSync(directory);
  if (isSymlinkOrJunction(dirStats) || !dirStats.isDirectory()) {
    throw previewError("preview directory is a symlink", "PREVIEW_SYMLINK");
  }
  const canonicalDir = nativeRealpath(directory, io);
  const canonicalFile = path.join(canonicalDir, path.basename(resolved));
  if (process.platform !== "win32") {
    try {
      chmodSync(canonicalDir, 0o700);
    } catch {
      /* best-effort directory mode */
    }
  }

  if (previewTargetIsSymlink(canonicalFile) || previewTargetIsSymlink(resolved)) {
    throw previewError("preview target is a symlink", "PREVIEW_SYMLINK");
  }

  const tmpPath = path.join(
    canonicalDir,
    `${path.basename(canonicalFile)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );
  if (previewTargetIsSymlink(tmpPath)) {
    throw previewError("preview temp is a symlink", "PREVIEW_SYMLINK");
  }

  const flags =
    fsConstants.O_WRONLY |
    fsConstants.O_CREAT |
    fsConstants.O_EXCL |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);

  try {
    const fd = openSync(tmpPath, flags, PREVIEW_FILE_MODE);
    try {
      writeSync(fd, `${JSON.stringify(payload)}\n`);
    } finally {
      closeSync(fd);
    }
    if (process.platform !== "win32") {
      chmodSync(tmpPath, PREVIEW_FILE_MODE);
    }
    renameFn(tmpPath, canonicalFile);
    if (process.platform !== "win32") {
      try {
        chmodSync(canonicalFile, PREVIEW_FILE_MODE);
      } catch {
        /* ignore */
      }
    }
    return canonicalFile;
  } catch (error) {
    unlinkIfRegularFile(tmpPath);
    throw error;
  }
}

export function cleanupStalePreviewArtifacts(
  directory,
  { now = new Date(), maxAgeMs = 7 * 24 * 60 * 60 * 1000 } = {}
) {
  const root = path.resolve(directory);
  let removed = 0;
  let skippedSymlinks = 0;
  if (!existsSync(root)) {
    return { removed, skippedSymlinks };
  }

  try {
    if (lstatSync(root).isSymbolicLink()) {
      return { removed, skippedSymlinks: 1 };
    }
  } catch {
    return { removed, skippedSymlinks };
  }

  const when = now instanceof Date ? now : new Date(now);
  const names = readdirSync(root);
  for (const name of names) {
    if (
      name !== CLIENT_PREVIEW_FILE &&
      name !== PRODUCTS_PREVIEW_FILE &&
      !name.endsWith(".tmp")
    ) {
      continue;
    }
    const full = path.resolve(root, name);
    if (path.dirname(full) !== root) continue;
    let lst;
    try {
      lst = lstatSync(full);
    } catch {
      continue;
    }
    if (lst.isSymbolicLink()) {
      skippedSymlinks += 1;
      continue;
    }
    if (!lst.isFile()) continue;
    if (when.getTime() - lst.mtimeMs < Number(maxAgeMs)) continue;
    unlinkSync(full);
    removed += 1;
  }
  return { removed, skippedSymlinks };
}
