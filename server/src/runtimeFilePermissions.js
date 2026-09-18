import {
  chmodSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import {
  PRODUCTION_LIVE_DB_RELATIVE,
  PRODUCTION_REPOSITORY_ROOT,
  isPathProvenProductionRepositoryRoot,
  isProductionLookingDbPath,
  isWorktreeDataDbPath,
} from "./auditRetention.js";
import {
  assertNoSymlinkPathComponents,
  isSymlinkOrJunction,
  sameCanonicalPath,
} from "./safeFsPath.js";

export const RUNTIME_DIR_MODE = 0o700;
export const RUNTIME_FILE_MODE = 0o600;
export const RUNTIME_PERMISSIONS_CODE_DENIED = "RUNTIME_PERMISSIONS_ROOT_DENIED";

export const RUNTIME_PERMISSION_TARGETS = Object.freeze([
  { relative: "server/data", kind: "dir", mode: RUNTIME_DIR_MODE, required: true },
  { relative: PRODUCTION_LIVE_DB_RELATIVE, kind: "file", mode: RUNTIME_FILE_MODE, required: true },
  { relative: "server/data/clover.sqlite-wal", kind: "file", mode: RUNTIME_FILE_MODE, required: false },
  { relative: "server/data/clover.sqlite-shm", kind: "file", mode: RUNTIME_FILE_MODE, required: false },
  { relative: "server/data/one-c-preview", kind: "dir", mode: RUNTIME_DIR_MODE, required: true },
  {
    relative: "server/data/one-c-preview/clients-preview.json",
    kind: "file",
    mode: RUNTIME_FILE_MODE,
    required: false,
  },
  {
    relative: "server/data/one-c-preview/products-preview.json",
    kind: "file",
    mode: RUNTIME_FILE_MODE,
    required: false,
  },
  { relative: "server/backups", kind: "dir", mode: RUNTIME_DIR_MODE, required: false },
]);

export const RUNTIME_PERMISSION_UNTOUCHED = Object.freeze([
  "server/uploads",
  "dist",
]);

function denyRuntimeRoot(message) {
  const error = new Error(message);
  error.code = RUNTIME_PERMISSIONS_CODE_DENIED;
  throw error;
}

function posixUnder(root, candidate) {
  const rootPosix = path.resolve(root).replaceAll("\\", "/");
  const candidatePosix = path.resolve(candidate).replaceAll("\\", "/");
  return candidatePosix === rootPosix || candidatePosix.startsWith(`${rootPosix}/`);
}

export function isExplicitApply(options = {}) {
  return options.apply === true;
}

export function parseRuntimePermissionsArgs(argv) {
  const options = {
    apply: false,
    postcheck: false,
    rollback: false,
    root: "",
    planPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--postcheck") {
      options.postcheck = true;
    } else if (arg === "--rollback") {
      options.rollback = true;
    } else if (arg === "--root") {
      options.root = String(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--plan") {
      options.planPath = String(argv[index + 1] || "");
      index += 1;
    }
  }
  return options;
}

export function assertRuntimeRootAllowed(
  candidate,
  { repositoryRoot, allowProduction = false, fs } = {}
) {
  if (!String(candidate || "").trim()) {
    denyRuntimeRoot("Refusing empty runtime root");
  }
  const resolved = path.resolve(String(candidate || ""));
  const io = fs || { lstatSync, realpathSync };
  if (isPathProvenProductionRepositoryRoot(resolved)) {
    if (allowProduction !== true) {
      denyRuntimeRoot("Refusing production runtime root");
    }
  } else if (isProductionLookingDbPath(resolved) || posixUnder(PRODUCTION_REPOSITORY_ROOT, resolved)) {
    denyRuntimeRoot("Refusing production runtime root");
  } else if (repositoryRoot && sameCanonicalPath(resolved, repositoryRoot)) {
    denyRuntimeRoot("Refusing worktree runtime root");
  } else if (repositoryRoot && isWorktreeDataDbPath(resolved, repositoryRoot)) {
    denyRuntimeRoot("Refusing worktree runtime root");
  }

  try {
    assertNoSymlinkPathComponents(resolved, { allowMissing: false, fs: io });
  } catch (error) {
    if (error?.code === "SAFE_PATH_SYMLINK") {
      denyRuntimeRoot("Refusing symlink runtime root");
    }
    if (error?.code === "SAFE_PATH_MISSING") {
      denyRuntimeRoot("Runtime root does not exist");
    }
    throw error;
  }
  const stats = io.lstatSync(resolved);
  if (isSymlinkOrJunction(stats) || !stats.isDirectory()) {
    denyRuntimeRoot("Runtime root must be a regular directory");
  }
  if (isPathProvenProductionRepositoryRoot(resolved) && allowProduction === true) {
    if (!sameCanonicalPath(resolved, PRODUCTION_REPOSITORY_ROOT)) {
      denyRuntimeRoot("Refusing production runtime root");
    }
  }
  return resolved;
}

function inspectTarget(root, target, io) {
  const absolute = path.resolve(root, target.relative);
  if (!posixUnder(root, absolute) || sameCanonicalPath(absolute, root)) {
    return { status: "denied", reason: "path-escape", relative: target.relative };
  }
  if (!sameCanonicalPath(absolute, path.resolve(root, ...target.relative.split("/")))) {
    return { status: "denied", reason: "path-escape", relative: target.relative };
  }
  try {
    assertNoSymlinkPathComponents(absolute, { allowMissing: !target.required, fs: io });
  } catch (error) {
    if (error?.code === "SAFE_PATH_SYMLINK") {
      return { status: "skipped", reason: "symlink", relative: target.relative, path: absolute };
    }
    if (error?.code === "SAFE_PATH_MISSING") {
      return {
        status: target.required ? "denied" : "skipped",
        reason: "missing",
        relative: target.relative,
        path: absolute,
      };
    }
    throw error;
  }

  let stats;
  try {
    stats = io.lstatSync(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        status: target.required ? "denied" : "skipped",
        reason: "missing",
        relative: target.relative,
        path: absolute,
      };
    }
    throw error;
  }
  if (isSymlinkOrJunction(stats)) {
    return { status: "skipped", reason: "symlink", relative: target.relative, path: absolute };
  }
  if (target.kind === "dir" && !stats.isDirectory()) {
    return { status: "denied", reason: "not-directory", relative: target.relative, path: absolute };
  }
  if (target.kind === "file" && !stats.isFile()) {
    return { status: "denied", reason: "not-file", relative: target.relative, path: absolute };
  }
  const currentMode = stats.mode & 0o777;
  return {
    status: currentMode === target.mode ? "ok" : "change",
    relative: target.relative,
    path: absolute,
    kind: target.kind,
    from: currentMode,
    to: target.mode,
  };
}

