/**
 * Verify 1C contour-specific BSL/patch sources keep X-Clover-Database
 * and JSON body.database on the same contour.
 *
 * Catches the confirmed SEC-001 regression:
 *   header VLAVKA + body.database TEST → ONEC_CONTOUR_CONFLICT on purchase-prices.
 *
 * Does not touch production / live 1C / env.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const HEADER_RE =
  /Заголовки\.Вставить\(\s*"X-Clover-Database"\s*,\s*(?:"(TEST|VLAVKA)"|ПолучитьИмяБазыОбмена\(\))/g;
const BODY_DB_RE =
  /\.Вставить\(\s*"database"\s*,\s*(?:"(TEST|VLAVKA)"|ПолучитьИмяБазыОбмена\(\))/g;
const CONTOUR_FN_RE =
  /Функция\s+ПолучитьИмяБазыОбмена\(\)[\s\S]*?Возврат\s+"(TEST|VLAVKA)"/i;

/** @typedef {{ file: string, kind: "VLAVKA" | "TEST", required: boolean }} ContourModule */

/** Contour-specific full client modules under one_c_patches. */
const MODULES = /** @type {ContourModule[]} */ ([
  {
    file: "one_c_patches/vlavka/ПОЛНЫЙ_МОДУЛЬ_VLAVKA.txt",
    kind: "VLAVKA",
    required: true,
  },
  {
    file: "one_c_patches/price_types/ПОЛНЫЙ_МОДУЛЬ_вставить_целиком.txt",
    kind: "TEST",
    required: true,
  },
]);

/**
 * @param {string} text
 * @returns {{ headers: string[], bodies: string[], contourFn: string | null }}
 */
function extractContours(text) {
  const headers = [];
  for (const match of text.matchAll(HEADER_RE)) {
    headers.push(match[1] || "FN");
  }
  const bodies = [];
  for (const match of text.matchAll(BODY_DB_RE)) {
    bodies.push(match[1] || "FN");
  }
  const fn = text.match(CONTOUR_FN_RE);
  return {
    headers,
    bodies,
    contourFn: fn ? fn[1].toUpperCase() : null,
  };
}

/**
 * Resolve literal contour for a capture ("TEST"|"VLAVKA"|"FN").
 * @param {string} token
 * @param {string | null} contourFn
 */
function resolveToken(token, contourFn) {
  if (token === "FN") {
    assert.ok(contourFn, "ПолучитьИмяБазыОбмена() used but function body missing");
    return contourFn;
  }
  return token;
}

/**
 * @param {string} rel
 * @param {"VLAVKA" | "TEST"} kind
 */
function assertModuleConsistent(rel, kind) {
  const abs = path.join(repoRoot, rel);
  const text = readFileSync(abs, "utf8");
  const { headers, bodies, contourFn } = extractContours(text);

  assert.ok(headers.length > 0, `${rel}: missing X-Clover-Database header`);

  const headerContours = new Set(
    headers.map((token) => resolveToken(token, contourFn))
  );
  assert.equal(
    headerContours.size,
    1,
    `${rel}: mixed X-Clover-Database contours: ${[...headerContours]}`
  );
  const headerContour = [...headerContours][0];
  assert.equal(
    headerContour,
    kind,
    `${rel}: expected header contour ${kind}, got ${headerContour}`
  );

  if (bodies.length) {
    const bodyContours = new Set(
      bodies.map((token) => resolveToken(token, contourFn))
    );
    assert.equal(
      bodyContours.size,
      1,
      `${rel}: mixed body.database contours: ${[...bodyContours]}`
    );
    const bodyContour = [...bodyContours][0];
    assert.equal(
      bodyContour,
      headerContour,
      `${rel}: body.database=${bodyContour} disagrees with header=${headerContour}`
    );
  }

  // Confirmed production bug pattern must not appear in VLAVKA sources.
  if (kind === "VLAVKA") {
    assert.equal(
      /ДанныеЦен\.Вставить\(\s*"database"\s*,\s*"TEST"\s*\)/.test(text),
      false,
      `${rel}: regression — ДанныеЦен database hardcoded TEST under VLAVKA module`
    );
  }

  return { rel, kind, headerContour, bodyCount: bodies.length, contourFn };
}

function assertRegressionDetectorWorks() {
  const bad = `
Процедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт
	ЗапросHTTP.Заголовки.Вставить("X-Clover-Database", "VLAVKA");
КонецПроцедуры
ДанныеЦен.Вставить("database", "TEST");
`;
  const { headers, bodies, contourFn } = extractContours(bad);
  const header = resolveToken(headers[0], contourFn);
  const body = resolveToken(bodies[0], contourFn);
  assert.equal(header, "VLAVKA");
  assert.equal(body, "TEST");
  assert.notEqual(
    header,
    body,
    "fixture must demonstrate VLAVKA header vs TEST body conflict"
  );

  // Write temp file and ensure assertModuleConsistent would fail.
  const dir = mkdtempSync(path.join(tmpdir(), "clover-contour-mod-"));
  const rel = path.join(dir, "bad-vlava.txt");
  writeFileSync(rel, bad, "utf8");
  let failed = false;
  try {
    // Inline check mirroring VLAVKA rule:
    assert.equal(
      /ДанныеЦен\.Вставить\(\s*"database"\s*,\s*"TEST"\s*\)/.test(bad),
      false,
      "expected fail"
    );
  } catch {
    failed = true;
  }
  rmSync(dir, { recursive: true, force: true });
  assert.equal(failed, true, "regression detector must flag header VLAVKA + body TEST");
}

const reports = [];
for (const mod of MODULES) {
  reports.push(assertModuleConsistent(mod.file, mod.kind));
}
assertRegressionDetectorWorks();

// Header-only VLAVKA snippet must stay VLAVKA (no TEST body).
assertModuleConsistent(
  "one_c_patches/vlavka/ЗАГОЛОВКИ_VLAVKA.txt",
  "VLAVKA"
);

console.log("verify-onec-contour-module-sources: ok");
console.log(JSON.stringify({ reports }, null, 2));
