import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { renderDocx, createDocumentConverter } from "../src/documents/engine.js";
import { createDocumentStorage, inspectDocumentUpload } from "../src/documents/storage.js";
import { documentCapabilities } from "../src/documents/policy.js";

function fixture(body) {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`));
  return zip.toBuffer();
}
test("DOCX placeholders spanning styled runs preserve surrounding OOXML", () => {
  const body = '<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>До {{BUY</w:t></w:r><w:r><w:t>ER}} и {{DATE}} после</w:t></w:r></w:p>';
  const result = renderDocx(fixture(body), { BUYER: "ООО «Тест & сын»", DATE: "2026-10-05" });
  assert.equal(result.text, "До ООО «Тест & сын» и 2026-10-05 после");
  const xml = new AdmZip(result.buffer).readAsText("word/document.xml");
  assert.ok(xml.includes("<w:b/>")); assert.ok(xml.includes("<w:keepNext/>")); assert.ok(xml.includes("&amp;"));
  assert.throws(() => renderDocx(fixture(body), {}), /Не заполнена/);
  assert.throws(() => renderDocx(fixture('<w:p><w:r><w:t>{{BAD syntax}}</w:t></w:r></w:p>'), {}), /остались/);
  assert.throws(() => renderDocx(fixture('<w:p><w:r><w:t>Старый покупатель</w:t></w:r></w:p>'), {}, { previousClientTokens: ["Старый покупатель"] }), /исходного/);
});
test("uploads verify content; storage prevents traversal and detects corruption", () => {
  const root = mkdtempSync(path.resolve(".tmp/clover-document-store-"));
  const store = createDocumentStorage(path.join(root, "private"), [path.join(root, "uploads")]);
  assert.throws(() => createDocumentStorage(path.join(root, "uploads", "nested"), [path.join(root, "uploads")]), /вне публичного/);
  assert.throws(() => inspectDocumentUpload(Buffer.from("text"), "card.pdf"), /не соответствует/);
  assert.throws(() => inspectDocumentUpload(Buffer.from("text"), "card.exe"), /не поддерживается/);
  const data = Buffer.from("%PDF-fixture");
  const metadata = store.put(data, "pdf");
  assert.deepEqual(store.read(metadata.key, metadata.sha256), data);
  assert.throws(() => store.read("../escape.pdf"), /ключ/);
  assert.throws(() => store.read(metadata.key, "bad"), /целостности/);
});
test("capabilities default deny staff; ownership checked separately from grants", () => {
  assert.equal(documentCapabilities({ id: "c", role: "client" }, "other").view, false);
  assert.equal(documentCapabilities({ id: "c", role: "client" }, "c").create, false);
  assert.equal(documentCapabilities({ id: "m", role: "manager" }, "c", { assignedManagerId: "m" }).view, false);
  assert.equal(documentCapabilities({ id: "m", role: "manager" }, "c", { assignedManagerId: "other", grants: { m: ["view"] } }).view, false);
  assert.equal(documentCapabilities({ id: "m", role: "manager" }, "c", { assignedManagerId: "m", grants: { m: ["view"] } }).view, true);
  assert.equal(documentCapabilities({ id: "a", role: "admin", disabled_at: "date" }, "c").create, false);
});
test("missing converter is a clear blocking error", async () => {
  await assert.rejects(createDocumentConverter().convert(Buffer.from("docx")), /не настроен/);
});