export function planRuntimePermissionFixes(root, { fs } = {}) {
  const io = fs || { lstatSync, realpathSync };
  const resolvedRoot = path.resolve(root);
  const changes = [];
  const unchanged = [];
  const skipped = [];
  const denied = [];
  for (const target of RUNTIME_PERMISSION_TARGETS) {
    const row = inspectTarget(resolvedRoot, target, io);
    if (row.status === "change") changes.push(row);
    else if (row.status === "ok") unchanged.push(row);
    else if (row.status === "skipped") skipped.push(row);
    else denied.push(row);
  }
  return {
    root: resolvedRoot,
    dryRun: true,
    apply: false,
    changes,
    unchanged,
    skipped,
    denied,
  };
}

export function applyRuntimePermissionPlan(plan, { apply = false, chmodFn, fs } = {}) {
  const io = fs || { lstatSync, realpathSync };
  const chmod = typeof chmodFn === "function" ? chmodFn : chmodSync;
  const explicitApply = isExplicitApply({ apply });
  if (!explicitApply) {
    return {
      ...plan,
      dryRun: true,
      apply: false,
      applied: 0,
      appliedChanges: [],
    };
  }
  if (Array.isArray(plan.denied) && plan.denied.length) {
    const error = new Error("Refusing apply with denied permission targets");
    error.code = RUNTIME_PERMISSIONS_CODE_DENIED;
    throw error;
  }
  const appliedChanges = [];
  for (const change of plan.changes || []) {
    const exactPath = assertExactPermissionChange(plan.root, change);
    const stats = io.lstatSync(exactPath);
    if (isSymlinkOrJunction(stats)) {
      continue;
    }
    if (change.kind === "dir" && !stats.isDirectory()) continue;
    if (change.kind === "file" && !stats.isFile()) continue;
    chmod(exactPath, change.to);
    appliedChanges.push({
      relative: change.relative,
      path: exactPath,
      from: change.from,
      to: change.to,
    });
  }
  return {
    ...plan,
    dryRun: false,
    apply: true,
    applied: appliedChanges.length,
    appliedChanges,
  };
}

