import { codedError } from "./i18n/errorDisplay.js";

// Единый стиль фото товара каталога: квадрат 800×800, белый фон, JPEG.

export const PRODUCT_PHOTO_SIZE = 800;
export const PRODUCT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PRODUCT_PHOTO_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_PHOTO_JPEG_QUALITY = 0.85;

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(codedError("PHOTO_PREPARE_FAILED", "Failed to prepare the photograph."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function loadImageBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fallback below
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(codedError("PHOTO_UNRECOGNIZED", "The file is not a photograph."));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawContainOnWhite(source, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw codedError("PHOTO_PREPARE_FAILED", "Failed to prepare the photograph.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);

  const sourceWidth = source.width || source.naturalWidth || 1;
  const sourceHeight = source.height || source.naturalHeight || 1;
  const scale = Math.min(size / sourceWidth, size / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const dx = Math.round((size - drawWidth) / 2);
  const dy = Math.round((size - drawHeight) / 2);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, dx, dy, drawWidth, drawHeight);
  return canvas;
}

function jpegFileName(originalName) {
  const base = String(originalName || "product")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.\-а-яА-ЯёЁ]+/gi, "_")
    .slice(0, 80);
  return `${base || "product"}.jpg`;
}

/**
 * Приводит любое JPG/PNG/WEBP к единому квадратному JPEG каталога.
 * @returns {Promise<File>}
 */
export async function normalizeProductPhotoFile(file) {
  if (!file) {
    throw codedError("PHOTO_REQUIRED", "Choose a product photograph.");
  }
  if (!PRODUCT_PHOTO_TYPES.includes(file.type)) {
    throw codedError("PHOTO_TYPE", "Only JPG, PNG, or WEBP images are allowed.");
  }
  if (file.size > PRODUCT_PHOTO_MAX_SOURCE_BYTES) {
    throw codedError("PHOTO_MAX_SIZE", "Maximum file size is 5 MB.");
  }

  const bitmap = await loadImageBitmap(file);
  try {
    const canvas = drawContainOnWhite(bitmap, PRODUCT_PHOTO_SIZE);
    const blob = await canvasToJpegBlob(canvas, PRODUCT_PHOTO_JPEG_QUALITY);
    if (blob.size > PRODUCT_PHOTO_MAX_SOURCE_BYTES) {
      const tighter = await canvasToJpegBlob(canvas, 0.72);
      if (tighter.size > PRODUCT_PHOTO_MAX_SOURCE_BYTES) {
        throw codedError("PHOTO_STILL_TOO_LARGE", "The processed photograph is still too large.");
      }
      return new File([tighter], jpegFileName(file.name), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }
    return new File([blob], jpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    if (typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

/**
 * URL фото товара с cache-bust по imageUpdatedAt (после замены не залипает старый кадр).
 */
export function productImageSrc(product) {
  const raw = String(product?.imageUrl || "").trim();
  if (!raw) return "";
  const stamp = String(product?.imageUpdatedAt || "").trim();
  if (!stamp) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}v=${encodeURIComponent(stamp)}`;
}
