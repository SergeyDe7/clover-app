import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import express from "express";
import AdmZip from "adm-zip";
import XLSX from "xlsx";
import { applyDocumentsSchema } from "../src/documents/schema.js";
import { createDocumentsRepository } from "../src/documents/repository.js";
import { createDocumentStorage } from "../src/documents/storage.js";
import { createDocumentService } from "../src/documents/service.js";
import { createDocumentsRouter } from "../src/documents/router.js";
import { createDocumentRuntime } from "../src/documents/runtime.js";
import { validInn } from "../src/documents/validation.js";
import { createDocumentsBackup, assertLegacyRestoreAllowed, assertClientDocumentDeletionAllowed } from "../src/documents/backup.js";
import { documentCapabilities } from "../src/documents/policy.js";

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
    findUser: (id) => actors[id], clientLink: (id) => clientLinks[id] || ({ personalManagerId: "manager" }), config: documentConfig, audit: (_req, event, details) => audit.push({ event, details }) }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api/documents`;
  const request = (url, actor = "admin", body, method = body ? "POST" : "GET") => fetch(base + url, { method, headers: { "x-test-actor": actor, ...(body instanceof FormData ? {} : body ? { "Content-Type": "application/json" } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { repo, store, request, audit, db, root, conversions: () => conversions, async close() { await new Promise((resolve) => server.close(resolve)); db.close(); } };
}
function input(entity, type, payment = { type: "prepayment", days: null }) {
  return { legalEntityId: entity, date: "2026-10-05", payment, counterparty: counterparty(type), confirmed: true, idempotencyKey: `${entity}-${type}-${payment.type}-${payment.days}` };
}

test('trash is admin-only, explicit, reversible and retains files, snapshots and sequence',async()=>{
 const env=await environment(true,{documentConfig:{grants:{manager:['view','create','uploadSigned','delete','restore']},clientCreate:true}});
 try {
  const body=input('supplier-ip','ip');
  const doc=(await (await env.request('/clients/client/drafts','admin',body)).json()).document;
  assert.equal((await env.request(`/${doc.id}/generate`,'admin',{})).status,200);
  const original=env.repo.getDocument(doc.id),snapshot=env.repo.getRevision(doc.id),sequence=env.repo.getSequence();
  const output=original.files.map(file=>({file,bytes:env.store.read(env.repo.getFileInternal(file.id).storage_key,file.sha256)}));
  for(const role of ['manager','client','other']) {
   assert.equal((await env.request('/trash',role)).status,403);
   for(const action of ['trash','restore'])assert.equal((await env.request(`/${doc.id}/${action}`,role,{confirmed:true})).status,403);
  }
  const rights=documentCapabilities(actors.manager,'client',{assignedManagerId:'manager',grants:{manager:['delete','restore','view']}});
  assert.equal(rights.delete,false);assert.equal(rights.restore,false);
  assert.equal((await env.request(`/${doc.id}/trash`,'admin',{confirmed:false})).status,400);
  const first=await (await env.request(`/${doc.id}/trash`,'admin',{confirmed:true})).json();
  assert.deepEqual(await (await env.request(`/${doc.id}/trash`,'admin',{confirmed:true})).json(),first);
  assert.equal((await (await env.request('/archive')).json()).documents.length,0);
  assert.equal((await (await env.request('/clients/client')).json()).documents.length,0);
  const trash=await (await env.request('/trash')).json();assert.equal(trash.documents[0].canRestore,true);assert.deepEqual(trash.documents[0].files,[]);
  assert(!JSON.stringify(trash).includes('storage_key'));assert(!JSON.stringify(trash).includes('request_json'));
  for(const [url,body] of [[`/${doc.id}/generate`,{}],[`/${doc.id}/review`,undefined],[`/${doc.id}/files/${original.files[0].id}`,undefined],[`/jobs/${env.repo.getGenerationJob(doc.id).id}`,undefined],[`/${doc.id}/signed-files`,{}]]) {
   const response=await env.request(url,'admin',body);assert.equal(response.status,409,url);assert.equal((await response.json()).code,'DOCUMENT_TRASHED');
   const foreign=await env.request(url,'other',body);assert.equal(foreign.status,403,url);assert.equal((await foreign.json()).code,'DOCUMENT_FORBIDDEN');
  }
  const repeat=await env.request('/clients/client/drafts','admin',body);assert.equal(repeat.status,409);assert.equal((await repeat.json()).code,'DOCUMENT_TRASHED');
  assert.throws(()=>env.repo.claimGenerationJob(doc.id),{code:'DOCUMENT_TRASHED'});
  assert.throws(()=>env.repo.reserveNumber(doc.id),{code:'DOCUMENT_TRASHED'});
  assert.throws(()=>env.repo.addFile({documentId:doc.id}),{code:'DOCUMENT_TRASHED'});
  assert.throws(()=>env.repo.transitionStatus({documentId:doc.id,status:'signing'}),{code:'DOCUMENT_TRASHED'});
  assert.throws(()=>env.repo.createJob({documentId:doc.id,kind:'generation',idempotencyKey:'generation-v1'}),{code:'DOCUMENT_TRASHED'});
  assert.throws(()=>env.repo.finalizeGeneration({documentId:doc.id,jobId:env.repo.getGenerationJob(doc.id).id,leaseToken:env.repo.getGenerationJob(doc.id).lease_token}),{code:'DOCUMENT_TRASHED'});
  assert.throws(()=>env.repo.failGeneration({jobId:env.repo.getGenerationJob(doc.id).id,leaseToken:env.repo.getGenerationJob(doc.id).lease_token,errorCode:'TEST_FAILURE'}),{code:'DOCUMENT_TRASHED'});
  assert.deepEqual(env.repo.getRevision(doc.id),snapshot);assert.deepEqual(env.repo.getSequence(),sequence);
  assert.equal(env.db.prepare('SELECT count(*) n FROM documents').get().n,1);
  assert.throws(()=>assertClientDocumentDeletionAllowed(env.db,'client'),{code:'DOCUMENTS_CLIENT_RETAINED'});
  assert.throws(()=>assertLegacyRestoreAllowed(env.db),{code:'DOCUMENTS_FULL_RESTORE_REQUIRED'});
  for(const {file,bytes} of output)assert.deepEqual(env.store.read(env.repo.getFileInternal(file.id).storage_key,file.sha256),bytes);
  for(let n=0;n<2;n++)assert.equal((await env.request(`/${doc.id}/restore`,'admin',{confirmed:true})).status,200);
  assert.deepEqual(env.repo.getDocument(doc.id),original);assert.equal((await (await env.request('/trash')).json()).documents.length,0);
  assert.equal((await env.request(`/${doc.id}/files/${original.files[0].id}`)).status,200);
  const next=env.repo.createDraft({clientId:'client',entityId:'supplier-ip',payment:{type:'prepayment'},counterparty:counterparty('ip'),date:body.date,actorId:'admin',idempotencyKey:'next'});
  assert.equal(env.repo.reserveNumber(next.id),'256');
 }finally{await env.close();}
});

test('existing installation without trash schema fails readiness without silently migrating its database',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT NOT NULL) STRICT');
 for(const actor of Object.values(actors))db.prepare('INSERT INTO users VALUES(?,?)').run(actor.id,actor.role);
 applyDocumentsSchema(db);db.exec('DROP TABLE document_trash');
 const app=express();app.use('/api/documents',createDocumentRuntime({db,env:{CLOVER_DOCUMENTS_ENABLED:'true'},authRequired:auth,findUser:id=>actors[id]}));
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 try{
  const base=`http://127.0.0.1:${server.address().port}/api/documents`;
  const response=await fetch(base+'/trash',{headers:{'x-test-actor':'admin'}});assert.equal(response.status,503);assert.equal((await response.json()).code,'DOCUMENTS_SCHEMA_REQUIRED');
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='document_trash'").get(),undefined);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('trash and generation claims are serialized, queued and even expired running jobs block deletion',async()=>{
 const env=await environment();try{
  for(const state of ['queued','running']) {
   const draft=env.repo.createDraft({clientId:'client',entityId:'supplier-ip',payment:{type:'prepayment'},counterparty:counterparty('ip'),date:'2026-10-05',actorId:'admin',idempotencyKey:state});
   if(state==='queued')env.repo.createJob({documentId:draft.id,kind:'generation',idempotencyKey:'generation-v1'});
   else env.repo.claimGenerationJob(draft.id,{nowMs:0,leaseMs:1});
   const response=await env.request(`/${draft.id}/trash`,'admin',{confirmed:true});assert.equal(response.status,409);assert.equal((await response.json()).code,'DOCUMENT_GENERATION_ACTIVE');
   assert.equal(env.repo.getDocument(draft.id).status,'draft');
  }
  const draft=env.repo.createDraft({clientId:'client',entityId:'supplier-ip',payment:{type:'prepayment'},counterparty:counterparty('ip'),date:'2026-10-05',actorId:'admin',idempotencyKey:'trash-first'});
  env.repo.trashDocument({documentId:draft.id,actorId:'admin'});
  assert.throws(()=>env.repo.claimGenerationJob(draft.id),{code:'DOCUMENT_TRASHED'});
  assert.equal(env.repo.getGenerationJob(draft.id),null);
 }finally{await env.close();}
});
