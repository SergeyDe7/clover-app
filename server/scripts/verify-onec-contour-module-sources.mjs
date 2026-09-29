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
import { readFileSync } from "node:fs";
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
function assertModuleTextConsistent(
  text,
  rel,
  kind,
  { requireHardening = true } = {}
) {
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

  if (kind === "VLAVKA" && requireHardening) {
    const keyFnStart = text.indexOf("Функция ПолучитьКлючОбмена()");
    const keyFnEnd = text.indexOf("КонецФункции", keyFnStart);
    const keyFnSlice = text.slice(keyFnStart, keyFnEnd);
    const keyLiterals = [...keyFnSlice.matchAll(/"([^"]*)"/g)].map(
      (match) => match[1]
    );
    assert.ok(
      keyFnStart >= 0 && keyFnEnd > keyFnStart,
      `${rel}: ПолучитьКлючОбмена() function is required`
    );
    assert.equal(
      (text.match(/\*\*\*REPLACE_WITH_ONEC_API_KEY\*\*\*/g) || []).length,
      1,
      `${rel}: source-controlled VLAVKA module must contain exactly one key placeholder`
    );
    assert.deepEqual(
      keyLiterals,
      ["***REPLACE_WITH_ONEC_API_KEY***"],
      `${rel}: key function must contain only the explicit placeholder and no embedded secret`
    );
    const fileWideSecretPatterns = [
      { label: "long hex token", pattern: /\b[0-9a-fA-F]{32,}\b/ },
      {
        label: "provider-style API token",
        pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{16,}\b/,
      },
      {
        label: "JWT-like token",
        pattern: /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
      },
    ];
    for (const { label, pattern } of fileWideSecretPatterns) {
      assert.equal(
        pattern.test(text),
        false,
        `${rel}: source-controlled VLAVKA module contains a ${label}`
      );
    }
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
    const persistedCheckStart = text.indexOf(
      "Функция ПроверитьЗаписанныйЗаказClover("
    );
    const persistedCheckEnd = text.indexOf(
      "КонецФункции",
      persistedCheckStart
    );
    const persistedCheckSlice = text.slice(
      persistedCheckStart,
      persistedCheckEnd
    );
    assert.ok(
      persistedCheckStart >= 0 && persistedCheckEnd > persistedCheckStart,
      `${rel}: persisted-document verifier function is required`
    );
    assert.ok(
      persistedCheckSlice.includes(
        "ПроверенныйЗаказ = СсылкаДокумента.ПолучитьОбъект()"
      ) &&
        persistedCheckSlice.includes("ФактическийID <> ОжидаемыйID"),
      `${rel}: persisted verifier must re-read the exact document and compare Clover ID`
    );
    const createFlowStart = text.indexOf("Функция СоздатьОдинТестовыйЗаказ()");
    const createFlowEnd = text.indexOf("КонецФункции", createFlowStart);
    const createFlowSlice = text.slice(createFlowStart, createFlowEnd);
    assert.ok(
      createFlowStart >= 0 && createFlowEnd > createFlowStart,
      `${rel}: order creation flow is required`
    );
    const lockIdx = createFlowSlice.indexOf("БлокировкаClover.Заблокировать()");
    const lockedLookupIdx = createFlowSlice.indexOf(
      "Заказ = НайтиЗаказПоCloverID(CloverID)",
      lockIdx
    );
    const writeIdx = createFlowSlice.indexOf("Заказ.Записать()", lockedLookupIdx);
    const rereadIdx = createFlowSlice.indexOf(
      "ПроверенныйЗаказ = ПроверитьЗаписанныйЗаказClover(",
      writeIdx
    );
    const commitIdx = createFlowSlice.indexOf(
      "ЗафиксироватьТранзакцию()",
      rereadIdx
    );
    const ackIdx = createFlowSlice.indexOf(
      "ПодтвердитьЗаказВClover(",
      commitIdx
    );
    assert.ok(
      lockIdx >= 0 &&
        lockedLookupIdx > lockIdx &&
        writeIdx > lockedLookupIdx &&
        rereadIdx > writeIdx &&
        commitIdx > rereadIdx &&
        ackIdx > commitIdx,
      `${rel}: required order is lock -> lookup -> write -> persisted verify -> commit -> ACK`
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
        lookupSlice.includes("ИзвлечьТочныйCloverIDИзКомментария(") &&
        lookupSlice.includes("ВыборкаЗаказа.Комментарий) = CloverID Тогда") &&
        !lookupSlice.includes("НЕ Заказы.ПометкаУдаления"),
      `${rel}: lookup must compare exact Clover ID and block marked-for-deletion documents`
    );
    assert.ok(
      text.includes("ДанныеПринятия.Вставить(\"orderId\"") &&
        !text.includes("ДанныеПринятия.Вставить(\"orderNumber\""),
      `${rel}: accepted-status callback must use immutable orderId`
    );
    const guardStart = text.indexOf(
      "Процедура ПроверитьНеизменностьCloverIDПередЗаписью("
    );
    const guardEnd = text.indexOf("КонецПроцедуры", guardStart);
    const guardSlice = text.slice(guardStart, guardEnd);
    const beforeWriteStart = text.indexOf(
      "Процедура ОбработатьЗаписьЗаказаCloverПередЗаписью("
    );
    const beforeWriteEnd = text.indexOf("КонецПроцедуры", beforeWriteStart);
    const beforeWriteSlice = text.slice(beforeWriteStart, beforeWriteEnd);
    assert.ok(
      guardStart >= 0 &&
        guardEnd > guardStart &&
        guardSlice.includes("Источник.Ссылка.Комментарий") &&
        guardSlice.includes("ТекущийCloverID <> ПредыдущийCloverID") &&
        guardSlice.includes("Отказ = Истина") &&
        guardSlice.includes("CLOVER_ID_IMMUTABLE") &&
        !guardSlice.includes("Источник.Комментарий <> ПредыдущийКомментарий"),
      `${rel}: existing Clover ID marker must be immutable`
    );
    assert.ok(
      beforeWriteStart >= 0 &&
        beforeWriteEnd > beforeWriteStart &&
        beforeWriteSlice.includes(
          "ПроверитьНеизменностьCloverIDПередЗаписью(Источник, Отказ)"
        ),
      `${rel}: BeforeWrite subscription must invoke Clover ID immutability guard`
    );
  }

  return { rel, kind, headerContour, bodyCount: bodies.length, contourFn };
}

