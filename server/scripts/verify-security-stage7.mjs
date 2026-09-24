import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import {
  normalizeMailAttachments,
  normalizeMailRecipients,
  reconciliationReadyEmail,
  verificationEmail,
} from "../src/mailer.js";
import {
  MATRIX_EXCEL_MAX_FILE_BYTES,
  MATRIX_EXCEL_MAX_ROWS,
  parseMatrixExcelFile,
} from "../../src/shared/matrixExcelImport.js";

const rootPackage = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8")
);
const serverPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

assert.equal(serverPackage.dependencies["@simplewebauthn/server"], "13.3.3");
assert.equal(serverPackage.dependencies["adm-zip"], "0.6.1");
assert.equal(serverPackage.dependencies.multer, "2.4.0");
assert.equal(serverPackage.dependencies.nodemailer, "7.0.13");
assert.equal(serverPackage.dependencies.sharp, "^0.35.4");
assert.equal(serverPackage.overrides.qs, "6.16.0");
assert.equal(rootPackage.dependencies.xlsx, "file:vendor/xlsx-0.20.3.tgz");
assert.equal(rootPackage.overrides.nanoid, "3.3.18");
assert.equal(rootPackage.overrides.postcss, "8.5.28");
assert.equal(XLSX.version, "0.20.3");

const sheetJsTarball = await readFile(
  new URL("../../vendor/xlsx-0.20.3.tgz", import.meta.url)
);
assert.equal(
  createHash("sha256").update(sheetJsTarball).digest("hex"),
  "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8"
);

const maliciousCompany = '<img src=x onerror="alert(1)"> & Clover';
const maliciousUrl = 'https://example.invalid/?next=" onclick="alert(1)';
const message = verificationEmail({
  companyName: maliciousCompany,
  verifyUrl: maliciousUrl,
});
assert.match(message.text, /<img src=x/);
assert.doesNotMatch(message.html, /<img\s/i);
assert.doesNotMatch(message.html, /href="[^"]*"\s+onclick=/i);
assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
assert.match(message.html, /next=&quot; onclick=&quot;alert\(1\)/);

assert.equal(
  normalizeMailRecipients("manager@example.com, client@example.org"),
  "manager@example.com, client@example.org"
);
assert.throws(
  () => normalizeMailRecipients("victim@example.com (nested(comment@example.net))"),
  /MAIL_RECIPIENT_INVALID/
);
assert.throws(
  () => normalizeMailRecipients("victim@example.com\r\nBcc: attacker@example.net"),
  /MAIL_RECIPIENT_INVALID/
);

const safeAttachment = normalizeMailAttachments([{
  filename: "act.pdf",
  content: Buffer.from("synthetic-pdf"),
  contentType: "application/pdf",
}]);
assert.equal(safeAttachment.length, 1);
assert.ok(Buffer.isBuffer(safeAttachment[0].content));
const { default: nodemailer } = await import("nodemailer");
const attachmentTransport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
});
const attachmentMessage = await attachmentTransport.sendMail({
  from: "clover@example.invalid",
  to: "client@example.invalid",
  subject: "Synthetic attachment verification",
  text: "Synthetic attachment verification",
  attachments: safeAttachment,
  disableFileAccess: true,
  disableUrlAccess: true,
});
assert.ok(Buffer.isBuffer(attachmentMessage.message));
assert.throws(
  () => normalizeMailAttachments([{ filename: "act.pdf", path: "C:/secret.txt" }]),
  /MAIL_ATTACHMENT_INVALID/
);

