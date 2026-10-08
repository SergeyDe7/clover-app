import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import express from "express";
import AdmZip from "adm-zip";
import XLSX from "xlsx";
import sharp from "sharp";
import { applyDocumentsSchema } from "../src/documents/schema.js";
import { createDocumentsRepository } from "../src/documents/repository.js";
import { createDocumentStorage } from "../src/documents/storage.js";
import { createDocumentService } from "../src/documents/service.js";
import { createDocumentsRouter } from "../src/documents/router.js";
import { createDocumentRuntime } from "../src/documents/runtime.js";
import { validInn } from "../src/documents/validation.js";
import { createDocumentsBackup, assertLegacyRestoreAllowed, assertClientDocumentDeletionAllowed } from "../src/documents/backup.js";

function counterparty(type) {
  const base = type === "ip" ? "1234567890" : "123456789";
  let inn;
  for (let n = 0; n < (type === "ip" ? 100 : 10); n++) {
    const candidate = base + String(n).padStart(type === "ip" ? 2 : 1, "0");
    if (validInn(candidate)) { inn = candidate; break; }
  }
  const registration = type === "ip" ? "31234567890123" : "112345678901";
  const check = String(BigInt(registration) % BigInt(type === "ip" ? 13 : 11) % 10n);
  return { type, fullName: type === "ip" ? "ИП Проверочный Покупатель" : "ООО «Проверка»", inn, kpp: type === "ooo" ? "123456789" : "",
    ogrnip: type === "ip" ? registration + check : "", ogrn: type === "ooo" ? registration + check : "", legalAddress: "Тестовый адрес",
    bankName: "Тестовый банк", bik: "123456789", settlementAccount: "1".repeat(20), correspondentAccount: "2".repeat(20),
    signerFullName: "Проверочный Покупатель", signerPosition: "Подписант", authorityBasis: "Тестовое основание" };
}
function template() {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{BUYER_FULL_NAME}} {{DOCUMENT_NUMBER}} {{DOCUMENT_DATE}} {{DOCUMENT_DATE_RU}} {{PAYMENT_DAYS}} {{PAYMENT_DAYS_WORDS}} {{PAYMENT_DAYS_UNIT}} {{PAYMENT_START_EVENT}}</w:t></w:r></w:p><w:p><w:r><w:t>{{SUPPLIER_FULL_NAME}} {{SUPPLIER_INN}} {{BUYER_INN}}</w:t></w:r></w:p></w:body></w:document>'));
  return zip.toBuffer();
}
const actors = { admin: { id: "admin", role: "admin" }, client: { id: "client", role: "client" }, other: { id: "other", role: "client" }, manager: { id: "manager", role: "manager" } };
const auth = (req, res, next) => { req.user = actors[req.headers["x-test-actor"]]; if (!req.user) return res.status(401).end(); next(); };

test("admin entities are inactive until all variants exist, scoped and preserve historic snapshots",async()=>{
  const env=await environment();
  try {
    for(const actor of ["manager","client"]) {
      assert.equal((await env.request("/admin/legal-entities",actor)).status,403);
      assert.equal((await env.request("/admin/legal-entities",actor,{id:"extra-ip",name:"ИП Новый",data:counterparty("ip"),approved:true})).status,403);
      assert.equal((await env.request("/admin/legal-entities/supplier-ip/activation",actor,{active:false,confirmed:true})).status,403);
    }
    const original=await (await env.request("/clients/client/drafts","admin",input("supplier-ip","ip"))).json();
    assert.equal((await env.request(`/${original.document.id}/generate`,"admin",{})).status,200);
    const snapshot=env.repo.getRevision(original.document.id).snapshot;
    const create=await env.request("/admin/legal-entities","admin",{id:"extra-ip",name:"ИП Новый",data:counterparty("ip"),approved:true});
    assert.equal(create.status,201,await create.clone().text());
    const listed=await (await env.request("/admin/legal-entities")).json();
    assert.equal(listed.legalEntities.find(e=>e.id==="extra-ip").active,false);
    assert(!JSON.stringify(listed).includes("storage_key"));
    assert(!env.repo.listLegalEntities().some(e=>e.id==="extra-ip"));
    assert.equal((await env.request("/admin/legal-entities/extra-ip/activation","admin",{active:true,confirmed:true})).status,422);
    for(const paymentType of ["prepayment","postpayment"]) for(const buyerType of ["ip","ooo"]) {
      const form=new FormData();form.append("file",new Blob([template()]),"approved.docx");
      for(const [key,value] of Object.entries({templateId:`extra-${paymentType}-${buyerType}`,entityId:"extra-ip",paymentType,approved:"true",config:JSON.stringify({blocks:{BUYER_AUTHORITY_BASIS:"подтверждённое основание"},previousClientTokens:[],buyerTypes:[buyerType],supplierTypes:["ip"]})}))form.append(key,value);
      const response=await env.request("/admin/templates","admin",form);assert.equal(response.status,201,await response.clone().text());
    }
    assert.equal((await env.request("/admin/legal-entities/extra-ip/activation","admin",{active:true,confirmed:false})).status,400);
    assert.equal((await env.request("/admin/legal-entities/extra-ip/activation","admin",{active:true,confirmed:true})).status,200);
    assert(env.repo.listLegalEntities().some(e=>e.id==="extra-ip"));
    assert.equal((await env.request("/admin/legal-entities/supplier-ip/activation","admin",{active:false,confirmed:true})).status,200);
    const changed={...counterparty("ip"),fullName:"ИП Обновлённый"};
    assert.equal((await env.request("/admin/legal-entities","admin",{id:"supplier-ip",name:changed.fullName,data:changed,approved:true})).status,201);
    assert.equal(env.repo.listLegalEntities({includeInactive:true}).find(e=>e.id==="supplier-ip").name,changed.fullName);
    assert.deepEqual(env.repo.getRevision(original.document.id).snapshot,snapshot);
    assert.equal((await env.request("/admin/legal-entities/missing/activation","admin",{active:true,confirmed:true})).status,404);
  } finally {await env.close();}
});

