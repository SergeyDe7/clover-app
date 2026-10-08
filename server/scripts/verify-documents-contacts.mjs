import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import express from "express";
import { validContactEmails, validateCounterparty } from "../src/documents/validation.js";
import { renderDocx } from "../src/documents/engine.js";
import { applyDocumentsSchema } from "../src/documents/schema.js";
import { createDocumentsRepository } from "../src/documents/repository.js";
import { createDocumentStorage } from "../src/documents/storage.js";
import { createDocumentService } from "../src/documents/service.js";
import { createDocumentsRouter } from "../src/documents/router.js";

const contacts = "Генеральный директор Иванов В.В. vi@example.invalid\nДиректор по качеству Назаретян Э.А. e@example.invalid\nБухгалтерия buh@example.invalid";
function fixture(text = "{{BUYER_EMAIL}} действующего на основании {{BUYER_AUTHORITY_BASIS}} {{BUYER_EDO}}") {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`));
  return zip.toBuffer();
}
function party(type = "ooo") {
  return { type, fullName: "Проверочный покупатель", inn: type === "ip" ? "123456789047" : "1234567894", kpp: "123456789", ogrn: "1123456789015", ogrnip: "312345678901230", legalAddress: "Тестовый адрес", bankName: "Тестовый банк", bik: "123456789", settlementAccount: "1".repeat(20), correspondentAccount: "2".repeat(20), signerFullName: "Проверочный Подписант", signerPosition: "Директор", email: contacts };
}
function environment(config = {}, { failFirst = false, type = "ooo" } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT NOT NULL) STRICT; INSERT INTO users VALUES('admin','admin'),('client','client')");
  applyDocumentsSchema(db);
  const repo = createDocumentsRepository(db);
  const store = createDocumentStorage(mkdtempSync(path.resolve(".tmp/documents-contacts-")));
  repo.createLegalEntity({ id: "supplier", name: "Проверочный поставщик" });
  repo.createLegalEntityRevision({ entityId: "supplier", data: party(), actorId: "admin" });
  const approve = (nextConfig) => {
    const templateFile = store.put(fixture(), "docx");
    return repo.createTemplateVersion({ templateId: "fixture", entityId: "supplier", paymentType: "prepayment", storageKey: templateFile.key, sha256: templateFile.sha256, config: nextConfig, actorId: "admin" });
  };
  approve(config);
  repo.configureSequence({ nextNumber: 255, prefix: "1-636/" });
  let calls = 0; const generated = [];
  const service = createDocumentService({ repository: repo, storage: store, converter: { available: true, async convert(buffer) {
    calls++; generated.push(new AdmZip(buffer).readAsText("word/document.xml"));
    if (failFirst && calls === 1) throw Object.assign(new Error("Synthetic failure"), { code: "TEST_FAILURE" });
    return Buffer.from("%PDF-TEST-ONLY");
  } } });
  const payload = { legalEntityId: "supplier", counterparty: party(type), payment: { type: "prepayment" }, date: "2026-10-06", confirmed: true };
  const draft = () => repo.createDraft({ clientId: "client", entityId: payload.legalEntityId, actorId: "admin", idempotencyKey: "contact-fixture", counterparty: payload.counterparty, payment: payload.payment, date: payload.date });
  return { db, repo, store, service, payload, draft, approve, generated, calls: () => calls };
}

test("labelled multiline contacts and legacy email pass; malformed lists fail", () => {
  for (const value of [contacts, "simple@example.invalid", contacts.replaceAll("\n", "\r\n")]) assert.equal(validContactEmails(value), true);
  for (const value of ["", " ", "a@example.invalid\n", "a@example.invalid\n\nb@example.invalid", "Role invalid@", "Role a@example.invalid b@example.invalid", "a..b@example.invalid", "a@-bad.invalid", "Role\u0000 a@example.invalid", Array(21).fill("a@example.invalid").join("\n"), "x".repeat(161) + " a@example.invalid", "x".repeat(2001), 42]) assert.equal(validContactEmails(value), false, String(value));
  assert.equal(validateCounterparty(party()).errors.length, 0);
  assert.ok(validateCounterparty({ ...party(), email: "bad" }).errors.some(error => error.code === "EMAIL_INVALID"));
});

test("multiline contacts use real Word breaks, escape XML and preserve split styled runs", () => {
  const template = fixture("До {{BUY</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>ER_EMAIL}} после {{BUYER_AUTHORITY_BASIS}}");
  const labelled = "Директор &amp; <Тест> a@example.invalid\nБухгалтерия b@example.invalid\nКонтакт c@example.invalid";
  const result = renderDocx(template, { BUYER_EMAIL: labelled, BUYER_AUTHORITY_BASIS: "Устава" });
  const xml = new AdmZip(result.buffer).readAsText("word/document.xml");
  assert.equal((xml.match(/<w:br\/>/g) || []).length, 2);
  assert.ok(xml.includes("&amp;amp; &lt;Тест&gt;"));
  assert.ok(xml.includes("<w:b/>") && xml.includes("<w:i/>"));
  assert.equal(result.text, `До ${labelled} после Устава`);
  assert.ok(!xml.includes("{{"));
});

test("approved authority literal replaces hidden input for both buyer types", async () => {
  for (const [type, basis] of [["ooo", "Устава"], ["ip", "записи в едином государственном реестре индивидуальных предпринимателей"]]) {
    const env = environment({ blocks: { BUYER_AUTHORITY_BASIS: basis }, requiredBuyerFields: ["authorityBasis"] }, { type });
    try {
      assert.equal(env.service.validate(env.payload).valid, true);
      const draft = env.draft();
      const first = await env.service.generate(draft.id, "admin");
      assert.equal(first.status, "succeeded");
      assert.deepEqual(await env.service.generate(draft.id, "admin"), first);
      assert.equal(env.calls(), 1);
      assert.equal(env.repo.getSequence().next_number, 256);
      assert.equal(env.repo.getRevision(draft.id).snapshot.template.config.blocks.BUYER_AUTHORITY_BASIS, basis);
      assert.ok(env.generated[0].includes(`действующего на основании ${basis}`));
      for (const value of ["vi@example.invalid", "e@example.invalid", "buh@example.invalid", "Назаретян Э.А."]) assert.ok(env.generated[0].includes(value));
    } finally { env.db.close(); }
  }
});

test("missing, blank, nonliteral and conflicting authority block before numbering", async () => {
  for (const [config, explicit, expected] of [[{}, undefined, "AUTHORITY_BASIS_REQUIRED"], [{ blocks: { BUYER_AUTHORITY_BASIS: " " } }, undefined, "TEMPLATE_AUTHORITY_BASIS_INVALID"], [{ blocks: { BUYER_AUTHORITY_BASIS: "{{UNKNOWN}}" } }, undefined, "TEMPLATE_AUTHORITY_BASIS_INVALID"], [{ blocks: { BUYER_AUTHORITY_BASIS: "Устава" } }, "Доверенности", "AUTHORITY_BASIS_CONFLICT"]]) {
    const env = environment(config);
    try {
      if (explicit) env.payload.counterparty.authorityBasis = explicit;
      assert.ok(env.service.validate(env.payload).errors.some(error => error.code === expected));
      const draft = env.draft();
      await assert.rejects(env.service.generate(draft.id, "admin"), error => error.code === "DOCUMENT_VALIDATION");
      assert.equal(env.repo.getSequence().next_number, 255);
      assert.equal(env.repo.getDocument(draft.id).number, null);
      assert.equal(env.calls(), 0);
    } finally { env.db.close(); }
  }
});

test("legacy explicit authority stays valid and approved match is permitted", () => {
  for (const config of [{}, { blocks: { BUYER_AUTHORITY_BASIS: "Устава" } }]) {
    const env = environment(config);
    try { env.payload.counterparty.authorityBasis = "Устава"; assert.equal(env.service.validate(env.payload).valid, true); }
    finally { env.db.close(); }
  }
});

test("failed conversion retry keeps frozen authority and contacts after approval changes", async () => {
  const env = environment({ blocks: { BUYER_AUTHORITY_BASIS: "Устава" } }, { failFirst: true });
  try {
    const draft = env.draft();
    await assert.rejects(env.service.generate(draft.id, "admin"), error => error.code === "TEST_FAILURE");
    const snapshot = env.repo.getRevision(draft.id).snapshot;
    env.approve({ blocks: { BUYER_AUTHORITY_BASIS: "Новое основание" } });
    assert.equal((await env.service.generate(draft.id, "admin")).status, "succeeded");
    assert.deepEqual(env.repo.getRevision(draft.id).snapshot, snapshot);
    assert.equal(env.generated[0], env.generated[1]);
    assert.ok(env.generated[1].includes("Устава"));
    assert.equal(env.repo.getSequence().next_number, 256);
    assert.equal(env.calls(), 2);
  } finally { env.db.close(); }
});

test("ЭДО is optional, bounded and rejects invalid XML/control characters", () => {
  for (const edo of [undefined, "", " ", "СБИС, ID тестового участника\nОператор <Тест> & партнёр", "x".repeat(2000)]) assert.ok(!validateCounterparty({ ...party(), edo }).errors.some(error => error.field === "edo"));
  for (const edo of [null, 42, "x".repeat(2001), "test\u0000", "test\u007f", "test\ud800", "test\ufffe"]) assert.ok(validateCounterparty({ ...party(), edo }).errors.some(error => error.code === "EDO_INVALID"));
});

test("optional buyer ЭДО renders escaped labelled multiline value and emits no absent label", async () => {
  for (const edo of [undefined, "СБИС <Тест> & участник\nID: TEST-123"]) {
    const env = environment({ blocks: { BUYER_AUTHORITY_BASIS: "Устава" } });
    try {
      if (edo) env.payload.counterparty.edo = edo;
      assert.equal(env.service.validate(env.payload).valid, true);
      const draft = env.draft();
      assert.equal((await env.service.generate(draft.id, "admin")).status, "succeeded");
      const xml = env.generated[0];
      if (edo) {
        assert.ok(xml.includes("ЭДО: СБИС &lt;Тест&gt; &amp; участник"));
        assert.ok(xml.includes('<w:br/><w:t xml:space="preserve">ID: TEST-123'));
        assert.equal(env.repo.getRevision(draft.id).snapshot.counterparty.edo, edo);
      } else assert.ok(!xml.includes("ЭДО:"));
      assert.ok(!xml.includes("{{BUYER_EDO}}"));
    } finally { env.db.close(); }
  }
});

test("strict HTTP draft schema supports optional ЭДО and keeps unknown keys blocked", async () => {
  const env = environment({ blocks: { BUYER_AUTHORITY_BASIS: "Устава" } });
  const app = express(); app.use(express.json());
  app.use("/api/documents", createDocumentsRouter({ enabled: true, repository: env.repo, storage: env.store, service: env.service,
    authRequired: (req, _res, next) => { req.user = { id: "admin", role: "admin" }; next(); }, findUser: id => ({ id, role: id === "client" ? "client" : "admin" }) }));
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const request = counterparty => fetch(`http://127.0.0.1:${server.address().port}/api/documents/clients/client/validate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...env.payload, counterparty, idempotencyKey: "edo-validation" }),
  });
  try {
    const accepted = await request({ ...party(), edo: "СБИС, ID: TEST-123" });
    assert.equal(accepted.status, 200); assert.equal((await accepted.json()).valid, true);
    assert.equal((await request({ ...party(), edo: "x".repeat(2001) })).status, 400);
    const controls = await request({ ...party(), edo: "invalid\u0000" });
    assert.equal(controls.status, 200); assert.ok((await controls.json()).errors.some(error => error.code === "EDO_INVALID"));
    assert.equal((await request({ ...party(), unknownRequisite: "test" })).status, 400);
    assert.equal(env.repo.getSequence().next_number, 255);
  } finally { await new Promise(resolve => server.close(resolve)); env.db.close(); }
});


