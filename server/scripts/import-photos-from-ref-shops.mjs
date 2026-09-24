/**
 * Импорт фото с gudvin-group.ru и eu-market.ru на товары витрины Clover.
 *
 *   node server/scripts/import-photos-from-ref-shops.mjs --dry-run
 *   node server/scripts/import-photos-from-ref-shops.mjs --apply
 *
 * High-confidence (score >= THRESHOLD) только. Приоритет источника при равном score: gudvin.
 * --apply: бэкап sqlite+uploads → скачать → 800×800 JPEG → POST /api/admin/products/:id/image
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { DatabaseSync } from "node:sqlite";
import { createServerBackup } from "../src/backups.js";
import { db } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const BASE = process.env.VERIFY_BASE_URL || "http://127.0.0.1:4100";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const THRESHOLD = Number(process.env.PHOTO_IMPORT_THRESHOLD || 0.72);
const PRODUCT_PHOTO_SIZE = 800;
const OUT_DIR = path.join(serverRoot, "data", "photo-import");
const REPORT_JSON = path.join(OUT_DIR, "report.json");
const REPORT_CSV = path.join(OUT_DIR, "report.csv");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run") || !args.has("--apply");
const APPLY = args.has("--apply");

const STOP = new Set([
  "для",
  "и",
  "с",
  "на",
  "из",
  "по",
  "без",
  "или",
  "шт",
  "штук",
  "уп",
  "упак",
  "мм",
  "см",
  "м",
  "мкм",
  "л",
  "мл",
  "гр",
  "г",
  "кг",
  "х",
  "x",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeName(name) {
  return clean(name)
    .toLocaleLowerCase("ru-RU")
    .replace(/\([^)]*шт[^)]*\)/gi, " ")
    .replace(/\([^)]*\/\s*\d+[^)]*\)/g, " ")
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/["«»„“”']/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name) {
  return normalizeName(name)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+([.,]\d+)?$/.test(t));
}

function searchQuery(name) {
  const t = tokens(name);
  let q = t.slice(0, 8).join(" ");
  if (q.length > 70) q = q.slice(0, 70).trim();
  return q || normalizeName(name).slice(0, 70);
}

function stemish(t) {
  // лёгкая нормализация окончаний для RU product nouns
  return t
    .replace(/(ами|ями|ов|ев|ей|ом|ем|ах|ях|ы|и|а|я|у|ю|е|о)$/u, "")
    .replace(/(ическ|ованн|енн)$/u, "");
}

/** Dice on tokens + stem overlap + head-token / size bonuses. */
function scoreNames(a, b) {
  const taArr = tokens(a);
  const tbArr = tokens(b);
  const ta = new Set(taArr);
  const tb = new Set(tbArr);
  if (!ta.size || !tb.size) return 0;

  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  let dice = (2 * inter) / (ta.size + tb.size);

  const stemsA = taArr.map(stemish).filter((t) => t.length >= 4);
  const stemsB = new Set(tbArr.map(stemish).filter((t) => t.length >= 4));
  let stemHit = 0;
  for (const s of stemsA) if (stemsB.has(s)) stemHit += 1;
  dice += Math.min(0.18, stemHit * 0.045);

  // head tokens of Clover name must matter
  if (taArr[0] && (tb.has(taArr[0]) || stemsB.has(stemish(taArr[0])))) {
    dice += 0.14;
  }
  if (taArr[1] && (tb.has(taArr[1]) || stemsB.has(stemish(taArr[1])))) {
    dice += 0.08;
  }

  // shared size numbers (8, 240, 500) from original strings
  const numsA = new Set(
    (clean(a).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."))
  );
  const numsB = new Set(
    (clean(b).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "."))
  );
  let numHit = 0;
  for (const n of numsA) if (numsB.has(n) && Number(n) >= 5) numHit += 1;
  if (numHit) dice += Math.min(0.12, numHit * 0.035);

  // dimension pairs WxH — require overlap when both sides have them
  const dimA = clean(a).match(/(\d+)\s*[xх×]\s*(\d+)/i);
  const dimB = clean(b).match(/(\d+)\s*[xх×]\s*(\d+)/i);
  if (dimA && dimB) {
    const setA = new Set([dimA[1], dimA[2]]);
    const hits = [dimB[1], dimB[2]].filter((n) => setA.has(n)).length;
    if (hits === 2) dice += 0.08;
    else if (hits === 1) dice *= 0.88;
    else dice *= 0.62;
  }

  // volume (мл/л) mismatch penalty
  const volA = clean(a).match(/(\d+(?:[.,]\d+)?)\s*(мл|л)\b/i);
  const volB = clean(b).match(/(\d+(?:[.,]\d+)?)\s*(мл|л)\b/i);
  if (volA && volB) {
    const toMl = (n, u) =>
      String(u).toLowerCase() === "л"
        ? Number(String(n).replace(",", ".")) * 1000
        : Number(String(n).replace(",", "."));
    const va = toMl(volA[1], volA[2]);
    const vb = toMl(volB[1], volB[2]);
    if (va && vb) {
      const ratio = Math.max(va, vb) / Math.min(va, vb);
      if (ratio > 1.35) dice *= 0.7;
      else if (ratio <= 1.05) dice += 0.06;
    }
  }

  // reject if no shared stem/head at all (prevents random high dice)
  const headOk =
    (taArr[0] && (tb.has(taArr[0]) || stemsB.has(stemish(taArr[0])))) ||
    stemHit >= 2;
  if (!headOk && dice < 0.85) {
    dice *= 0.55;
  }

  return Math.min(1, dice);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, { json = false } = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: json ? "application/json" : "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return json ? res.json() : res.text();
}

