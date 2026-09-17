/**
 * Mature password hashing for Clover auth (bcryptjs).
 * S2-NEW-002: single wrapper — no custom cryptography.
 */
import bcrypt from "bcryptjs";

export const PASSWORD_HASH_ALGORITHM = "bcrypt";
export const PASSWORD_HASH_COST = 12;
export const BCRYPT_HASH_RE = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Usable bcrypt hash only. Sentinels / empty / malformed → false. */
export function isUsablePasswordHash(value) {
  const hash = String(value ?? "").trim();
  if (!hash || hash.startsWith("!")) return false;
  if (!BCRYPT_HASH_RE.test(hash)) return false;
  const cost = bcryptCost(hash);
  return Number.isFinite(cost) && cost >= 4 && cost <= 31;
}

export function bcryptCost(hash) {
  const match = String(hash || "").match(/^\$2[aby]?\$(\d{2})\$/);
  if (!match) return NaN;
  return Number(match[1]);
}

export function passwordHashMeta(hash) {
  const usable = isUsablePasswordHash(hash);
  return {
    usable,
    algorithm: usable ? PASSWORD_HASH_ALGORITHM : "",
    cost: usable ? bcryptCost(hash) : null,
  };
}

export async function hashPassword(plain, cost = PASSWORD_HASH_COST) {
  const password = String(plain ?? "");
  if (!password) {
    throw new Error("password_required");
  }
  return bcrypt.hash(password, Number(cost) || PASSWORD_HASH_COST);
}

export function hashPasswordSync(plain, cost = PASSWORD_HASH_COST) {
  const password = String(plain ?? "");
  if (!password) {
    throw new Error("password_required");
  }
  return bcrypt.hashSync(password, Number(cost) || PASSWORD_HASH_COST);
}

/**
 * Fail-closed: malformed/missing hash never authenticates.
 * Does not throw to callers — returns false.
 */
export async function verifyPassword(plain, hash) {
  if (!isUsablePasswordHash(hash)) return false;
  const password = String(plain ?? "");
  if (!password) return false;
  try {
    return await bcrypt.compare(password, String(hash));
  } catch {
    return false;
  }
}

/** Sync verify for startup / migration paths. Fail-closed. */
export function verifyPasswordSync(plain, hash) {
  if (!isUsablePasswordHash(hash)) return false;
  const password = String(plain ?? "");
  if (!password) return false;
  try {
    return bcrypt.compareSync(password, String(hash));
  } catch {
    return false;
  }
}

export function needsPasswordRehash(hash, targetCost = PASSWORD_HASH_COST) {
  if (!isUsablePasswordHash(hash)) return false;
  const cost = bcryptCost(hash);
  return cost < Number(targetCost);
}