const reconciliationMessage = reconciliationReadyEmail({
  companyName: '<img src=x onerror="alert(1)">',
  period: '<script>alert(1)</script>',
});
assert.doesNotMatch(reconciliationMessage.html, /<img\s|<script/i);
assert.match(reconciliationMessage.html, /&lt;img src=x/);
assert.match(reconciliationMessage.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.throws(
  () => normalizeMailAttachments([{
    filename: "act.pdf\r\nBcc: attacker@example.net",
    content: Buffer.from("x"),
  }]),
  /MAIL_ATTACHMENT_INVALID/
);

const serverSource = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
assert.match(serverSource, /content:\s*await readFile\(req\.file\.path\)/u);
assert.doesNotMatch(serverSource, /attachments:\s*\[\{[^}]*\bpath:\s*req\.file\.path/su);

const releaseEnv = await readFile(
  new URL("../../releases/dc-prep-ac44dcf/server.env.for-dc", import.meta.url),
  "utf8"
);
for (const key of ["JWT_SECRET", "ONEC_PASSWORD", "ONEC_API_KEY"]) {
  const line = releaseEnv.split(/\r?\n/u).find((entry) => entry.startsWith(`${key}=`));
  assert.ok(line, `${key} must exist in the release environment template`);
  assert.ok(
    /^\w+=REPLACE_/u.test(line),
    `${key} must contain a non-secret server-side placeholder`
  );
}

let oversizedRead = false;
await assert.rejects(
  parseMatrixExcelFile({
    size: MATRIX_EXCEL_MAX_FILE_BYTES + 1,
    async arrayBuffer() {
      oversizedRead = true;
      return new ArrayBuffer(0);
    },
  }),
  (error) => error?.code === "EXCEL_FILE_TOO_LARGE"
);
assert.equal(oversizedRead, false, "oversized file must be rejected before allocation");

const csv = [
  "Название,Код",
  ...Array.from({ length: MATRIX_EXCEL_MAX_ROWS + 1 }, (_, index) =>
    `Товар ${index + 1},CODE-${index + 1}`
  ),
].join("\n");
const csvBytes = new TextEncoder().encode(csv);
assert.ok(csvBytes.byteLength < MATRIX_EXCEL_MAX_FILE_BYTES);
await assert.rejects(
  parseMatrixExcelFile({
    size: csvBytes.byteLength,
    async arrayBuffer() {
      return csvBytes.buffer;
    },
  }),
  (error) => error?.code === "EXCEL_RANGE_TOO_LARGE"
);

const headerlessCsv = Array.from(
  { length: MATRIX_EXCEL_MAX_ROWS + 1 },
  (_, index) => `Unrecognized ${index + 1},CODE-${index + 1}`
).join("\n");
const headerlessBytes = new TextEncoder().encode(headerlessCsv);
assert.ok(headerlessBytes.byteLength < MATRIX_EXCEL_MAX_FILE_BYTES);
await assert.rejects(
  parseMatrixExcelFile({
    size: headerlessBytes.byteLength,
    async arrayBuffer() {
      return headerlessBytes.buffer;
    },
  }),
  (error) => error?.code === "EXCEL_TOO_MANY_ROWS"
);

const headerlessAtLimitBytes = new TextEncoder().encode(
  Array.from(
    { length: MATRIX_EXCEL_MAX_ROWS },
    (_, index) => `Allowed ${index + 1},CODE-${index + 1}`
  ).join("\n")
);
const headerlessAtLimit = await parseMatrixExcelFile({
  size: headerlessAtLimitBytes.byteLength,
  async arrayBuffer() {
    return headerlessAtLimitBytes.buffer;
  },
});
assert.equal(headerlessAtLimit.rows.length, MATRIX_EXCEL_MAX_ROWS);

const sparseWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  sparseWorkbook,
  XLSX.utils.aoa_to_sheet([["Product"]]),
  "Sparse"
);
const sparseBaseBytes = XLSX.write(sparseWorkbook, { type: "array", bookType: "xlsx" });
const sparseZip = new AdmZip(Buffer.from(sparseBaseBytes));
const sparseSheetEntry = sparseZip.getEntry("xl/worksheets/sheet1.xml");
assert.ok(sparseSheetEntry);
const sparseSheetXml = sparseSheetEntry.getData().toString("utf8");
const sparseSheetWithHugeRange = sparseSheetXml.replace(
  /<dimension ref="[^"]+"\/>/u,
  '<dimension ref="A1:XFD1048576"/>'
);
assert.notEqual(sparseSheetWithHugeRange, sparseSheetXml);
sparseZip.updateFile(sparseSheetEntry, Buffer.from(sparseSheetWithHugeRange, "utf8"));
const sparseBytes = sparseZip.toBuffer();
assert.ok(sparseBytes.byteLength < MATRIX_EXCEL_MAX_FILE_BYTES);
await assert.rejects(
  parseMatrixExcelFile({
    size: sparseBytes.byteLength,
    async arrayBuffer() {
      return sparseBytes;
    },
  }),
  (error) => error?.code === "EXCEL_RANGE_TOO_LARGE"
);

const validCsv = new TextEncoder().encode("name,code\nProduct,ABC-1\n");
const parsed = await parseMatrixExcelFile({
  size: validCsv.byteLength,
  async arrayBuffer() {
    return validCsv.buffer;
  },
});
assert.deepEqual(parsed.rows, [{ name: "Product", code: "ABC-1" }]);

console.log("SECURITY_STAGE7_VERIFIER:PASS");