test("missing buyer contacts warn but allow confirmed generation even when template lists them required", async () => {
  const e=environment({requiredBuyerFields:['phone','email'],blocks:{BUYER_AUTHORITY_BASIS:'Устава'}});
  try {
    delete e.payload.counterparty.phone; delete e.payload.counterparty.email;
    const checked=e.service.validate(e.payload);
    assert.equal(checked.valid,true);
    assert.equal(checked.warnings.filter(item=>item.code==='CONTACT_OMITTED').length,2);
    assert.equal(e.service.validate({...e.payload,confirmed:false}).valid,false);
    e.payload.counterparty.email='invalid';assert.equal(e.service.validate(e.payload).valid,false);delete e.payload.counterparty.email;
    const draft=e.draft();assert.equal((await e.service.generate(draft.id,'admin')).status,'succeeded');
    assert(!e.generated[0].includes('{{BUYER_EMAIL}}'));
  } finally {e.db.close();}
});
test("empty contacts remove only pure labels, preserve EDO and contractual text", () => {
  const template=fixture('Тел.: {{BUYER_PHONE}}</w:t></w:r></w:p><w:p><w:r><w:t>e-mail: {{BUYER_EMAIL}}{{BUYER_EDO}}</w:t></w:r></w:p><w:p><w:r><w:t>Условие: телефон {{BUYER_PHONE}} согласован');
  const rendered=renderDocx(template,{BUYER_PHONE:'',BUYER_EMAIL:'',BUYER_EDO:'\nЭДО: Тест'});
  assert(!rendered.text.includes('Тел.:'));assert(!rendered.text.includes('e-mail:'));
  assert(rendered.text.includes('ЭДО: Тест'));assert(rendered.text.includes('Условие: телефон  согласован'));
});

test("label removal does not introduce an accepted template variable", () => {
  assert.throws(()=>renderDocx(fixture('{{EMPTY_CONTACT_LABEL}}'),{}),error=>error.code==='DOCUMENT_PLACEHOLDER');
});
