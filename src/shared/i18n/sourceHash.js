import { createHash } from "node:crypto";

/**
 * Authoritative RU source hash for Stage 3.1 stale detection.
 * One definition for server and shared tooling.
 */
export function normalizeSourceRu(sourceRu) {
  if (typeof sourceRu !== "string") return "";
  return sourceRu.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function sourceHash(sourceRu) {
  const normalized = normalizeSourceRu(sourceRu);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