async function searchGudvin(query) {
  const url = `https://gudvin-group.ru/api/search-products?query=${encodeURIComponent(query)}`;
  const data = await fetchText(url, { json: true });
  const list = data?.result?.list;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      const imageUrl =
        clean(item.main_original_image_url) ||
        clean(item.main_thumbnail_image_url);
      return {
        source: "gudvin",
        name: clean(item.name),
        imageUrl,
        pageUrl: item.slug
          ? `https://gudvin-group.ru/product/${item.slug}`
          : "",
        id: item.id,
      };
    })
    .filter((x) => x.name && x.imageUrl);
}

function stripTags(html) {
  return clean(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, " ")
  );
}

async function searchEuMarket(query) {
  const url = `https://eu-market.ru/search/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  const items = [];
  const re =
    /<div class="search-item">\s*<h4><a href="([^"]+)">([\s\S]*?)<\/a><\/h4>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    const name = stripTags(m[2]);
    if (!href || href.startsWith("?sphrase")) continue;
    if (href.startsWith("/")) href = `https://eu-market.ru${href}`;
    href = href.split("?")[0];
    if (!/\/goods\/.+\.html$/i.test(href)) continue;
    items.push({ source: "eu-market", name, pageUrl: href, imageUrl: "" });
  }
  return items.slice(0, 8);
}

async function euMarketProductImage(pageUrl, productName) {
  const html = await fetchText(pageUrl);
  const want = tokens(productName)[0] || "";
  const imgs = [];
  const imgRe = /<img[^>]+>/gi;
  let m;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const srcM = tag.match(/(?:src|data-src)="([^"]+)"/i);
    const altM = tag.match(/alt="([^"]*)"/i);
    if (!srcM) continue;
    let src = srcM[1];
    if (!src.includes("/upload/iblock/") && !src.includes("/upload/resize_cache/iblock/")) {
      continue;
    }
    // prefer full iblock over tiny resize_cache thumbs
    if (src.includes("/resize_cache/")) continue;
    if (src.startsWith("/")) src = `https://eu-market.ru${src}`;
    const alt = stripTags(altM?.[1] || "");
    imgs.push({ src, alt });
  }
  if (!imgs.length) return "";
  // Prefer alt matching product name
  let best = imgs[0];
  let bestScore = scoreNames(productName, best.alt || "");
  for (const img of imgs) {
    const s = scoreNames(productName, img.alt || "");
    if (s > bestScore) {
      best = img;
      bestScore = s;
    }
  }
  if (want && bestScore < 0.25 && imgs[0]) {
    // fallback first gallery image on product page (usually main)
    return imgs[0].src;
  }
  return best.src;
}

function pickBest(cloverName, candidates) {
  let best = null;
  for (const c of candidates) {
    const score = scoreNames(cloverName, c.name);
    const ranked = {
      ...c,
      score,
      tier: score >= THRESHOLD ? "high" : score >= 0.45 ? "weak" : "none",
    };
    if (!best) {
      best = ranked;
      continue;
    }
    if (ranked.score > best.score + 0.001) {
      best = ranked;
      continue;
    }
    if (Math.abs(ranked.score - best.score) <= 0.001) {
      // tie: gudvin wins
      if (ranked.source === "gudvin" && best.source !== "gudvin") best = ranked;
    }
  }
  return best;
}

