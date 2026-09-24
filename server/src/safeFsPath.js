import {
  lstatSync as defaultLstatSync,
  realpathSync as defaultRealpathSync,
} from "node:fs";
import path from "node:path";

const defaultFs = {
  lstatSync: defaultLstatSync,
  realpathSync: defaultRealpathSync,
};

export function isSymlinkOrJunction(stats) {
  return Boolean(stats && typeof stats.isSymbolicLink === "function" && stats.isSymbolicLink());
}

function normalizeComparedPath(filePath) {
  let value = path.resolve(String(filePath || "")).replaceAll("\\", "/");
  if (value.startsWith("//?/") || value.startsWith("//./")) {
    value = value.slice(3);
  }
  if (process.platform === "win32") {
    value = value.toLowerCase();
  }
  if (value.length > 3 && value.endsWith("/")) {
    value = value.slice(0, -1);
  }
  return value;
}

export function sameCanonicalPath(left, right) {
  return normalizeComparedPath(left) === normalizeComparedPath(right);
}

export function nativeRealpath(filePath, fs = defaultFs) {
  const realpathSync = fs.realpathSync || defaultRealpathSync;
  if (typeof realpathSync.native === "function") {
    try {
      return realpathSync.native(filePath);
    } catch (error) {
      const canUseWindowsFallback =
        process.platform === "win32" &&
        (error?.code === "EPERM" || error?.code === "EACCES");
      if (!canUseWindowsFallback) throw error;
    }
  }
  return realpathSync(filePath);
}

function pathError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function assertNoSymlinkPathComponents(
  candidate,
  { allowMissing = false, fs = defaultFs } = {}
) {
  const resolved = path.resolve(candidate);
  const { root } = path.parse(resolved);
  const parts = resolved.slice(root.length).split(path.sep).filter(Boolean);
  let acc = root;
  for (const part of parts) {
    acc = path.join(acc, part);
    let stats;
    try {
      stats = fs.lstatSync(acc);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") {
        return resolved;
      }
      if (error?.code === "ENOENT") {
        throw pathError("Path does not exist", "SAFE_PATH_MISSING");
      }
      throw error;
    }
    if (isSymlinkOrJunction(stats)) {
      throw pathError("Refusing symlink path", "SAFE_PATH_SYMLINK");
    }
    if (typeof stats.isDirectory === "function" && stats.isDirectory()) {
      let real;
      try {
        real = nativeRealpath(acc, fs);
      } catch {
        throw pathError("Refusing symlink path", "SAFE_PATH_SYMLINK");
      }
      if (!sameCanonicalPath(real, acc)) {
        throw pathError("Refusing symlink path", "SAFE_PATH_SYMLINK");
      }
    }
  }
  return resolved;
}
