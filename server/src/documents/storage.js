import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, realpathSync, lstatSync, unlinkSync } from "node:fs";
import path from "node:path";
import { assertNoSymlinkPathComponents } from "../safeFsPath.js";

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = new Set(["pdf", "doc", "docx", "rtf", "xls", "xlsx", "jpg", "jpeg", "png"]);
// Standard realpath also resolves junctions and works when native realpath is restricted.
export const assertDocumentPath = (target, allowMissing = false) => assertNoSymlinkPathComponents(target,
  { allowMissing, fs: { lstatSync, realpathSync: (candidate) => realpathSync(candidate) } });
export function documentError(code, message, status = 422) {
  return Object.assign(new Error(message), { code, status });
}

export function inspectDocumentUpload(buffer, originalName, signed = false) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > DOCUMENT_MAX_BYTES) {
    throw documentError("DOCUMENT_FILE_SIZE", "Файл должен быть непустым и не больше 10 МБ.");
  }
  const extension = path.extname(String(originalName)).slice(1).toLowerCase();
  if (!EXTENSIONS.has(extension) || (signed && !["pdf", "jpg", "jpeg", "png"].includes(extension))) {
    throw documentError("DOCUMENT_FILE_TYPE", "Этот формат файла не поддерживается.");
  }
  const starts = (hex) => buffer.subarray(0, hex.length / 2).toString("hex") === hex;
  const valid = extension === "pdf" ? buffer.subarray(0, 5).toString() === "%PDF-"
    : extension === "rtf" ? /^\{\\rtf\d/.test(buffer.subarray(0, 20).toString())
    : ["docx", "xlsx"].includes(extension) ? starts("504b0304")
    : ["doc", "xls"].includes(extension) ? starts("d0cf11e0a1b11ae1")
    : extension === "png" ? starts("89504e470d0a1a0a") : starts("ffd8ff");
  if (!valid) throw documentError("DOCUMENT_SIGNATURE", "Содержимое файла не соответствует расширению.");
  return { extension, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
}

// The configured root must be private and not nested under any static uploads root.
export function createDocumentStorage(root, publicRoots = []) {
  const resolved = path.resolve(root);
  assertDocumentPath(resolved, true);
  for (const publicRoot of publicRoots) {
    const relative = path.relative(path.resolve(publicRoot), resolved);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
      throw documentError("DOCUMENT_STORAGE_PUBLIC", "Хранилище документов должно быть вне публичного uploads.", 503);
    }
  }
  mkdirSync(resolved, { recursive: true, mode: 0o700 });
  const canonical = realpathSync(resolved);
  function filePath(key) {
    if (!/^[0-9a-f-]{36}\.(pdf|doc|docx|rtf|xls|xlsx|jpg|jpeg|png)$/.test(key)) {
      throw documentError("DOCUMENT_STORAGE_KEY", "Некорректный ключ файла.");
    }
    const target = path.join(canonical, key);
    assertDocumentPath(target, true);
    return target;
  }
  return {
    put(buffer, extension) {
      if (!EXTENSIONS.has(extension) || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > DOCUMENT_MAX_BYTES) {
        throw documentError("DOCUMENT_FILE_SIZE", "Некорректный файл документа.");
      }
      const key = `${randomUUID()}.${extension}`;
      writeFileSync(filePath(key), buffer, { flag: "wx", mode: 0o600 });
      return { key, size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
    },
    read(key, sha256) {
      const buffer = readFileSync(filePath(key));
      if (sha256 && createHash("sha256").update(buffer).digest("hex") !== sha256) {
        throw documentError("DOCUMENT_INTEGRITY", "Проверка целостности документа не пройдена.", 409);
      }
      return buffer;
    },
    remove(key) {try {unlinkSync(filePath(key));} catch(error){if(error.code!=='ENOENT')throw documentError('DOCUMENT_PURGE_INCOMPLETE','Не удалось удалить файлы. Повторите окончательное удаление.',503);}},
    filePath,
  };
}