export function postcheckRuntimePermissions(root, { fs } = {}) {
  const plan = planRuntimePermissionFixes(root, { fs });
  const modeChecksSkipped = process.platform === "win32";
  const mismatches = modeChecksSkipped ? [] : plan.changes.map((row) => ({
    relative: row.relative,
    from: row.from,
    to: row.to,
  }));
  return {
    root: plan.root,
    ok: plan.denied.length === 0 && mismatches.length === 0,
    denied: plan.denied,
    skipped: plan.skipped,
    mismatches,
    modeChecksSkipped,
    unchanged: plan.unchanged.length,
  };
}

export function assertExactPermissionChange(root, change) {
  const resolvedRoot = path.resolve(root);
  const relative = String(change?.relative || "");
  const allowed = RUNTIME_PERMISSION_TARGETS.some((row) => row.relative === relative);
  if (!allowed) {
    denyRuntimeRoot("Refusing unknown permission target");
  }
  const expected = path.resolve(resolvedRoot, relative);
  if (!change?.path || !sameCanonicalPath(expected, change.path)) {
    denyRuntimeRoot("Refusing permission path escape");
  }
  if (!posixUnder(resolvedRoot, change.path) || sameCanonicalPath(change.path, resolvedRoot)) {
    denyRuntimeRoot("Refusing permission path escape");
  }
  return expected;
}

export function rollbackRuntimePermissionPlan(plan, { chmodFn, fs } = {}) {
  const io = fs || { lstatSync, realpathSync };
  const chmod = typeof chmodFn === "function" ? chmodFn : chmodSync;
  const restored = [];
  const rows = plan.appliedChanges || plan.changes || [];
  const validated = rows.map((change) => {
    const exactPath = assertExactPermissionChange(plan.root, change);
    return { ...change, path: exactPath };
  });
  for (const change of validated) {
    try {
      assertNoSymlinkPathComponents(change.path, { allowMissing: false, fs: io });
    } catch (error) {
      if (error?.code === "SAFE_PATH_SYMLINK") continue;
      throw error;
    }
    const stats = io.lstatSync(change.path);
    if (isSymlinkOrJunction(stats)) continue;
    chmod(change.path, change.from);
    restored.push({
      relative: change.relative,
      path: change.path,
      from: change.to,
      to: change.from,
    });
  }
  return {
    root: plan.root,
    dryRun: false,
    rollback: true,
    restored: restored.length,
    restoredChanges: restored,
  };
}

export function summarizeRuntimePermissionsResult(result) {
  return {
    dryRun: result.dryRun === true,
    apply: result.apply === true,
    rollback: result.rollback === true,
    rootKind: isPathProvenProductionRepositoryRoot(result.root) ? "production" : "fixture",
    changeCount: (result.changes || []).length,
    applied: Number(result.applied) || 0,
    restored: Number(result.restored) || 0,
    skipped: (result.skipped || []).map((row) => ({ relative: row.relative, reason: row.reason })),
    denied: (result.denied || []).map((row) => ({ relative: row.relative, reason: row.reason })),
    mismatches: result.mismatches || [],
    modeChecksSkipped: result.modeChecksSkipped === true,
    ok: result.ok,
  };
}