test("template upload rejects unknown and malformed placeholders and mismatched supplier before storing",async()=>{
 const env=await environment();
 try {
  for(const [content,supplierTypes,expected] of [["{{UNKNOWN_FIELD}}",["ip"],"DOCUMENT_PLACEHOLDER"],["{{BUYER_fullName}}",["ip"],"DOCUMENT_PLACEHOLDER"],["{{BUYER_FULL_NAME}}",["ooo"],"TEMPLATE_SUPPLIER_TYPE_MISMATCH"],["Статический договор с прежним покупателем",["ip"],"TEMPLATE_VARIABLES_REQUIRED"]]) {
    const zip=new AdmZip(template());zip.updateFile("word/document.xml",Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body></w:document>`));
    const before=env.repo.listTemplateVersions("supplier-ip").length;
    const form=new FormData();form.append("file",new Blob([zip.toBuffer()]),"bad.docx");
    for(const [key,value] of Object.entries({templateId:"bad",entityId:"supplier-ip",paymentType:"prepayment",approved:"true",config:JSON.stringify({blocks:{BUYER_AUTHORITY_BASIS:"Тестовое основание"},previousClientTokens:[],supplierTypes})}))form.append(key,value);
    const response=await env.request("/admin/templates","admin",form);assert.equal(response.status,422);assert.equal((await response.json()).code,expected);
    assert.equal(env.repo.listTemplateVersions("supplier-ip").length,before);
  }
 } finally {await env.close();}
});

test("admin template samples produce DOCX/PDF without reserving numbers or storing contracts",async()=>{
 const env=await environment(true,{approvedTemplateBasis:true});
 try {
  const version=env.repo.findTemplateVersion("supplier-ip","postpayment","ip");
  const before=env.repo.getSequence().next_number;
  for(const actor of ["manager","client"])assert.equal((await env.request(`/admin/templates/${version.id}/preview`,actor,{buyerType:"ip",format:"pdf"})).status,403);
  const docx=await env.request(`/admin/templates/${version.id}/preview`,"admin",{buyerType:"ip",format:"docx"});
  assert.equal(docx.status,200,await docx.clone().text());
  const xml=new AdmZip(Buffer.from(await docx.arrayBuffer())).readAsText("word/document.xml");
  assert(xml.includes("ОБРАЗЕЦ") && xml.includes("Проверочный образец"));
  const pdf=await env.request(`/admin/templates/${version.id}/preview`,"admin",{buyerType:"ip",format:"pdf"});
  assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),"%PDF-");
  assert.equal(env.repo.getSequence().next_number,before);assert.equal(env.repo.listDocuments("client").length,0);
 } finally{await env.close();}
 const disabled=await environment(false,{approvedTemplateBasis:true});
 try{const version=disabled.repo.findTemplateVersion("supplier-ip","prepayment","ip");assert.equal((await disabled.request(`/admin/templates/${version.id}/preview`,"admin",{buyerType:"ip",format:"pdf"})).status,503);}finally{await disabled.close();}
});

test("admin refuses postpayment clauses lacking delivery start or referring to prepayment",async()=>{
 const env=await environment();
 try{
  for(const [change,expected] of [[xml=>xml.replace("{{PAYMENT_START_EVENT}}",""),"PAYMENT_START_REQUIRED"],[xml=>xml.replace("{{PAYMENT_START_EVENT}}","{{PAYMENT_START_EVENT}} после предоплаты"),"PAYMENT_CLAUSE_CONFLICT"]]) {
    const zip=new AdmZip(template());zip.updateFile("word/document.xml",Buffer.from(change(zip.readAsText("word/document.xml"))));
    const form=new FormData();form.append("file",new Blob([zip.toBuffer()]),"bad-postpayment.docx");
    for(const [key,value] of Object.entries({templateId:"bad-post",entityId:"supplier-ip",paymentType:"postpayment",approved:"true",config:JSON.stringify({blocks:{BUYER_AUTHORITY_BASIS:"Тестовое основание"},previousClientTokens:[],buyerTypes:["ip"],supplierTypes:["ip"]})}))form.append(key,value);
    const response=await env.request("/admin/templates","admin",form);assert.equal(response.status,422);assert.equal((await response.json()).code,expected);
  }
 }finally{await env.close();}
});

test("failed legal entity approval atomically preserves active entity and never leaves a new orphan",async()=>{
 const env=await environment();
 try{
  const before=env.repo.listLegalEntities({includeInactive:true});
  const count=env.db.prepare("SELECT count(*) AS count FROM legal_entity_revisions").get().count;
  for(const id of ["supplier-ip","new-orphan"]) assert.throws(()=>env.repo.saveApprovedLegalEntity({id,name:"Изменённое название",data:counterparty("ip"),actorId:"not-an-existing-user"}));
  assert.deepEqual(env.repo.listLegalEntities({includeInactive:true}),before);
  assert.equal(env.db.prepare("SELECT count(*) AS count FROM legal_entity_revisions").get().count,count);
 }finally{await env.close();}
});

test("admin rejects absent or variable authority basis on upload, preview and activation",async()=>{
 const env=await environment();
 try{
  for(const basis of [undefined,"","{{BUYER_AUTHORITY_BASIS}}","${authority}"]) {
    const form=new FormData();form.append("file",new Blob([template()]),"approved.docx");
    const blocks=basis===undefined?{}:{BUYER_AUTHORITY_BASIS:basis};
    for(const [key,value] of Object.entries({templateId:"basis",entityId:"supplier-ip",paymentType:"prepayment",approved:"true",config:JSON.stringify({blocks,previousClientTokens:[],buyerTypes:["ip"],supplierTypes:["ip"]})}))form.append(key,value);
    const response=await env.request("/admin/templates","admin",form);assert.equal(response.status,422);assert.equal((await response.json()).code,"TEMPLATE_AUTHORITY_BASIS_INVALID");
  }
  const version=env.repo.findTemplateVersion("supplier-ip","prepayment","ip");
  const preview=await env.request(`/admin/templates/${version.id}/preview`,"admin",{buyerType:"ip",format:"docx"});assert.equal(preview.status,422);assert.equal((await preview.json()).code,"TEMPLATE_AUTHORITY_BASIS_INVALID");
  env.repo.setLegalEntityActive("supplier-ip",false);
  const activation=await env.request("/admin/legal-entities/supplier-ip/activation","admin",{active:true,confirmed:true});assert.equal(activation.status,422);assert.equal((await activation.json()).code,"TEMPLATE_AUTHORITY_BASIS_INVALID");
  assert(!env.repo.listLegalEntities().some(entity=>entity.id==="supplier-ip"));
 }finally{await env.close();}
});

test("approved template publication rolls back when deactivation fails",async()=>{
 const env=await environment();
 try{
  const oldTemplates=env.repo.listTemplateVersions("supplier-ip");
  const oldEntity=env.repo.listLegalEntities({includeInactive:true}).find(entity=>entity.id==="supplier-ip");
  env.db.exec("CREATE TRIGGER test_entity_disable_fail BEFORE UPDATE ON legal_entities BEGIN SELECT RAISE(ABORT,'TEST_DISABLE_FAILED'); END;");
  const file=env.store.put(template(),"docx");
  assert.throws(()=>env.repo.publishApprovedTemplate({templateId:"atomic",entityId:"supplier-ip",paymentType:"prepayment",storageKey:file.key,sha256:file.sha256,config:{blocks:{BUYER_AUTHORITY_BASIS:"Тестовое основание"}},actorId:"admin"}),/TEST_DISABLE_FAILED/);
  assert.deepEqual(env.repo.listTemplateVersions("supplier-ip"),oldTemplates);
  assert.deepEqual(env.repo.listLegalEntities({includeInactive:true}).find(entity=>entity.id==="supplier-ip"),oldEntity);
 }finally{await env.close();}
});

test("saved draft review is create-scoped, reports grammar warnings and changes neither draft nor snapshots",async()=>{
 const env=await environment(true,{documentConfig:{clientCreate:true}});
 try{
  const payload={...input("supplier-ip","ip"),counterparty:{...counterparty("ip"),signerFullName:"Ким Сергей Иванович",signerFullNameGenitive:"Ким Сергей Иванович",signerPosition:"Индивидуальный предприниматель",signerPositionGenitive:"Индивидуального предпринимателя"}};
  const created=await env.request("/clients/client/drafts","admin",payload);assert.equal(created.status,201);const {document}=await created.json();
  const stored=env.repo.getDocument(document.id);const numberBefore=env.repo.getSequence().next_number;
  for(const actor of ["other","manager"])assert.equal((await env.request(`/${document.id}/review`,actor)).status,403);
  const own=await env.request(`/${document.id}/review`,"client");assert.equal(own.status,200);const review=await own.json();
  assert.equal(review.id,document.id);assert.deepEqual(review.counterparty,payload.counterparty);assert.equal(review.checks.fields.find(item=>item.field==="signerFullNameGenitive").status,"needs_review");
  assert(!JSON.stringify(review).includes("storageKey"));assert(!JSON.stringify(review).includes("storage_key"));
  assert.deepEqual(env.repo.getDocument(document.id),stored);assert.equal(env.repo.getSequence().next_number,numberBefore);assert.equal(env.repo.getRevision(document.id),null);
  assert.equal((await env.request(`/${document.id}/generate`,"admin",{})).status,200);
  const snapshot=env.repo.getRevision(document.id).snapshot;
  assert.equal((await env.request(`/${document.id}/review`,"admin")).status,200);assert.deepEqual(env.repo.getRevision(document.id).snapshot,snapshot);
 }finally{await env.close();}
});
async function environment(converterAvailable = true, { seedTemplates = true, conversionFailures = 0, documentConfig = {}, clientLinks = {}, approvedTemplateBasis=false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT NOT NULL) STRICT");
  for (const actor of Object.values(actors)) db.prepare("INSERT INTO users VALUES(?,?)").run(actor.id, actor.role);
  applyDocumentsSchema(db);
  const repo = createDocumentsRepository(db);
  const root = mkdtempSync(path.resolve(".tmp/documents-api-"));
  const store = createDocumentStorage(root);
  for (const entityId of ["supplier-ip", "supplier-ooo"]) {
    repo.createLegalEntity({ id: entityId, name: "Проверочный поставщик" });
    repo.createLegalEntityRevision({ entityId, data: counterparty(entityId === "supplier-ip" ? "ip" : "ooo"), actorId: "admin" });
    if (!seedTemplates) continue;
    for (const paymentType of ["prepayment", "postpayment"]) {
      const file = store.put(template(), "docx");
      repo.createTemplateVersion({ templateId: "fixture", entityId, paymentType, storageKey: file.key, sha256: file.sha256, config: approvedTemplateBasis?{blocks:{BUYER_AUTHORITY_BASIS:"Тестовое основание"}}:{}, actorId: "admin" });
    }
  }
  repo.configureSequence({ nextNumber: 255 });
  let conversions = 0;
  const converter = { available: converterAvailable, async convert(docx) { conversions++; assert.ok(new AdmZip(docx).readAsText("word/document.xml").includes("Провер")); if (conversions <= conversionFailures) throw Object.assign(new Error("Тестовая ошибка конвертации."),{code:"TEST_CONVERSION_FAILED"}); return Buffer.from("%PDF-TEST-ONLY"); } };
  const service = createDocumentService({ repository: repo, storage: store, converter });
  const audit = [];
  const app = express(); app.use(express.json({ limit: "256kb" }));
  app.use("/api/documents", createDocumentsRouter({ enabled: true, repository: repo, storage: store, service, authRequired: auth,
    findUser: (id) => actors[id], clientLink: (id) => clientLinks[id] || ({ personalManagerId: "manager" }), config: {fileValidatorPython:"C:/Users/Lonovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",...documentConfig}, audit: (_req, event, details) => audit.push({ event, details }) }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api/documents`;
  const request = (url, actor = "admin", body, method = body ? "POST" : "GET") => fetch(base + url, { method, headers: { "x-test-actor": actor, ...(body instanceof FormData ? {} : body ? { "Content-Type": "application/json" } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { repo, store, request, audit, db, root, conversions: () => conversions, async close() { await new Promise((resolve) => server.close(resolve)); db.close(); } };
}
function input(entity, type, payment = { type: "prepayment", days: null }) {
  return { legalEntityId: entity, date: "2026-10-05", payment, counterparty: counterparty(type), confirmed: true, idempotencyKey: `${entity}-${type}-${payment.type}-${payment.days}` };
}

test("HTTP contracts cover four party combinations, postpayment variants and idempotent output", async () => {
  const env = await environment();
  try {
    for (const entity of ["supplier-ip", "supplier-ooo"]) for (const type of ["ip", "ooo"]) {
      for (const payment of [{ type: "prepayment", days: null }, ...[7,10,14,21,30].map((days) => ({ type: "postpayment", days }))]) {
        const response = await env.request("/clients/client/drafts", "admin", input(entity, type, payment));
        assert.equal(response.status, 201, await response.clone().text());
        const { document } = await response.json();
        const generated = await env.request(`/${document.id}/generate`, "admin", {});
        assert.equal(generated.status, 200, await generated.clone().text());
        const first = await generated.json();
        const retry = await env.request(`/${document.id}/generate`, "admin", {});
        assert.deepEqual(await retry.json(), first);
        assert.equal(env.repo.getDocument(document.id).files.length, 2);
        const revision = env.repo.getRevision(document.id);
        if (payment.type === "postpayment") {
          assert.equal(revision.snapshot.payment.startEvent, "delivery");
          const docxFile = env.repo.getDocument(document.id).files.find((file) => file.type === "docx");
          const downloaded = await env.request(`/${document.id}/files/${docxFile.id}`, "client");
          const xml = new AdmZip(Buffer.from(await downloaded.arrayBuffer())).readAsText("word/document.xml");
          assert.ok(xml.includes("момента поставки товара"));
        }
      }
    }
    assert.equal(env.conversions(), 24);
    const list = await (await env.request("/clients/client", "client")).json();
    assert.equal(list.documents.length, 24); assert.equal(list.documents[0].number, "255");
    assert.ok(!JSON.stringify(list).includes("storage_key")); assert.ok(!JSON.stringify(list).includes("request_json"));
  } finally { await env.close(); }
});

test("one IP/OOO numbering sequence preserves the owner's format and safe download names", async () => {
  const env = await environment();
  try {
    assert.equal((await env.request("/admin/sequence", "client", {})).status, 403);
    assert.equal((await env.request("/admin/sequence", "admin", {})).status, 200);
    const { document } = await (await env.request("/clients/client/drafts", "admin", input("supplier-ip", "ip"))).json();
    assert.equal((await env.request(`/${document.id}/generate`, "admin", {})).status, 200);
    assert.equal(env.repo.getDocument(document.id).number, "1-636/255");
    for (const file of env.repo.getDocument(document.id).files) {
      assert.ok(file.name.startsWith("Договор_1-636_255."));
      assert.ok(!file.name.includes("/"));
      const download = await env.request(`/${document.id}/files/${file.id}`, "client");
      assert.equal(download.status, 200);
      assert.ok(download.headers.get("content-disposition").includes("1-636_255"));
    }
    const { document: second } = await (await env.request("/clients/client/drafts", "admin", input("supplier-ooo", "ooo"))).json();
    assert.equal((await env.request(`/${second.id}/generate`, "admin", {})).status, 200);
    assert.equal(env.repo.getDocument(second.id).number, "1-636/256");
    const thirdInput = { ...input("supplier-ip", "ip"), idempotencyKey: "third-independent-contract" };
    const { document: third } = await (await env.request("/clients/client/drafts", "admin", thirdInput)).json();
    assert.equal((await env.request(`/${third.id}/generate`, "admin", {})).status, 200);
    assert.equal(env.repo.getDocument(third.id).number, "1-636/257");
    assert.equal((await env.request(`/${document.id}/generate`, "admin", {})).status, 200);
    assert.equal(env.repo.getDocument(document.id).number, "1-636/255");
    assert.equal((await env.request("/admin/sequence", "admin", {})).status, 422);
    assert.equal(env.repo.getDocument(document.id).number, "1-636/255");
  } finally { await env.close(); }
});
test("HTTP ownership, upload signature, XLS extraction, signed versions and audit", async () => {
  const env = await environment();
  try {
    assert.equal((await env.request("/clients/client", "other")).status, 403);
    assert.equal((await env.request("/clients/client", "manager")).status, 403);
    assert.equal((await env.request("/clients/client/drafts", "client", input("supplier-ip", "ip"))).status, 403);
    const file = new FormData(); file.append("file", new Blob(["wrong"]), "card.pdf");
    assert.equal((await env.request("/clients/client/imports", "admin", file)).status, 422);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["ИНН", counterparty("ip").inn]]), "Карточка");
    const binary = XLSX.write(workbook, { type: "buffer", bookType: "biff8" });
    const xls = new FormData(); xls.append("file", new Blob([binary]), "card.xls");
    const parsed = await env.request("/clients/client/imports", "admin", xls);
    assert.equal(parsed.status, 201, await parsed.clone().text());
    const imported = await parsed.json(); assert.equal(imported.fields.inn, counterparty("ip").inn);
    assert.equal((await env.request(`/imports/${imported.id}`, "other")).status, 403);
    const { document } = await (await env.request("/clients/client/drafts", "admin", input("supplier-ip", "ip"))).json();
    await env.request(`/${document.id}/generate`, "admin", {});
    const output = env.repo.getDocument(document.id).files[0];
    assert.equal((await env.request(`/${document.id}/files/${output.id}`, "other")).status, 403);
    const download = await env.request(`/${document.id}/files/${output.id}`, "client");
    assert.equal(download.status, 200); assert.equal(download.headers.get("cache-control"), "no-store");
    const signed = new FormData(); signed.append("file", new Blob([await sharp({create:{width:2,height:2,channels:3,background:"white"}}).png().toBuffer()]), "Подписанный.png"); signed.append("date", "2026-10-05");
    assert.equal((await env.request(`/${document.id}/signed-files`, "admin", signed)).status, 200);
    assert.equal(env.repo.getDocument(document.id).status, "signed");
    assert.ok(env.audit.some(({ event }) => event === "document.requisites.confirm"));
  } finally { await env.close(); }
});
test("draft survives unavailable converter; generation remains blocked", async () => {
  const env = await environment(false);
  try {
    const payload = input("supplier-ip", "ip");
    const check = await (await env.request("/clients/client/validate", "admin", payload)).json();
    assert.equal(check.valid, false); assert.ok(check.errors.some(({ code }) => code === "CONVERTER_NOT_CONFIGURED"));
    const response = await env.request("/clients/client/drafts", "admin", payload);
    assert.equal(response.status, 201);
    const { document } = await response.json();
    assert.equal((await env.request(`/${document.id}/generate`, "admin", {})).status, 422);
    assert.equal(env.repo.getDocument(document.id).files.length, 0);
  } finally { await env.close(); }
});
test("approved template party types and manually confirmed genitive are enforced only on generation", async () => {
  const env = await environment(true,{seedTemplates:false});
  try {
    function restrict(entityId, config) {
      const zip = new AdmZip(template());
      const xml = zip.readAsText("word/document.xml").replace("{{BUYER_FULL_NAME}}", "{{BUYER_FULL_NAME}} {{BUYER_SIGNER_FULL_NAME_GENITIVE}} {{SUPPLIER_SIGNER_FULL_NAME_GENITIVE}}");
      zip.updateFile("word/document.xml",Buffer.from(xml));
      const file = env.store.put(zip.toBuffer(),"docx");
      env.repo.createTemplateVersion({templateId:"restricted-ip-template",entityId,paymentType:"prepayment",storageKey:file.key,sha256:file.sha256,config,actorId:"admin"});
    }
    restrict("supplier-ip", {buyerTypes:["ip"],supplierTypes:["ip"],requiredBuyerFields:["signerFullNameGenitive"],requiredSupplierFields:["signerFullNameGenitive"]});
    const wrongBuyer = await (await env.request("/clients/client/validate","admin",input("supplier-ip","ooo"))).json();
    assert(wrongBuyer.errors.some(error => error.field === "counterparty.type" && error.code === "TEMPLATE_BUYER_TYPE_MISMATCH"));
    const payload = input("supplier-ip","ip");
    const missing = await (await env.request("/clients/client/validate","admin",payload)).json();
    assert(missing.errors.some(error => error.field === "counterparty.signerFullNameGenitive" && error.code === "TEMPLATE_BUYER_FIELD_REQUIRED"));
    assert(missing.errors.some(error => error.field === "legalEntity.signerFullNameGenitive" && error.code === "TEMPLATE_SUPPLIER_FIELD_REQUIRED"));
    const draft = await env.request("/clients/client/drafts","admin",payload);
    assert.equal(draft.status,201);
    const document = (await draft.json()).document;
    assert.equal((await env.request(`/${document.id}/generate`,"admin",{})).status,422);
    assert.equal(env.repo.getDocument(document.id).number,null);
    payload.counterparty.signerFullNameGenitive = "Проверочного Покупателя";
    env.repo.createLegalEntityRevision({entityId:"supplier-ip",data:{...counterparty("ip"),signerFullNameGenitive:"Проверочного Поставщика"},actorId:"admin"});
    const supplied = await env.request("/clients/client/validate","admin",payload);
    assert.equal(supplied.status,200);
    assert.equal((await supplied.json()).valid,true);
    payload.idempotencyKey += "-with-confirmed-genitive";
    const completed = (await (await env.request("/clients/client/drafts","admin",payload)).json()).document;
    assert.equal((await env.request(`/${completed.id}/generate`,"admin",{})).status,200);
    const output = env.repo.getDocument(completed.id).files.find(file => file.type === "docx");
    const xml = new AdmZip(Buffer.from(await (await env.request(`/${completed.id}/files/${output.id}`,"client")).arrayBuffer())).readAsText("word/document.xml");
    assert(xml.includes("Проверочного Покупателя Проверочного Поставщика"));
    restrict("supplier-ooo",{supplierTypes:["ip"]});
    const wrongSupplier = await (await env.request("/clients/client/validate","admin",input("supplier-ooo","ip"))).json();
    assert(wrongSupplier.errors.some(error => error.field === "legalEntityId" && error.code === "TEMPLATE_SUPPLIER_TYPE_MISMATCH"));
  } finally { await env.close(); }
});
test("admin template schema accepts explicit party restrictions and supported contact fields only", async () => {
  const env = await environment();
  try {
    const upload = config => {
      const form = new FormData(); form.append("file",new Blob([template()]),"template.docx");
      for (const [key,value] of Object.entries({templateId:"narrow",entityId:"supplier-ip",paymentType:"prepayment",approved:"true",config:JSON.stringify(config)})) form.append(key,value);
      return env.request("/admin/templates","admin",form);
    };
    const config = {blocks:{BUYER_AUTHORITY_BASIS:"Тестовое основание"},previousClientTokens:[],buyerTypes:["ip"],supplierTypes:["ip"],requiredBuyerFields:["signerFullNameGenitive","signerPositionGenitive","phone","email"],requiredSupplierFields:["signerFullNameGenitive","accountingPhone","phone","email"]};
    const accepted = await upload(config);
    assert.equal(accepted.status,201,await accepted.clone().text());
    const stored = env.repo.getTemplateVersion((await accepted.json()).id).config;
    assert.deepEqual(stored.requiredSupplierFields,config.requiredSupplierFields);
    assert.equal(env.repo.listLegalEntities().some(entity=>entity.id==="supplier-ip"),false);
    // Isolated validation fixture re-enables it to exercise missing-field errors separately.
    env.repo.setLegalEntityActive("supplier-ip",true);
    assert.equal((await upload({...config,buyerTypes:[]})).status,400);
    assert.equal((await upload({...config,supplierTypes:["unknown"]})).status,400);
    assert.equal((await upload({...config,requiredBuyerFields:["unknownField"]})).status,400);
    const payload = {...input("supplier-ip","ip"),counterparty:{...counterparty("ip"),signerFullNameGenitive:"Проверочного Покупателя",phone:"+70000000000",email:"buyer@example.invalid"}};
    const missing = await (await env.request("/clients/client/validate","admin",payload)).json();
    assert(missing.errors.some(error => error.field === "legalEntity.accountingPhone"));
    assert(missing.errors.some(error => error.field === "counterparty.signerPositionGenitive"));
    payload.counterparty.signerPositionGenitive = "Подписанта";
    env.repo.createLegalEntityRevision({entityId:"supplier-ip",data:{...counterparty("ip"),signerFullNameGenitive:"Проверочного Поставщика",phone:"+70000000001",accountingPhone:"+70000000002",email:"supplier@example.invalid"},actorId:"admin"});
    assert.equal((await (await env.request("/clients/client/validate","admin",payload)).json()).valid,true);
  } finally { await env.close(); }
});
test("DOCX exposes Russian date without changing the stored ISO date", async () => {
  const env = await environment();
  try {
    const { document } = await (await env.request("/clients/client/drafts","admin",input("supplier-ip","ip"))).json();
    assert.equal((await env.request(`/${document.id}/generate`,"admin",{})).status,200);
    const output = env.repo.getDocument(document.id).files.find(file => file.type === "docx");
    const buffer = Buffer.from(await (await env.request(`/${document.id}/files/${output.id}`,"client")).arrayBuffer());
    const xml = new AdmZip(buffer).readAsText("word/document.xml");
    assert(xml.includes("2026-10-05 05.10.2026"));
    assert.equal(env.repo.getRevision(document.id).snapshot.date,"2026-10-05");
  } finally { await env.close(); }
});
test("generated postpayment DOCX agrees calendar-day units for 1, 21 and 7 days", async () => {
  const env = await environment();
  try {
    for (const [days,wording] of [[1,"1 одного календарного дня"],[21,"21 двадцати одного календарного дня"],[7,"7 семи календарных дней"]]) {
      const {document} = await (await env.request("/clients/client/drafts","admin",input("supplier-ip","ip",{type:"postpayment",days}))).json();
      assert.equal((await env.request(`/${document.id}/generate`,"admin",{})).status,200);
      const output = env.repo.getDocument(document.id).files.find(file => file.type === "docx");
      const xml = new AdmZip(Buffer.from(await (await env.request(`/${document.id}/files/${output.id}`,"client")).arrayBuffer())).readAsText("word/document.xml");
      assert(xml.includes(wording));
      assert.equal(env.repo.getRevision(document.id).snapshot.payment.days,days);
    }
  } finally { await env.close(); }
});
test("buyer-specific versions select the latest compatible template independently of publication order", async () => {
  const env = await environment(true,{seedTemplates:false});
  try {
    function register(entityId,buyerType,marker) {
      const zip = new AdmZip(template());
      zip.updateFile("word/document.xml",Buffer.from(zip.readAsText("word/document.xml").replace("{{BUYER_FULL_NAME}}",`${marker} {{BUYER_FULL_NAME}}`)));
      const file = env.store.put(zip.toBuffer(),"docx");
      return env.repo.createTemplateVersion({templateId:`variant-${buyerType}`,entityId,paymentType:"prepayment",storageKey:file.key,sha256:file.sha256,config:{buyerTypes:[buyerType]},actorId:"admin"});
    }
    const oldIP = register("supplier-ip","ip","ИП первая версия");
    const ooo = register("supplier-ip","ooo","ООО версия");
    assert.equal(env.repo.findTemplateVersion("supplier-ip","prepayment","ip").id,oldIP);
    assert.equal(env.repo.findTemplateVersion("supplier-ip","prepayment","ooo").id,ooo);
    assert.equal(env.repo.findTemplateVersion("supplier-ip","prepayment").id,ooo);
    const newIP = register("supplier-ip","ip","ИП вторая версия");
    assert.equal(env.repo.findTemplateVersion("supplier-ip","prepayment","ip").id,newIP);
    assert.equal(env.repo.findTemplateVersion("supplier-ip","prepayment","ooo").id,ooo);
    for (const [type,versionId,marker] of [["ip",newIP,"ИП вторая версия"],["ooo",ooo,"ООО версия"]]) {
      const {document} = await (await env.request("/clients/client/drafts","admin",input("supplier-ip",type))).json();
      assert.equal((await env.request(`/${document.id}/generate`,"admin",{})).status,200);
      assert.equal(env.repo.getRevision(document.id).snapshot.template.id,versionId);
      const output = env.repo.getDocument(document.id).files.find(file => file.type === "docx");
      const xml = new AdmZip(Buffer.from(await (await env.request(`/${document.id}/files/${output.id}`,"client")).arrayBuffer())).readAsText("word/document.xml");
      assert(xml.includes(marker));
    }
    register("supplier-ooo","ip","Ограниченная версия");
    const rejected = await (await env.request("/clients/client/validate","admin",input("supplier-ooo","ooo"))).json();
    assert.equal(rejected.valid,false);
    assert(rejected.errors.some(error => error.code === "TEMPLATE_BUYER_TYPE_MISMATCH"));
  } finally { await env.close(); }
});
test("all eight restricted supplier-buyer-payment variants generate their own templates and require confirmed genitive", async () => {
  const env = await environment(true,{seedTemplates:false});
  try {
    const versions = new Map();
    for (const supplier of ["ip","ooo"]) {
      const entityId = `supplier-${supplier}`;
      env.repo.createLegalEntityRevision({entityId,data:{...counterparty(supplier),signerFullNameGenitive:"Проверочного Поставщика",signerPositionGenitive:"Подписанта"},actorId:"admin"});
      for (const paymentType of ["prepayment","postpayment"]) for (const buyer of ["ip","ooo"]) {
        const marker = `${supplier}-${buyer}-${paymentType}`;
        const zip = new AdmZip(template());
        const xml = zip.readAsText("word/document.xml").replace("{{BUYER_FULL_NAME}}",`${marker} {{BUYER_FULL_NAME}} {{BUYER_SIGNER_FULL_NAME_GENITIVE}} {{BUYER_SIGNER_POSITION_GENITIVE}} {{SUPPLIER_SIGNER_FULL_NAME_GENITIVE}} {{SUPPLIER_SIGNER_POSITION_GENITIVE}}`);
        zip.updateFile("word/document.xml",Buffer.from(xml));
        const file = env.store.put(zip.toBuffer(),"docx");
        const versionId = env.repo.createTemplateVersion({templateId:marker,entityId,paymentType,storageKey:file.key,sha256:file.sha256,
          config:{buyerTypes:[buyer],supplierTypes:[supplier],requiredBuyerFields:["signerFullNameGenitive","signerPositionGenitive"],requiredSupplierFields:["signerFullNameGenitive","signerPositionGenitive"]},actorId:"admin"});
        versions.set(marker,versionId);
      }
    }
    const missing = input("supplier-ip","ip");
    const {document:incomplete} = await (await env.request("/clients/client/drafts","admin",missing)).json();
    const sequenceBefore = env.repo.getSequence().next_number;
    assert.equal((await env.request(`/${incomplete.id}/generate`,"admin",{})).status,422);
    assert.equal(env.repo.getDocument(incomplete.id).number,null);
    assert.equal(env.repo.getSequence().next_number,sequenceBefore);
    assert.equal(env.conversions(),0);
    for (const supplier of ["ip","ooo"]) for (const buyer of ["ip","ooo"]) for (const paymentType of ["prepayment","postpayment"]) {
      const marker = `${supplier}-${buyer}-${paymentType}`;
      const payment = paymentType === "prepayment" ? {type:paymentType,days:null} : {type:paymentType,days:21};
      const payload = input(`supplier-${supplier}`,buyer,payment);
      payload.idempotencyKey = `matrix-${marker}`;
      Object.assign(payload.counterparty,{signerFullNameGenitive:"Проверочного Покупателя",signerPositionGenitive:"Подписанта"});
      const checked = await (await env.request("/clients/client/validate","admin",payload)).json();
      assert.equal(checked.valid,true,`${marker}: ${JSON.stringify(checked.errors)}`);
      const {document} = await (await env.request("/clients/client/drafts","admin",payload)).json();
      const generated = await env.request(`/${document.id}/generate`,"admin",{});
      assert.equal(generated.status,200,await generated.clone().text());
      const revision = env.repo.getRevision(document.id);
      assert.equal(revision.snapshot.template.id,versions.get(marker));
      assert.equal(revision.snapshot.entity.type,supplier);
      assert.equal(revision.snapshot.counterparty.type,buyer);
      assert.equal(revision.snapshot.payment.type,paymentType);
      const output = env.repo.getDocument(document.id).files.find(file => file.type === "docx");
      const xml = new AdmZip(Buffer.from(await (await env.request(`/${document.id}/files/${output.id}`,"client")).arrayBuffer())).readAsText("word/document.xml");
      assert(xml.includes(marker));
      assert(xml.includes("Проверочного Покупателя Подписанта Проверочного Поставщика Подписанта"));
      assert.equal(env.repo.getDocument(document.id).files.length,2);
    }
    assert.equal(env.conversions(),8);
    assert.equal(env.repo.getSequence().next_number,sequenceBefore+8);
  } finally { await env.close(); }
});
test("failed generation retries its immutable revision after a stricter template is published", async () => {
  const env = await environment(true,{conversionFailures:1});
  try {
    const payload = input("supplier-ip","ip");
    const {document} = await (await env.request("/clients/client/drafts","admin",payload)).json();
    const failed = await env.request(`/${document.id}/generate`,"admin",{});
    assert.equal(failed.status,422);
    assert.equal((await failed.json()).code,"TEST_CONVERSION_FAILED");
    const before = env.repo.getRevision(document.id);
    const failedJob = env.repo.getGenerationJob(document.id);
    assert.equal(failedJob.state,"failed");
    assert.equal(env.repo.getDocument(document.id).files.length,0);
    const file = env.store.put(template(),"docx");
    const newTemplate = env.repo.createTemplateVersion({templateId:"new-stricter",entityId:"supplier-ip",paymentType:"prepayment",storageKey:file.key,sha256:file.sha256,config:{buyerTypes:["ip"],requiredBuyerFields:["signerFullNameGenitive"]},actorId:"admin"});
    env.repo.createLegalEntityRevision({entityId:"supplier-ip",data:{...counterparty("ip"),fullName:"Новый Проверочный Поставщик"},actorId:"admin"});
    const latestCheck = await (await env.request("/clients/client/validate","admin",payload)).json();
    assert(latestCheck.errors.some(error => error.field === "counterparty.signerFullNameGenitive"));
    env.repo.setLegalEntityActive("supplier-ip",false);
    const frozenReviewResponse=await env.request(`/${document.id}/review`,"admin");assert.equal(frozenReviewResponse.status,200);
    const frozenReview=await frozenReviewResponse.json();assert.equal(frozenReview.validation.valid,true);assert.deepEqual(frozenReview.validation.errors,[]);
    assert.deepEqual(frozenReview.counterparty,before.snapshot.counterparty);assert.equal(frozenReview.date,before.snapshot.date);
    assert.deepEqual(env.repo.getRevision(document.id),before);
    assert.equal((await env.request(`/${document.id}/generate`,"other",{})).status,403);
    assert.equal((await env.request(`/${document.id}/generate`,"admin",{})).status,200);
    const after = env.repo.getRevision(document.id);
    assert.equal(after.id,before.id);
    assert.deepEqual(after.snapshot,before.snapshot);
    assert.notEqual(after.snapshot.template.id,newTemplate);
    assert.equal(env.repo.getGenerationJob(document.id).id,failedJob.id);
    assert.equal(env.repo.getGenerationJob(document.id).state,"succeeded");
    assert.equal(env.repo.getSequence().next_number,256);
    assert.equal(env.repo.getDocument(document.id).files.length,2);
    assert.equal(env.conversions(),2);
  } finally { await env.close(); }
});
test("disabled runtime never touches injected database", async () => {
  const app = express();
  app.use("/api/documents", createDocumentRuntime({ db: { prepare() { throw new Error("DB MUST NOT BE TOUCHED"); } }, env: {}, authRequired: auth, findUser: (id) => actors[id] }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/documents/clients/client/options`, { headers: { "x-test-actor": "admin" } });
    assert.equal(response.status, 200); assert.equal((await response.json()).enabled, false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("full SQLite and private file backup retains references and verifies hashes", async () => {
  const env = await environment();
  try {
    const created = await (await env.request("/clients/client/drafts", "admin", input("supplier-ip", "ip"))).json();
    await env.request(`/${created.document.id}/generate`, "admin", {});
    assert.throws(() => assertLegacyRestoreAllowed(env.db), /старое восстановление/);
    assert.throws(() => assertClientDocumentDeletionAllowed(env.db, "client"), { code: "DOCUMENTS_CLIENT_RETAINED", status: 409 });
    assert.doesNotThrow(() => assertClientDocumentDeletionAllowed(env.db, "other"));
    const tempRoot = path.join(env.root, "temp"); mkdirSync(tempRoot);
    const out = path.join(env.root, "backup.zip");
    const result = await createDocumentsBackup({ db: env.db, storageRoot: env.root, outputPath: out, tempRoot });
    const zipBuffer = readFileSync(out); assert.equal(createHash("sha256").update(zipBuffer).digest("hex"), result.sha256);
    const zip = new AdmZip(zipBuffer);
    const manifest = JSON.parse(zip.readAsText("manifest.json"));
    for (const file of manifest.files) assert.equal(createHash("sha256").update(zip.readFile(`private/${file.storage_key}`)).digest("hex"), file.sha256);
    const restoredFile = path.join(env.root, "restored.sqlite"); writeFileSync(restoredFile, zip.readFile("clover.sqlite"));
    const restored = new DatabaseSync(restoredFile, { readOnly: true });
    try {
      assert.equal(restored.prepare("SELECT status FROM documents WHERE id=?").get(created.document.id).status, "generated");
      assert.equal(restored.prepare("SELECT count(*) AS n FROM document_files").get().n, 2);
      assert.equal(restored.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    } finally { restored.close(); }
  } finally { await env.close(); }
});




test("saved archive searches buyer INN and limits each role to permitted contracts",async()=>{
 const env=await environment();
 try{
  const own=(await (await env.request('/clients/client/drafts','admin',input('supplier-ip','ip'))).json()).document;
  const otherInput={...input('supplier-ooo','ooo'),idempotencyKey:'archive-other'};
  await env.request('/clients/other/drafts','admin',otherInput);
  const list=async(actor,query='')=>(await (await env.request('/archive'+query,actor)).json()).documents;
  assert.equal((await list('admin')).length,2);
  assert.equal((await list('client')).length,1);assert.equal((await list('client'))[0].id,own.id);
  assert.equal((await list('other')).length,1);assert.equal((await list('manager')).length,0);
  assert.equal((await list('admin','?inn='+counterparty('ip').inn)).length,1);
  assert.equal((await list('client','?inn='+counterparty('ooo').inn)).length,0);
  assert.equal((await list('admin','?inn=123')).length,2);
  assert.equal((await env.request('/archive?inn=bad','admin')).status,400);
  assert.equal((await list('admin'))[0].counterparty.inn.length>0,true);
 }finally{await env.close();}
});
test("signed scan upload requires a valid file but no signing date",async()=>{
 const env=await environment();
 try{
  const document=(await (await env.request('/clients/client/drafts','admin',input('supplier-ip','ip'))).json()).document;
  await env.request(`/${document.id}/generate`,'admin',{});
  const malformed=new FormData();malformed.append('file',new Blob(['not a scan']),'scan.pdf');
  assert.equal((await env.request(`/${document.id}/signed-files`,'admin',malformed)).status,422);
  assert.equal(env.repo.getDocument(document.id).files.some(f=>f.type==='signed'),false);
  const signed=new FormData();signed.append('file',new Blob([await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer()]),'scan.png');
  const response=await env.request(`/${document.id}/signed-files`,'admin',signed);
  assert.equal(response.status,200);const result=(await response.json()).document;
  assert.equal(result.status,'signed');assert(result.files.some(file=>file.type==='signed'));
  assert.equal(env.repo.getDocument(document.id).signed_date,null);
 }finally{await env.close();}
});


test("archive manager grants apply per assigned client and per action",async()=>{
 const env=await environment(true,{documentConfig:{grants:{manager:['view','uploadSigned']}},clientLinks:{other:{personalManagerId:'different-manager'}}});
 try{
  await env.request('/clients/client/drafts','admin',input('supplier-ip','ip'));
  await env.request('/clients/other/drafts','admin',{...input('supplier-ooo','ooo'),idempotencyKey:'manager-other'});
  const list=(await (await env.request('/archive','manager')).json()).documents;
  assert.equal(list.length,1);assert.equal(list[0].clientId,'client');
  assert.equal(list[0].canUploadSigned,true);assert.equal(list[0].canCreate,false);
 }finally{await env.close();}
});


test('standalone generator uses null client and isolates recognition, generation and archive from clients',async()=>{
 const env=await environment();
 try{
  for(const actor of ['manager','client']) {
   for(const endpoint of ['options','validate','drafts','imports']) {
    const response=await env.request('/admin/generator/'+endpoint,actor,endpoint==='options'?undefined:input('supplier-ip','ip'));
    assert.equal(response.status,403,endpoint);
   }
  }
  const options=await (await env.request('/admin/generator/options','admin')).json();
  assert.equal(options.clientId,null);assert.equal(options.capabilities.create,true);
  const form=new FormData();form.append('file',new Blob([template()]),'card.docx');
  const recognized=await env.request('/admin/generator/imports','admin',form);
  assert.equal(recognized.status,201,await recognized.clone().text());
  const imported=await recognized.json();assert.equal(env.repo.getImport(imported.id).clientId,null);
  for(const actor of ['manager','client'])assert.equal((await env.request('/imports/'+imported.id,actor)).status,403);
  const body={...input('supplier-ip','ip'),importId:imported.id};
  assert.equal((await env.request('/admin/generator/validate','admin',body)).status,200);
  const create=await env.request('/admin/generator/drafts','admin',body);
  assert.equal(create.status,201,await create.clone().text());const doc=(await create.json()).document;
  assert.equal(doc.clientId,null);
  assert.equal((await (await env.request('/admin/generator/drafts','admin',body)).json()).document.id,doc.id);
  assert.equal((await env.request('/admin/generator/drafts','admin',{...body,date:'2026-10-08'})).status,422);
  for(const actor of ['manager','client'])assert.equal((await env.request('/'+doc.id+'/generate',actor,{})).status,403);
  const generated=await env.request('/'+doc.id+'/generate','admin',{});assert.equal(generated.status,200,await generated.clone().text());
  assert.equal(env.repo.getDocument(doc.id).files.length,2);
  assert.equal(env.db.prepare('SELECT client_id FROM counterparty_snapshots WHERE id=?').get(env.repo.getRevision(doc.id).counterparty_snapshot_id).client_id,null);
  assert.equal(env.db.prepare('SELECT count(*) n FROM counterparty_details').get().n,0);
  for(const actor of ['manager','client']) {
   assert.equal((await (await env.request('/archive',actor)).json()).documents.length,0);
   assert.equal((await env.request('/'+doc.id+'/review',actor)).status,403);
   assert.equal((await env.request('/'+doc.id+'/files/'+env.repo.getDocument(doc.id).files[0].id,actor)).status,403);
  }
  const archive=(await (await env.request('/archive','admin')).json()).documents;assert.equal(archive.length,1);assert.equal(archive[0].canCreate,true);
  assert.equal((await env.request('/'+doc.id+'/generate','admin',{})).status,200);assert.equal(env.repo.getDocument(doc.id).files.length,2);
 }finally{await env.close();}
});