function assertModuleConsistent(rel, kind, options = {}) {
  const abs = path.join(repoRoot, rel);
  return assertModuleTextConsistent(readFileSync(abs, "utf8"), rel, kind, options);
}

function expectModuleRejected(label, text, options = {}) {
  assert.throws(
    () =>
      assertModuleTextConsistent(text, `fixture:${label}`, "VLAVKA", {
        requireHardening: true,
        ...options,
      }),
    undefined,
    `mutation fixture must be rejected: ${label}`
  );
}

function mutateRequired(text, from, to, label) {
  assert.ok(text.includes(from), `fixture source missing mutation target: ${label}`);
  return text.replaceAll(from, to);
}

function assertRegressionDetectorWorks() {
  const bad = `
Процедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт
	ЗапросHTTP.Заголовки.Вставить("X-Clover-Database", "VLAVKA");
КонецПроцедуры
ДанныеЦен.Вставить("database", "TEST");
`;
  assert.throws(
    () =>
      assertModuleTextConsistent(bad, "fixture:contour-conflict", "VLAVKA", {
        requireHardening: false,
      }),
    undefined,
    "main verifier must reject VLAVKA header with TEST body"
  );

  const source = readFileSync(
    path.join(repoRoot, "one_c_patches/vlavka/ПОЛНЫЙ_МОДУЛЬ_VLAVKA.txt"),
    "utf8"
  );
  const providerTokenFixture = ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_");
  const mutations = [
    [
      "embedded-non-hex-secret",
      'Возврат "***REPLACE_WITH_ONEC_API_KEY***";',
      'ЛишнийКлюч = "non-hex-production-api-key-that-must-never-enter-git";\n\tВозврат "***REPLACE_WITH_ONEC_API_KEY***";',
    ],
    [
      "external-provider-secret",
      "Процедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт",
      `ВнешнийСекрет = "${providerTokenFixture}";\nПроцедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт`,
    ],
    [
      "external-hex-secret",
      "Процедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт",
      'ВнешнийHexСекрет = "0123456789abcdef0123456789abcdef";\nПроцедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт',
    ],
    [
      "external-jwt-secret",
      "Процедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт",
      'ВнешнийJWT = "eyJabcdefghijklmnop.qrstuvwx.yzABCDEF";\nПроцедура ДобавитьЗаголовкиОбмена(ЗапросHTTP) Экспорт',
    ],
    ["missing-id-marker", "[CLOVER-ID:", "[CLOVER-LEGACY-ID:"],
    [
      "inexact-id-comparison",
      "ВыборкаЗаказа.Комментарий) = CloverID Тогда",
      'ВыборкаЗаказа.Комментарий) <> "" Тогда',
    ],
    [
      "missing-managed-transaction",
      "НачатьТранзакцию(РежимУправленияБлокировкойДанных.Управляемый)",
      "НачатьТранзакцию()",
    ],
    [
      "missing-data-lock",
      "БлокировкаClover.Заблокировать()",
      "// Блокировка удалена",
    ],
    [
      "marked-deletion-bypass",
      "CLOVER_ID_MARKED_FOR_DELETION",
      "CLOVER_ID_DELETE_IGNORED",
    ],
    [
      "missing-target-reread",
      "ПроверенныйЗаказ = СсылкаДокумента.ПолучитьОбъект()",
      "ПроверенныйЗаказ = СсылкаДокумента",
    ],
    [
      "commit-before-verified-ack-order-missing",
      "ЗафиксироватьТранзакцию();",
      "// ЗафиксироватьТранзакцию удалено",
    ],
    [
      "mutable-status-identity",
      'ДанныеПринятия.Вставить("orderId"',
      'ДанныеПринятия.Вставить("orderNumber"',
    ],
    [
      "missing-before-write-id-guard",
      "ПроверитьНеизменностьCloverIDПередЗаписью(Источник, Отказ);",
      "// Проверка неизменности Clover ID удалена",
    ],
  ];
  for (const [label, from, to] of mutations) {
    expectModuleRejected(label, mutateRequired(source, from, to, label));
  }

  const marker = "[CLOVER-ID:fixture-order-id]";
  const oldComment = `${marker}\nСтарый текст менеджера`;
  const editedComment = `${marker}\nНовый текст менеджера`;
  assert.equal(oldComment.split("\n", 1)[0], editedComment.split("\n", 1)[0]);
  assert.notEqual(oldComment, editedComment);
}

const reports = [];
for (const mod of MODULES) {
  reports.push(
    assertModuleConsistent(mod.file, mod.kind, {
      // Both contour templates must retain immutable-ID idempotency hardening.
      // The VLAVKA source is secretless and represents the production-tested
      // module with one explicit key placeholder.
      requireHardening: true,
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
