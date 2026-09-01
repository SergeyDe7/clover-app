import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { unitLabel } from "./pricing.js";
import { getStorefrontPriceListProducts } from "./storefrontPublic.js";

const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const PAGE = { width: 595.28, height: 841.89, margin: 20 };
/** ~15 позиций на страницу — крупные фото. */
const THUMB = 46;
const ROW_H = 50;
const PRICE_COL_W = 110;
const GAP = 10;
const ROWS_PER_PAGE = 15;

function formatRub(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatDateRu(date = new Date()) {
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function primaryPrice(product) {
  const units = Array.isArray(product.saleUnits) ? product.saleUnits : ["piece"];
  for (const unit of units) {
    const price = Number(product.prices?.[unit]);
    if (price > 0) {
      return {
        text: formatRub(price),
        unit: unitLabel(unit),
      };
    }
  }
  for (const [unit, raw] of Object.entries(product.prices || {})) {
    const price = Number(raw);
    if (price > 0) {
      return { text: formatRub(price), unit: unitLabel(unit) };
    }
  }
  return { text: "—", unit: "" };
}

function resolveUploadPath(imageUrl, uploadsDirectory) {
  const raw = String(imageUrl || "").trim();
  if (!raw.startsWith("/uploads/")) return "";
  const fileName = path.basename(raw);
  if (!fileName || fileName.includes("..")) return "";
  return path.resolve(uploadsDirectory, fileName);
}

async function loadThumbBuffer(imageUrl, uploadsDirectory) {
  const filePath = resolveUploadPath(imageUrl, uploadsDirectory);
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return await sharp(filePath)
      .rotate()
      .resize(THUMB * 3, THUMB * 3, {
        fit: "cover",
        position: "centre",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 84 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Прайс: крупные фото, ~15 товаров на страницу.
 * После абсолютной отрисовки сбрасываем doc.y — иначе PDFKit вставляет пустые страницы.
 */
export async function buildStorefrontPriceListPdf({
  markupPercent,
  uploadsDirectory,
} = {}) {
  const { products } = getStorefrontPriceListProducts({ markupPercent });

  const dateLabel = formatDateRu();
  const title = `Прайс-лист Clover от ${dateLabel}`;

  const thumbs = new Map();
  await Promise.all(
    products.map(async (product) => {
      const buf = await loadThumbBuffer(product.imageUrl, uploadsDirectory);
      if (buf) thumbs.set(String(product.id), buf);
    })
  );

  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      autoFirstPage: true,
      bufferPages: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title: title,
        Author: "Clover",
        Subject: "Прайс-лист Clover",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const hasFonts =
      fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
    if (hasFonts) {
      doc.registerFont("Regular", FONT_REGULAR);
      doc.registerFont("Bold", FONT_BOLD);
    }
    const font = hasFonts ? "Regular" : "Helvetica";
    const fontBold = hasFonts ? "Bold" : "Helvetica-Bold";

    const contentWidth = PAGE.width - PAGE.margin * 2;
    const nameColW = contentWidth - THUMB - GAP - PRICE_COL_W - GAP;
    const bottom = PAGE.height - PAGE.margin - 16;
    let y = PAGE.margin;
    let rowsOnPage = 0;

    const pin = (nextY) => {
      y = nextY;
      doc.x = PAGE.margin;
      doc.y = PAGE.margin;
    };

    const drawHeader = (first) => {
      doc.font(fontBold).fontSize(first ? 14 : 11).fillColor("#1a2e1a");
      doc.text(title, PAGE.margin, y, {
        width: contentWidth,
        lineBreak: false,
      });
      pin(y + (first ? 20 : 16));
      doc
        .moveTo(PAGE.margin, y)
        .lineTo(PAGE.margin + contentWidth, y)
        .strokeColor("#c8d6c6")
        .lineWidth(0.7)
        .stroke();
      pin(y + 8);
      rowsOnPage = 0;
    };

    const newPage = () => {
      doc.addPage();
      pin(PAGE.margin);
      drawHeader(false);
    };

    const ensureSpace = (need) => {
      if (y + need <= bottom) return;
      newPage();
    };

    drawHeader(true);

    let lastCategory = null;
    let rowIndex = 0;
    for (const product of products) {
      const category = String(product.category || "Прочее").trim() || "Прочее";
      if (category !== lastCategory) {
        ensureSpace(18 + ROW_H);
        if (lastCategory !== null) pin(y + 4);
        doc.font(fontBold).fontSize(9).fillColor("#2f5f2f");
        doc.text(category.toUpperCase(), PAGE.margin, y, {
          width: contentWidth,
          lineBreak: false,
        });
        pin(y + 14);
        lastCategory = category;
      }

      if (rowsOnPage >= ROWS_PER_PAGE) {
        newPage();
      }

      ensureSpace(ROW_H);
      const rowTop = y;
      const midY = rowTop + (ROW_H - THUMB) / 2;
      const thumb = thumbs.get(String(product.id));
      const textX = PAGE.margin + THUMB + GAP;
      const priceX = PAGE.margin + contentWidth - PRICE_COL_W;

      if (rowIndex % 2 === 0) {
        doc
          .save()
          .roundedRect(PAGE.margin - 1, rowTop, contentWidth + 2, ROW_H, 4)
          .fillColor("#f5f9f4")
          .fill()
          .restore();
      }
      rowIndex += 1;

      if (thumb) {
        doc.image(thumb, PAGE.margin, midY, {
          width: THUMB,
          height: THUMB,
          fit: [THUMB, THUMB],
          align: "center",
          valign: "center",
        });
      } else {
        doc
          .roundedRect(PAGE.margin, midY, THUMB, THUMB, 4)
          .fillColor("#e6ece4")
          .fill();
      }
      pin(rowTop);

      const name = String(product.name || "Без названия");
      const code = String(product.code || product.oneCCode || "").trim();
      const nameY = code ? rowTop + 8 : rowTop + (ROW_H - 11) / 2;

      doc.font(fontBold).fontSize(10).fillColor("#1c1f1c");
      doc.text(name, textX, nameY, {
        width: nameColW,
        height: 14,
        ellipsis: true,
        lineBreak: false,
      });
      pin(rowTop);
      if (code) {
        doc.font(font).fontSize(8).fillColor("#7a857a");
        doc.text(`арт. ${code}`, textX, rowTop + 28, {
          width: nameColW,
          height: 12,
          ellipsis: true,
          lineBreak: false,
        });
        pin(rowTop);
      }

      const { text: priceText, unit } = primaryPrice(product);
      const priceLine = unit ? `${priceText} / ${unit}` : priceText;
      doc.font(fontBold).fontSize(11).fillColor("#1f4f1f");
      doc.text(priceLine, priceX, rowTop + (ROW_H - 12) / 2, {
        width: PRICE_COL_W,
        align: "right",
        lineBreak: false,
      });
      pin(rowTop);

      pin(rowTop + ROW_H);
      rowsOnPage += 1;
    }

    if (!products.length) {
      doc.font(font).fontSize(11).fillColor("#6b756b");
      doc.text("На витрине нет товаров для выгрузки.", PAGE.margin, y, {
        width: contentWidth,
      });
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc
        .font(font)
        .fontSize(8)
        .fillColor("#9aa39a")
        .text(`Стр. ${i + 1} / ${range.count}`, PAGE.margin, PAGE.height - 14, {
          width: contentWidth,
          align: "right",
          lineBreak: false,
        });
    }

    doc.end();
  });
}
