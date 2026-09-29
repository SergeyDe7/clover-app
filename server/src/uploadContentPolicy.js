import { readFile } from "node:fs/promises";
import sharp from "sharp";

const IMAGE_FORMAT_BY_MIME = Object.freeze({
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
});

function invalidUpload(message) {
  const error = new Error(message);
  error.code = "UPLOAD_CONTENT_INVALID";
  error.status = 400;
  return error;
}

export function validatePdfContent(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content || "");
  const header = buffer.subarray(0, Math.min(buffer.length, 16)).toString("ascii");
  const tail = buffer.subarray(Math.max(0, buffer.length - 4096)).toString("latin1");
  const body = buffer.toString("latin1");
  if (
    buffer.length < 32 ||
    !/^%PDF-\d\.\d(?:\r?\n|\r)/u.test(header) ||
    !/(?:^|[\r\n])\d+\s+\d+\s+obj(?:\s|$)/u.test(body) ||
    !/startxref\s+\d+\s+%%EOF\s*$/u.test(tail)
  ) {
    throw invalidUpload("Файл не является корректным PDF.");
  }
  return { kind: "pdf", format: "pdf" };
}

export async function validateUploadedFileContent(file) {
  const filePath = String(file?.path || "").trim();
  const mimeType = String(file?.mimetype || "").trim().toLowerCase();
  if (!filePath) throw invalidUpload("Загруженный файл не найден.");

  if (mimeType === "application/pdf") {
    const content = await readFile(filePath);
    return validatePdfContent(content);
  }

  const expectedFormat = IMAGE_FORMAT_BY_MIME[mimeType];
  if (!expectedFormat) {
    throw invalidUpload("Тип загруженного файла не разрешён.");
  }

  let metadata;
  try {
    metadata = await sharp(filePath, {
      failOn: "error",
      limitInputPixels: 40_000_000,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw invalidUpload("Файл не является корректным изображением.");
  }
  if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
    throw invalidUpload("Содержимое файла не соответствует заявленному типу изображения.");
  }
  return {
    kind: "image",
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
  };
}
