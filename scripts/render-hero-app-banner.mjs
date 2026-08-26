#!/usr/bin/env node
/**
 * Renders hero-app.webp with an iPhone 17-style mockup and Clover LK screen.
 * Usage: node scripts/render-hero-app-banner.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outWebp = path.join(root, "public/storefront/hero-app.webp");
const outPng = path.join(root, "public/storefront/hero-app.png");

function b64(file) {
  return fs.readFileSync(path.join(root, file)).toString("base64");
}

const iconB64 = b64("public/apple-touch-icon.png");
const logoB64 = b64("public/clover-logo.png");

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function featureChip(x, y, label) {
  const w = label.length * 7.2 + 28;
  return `
  <rect x="${x}" y="${y}" width="${w}" height="34" rx="17" fill="#fff" stroke="#d7e1d4"/>
  <circle cx="${x + 16}" cy="${y + 17}" r="4" fill="#5b9d57"/>
  <text x="${x + 26}" y="${y + 22}" font-family="Manrope, system-ui, sans-serif" font-size="13" font-weight="700" fill="#3f4a3f">${escapeXml(label)}</text>`;
}

function productCard(x, y, title, code, price, qty) {
  return `
  <rect x="${x}" y="${y}" width="118" height="138" rx="14" fill="#fff" stroke="#e1e9de"/>
  <rect x="${x + 6}" y="${y + 6}" width="106" height="54" rx="10" fill="#eceae4"/>
  <text x="${x + 10}" y="${y + 78}" font-family="Manrope, system-ui, sans-serif" font-size="9" font-weight="800" fill="#1c1f1c">${escapeXml(title)}</text>
  <text x="${x + 10}" y="${y + 92}" font-family="Manrope, system-ui, sans-serif" font-size="8" font-weight="600" fill="#7a847a">${escapeXml(code)}</text>
  <text x="${x + 10}" y="${y + 106}" font-family="Manrope, system-ui, sans-serif" font-size="9.5" font-weight="800" fill="#1c1f1c">${escapeXml(price)}</text>
  <rect x="${x + 16}" y="${y + 112}" width="20" height="20" rx="7" fill="#f4f8f2" stroke="#d7e1d4"/>
  <text x="${x + 26}" y="${y + 126}" font-family="Manrope, system-ui, sans-serif" font-size="12" font-weight="800" fill="#5d695d" text-anchor="middle">−</text>
  <text x="${x + 59}" y="${y + 126}" font-family="Manrope, system-ui, sans-serif" font-size="10" font-weight="800" fill="#1c1f1c" text-anchor="middle">${qty}</text>
  <rect x="${x + 82}" y="${y + 112}" width="20" height="20" rx="7" fill="#f4f8f2" stroke="#d7e1d4"/>
  <text x="${x + 92}" y="${y + 126}" font-family="Manrope, system-ui, sans-serif" font-size="12" font-weight="800" fill="#5d695d" text-anchor="middle">+</text>`;
}

function iphone17Screen() {
  const w = 264;
  const h = 572;
  return `
  <rect width="${w}" height="${h}" fill="#f4f8f2"/>
  <rect width="${w}" height="108" fill="#fff"/>
  <line x1="0" y1="108" x2="${w}" y2="108" stroke="#e1e9de"/>
  <image href="data:image/png;base64,${logoB64}" x="12" y="52" width="72" height="26" preserveAspectRatio="xMidYMid meet"/>
  <text x="12" y="88" font-family="Manrope, system-ui, sans-serif" font-size="12" font-weight="800" fill="#1c1f1c">Моя матрица</text>
  <rect x="12" y="118" width="${w - 24}" height="28" rx="12" fill="#fbfdfb" stroke="#e6eee3"/>
  <text x="24" y="136" font-family="Manrope, system-ui, sans-serif" font-size="10" font-weight="600" fill="#7a847a">Поиск по каталогу</text>
  <rect x="12" y="154" width="38" height="22" rx="11" fill="#5b9d57"/>
  <text x="31" y="169" font-family="Manrope, system-ui, sans-serif" font-size="9" font-weight="800" fill="#fff" text-anchor="middle">Все</text>
  <rect x="56" y="154" width="88" height="22" rx="11" fill="#fff" stroke="#d7e1d4"/>
  <text x="100" y="169" font-family="Manrope, system-ui, sans-serif" font-size="8.5" font-weight="800" fill="#5d695d" text-anchor="middle">Одноразовая</text>
  ${productCard(12, 188, "Стакан 250 мл", "ST-250", "89 ₽", "24")}
  ${productCard(134, 188, "Контейнер 500", "CN-500", "12 ₽", "6")}
  ${productCard(12, 336, "Моющее 1 л", "CH-01", "186 ₽", "2")}
  ${productCard(134, 336, "Салфетки", "NV-24", "54 ₽", "3")}
  <rect x="12" y="492" width="${w - 24}" height="40" rx="12" fill="#fff" stroke="#e1e9de"/>
  <text x="22" y="510" font-family="Manrope, system-ui, sans-serif" font-size="9.5" font-weight="800" fill="#1c1f1c">Корзина · 4 поз.</text>
  <text x="22" y="524" font-family="Manrope, system-ui, sans-serif" font-size="9.5" font-weight="800" fill="#5b9d57">12 480 ₽</text>
  <rect x="${w - 84}" y="502" width="60" height="22" rx="10" fill="#5b9d57"/>
  <text x="${w - 54}" y="517" font-family="Manrope, system-ui, sans-serif" font-size="9" font-weight="800" fill="#fff" text-anchor="middle">Оформить</text>`;
}

function iphone17Mockup(x, y, rotate = -5) {
  const fw = 292;
  const fh = 608;
  const bezel = 4;
  const screenW = 264;
  const screenH = 572;
  const screenX = bezel + 10;
  const screenY = bezel + 10;
  const cx = fw / 2;
  const cy = fh / 2;

  return `
  <g transform="translate(${x}, ${y}) rotate(${rotate} ${cx} ${cy})" filter="url(#phoneShadow)">
    <defs>
      <linearGradient id="titanium" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6e6e73"/>
        <stop offset="35%" stop-color="#3a3a3c"/>
        <stop offset="70%" stop-color="#1d1d1f"/>
        <stop offset="100%" stop-color="#48484a"/>
      </linearGradient>
      <linearGradient id="frameShine" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
        <stop offset="45%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
      </linearGradient>
      <clipPath id="iphoneScreen">
        <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="42"/>
      </clipPath>
    </defs>

    <!-- Titanium frame -->
    <rect width="${fw}" height="${fh}" rx="54" fill="url(#titanium)"/>
    <rect width="${fw}" height="${fh}" rx="54" fill="url(#frameShine)"/>
    <!-- Side buttons (iPhone 17) -->
    <rect x="-2" y="132" width="3" height="44" rx="1.5" fill="#2c2c2e"/>
    <rect x="-2" y="188" width="3" height="64" rx="1.5" fill="#2c2c2e"/>
    <rect x="-2" y="260" width="3" height="64" rx="1.5" fill="#2c2c2e"/>
    <rect x="${fw - 1}" y="204" width="3" height="88" rx="1.5" fill="#2c2c2e"/>

    <!-- Screen inset -->
    <rect x="${screenX - 1}" y="${screenY - 1}" width="${screenW + 2}" height="${screenH + 2}" rx="43" fill="#000"/>
    <g clip-path="url(#iphoneScreen)">
      ${iphone17Screen()}
    </g>

    <!-- Dynamic Island -->
    <rect x="${screenX + screenW / 2 - 46}" y="${screenY + 10}" width="92" height="26" rx="13" fill="#000"/>
    <circle cx="${screenX + screenW / 2 + 28}" cy="${screenY + 23}" r="4" fill="#1a1a1c"/>
    <circle cx="${screenX + screenW / 2 + 28}" cy="${screenY + 23}" r="2.2" fill="#0d3d68" opacity="0.85"/>

    <!-- Status bar -->
    <text x="${screenX + 18}" y="${screenY + 28}" font-family="Manrope, system-ui, sans-serif" font-size="11" font-weight="700" fill="#1c1f1c">9:41</text>
    <rect x="${screenX + screenW - 52}" y="${screenY + 16}" width="16" height="10" rx="2" fill="none" stroke="#1c1f1c" stroke-width="1.2"/>
    <rect x="${screenX + screenW - 32}" y="${screenY + 19}" width="3" height="4" rx="0.5" fill="#1c1f1c"/>
    <rect x="${screenX + screenW - 27}" y="${screenY + 17}" width="3" height="6" rx="0.5" fill="#1c1f1c"/>
    <rect x="${screenX + screenW - 22}" y="${screenY + 15}" width="3" height="8" rx="0.5" fill="#1c1f1c"/>
    <rect x="${screenX + screenW - 17}" y="${screenY + 13}" width="3" height="10" rx="0.5" fill="#1c1f1c"/>

    <!-- Home indicator -->
    <rect x="${screenX + screenW / 2 - 42}" y="${screenY + screenH - 14}" width="84" height="4" rx="2" fill="#1c1f1c" opacity="0.22"/>
  </g>`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#eef7eb"/>
      <stop offset="45%" stop-color="#f4f8f2"/>
      <stop offset="100%" stop-color="#e8f2e4"/>
    </linearGradient>
    <filter id="phoneShadow" x="-25%" y="-15%" width="150%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="32" flood-color="#1c1f1c" flood-opacity="0.22"/>
    </filter>
  </defs>

  <rect width="1280" height="800" fill="url(#bg)"/>
  <rect x="0" y="0" width="6" height="800" fill="#5b9d57"/>
  <circle cx="700" cy="120" r="220" fill="#5b9d57" opacity="0.045"/>
  <circle cx="100" cy="700" r="160" fill="#5b9d57" opacity="0.06"/>
  <circle cx="480" cy="560" r="110" fill="#5b9d57" opacity="0.035"/>

  <!-- Promo -->
  <image href="data:image/png;base64,${iconB64}" x="64" y="132" width="44" height="44"/>
  <rect x="118" y="142" width="52" height="24" rx="12" fill="#eef7eb" stroke="#c5d9c0"/>
  <text x="132" y="158" font-family="Manrope, system-ui, sans-serif" font-size="11" font-weight="800" fill="#386f37" letter-spacing="0.6">PWA</text>

  <text x="64" y="218" font-family="Manrope, system-ui, sans-serif" font-size="14" font-weight="800" fill="#5b9d57" letter-spacing="2.2">МОБИЛЬНОЕ ПРИЛОЖЕНИЕ</text>
  <text x="64" y="278" font-family="Manrope, system-ui, sans-serif" font-size="50" font-weight="700" fill="#1c1f1c" letter-spacing="-1">Мобильное</text>
  <text x="64" y="336" font-family="Manrope, system-ui, sans-serif" font-size="50" font-weight="700" fill="#1c1f1c" letter-spacing="-1">приложение</text>
  <text x="64" y="394" font-family="Manrope, system-ui, sans-serif" font-size="50" font-weight="700" fill="#5b9d57" letter-spacing="-1">Clover</text>

  <text x="64" y="448" font-family="Manrope, system-ui, sans-serif" font-size="21" font-weight="600" fill="#4a564a">Заказывайте в любое время</text>
  <text x="64" y="478" font-family="Manrope, system-ui, sans-serif" font-size="21" font-weight="600" fill="#4a564a">и в любом месте — прямо с телефона</text>

  ${featureChip(64, 508, "Матрица товаров")}
  ${featureChip(210, 508, "Статусы заказов")}
  ${featureChip(64, 552, "Без App Store")}
  ${featureChip(196, 552, "За 10 секунд")}

  <rect x="64" y="612" width="220" height="46" rx="15" fill="#5b9d57"/>
  <text x="88" y="641" font-family="Manrope, system-ui, sans-serif" font-size="15" font-weight="800" fill="#fff">Установить на экран</text>

  ${iphone17Mockup(868, 88, -6)}
</svg>`;

const svgBuffer = Buffer.from(svg);

await sharp(svgBuffer).webp({ quality: 88 }).toFile(outWebp);
await sharp(svgBuffer).png({ compressionLevel: 9 }).toFile(outPng);

console.log("written", outWebp, fs.statSync(outWebp).size, "bytes");
console.log("written", outPng, fs.statSync(outPng).size, "bytes");
