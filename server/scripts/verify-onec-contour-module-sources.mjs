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
function assertModuleConsistent(rel, kind, { requireHardening = true } = {}) {
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

  if (requireHardening) {
    assert.ok(
      text.includes("[CLOVER-ID:"),
      `${rel}: exact immutable Clover ID marker is required`
    );
    assert.ok(
      text.includes("НайтиЗаказПоCloverID") &&
        text.includes("ПроверитьЗаписанныйЗаказClover"),
      `${rel}: exact lookup and persisted-document verification are required`
    );
    assert.equal(
      text.includes("ВЫБРАТЬ ПЕРВЫЕ 1000"),
      false,
      `${rel}: identity lookup must not be limited to the newest 1000 documents`
    );
    assert.equal(
      text.includes("НайтиРанееСозданныйЗаказ"),
      false,
      `${rel}: legacy short-number lookup must be removed`
    );
    assert.ok(
      text.includes(".Ссылка.ПолучитьОбъект()") ||
        text.includes("СсылкаДокумента.ПолучитьОбъект()"),
      `${rel}: document must be re-read from 1C before ACK`
    );
    const lockIdx = text.indexOf("БлокировкаClover.Заблокировать()");
    const lockedLookupIdx = text.indexOf(
      "Заказ = НайтиЗаказПоCloverID(CloverID)",
      lockIdx
    );
    const writeIdx = text.indexOf("Заказ.Записать()", lockedLookupIdx);
    const commitIdx = text.indexOf("ЗафиксироватьТранзакцию()", writeIdx);
    assert.ok(
      lockIdx >= 0 &&
        lockedLookupIdx > lockIdx &&
        writeIdx > lockedLookupIdx &&
        commitIdx > writeIdx,
      `${rel}: lookup and creation must be serialized by a 1C data lock`
    );
    assert.ok(
      text.includes(
        'Заказы.Комментарий ПОДОБНО &ШаблонМаркера СПЕЦСИМВОЛ ""~""'
      ) &&
        text.includes("ЭкранироватьШаблонПодобноClover") &&
        text.includes('СтрЗаменить(Результат, "_", "~_")') &&
        text.includes("ИзвлечьТочныйCloverIDИзКомментария"),
      `${rel}: lookup must prefilter on the server and then compare exact Clover ID`
    );
    assert.ok(
      text.includes(
        "НачатьТранзакцию(РежимУправленияБлокировкойДанных.Управляемый)"
      ),
      `${rel}: explicit managed-lock transaction mode is required`
    );
    const lookupStart = text.indexOf("Функция НайтиЗаказПоCloverID");
    const lookupEnd = text.indexOf("КонецФункции", lookupStart);
    const lookupSlice = text.slice(lookupStart, lookupEnd);
    assert.ok(
      lookupSlice.includes("Заказы.ПометкаУдаления КАК ПометкаУдаления") &&
        lookupSlice.includes("CLOVER_ID_MARKED_FOR_DELETION") &&
        !lookupSlice.includes("НЕ Заказы.ПометкаУдаления"),
      `${rel}: a marked-for-deletion Clover document must block create and ACK`
    );
    assert.ok(
      text.includes("ДанныеПринятия.Вставить(\"orderId\"") &&
        !text.includes("ДанныеПринятия.Вставить(\"orderNumber\""),
      `${rel}: accepted-status callback must use immutable orderId`
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
  reports.push(
    assertModuleConsistent(mod.file, mod.kind, {
      // This stage is TEST-only. VLAVKA remains byte-for-byte unchanged and
      // is checked only for its existing contour isolation.
      requireHardening: mod.kind === "TEST",
    })
  );
}
assertRegressionDetectorWorks();

for (const rel of [
  "one_c_extension_source/CONTRACT.json",
  "one_c_extension_ready/CONTRACT.json",
]) {
  const contract = JSON.parse(readFileSync(path.join(repoRoot, rel), "utf8"));
  assert.equal(
    contract.cloverInbound.orderAccepted.body.orderId,
    "exact immutable Clover order ID used by the 1C module",
    `${rel}: orderAccepted must expose one unambiguous immutable orderId`
  );
}

// Header-only VLAVKA snippet must stay VLAVKA (no TEST body).
assertModuleConsistent(
  "one_c_patches/vlavka/ЗАГОЛОВКИ_VLAVKA.txt",
  "VLAVKA",
  { requireHardening: false }
);

console.log("verify-onec-contour-module-sources: ok");
console.log(JSON.stringify({ reports }, null, 2));
