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

test('buyer legal form removes only the redundant adjacent paragraph in its own table cell', () => {
  const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  for (const [form,name] of [
    ['ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ','Общество с ограниченной ответственностью «Тест»'],
    ['ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ','ООО «Тест»'],
    ['ООО','ООО «Тест»'],
    ['ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ','Индивидуальный предприниматель Иванов Иван Иванович'],
    ['ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ','ИП Иванов Иван Иванович'],
    ['ИП','ИП Иванов Иван Иванович'],
  ]) {
    const prefix=p(form),nameParagraph=p('{{BUYER_FULL_NAME}}');
    const body=`<w:tbl><w:tr><w:tc>${prefix}${nameParagraph}</w:tc></w:tr></w:tbl>`;
    const result=renderDocx(fixture(body),{BUYER_FULL_NAME:name});
    const xml=new AdmZip(result.buffer).readAsText('word/document.xml');
    assert.equal(result.text,name);assert.equal((xml.match(/<w:p>/g)||[]).length,1);assert.ok(!xml.includes(prefix));
  }
});

test('buyer legal form handles multiline prefix and split styled runs while retaining name styling', () => {
  const prefix='<w:p><w:r><w:t>ОБЩЕ</w:t></w:r><w:r><w:t>СТВО С</w:t><w:br/><w:t>ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ</w:t></w:r></w:p>';
  const nameParagraph='<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>{{BUYER_</w:t></w:r><w:r><w:t>FULL_NAME}}</w:t></w:r></w:p>';
  const result=renderDocx(fixture(`<w:tbl><w:tr><w:tc>${prefix}\n${nameParagraph}</w:tc></w:tr></w:tbl>`),{BUYER_FULL_NAME:'ООО «Тест»'});
  const xml=new AdmZip(result.buffer).readAsText('word/document.xml');
  assert.equal(result.text,'ООО «Тест»');assert.ok(xml.includes('<w:keepNext/>'));assert.ok(xml.includes('<w:b/>'));assert.ok(!xml.includes(prefix));
});

test('buyer legal form keeps bare names, wrong forms, other text, supplier paragraphs and cross-cell prefixes', () => {
  const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const prefix=p('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ');
  const cases=[
    [prefix+p('{{BUYER_FULL_NAME}}'),'«Тест»'],
    [prefix+p('{{BUYER_FULL_NAME}}'),'ИП Иванов Иван Иванович'],
    [p('Индивидуальный предприниматель')+p('{{BUYER_FULL_NAME}}'),'ООО «Тест»'],
    [p('Для общества с ограниченной ответственностью условия сохраняются')+p('{{BUYER_FULL_NAME}}'),'ООО «Тест»'],
    [prefix+p('{{SUPPLIER_FULL_NAME}}'),'ООО «Тест»'],
    [prefix+p('Покупатель {{BUYER_FULL_NAME}}'),'ООО «Тест»'],
    [prefix+p('')+p('{{BUYER_FULL_NAME}}'),'ООО «Тест»'],
  ];
  for(const [paragraphs,name] of cases) {
    const result=renderDocx(fixture(`<w:tbl><w:tr><w:tc>${paragraphs}</w:tc></w:tr></w:tbl>`),{BUYER_FULL_NAME:name,SUPPLIER_FULL_NAME:'ООО «Поставщик»'});
    const first=paragraphs.slice(0,paragraphs.indexOf('</w:p>')+6);
    const text=[...first.matchAll(/<w:t>(.*?)<\/w:t>/g)].map(m=>m[1]).join('');
    assert.ok(result.text.startsWith(text));assert.equal((new AdmZip(result.buffer).readAsText('word/document.xml').match(/<w:p>/g)||[]).length,(paragraphs.match(/<w:p>/g)||[]).length);
  }
  const cross=renderDocx(fixture(`<w:tbl><w:tr><w:tc>${prefix}</w:tc><w:tc>${p('{{BUYER_FULL_NAME}}')}</w:tc></w:tr></w:tbl>`),{BUYER_FULL_NAME:'ООО «Тест»'});
  assert.ok(cross.text.startsWith('ОБЩЕСТВО'));assert.equal((new AdmZip(cross.buffer).readAsText('word/document.xml').match(/<w:p>/g)||[]).length,2);
  const outside=renderDocx(fixture(prefix+p('{{BUYER_FULL_NAME}}')),{BUYER_FULL_NAME:'ООО «Тест»'});
  assert.ok(outside.text.startsWith('ОБЩЕСТВО'));
});

test('IP multiline prefix is removed; nested cells and prefix drawings remain unchanged', () => {
  const p=text=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const ip='<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>ИНДИВИДУАЛЬНЫЙ</w:t><w:br/><w:t>ПРЕДПРИНИМАТЕЛЬ</w:t></w:r></w:p>';
  assert.equal(renderDocx(fixture(`<w:tbl><w:tr><w:tc>${ip}${p('{{BUYER_FULL_NAME}}')}</w:tc></w:tr></w:tbl>`),{BUYER_FULL_NAME:'ИП Иванов Иван Иванович'}).text,'ИП Иванов Иван Иванович');
  const prefix=p('ООО');
  const nested=`<w:tbl><w:tr><w:tc>${prefix}<w:tbl><w:tr><w:tc>${p('{{BUYER_FULL_NAME}}')}</w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>`;
  assert.ok(renderDocx(fixture(nested),{BUYER_FULL_NAME:'ООО «Тест»'}).text.startsWith('ОООООО'));
  const drawing='<w:p><w:r><w:t>ООО</w:t><w:drawing/></w:r></w:p>';
  const rendered=renderDocx(fixture(`<w:tbl><w:tr><w:tc>${drawing}${p('{{BUYER_FULL_NAME}}')}</w:tc></w:tr></w:tbl>`),{BUYER_FULL_NAME:'ООО «Тест»'});
  assert.ok(new AdmZip(rendered.buffer).readAsText('word/document.xml').includes('<w:drawing/>'));assert.ok(rendered.text.startsWith('ОООООО'));
});