function mintAdminToken() {
  const adminDb = new DatabaseSync(path.join(serverRoot, "data", "clover.sqlite"), {
    readOnly: true,
  });
  try {
    const admin = adminDb
      .prepare(
        "SELECT id, email, role, password_changed_at, disabled_at FROM users WHERE role = 'admin' LIMIT 1"
      )
      .get();
    if (!admin || String(admin.disabled_at || "").trim()) {
      throw new Error("admin user not found");
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET missing");
    return jwt.sign(
      {
        sub: admin.id,
        role: admin.role,
        email: admin.email,
        sessionEpoch: String(admin.password_changed_at || ""),
      },
      secret,
      { expiresIn: "2h", issuer: "clover-server", audience: "clover-app" }
    );
  } finally {
    adminDb.close();
  }
}

async function loadCloverProducts() {
  const res = await fetch(`${BASE}/api/public/catalog`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
  const data = await res.json();
  const products = Array.isArray(data.products) ? data.products : [];
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code || p.oneCCode || "",
    imageUrl: p.imageUrl || "",
  }));
}

async function normalizeToStudioJpeg(buffer) {
  const sharpMod = await import("sharp");
  const sharp = sharpMod.default;
  return sharp(buffer)
    .rotate()
    .resize(PRODUCT_PHOTO_SIZE, PRODUCT_PHOTO_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function downloadBinary(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function uploadProductImage(token, productId, jpegBuffer) {
  const form = new FormData();
  form.append(
    "image",
    new Blob([jpegBuffer], { type: "image/jpeg" }),
    `product-${productId}.jpg`
  );
  const res = await fetch(`${BASE}/api/admin/products/${productId}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    throw new Error(`upload ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function writeReports(rows) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    threshold: THRESHOLD,
    total: rows.length,
    high: rows.filter((r) => r.tier === "high").length,
    weak: rows.filter((r) => r.tier === "weak").length,
    none: rows.filter((r) => r.tier === "none").length,
    bySource: {
      gudvin: rows.filter((r) => r.tier === "high" && r.source === "gudvin").length,
      "eu-market": rows.filter(
        (r) => r.tier === "high" && r.source === "eu-market"
      ).length,
    },
    rows,
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2), "utf8");
  const header = [
    "productId",
    "code",
    "cloverName",
    "tier",
    "score",
    "source",
    "matchName",
    "imageUrl",
    "pageUrl",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      r.productId,
      r.code,
      r.cloverName,
      r.tier,
      r.score?.toFixed?.(3) ?? "",
      r.source || "",
      r.matchName || "",
      r.imageUrl || "",
      r.pageUrl || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  fs.writeFileSync(REPORT_CSV, lines.join("\n"), "utf8");
  return summary;
}

async function collectCandidates(productName, query) {
  const candidates = [];
  try {
    const g = await searchGudvin(query);
    candidates.push(...g);
  } catch (e) {
    console.warn(`  gudvin error: ${e.message}`);
  }
  await sleep(100);
  try {
    const eu = await searchEuMarket(query);
    for (const item of eu) {
      try {
        item.imageUrl = await euMarketProductImage(item.pageUrl, item.name);
        await sleep(70);
      } catch (e) {
        console.warn(`  eu image error: ${e.message}`);
      }
      if (item.imageUrl) candidates.push(item);
    }
  } catch (e) {
    console.warn(`  eu-market error: ${e.message}`);
  }
  await sleep(80);
  return candidates;
}

async function matchAll(products) {
  const rows = [];
  let i = 0;
  for (const product of products) {
    i += 1;
    const q = searchQuery(product.name);
    const shortQ = tokens(product.name).slice(0, 3).join(" ");
    process.stdout.write(`[${i}/${products.length}] ${q.slice(0, 50)}…\n`);
    let candidates = await collectCandidates(product.name, q);
    let best = pickBest(product.name, candidates);

    if ((!best || best.score < THRESHOLD) && shortQ && shortQ !== q) {
      const more = await collectCandidates(product.name, shortQ);
      candidates = candidates.concat(more);
      best = pickBest(product.name, candidates);
    }

    const row = {
      productId: product.id,
      code: product.code,
      cloverName: product.name,
      currentImageUrl: product.imageUrl,
      query: q,
      tier: best?.tier || "none",
      score: best?.score ?? 0,
      source: best?.source || "",
      matchName: best?.name || "",
      imageUrl: best?.imageUrl || "",
      pageUrl: best?.pageUrl || "",
      candidatesTried: candidates.length,
    };
    rows.push(row);
    console.log(
      `  → ${row.tier} ${row.score.toFixed(3)} ${row.source} | ${(row.matchName || "-").slice(0, 60)}`
    );
  }
  return rows;
}

function isSafeHighMatch(row) {
  if (row.tier !== "high" || !row.imageUrl) return false;
  const a = row.cloverName || "";
  const b = row.matchName || "";
  // OneClick model number must match when both sides have it
  const na = (a.match(/oneclick\s*(\d+)/i) || [])[1];
  const nb = (b.match(/oneclick\s*(\d+)/i) || [])[1];
  if (na && nb && na !== nb) return false;
  return true;
}

async function applyHigh(rows) {
  const high = rows.filter(isSafeHighMatch);
  const skipped = rows.filter(
    (r) => r.tier === "high" && r.imageUrl && !isSafeHighMatch(r)
  );
  if (skipped.length) {
    console.log(`Skipped unsafe high matches: ${skipped.length}`);
    for (const s of skipped) {
      console.log(`  skip id=${s.productId} ${s.cloverName.slice(0, 50)} <= ${s.matchName.slice(0, 50)}`);
    }
  }
  console.log(`Backup before apply (${high.length} high-confidence)…`);
  const backup = createServerBackup({
    label: "photo-import-ref-shops",
    reason: "Перед импортом фото с Gudvin/Europa Market",
  });
  console.log(`Backup: ${backup.fileName}`);

  const token = mintAdminToken();
  const results = [];
  let n = 0;
  for (const row of high) {
    n += 1;
    process.stdout.write(`[apply ${n}/${high.length}] id=${row.productId}… `);
    try {
      const raw = await downloadBinary(row.imageUrl);
      const jpeg = await normalizeToStudioJpeg(raw);
      const uploaded = await uploadProductImage(token, row.productId, jpeg);
      console.log(`ok ${uploaded.imageUrl}`);
      results.push({
        productId: row.productId,
        ok: true,
        imageUrl: uploaded.imageUrl,
        source: row.source,
        score: row.score,
      });
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      results.push({
        productId: row.productId,
        ok: false,
        error: e.message,
        source: row.source,
        score: row.score,
      });
    }
    await sleep(150);
  }
  const applyPath = path.join(OUT_DIR, "apply-result.json");
  fs.writeFileSync(
    applyPath,
    JSON.stringify(
      {
        appliedAt: new Date().toISOString(),
        backup: backup.fileName,
        total: results.length,
        ok: results.filter((r) => r.ok).length,
        fail: results.filter((r) => !r.ok).length,
        skippedUnsafe: skipped.map((s) => s.productId),
        results,
      },
      null,
      2
    ),
    "utf8"
  );
  return { backup, results, applyPath };
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}  threshold=${THRESHOLD}  base=${BASE}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let rows;
  if (APPLY && fs.existsSync(REPORT_JSON) && args.has("--from-report")) {
    const prev = JSON.parse(fs.readFileSync(REPORT_JSON, "utf8"));
    rows = prev.rows;
    console.log(`Loaded ${rows.length} rows from report`);
  } else {
    const products = await loadCloverProducts();
    console.log(`Clover products: ${products.length}`);
    rows = await matchAll(products);
    const summary = writeReports(rows);
    console.log("\n=== DRY-RUN SUMMARY ===");
    console.log(
      `total=${summary.total} high=${summary.high} weak=${summary.weak} none=${summary.none}`
    );
    console.log(
      `high by source: gudvin=${summary.bySource.gudvin} eu-market=${summary.bySource["eu-market"]}`
    );
    console.log(`Report: ${REPORT_JSON}`);
    console.log(`CSV:    ${REPORT_CSV}`);
  }

  if (APPLY) {
    // refresh report if we just matched
    if (!args.has("--from-report")) writeReports(rows);
    const { backup, results, applyPath } = await applyHigh(rows);
    console.log("\n=== APPLY SUMMARY ===");
    console.log(`backup=${backup.fileName}`);
    console.log(
      `ok=${results.filter((r) => r.ok).length} fail=${results.filter((r) => !r.ok).length}`
    );
    console.log(`Result: ${applyPath}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  });
